import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

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
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <p className="mb-4">
        <Link href="/school/notices/gallery" aria-label={t('gallery.allAlbums', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </p>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{album.title}</h1>
        <DeleteAlbumButton albumId={album.id} lang={lang} />
      </div>
      <PhotoGrid
        albumId={album.id}
        maxImages={album.max_images}
        maxImageSizeBytes={album.max_image_size_bytes}
        photos={photos ?? []}
        lang={lang}
      />
    </main>
  )
}
