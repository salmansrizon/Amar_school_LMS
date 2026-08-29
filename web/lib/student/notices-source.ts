import type { SupabaseClient } from '@supabase/supabase-js'
import { sortNotices, unreadIds, type StudentNotice } from '@/lib/student/notices'

// The I/O half of the notice feed (#445). RLS on `publications` (0139) already
// decides which rows a Student may see — school-wide, or targeted at their
// class — so this never filters by audience itself.

const COLUMNS =
  'id, kind, title, importance, target_type, target_class_name, target_section, image_path, link_url, created_at'

export interface NoticeFeed {
  notices: StudentNotice[]
  unread: Set<string>
}

/** Notices only. Homework, lesson plans and exam prep are other publication
 *  kinds and belong to their own tickets (#446, #447). */
export async function loadNoticeFeed(supabase: SupabaseClient, limit = 100): Promise<NoticeFeed> {
  const [feed, receipts] = await Promise.all([
    supabase
      .from('publications')
      .select(COLUMNS)
      .eq('kind', 'notice')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('student_publication_reads').select('publication_id'),
  ])

  const notices = sortNotices((feed.data ?? []) as StudentNotice[])
  return { notices, unread: new Set(unreadIds(notices, receipts.data ?? [])) }
}

/** Records that this Student opened a publication. Append-only: a repeat visit
 *  conflicts on the primary key and is ignored, so the first read is the one
 *  that counts. */
export async function markPublicationRead(
  supabase: SupabaseClient,
  studentId: string,
  publicationId: string,
): Promise<void> {
  await supabase
    .from('student_publication_reads')
    .upsert(
      { student_id: studentId, publication_id: publicationId },
      { onConflict: 'student_id,publication_id', ignoreDuplicates: true },
    )
}
