import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { DeleteAlbumButton } from '../gallery-controls'
import { PhotoGrid } from './photo-controls'

// Layout per ui/school-owner/gallery-album-detail.html: a toolbar (photo
// count badge + max-size note + Upload button) above a thumbnail grid with
// per-photo delete.
export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>
}) {
  const { albumId } = await params
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: album } = await supabase
    .from('gallery_albums')
    .select('id, title, max_images, max_image_size_bytes')
    .eq('id', albumId)
    .maybeSingle()
  if (!album) notFound()
  const { data: photos } = await supabase
    .from('gallery_photos')
    .select('id, file_name')
    .eq('album_id', albumId)
    .order('created_at')

  return (
    <>
      <PageHeader
        title={album.title}
        crumbs={schoolCrumbs(`/school/notices/gallery/${albumId}`, lang, [
          { label: t('notices.title', lang), href: '/school/notices' },
          { label: t('notices.tabGallery', lang), href: '/school/notices/gallery' },
          { label: album.title },
        ])}
        actions={<DeleteAlbumButton albumId={album.id} lang={lang} />}
      />
      <PhotoGrid
        albumId={album.id}
        maxImages={album.max_images}
        maxImageSizeBytes={album.max_image_size_bytes}
        photos={photos ?? []}
        lang={lang}
      />
    </>
  )
}
