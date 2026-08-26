import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { filterStudents, behaviourAverages } from '@/lib/students'
import { resolveClassSection } from '@/lib/class-catalogue'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, PageHeader, Toolbar, railClass } from '@/components/ui/page'
import { StudentFilters } from './student-filters'

// Layout per ui/school-owner/students-list.html: search (name/roll/guardian) +
// class/section filters, table Roll | Name | Class/Section | Guardian |
// Behaviour Avg | Status | View, with Old Students + New Admission actions.
//
// List archetype (gate #372): renders bare content — the shell owns the <main>,
// the width and the gutters — so the table fills the viewport instead of sitting
// in an 896px column. Columns distribute across that width the way an ERP grid
// does; an earlier pass clustered them left and left the right half of the card
// empty, which read as broken rather than tidy.
function avgBadge(avg: number | undefined) {
  if (avg === undefined) return <span className="text-muted">—</span>
  const tone =
    avg >= 4 ? 'bg-mint-soft text-mint-deep' : avg >= 3 ? 'bg-sun-soft text-sun-deep' : 'bg-alert-soft text-alert-deep'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{avg}</span>
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classSection?: string }>
}) {
  const { q = '', classSection = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()

  const [{ data: students }, { data: ratings }, { data: classes }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, roll_number, class_name, section, guardian_name, archived_at')
      .is('archived_at', null)
      .order('class_name')
      .order('roll_number'),
    // ponytail: whole-table scan capped at 10k rows, mirrors the classes page.
    supabase.from('behaviour_log_entries').select('student_id, rating').limit(10000),
    supabase.from('classes').select('id, name, section, group_department').order('created_at'),
  ])

  const { combos, className: klass, section } = resolveClassSection(classes ?? [], classSection)
  const visible = filterStudents(students ?? [], q, klass, section)
  const avgs = behaviourAverages(ratings ?? [])

  return (
    <>
      <PageHeader
        title={t('students.listTitle', lang)}
        actions={
          <>
            <Link
              href="/school/students/archive"
              className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('students.oldStudents', lang)}
            </Link>
            {/* Issuing logins is owner-only (#442) — the screen redirects Staff. */}
            {role === 'school_owner' && (
              <Link
                href="/school/students/logins"
                className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('students.loginBulk', lang)}
              </Link>
            )}
            <Link
              href="/school/students/new"
              className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + {t('students.newAdmission', lang)}
            </Link>
          </>
        }
      />

      <Toolbar
        filters={
          <StudentFilters q={q} classSection={classSection} combos={combos} lang={lang} />
        }
      />

      <Card padded={!visible.length}>
        {!visible.length ? (
          <p className="text-sm text-muted">{t('students.none', lang)}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={railClass(undefined)}>{t('students.roll', lang)}</TableHead>
                <TableHead>{t('students.name', lang)}</TableHead>
                <TableHead>{t('students.classSection', lang)}</TableHead>
                <TableHead>{t('students.guardian', lang)}</TableHead>
                <TableHead>{t('students.behaviourAvg', lang)}</TableHead>
                <TableHead>{t('students.status', lang)}</TableHead>
                <TableHead className="text-right">{t('students.view', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.id}>
                  {/* Rail carries "active" visually; the Status cell still spells
                      it out, so colour is never the only signal. */}
                  <TableCell className={railClass('mint')}>
                    {s.roll_number ?? <span className="text-muted">—</span>}
                  </TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>
                    {[s.class_name, s.section].filter(Boolean).join(' / ') || (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>{s.guardian_name ?? <span className="text-muted">—</span>}</TableCell>
                  <TableCell>{avgBadge(avgs.get(s.id))}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t('students.active', lang)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/school/students/${s.id}`} className="text-brand-600 hover:underline">
                      {t('students.view', lang)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}
