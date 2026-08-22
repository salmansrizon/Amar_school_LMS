import { redirect } from 'next/navigation'

// The distributor profile is no longer a dedicated page (#418) — it lives in the
// master-detail right pane. Keep this route as a redirect so existing links and
// bookmarks still resolve.
export default async function PartnerRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/super-admin/partners?selected=${id}`)
}
