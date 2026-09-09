import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signedIn } from '../helpers/auth'
import { targetAudienceLabel } from '@/lib/publishing'

// Seam: Publishing (issue #37, PRD §5.8) — notices/homework/lesson-plans/
// daily-lessons/exam-prep share one `publications` table (kind discriminates,
// RLS-scoped; OfficeTime targeting left with issue #100); gallery albums/photos are a
// second table pair with a server-enforced, per-album-configurable image-count
// and per-image-size cap (a row-locking trigger, not just an app-layer check).

describe('Publishing (issue #37)', () => {
  let ownerA: SupabaseClient
  let ownerB: SupabaseClient
  let albumId: string

  async function cleanup(client: SupabaseClient) {
    await client.from('publications').delete().like('title', 'PUB Test%')
    await client.from('gallery_photos').delete().like('file_name', 'PUB Test%')
    await client.from('gallery_albums').delete().like('title', 'PUB Test%')
  }

  beforeAll(async () => {
    ownerA = await signedIn('owner-a@test.local')
    ownerB = await signedIn('owner-b@test.local')
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  afterAll(async () => {
    await cleanup(ownerA)
    await cleanup(ownerB)
  })

  it('creates a notice targeted at everyone', async () => {
    const { data, error } = await ownerA
      .from('publications')
      .insert({ kind: 'notice', title: 'PUB Test All Notice', importance: 'urgent', target_scope: 'all' })
      .select('id, target_scope')
      .single()
    expect(error).toBeNull()
    expect(data?.target_scope).toBe('all')
  })

  it('creates homework broadcast at a Class/Section in the pinned Year', async () => {
    const { data: off } = await ownerA
      .from('class_offerings')
      .select('academic_year')
      .limit(1)
      .single()
    const { data, error } = await ownerA
      .from('publications')
      .insert({
        kind: 'homework',
        title: 'PUB Test Homework',
        importance: 'important',
        target_scope: 'broadcast',
        target_class_name: 'Class 6',
        target_academic_year: off!.academic_year as number,
        target_section: 'A',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('rejects an insert that still names the retired target_type column', async () => {
    const { error } = await ownerA
      .from('publications')
      .insert({ kind: 'notice', title: 'PUB Test Retired Column', importance: 'normal', target_scope: 'all', target_type: 'all' })
    expect(error).not.toBeNull()
  })

  it('rejects a row with no target_scope (NOT NULL as of Wave 7/#608)', async () => {
    const { error } = await ownerA
      .from('publications')
      .insert({ kind: 'notice', title: 'PUB Test No Scope', importance: 'normal' })
    expect(error).not.toBeNull()
  })

  it('rejects an unknown kind (check constraint)', async () => {
    const { error } = await ownerA
      .from('publications')
      .insert({ kind: 'bogus', title: 'PUB Test Bad Kind' })
    expect(error).not.toBeNull()
  })

  it("RLS: another school's owner sees none of these publications", async () => {
    const { data } = await ownerB.from('publications').select('id').like('title', 'PUB Test%')
    expect(data).toHaveLength(0)
  })

  // issue #607, map #598 Wave 6 -- createPublication writes the three-scope
  // target_scope contract. As of Wave 7 (#608) target_scope is the sole
  // discriminator (target_type dropped). This proves each scope's row lands
  // with exactly #601's per-scope invariants and reads back through the
  // shared label helper.
  describe('three-scope compose write path (#607)', () => {
    const SELECT =
      'target_scope, class_offering_id, target_class_name, target_academic_year, target_shift, target_group_department, target_section'
    let offeringId: string
    let activeYear: number

    beforeAll(async () => {
      await ownerA.from('publications').delete().like('title', 'PUB Test%')
      await ownerA.from('class_offerings').delete().like('name', 'PUB Test%')
      const { data: off } = await ownerA
        .from('class_offerings')
        .insert({ name: 'PUB Test Offering', section: 'A', shift: 'Day', group_department: 'Science' })
        .select('id, academic_year')
        .single()
      offeringId = off!.id
      activeYear = off!.academic_year as number
    })

    afterAll(async () => {
      await ownerA.from('publications').delete().like('title', 'PUB Test%')
      await ownerA.from('class_offerings').delete().like('name', 'PUB Test%')
    })

    it("scope='all': every target column NULL", async () => {
      const { data, error } = await ownerA
        .from('publications')
        .insert({ kind: 'notice', title: 'PUB Test Scope All', importance: 'normal', target_scope: 'all' })
        .select(SELECT)
        .single()
      expect(error).toBeNull()
      expect(data).toMatchObject({
        target_scope: 'all',
        class_offering_id: null,
        target_class_name: null,
        target_academic_year: null,
        target_shift: null,
        target_group_department: null,
        target_section: null,
      })
      expect(targetAudienceLabel(data!, 'en')).toBe('All Students')
    })

    it("scope='offering': class_offering_id set, every broadcast predicate column NULL", async () => {
      const { data, error } = await ownerA
        .from('publications')
        .insert({
          kind: 'homework',
          title: 'PUB Test Scope Offering',
          importance: 'normal',
          target_scope: 'offering',
          class_offering_id: offeringId,
        })
        .select(SELECT)
        .single()
      expect(error).toBeNull()
      expect(data).toMatchObject({
        target_scope: 'offering',
        class_offering_id: offeringId,
        target_class_name: null,
        target_academic_year: null,
        target_shift: null,
        target_group_department: null,
        target_section: null,
      })
      expect(
        targetAudienceLabel(data!, 'en', {
          name: 'PUB Test Offering',
          section: 'A',
          group_department: 'Science',
          shift: 'Day',
        }),
      ).toBe('PUB Test Offering (Science) - Day - A')
    })

    it("scope='broadcast': class_offering_id NULL, Class + Year pinned, Any dimensions NULL", async () => {
      const { data, error } = await ownerA
        .from('publications')
        .insert({
          kind: 'notice',
          title: 'PUB Test Scope Broadcast',
          importance: 'normal',
          target_scope: 'broadcast',
          target_class_name: 'PUB Test Offering',
          target_academic_year: activeYear,
          target_shift: 'Day',
        })
        .select(SELECT)
        .single()
      expect(error).toBeNull()
      expect(data).toMatchObject({
        target_scope: 'broadcast',
        class_offering_id: null,
        target_class_name: 'PUB Test Offering',
        target_academic_year: activeYear,
        target_shift: 'Day',
        target_group_department: null,
        target_section: null,
      })
      expect(targetAudienceLabel(data!, 'en')).toBe('PUB Test Offering / Day')
    })

    it("rejects scope='broadcast' with a predicate-forbidden shape: class_offering_id also set", async () => {
      const { error } = await ownerA.from('publications').insert({
        kind: 'notice',
        title: 'PUB Test Scope Bad',
        importance: 'normal',
        target_scope: 'broadcast',
        class_offering_id: offeringId,
        target_class_name: 'PUB Test Offering',
        target_academic_year: activeYear,
      })
      // publications_target_scope_broadcast_valid: a broadcast row must not
      // carry class_offering_id.
      expect(error).not.toBeNull()
      expect(error!.code).toBe('23514')
    })
  })

  describe('gallery albums: server-enforced per-album caps', () => {
    beforeAll(async () => {
      albumId = (
        await ownerA
          .from('gallery_albums')
          .insert({ title: 'PUB Test Album', max_images: 2, max_image_size_bytes: 1000 })
          .select('id')
          .single()
      ).data!.id
    })

    it('accepts photos up to the configured image-count cap', async () => {
      const { error: e1 } = await ownerA
        .from('gallery_photos')
        .insert({ album_id: albumId, storage_path: 'x/1.jpg', file_name: 'PUB Test 1.jpg', file_size: 500 })
      expect(e1).toBeNull()
      const { error: e2 } = await ownerA
        .from('gallery_photos')
        .insert({ album_id: albumId, storage_path: 'x/2.jpg', file_name: 'PUB Test 2.jpg', file_size: 500 })
      expect(e2).toBeNull()
    })

    it('rejects a photo once the album has reached its image-count cap', async () => {
      const { error } = await ownerA
        .from('gallery_photos')
        .insert({ album_id: albumId, storage_path: 'x/3.jpg', file_name: 'PUB Test 3.jpg', file_size: 500 })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('image limit')
    })

    it("rejects a photo over the album's per-image size cap", async () => {
      const { data: freshAlbum } = await ownerA
        .from('gallery_albums')
        .insert({ title: 'PUB Test Album Size', max_images: 20, max_image_size_bytes: 1000 })
        .select('id')
        .single()
      const { error } = await ownerA.from('gallery_photos').insert({
        album_id: freshAlbum!.id,
        storage_path: 'x/big.jpg',
        file_name: 'PUB Test Big.jpg',
        file_size: 1001,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('size limit')
    })

    it("rejects a photo whose album belongs to another school (tenancy trigger)", async () => {
      const { data: foreignAlbum } = await ownerB
        .from('gallery_albums')
        .insert({ title: 'PUB Test Foreign Album' })
        .select('id')
        .single()
      const { error } = await ownerA.from('gallery_photos').insert({
        album_id: foreignAlbum!.id,
        storage_path: 'x/ghost.jpg',
        file_name: 'PUB Test Ghost.jpg',
        file_size: 500,
      })
      expect(error).not.toBeNull()
      expect(error!.message).toContain('does not belong to this school')
      await ownerB.from('gallery_albums').delete().eq('id', foreignAlbum!.id)
    })

    it("RLS: another school's owner sees none of these albums or photos", async () => {
      const { data: albums } = await ownerB.from('gallery_albums').select('id').like('title', 'PUB Test%')
      expect(albums).toHaveLength(0)
      const { data: photos } = await ownerB
        .from('gallery_photos')
        .select('id')
        .like('file_name', 'PUB Test%')
      expect(photos).toHaveLength(0)
    })
  })
})
