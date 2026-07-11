import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { albumCountLabel, albumIsFull } from '@/lib/publishing'
import { NoticeTabs } from '../notice-tabs'
import { CreateAlbumForm } from './gallery-controls'

// Layout per ui/school-owner/gallery-albums.html: a 4-column album grid, each
// card showing "N/max photos" and a "Full" badge once the album-level cap is
// reached (the cap itself is server-enforced — see migration 0041's trigger).
export default async function GalleryAlbumsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: albums }, { data: photos }] = await Promise.all([
    supabase.from('gallery_albums').select('id, title, max_images').order('created_at', { ascending: false }),
    supabase.from('gallery_photos').select('album_id'),
  ])
  const counts = new Map<string, number>()
  for (const p of photos ?? []) counts.set(p.album_id, (counts.get(p.album_id) ?? 0) + 1)
  const query = q.trim().toLowerCase()
  const visible = (albums ?? []).filter((a) => !query || a.title.toLowerCase().includes(query))

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('notices.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>
      <NoticeTabs active="gallery" lang={lang} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <form className="flex items-center gap-2" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('gallery.search', lang)}
            className="rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('classes.filter', lang)}
          </button>
        </form>
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
            + {t('gallery.newAlbum', lang)}
          </summary>
          <div className="mt-3 rounded-md border border-line bg-paper-muted p-4">
            <CreateAlbumForm lang={lang} />
          </div>
        </details>
      </div>

      {!visible.length ? (
        <p className="text-sm text-muted">{t('gallery.noAlbums', lang)}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {visible.map((a) => {
            const count = counts.get(a.id) ?? 0
            const full = albumIsFull(count, a.max_images)
            return (
              <Link
                key={a.id}
                href={`/school/notices/gallery/${a.id}`}
                className="block text-inherit no-underline"
              >
                <div className="flex h-28 items-center justify-center rounded-t-md border border-b-0 border-line bg-paper-muted text-2xl text-muted">
                  🖼️
                </div>
                <div className="rounded-b-md border border-line p-3">
                  <div className="mb-0.5 truncate text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-muted">
                    {albumCountLabel(count, a.max_images)} {t('gallery.photos', lang)}
                  </div>
                  {full && (
                    <span className="mt-1 inline-block rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
                      {t('gallery.full', lang)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
