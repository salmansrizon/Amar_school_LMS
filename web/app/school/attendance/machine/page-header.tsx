import type { Lang } from '@/lib/i18n'
import { PageHeader } from '@/components/ui/page'
import { attendanceCrumbs } from '@/lib/school-crumbs'

/** The three Machine Attendance pages share one header: the Attendance trail
 *  and the page's own title. */
export function MachinePageHeader({ title, lang }: { title: string; lang: Lang }) {
  return <PageHeader title={title} crumbs={attendanceCrumbs('/school/attendance/machine', lang)} />
}
