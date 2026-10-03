import Form from 'next/form'
import Link from 'next/link'
import { Images, FolderClosed, FolderCheck } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs, headerPrimary } from '@/lib/school-crumbs'
import { albumCountLabel, albumIsFull } from '@/lib/publishing'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { NoticeTabs } from '../notice-tabs'
import { CreateAlbumForm } from './gallery-controls'
import { filterButtonClass, inputClass } from '@/components/ui/field'

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
  const fmt = numberFmt(lang)
  const { supabase } = await getSchoolContext()

  const [{ data: albums }, { data: photos }] = await Promise.all([
    supabase.from('gallery_albums').select('id, title, max_images').order('created_at', { ascending: false }),
    supabase.from('gallery_photos').select('album_id'),
  ])
  const counts = new Map<string, number>()
  for (const p of photos ?? []) counts.set(p.album_id, (counts.get(p.album_id) ?? 0) + 1)
  const query = q.trim().toLowerCase()
  const visible = (albums ?? []).filter((a) => !query || a.title.toLowerCase().includes(query))
  const fullCount = (albums ?? []).filter((a) => albumIsFull(counts.get(a.id) ?? 0, a.max_images)).length

  return (
    <>
      <PageHeader
        title={t('notices.tabGallery', lang)}
        crumbs={schoolCrumbs('/school/notices/gallery', lang, [
          { label: t('notices.title', lang), href: '/school/notices' },
          { label: t('notices.tabGallery', lang) },
        ])}
        actions={
          <details className="group relative">
            <summary className={`${headerPrimary} cursor-pointer list-none`}>+ {t('gallery.newAlbum', lang)}</summary>
            <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-line bg-paper-muted p-4 shadow-lg">
              <CreateAlbumForm lang={lang} />
            </div>
          </details>
        }
      />
      <NoticeTabs active="gallery" lang={lang} />

      <StatGrid>
        <StatCard icon={<FolderClosed className="size-5" />} label={t('gallery.statAlbums', lang)} value={fmt.format((albums ?? []).length)} />
        <StatCard icon={<Images className="size-5" />} tone="sky" label={t('gallery.statPhotos', lang)} value={fmt.format((photos ?? []).length)} />
        <StatCard icon={<FolderCheck className="size-5" />} tone="sun" label={t('gallery.statFull', lang)} value={fmt.format(fullCount)} />
      </StatGrid>

      <Card className="mb-grid">
        <Form className="flex items-center gap-2" action="/school/notices/gallery">
          <input
            name="q"
            defaultValue={q}
            placeholder={t('gallery.search', lang)}
            className={inputClass()}
          />
          <button
            type="submit"
            className={filterButtonClass()}
          >
            {t('classes.filter', lang)}
          </button>
        </Form>
      </Card>

      {!visible.length ? (
        <Card>
          <p className="text-sm text-muted">{t('gallery.noAlbums', lang)}</p>
        </Card>
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
    </>
  )
}
