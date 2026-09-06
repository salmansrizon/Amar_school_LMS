import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { behaviourAverages } from '@/lib/students'
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
import { EmptyState } from '@/components/ui/states'
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
  const { supabase, role, shiftSelection } = await getSchoolContext()

  const [roster, { data: ratings }] = await Promise.all([
    schoolRoster(supabase, { classSection, q, shiftSelection }),
    // ponytail: whole-table scan capped at 10k rows, mirrors the classes page.
    supabase.from('behaviour_log_entries').select('student_id, rating').limit(10000),
  ])
  const visible = roster.students
  const avgs = behaviourAverages(ratings ?? [])

  return (
    <>
      <PageHeader
        title={t('students.listTitle', lang)}
        actions={
          <>
            <Link
              href="/school/students/archive"
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
            >
              {t('students.oldStudents', lang)}
            </Link>
            {/* Issuing logins is owner-only (#442) — the screen redirects Staff. */}
            {role === 'school_owner' && (
              <Link
                href="/school/students/logins"
                className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('students.loginBulk', lang)}
              </Link>
            )}
            <Link
              href="/school/students/new"
              className="inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + {t('students.newAdmission', lang)}
            </Link>
          </>
        }
      />

      <Toolbar
        filters={
          <StudentFilters q={q} classSection={classSection} combos={roster.combos} lang={lang} />
        }
      />

      <Card padded={!visible.length}>
        {/* #538: an empty list says which kind of empty it is and offers the one
            action that changes it. Three kinds, and the model decides which
            (lib/school/roster.ts) — this page only renders the answer.
            An unassigned Employee is not sent to the admission form: she cannot
            admit anyone (ADR 0021), and her way out is an Owner assigning her a
            class, which is not a button she has. A filter that matched nothing
            is not sent there either — the school HAS students, and offering to
            admit another is the conflation #538 exists to forbid. */}
        {roster.empty ? (
          roster.empty === 'unassigned' ? (
            <EmptyState
              title={t('students.noClassAssigned', lang)}
              body={t('students.noClassAssignedHelp', lang)}
              action={{ href: '/school', label: t('denied.back', lang) }}
              lang={lang}
            />
          ) : roster.empty === 'no-match' ? (
            <EmptyState
              title={t('students.noMatch', lang)}
              body={t('students.noMatchHelp', lang)}
              action={{ href: '/school/students', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              title={t('students.none', lang)}
              action={{ href: '/school/students/new', label: t('students.newAdmission', lang) }}
              lang={lang}
            />
          )
        ) : (
          <>
          {/* Phone: cards, no horizontal scroll for the one action that matters
              (#540). Desktop keeps the seven-column grid. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((s) => (
              <li key={s.id} className="rounded-lg border border-line bg-paper p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-xs text-muted">
                    {t('students.roll', lang)} {s.roll_number ?? '—'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {[s.class_name, s.section].filter(Boolean).join(' / ') || '—'}
                  {s.guardian_name ? ` · ${s.guardian_name}` : ''}
                </p>
                <Link
                  href={`/school/students/${s.id}`}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-line-strong text-sm font-semibold hover:bg-paper-muted"
                >
                  {t('students.view', lang)}
                </Link>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
          </>
        )}
      </Card>
    </>
  )
}
