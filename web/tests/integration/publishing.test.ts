import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Seam: Publishing (issue #37, PRD §5.8) — notices/homework/lesson-plans/
// daily-lessons/exam-prep share one `publications` table (kind discriminates,
// RLS-scoped; OfficeTime targeting left with issue #100); gallery albums/photos are a
// second table pair with a server-enforced, per-album-configurable image-count
// and per-image-size cap (a row-locking trigger, not just an app-layer check).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PASSWORD = 'test-password-123!'

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login failed for ${email}: ${error.message}`)
  return client
}

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
      .insert({ kind: 'notice', title: 'PUB Test All Notice', importance: 'urgent' })
      .select('id, target_type')
      .single()
    expect(error).toBeNull()
    expect(data?.target_type).toBe('all')
  })

  it('creates homework targeted at a specific class/section', async () => {
    const { data, error } = await ownerA
      .from('publications')
      .insert({
        kind: 'homework',
        title: 'PUB Test Homework',
        importance: 'important',
        target_type: 'specific',
        target_class_name: 'Class 6',
        target_section: 'A',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
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
