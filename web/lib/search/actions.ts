'use server'

import { createClient } from '@/lib/supabase/server'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Dynamic per-record global search (#304). Infers the caller's role and runs
// RLS-scoped ilike queries across that role's record sources, returning navigable
// hits. Every query uses the caller's session, so RLS is the authority — a role
// only ever sees its own rows. Called (debounced) from the search palette.
export interface RecordHit {
  label: string
  sublabel: string
  href: string
}

export async function globalRecordSearch(query: string): Promise<RecordHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role
  const like = `%${q}%`
  const hits: RecordHit[] = []

  if (role === 'super_admin') {
    const [schools, dists, agents, govs, invs] = await Promise.all([
      supabase.from('schools').select('id, name').ilike('name', like).limit(5),
      supabase.from('profiles').select('id, full_name').eq('role', 'distributor').ilike('full_name', like).limit(4),
      supabase.from('profiles').select('id, full_name').eq('role', 'agent').ilike('full_name', like).limit(4),
      supabase.from('profiles').select('id, full_name').eq('role', 'gov_official').ilike('full_name', like).limit(3),
      supabase.from('invoices').select('id, number').ilike('number', like).limit(4),
    ])
    for (const s of schools.data ?? []) hits.push({ label: s.name, sublabel: 'School', href: `/super-admin/schools/${s.id}` })
    for (const d of dists.data ?? []) hits.push({ label: d.full_name ?? d.id, sublabel: 'Distributor', href: `/super-admin/partners/${d.id}` })
    for (const a of agents.data ?? []) hits.push({ label: a.full_name ?? a.id, sublabel: 'Agent', href: `/super-admin/agents/${a.id}` })
    for (const g of govs.data ?? []) hits.push({ label: g.full_name ?? g.id, sublabel: 'Gov official', href: `/super-admin/gov-officials/${g.id}` })
    for (const i of invs.data ?? []) hits.push({ label: i.number, sublabel: 'Invoice', href: '/super-admin/invoices' })
  } else if (role === 'distributor') {
    const [leads, territory] = await Promise.all([
      supabase.from('leads').select('id, school_name').ilike('school_name', like).limit(6),
      supabase.rpc('my_territory_schools'),
    ])
    for (const l of leads.data ?? []) hits.push({ label: l.school_name, sublabel: 'Lead', href: `/distributor/crm/${l.id}` })
    const ql = q.toLowerCase()
    for (const s of ((territory.data ?? []) as { name?: string }[]).filter((s) => s.name?.toLowerCase().includes(ql)).slice(0, 4)) {
      hits.push({ label: s.name ?? '', sublabel: 'Territory school', href: '/distributor' })
    }
  } else if (role === 'agent') {
    const tasks = await supabase.from('partner_tasks').select('id, title').ilike('title', like).limit(8)
    for (const t of tasks.data ?? []) hits.push({ label: t.title, sublabel: 'Task', href: `/agent/tasks/${t.id}` })
  } else if (role === 'school_owner' || role === 'staff_user') {
    const [students, emps] = await Promise.all([
      supabase.from('students').select('id, full_name').ilike('full_name', like).is('archived_at', null).limit(6),
      supabase.from('employee_card').select('id, full_name').ilike('full_name', like).is('archived_at', null).limit(4),
    ])
    for (const s of students.data ?? []) hits.push({ label: s.full_name, sublabel: 'Student', href: `/school/students/${s.id}` })
    for (const e of emps.data ?? []) hits.push({ label: e.full_name, sublabel: 'Employee', href: `/school/employees/${e.id}` })
  } else if (role === 'student') {
    // The Student portal (#457). Every source here is a definer view that has
    // ALREADY decided what this Student may see — their own class's notices,
    // tasks, material, published results and subjects — so there is nothing to
    // scope again, and a hit belonging to another class simply has no row.
    //
    // The sublabel is not decoration: four kinds share a title space here, and
    // "Chapter 4" alone tells a student nothing about whether they are opening
    // the task or the lesson plan. It is also the only English left on a
    // Bangla-default screen if it is not translated.
    const lang = await currentLang()
    const [pubs, material, exams, subjects] = await Promise.all([
      supabase
        .from('publications')
        .select('id, title, kind')
        .ilike('title', like)
        .in('kind', ['notice', 'homework'])
        .limit(6),
      supabase.from('student_material').select('id, source, title, kind').ilike('title', like).limit(4),
      supabase.from('student_exam_result').select('exam_id, exam_name').ilike('exam_name', like).limit(4),
      supabase.from('student_subject_option').select('id, name').ilike('name', like).limit(4),
    ])

    for (const p of pubs.data ?? []) {
      const isTask = p.kind === 'homework'
      hits.push({
        label: p.title,
        sublabel: t(isTask ? 'student.tasksTitle' : 'student.noticesTitle', lang),
        href: isTask ? `/student/tasks/${p.id}` : `/student/notices/${p.id}`,
      })
    }
    for (const m of material.data ?? []) {
      hits.push({ label: m.title, sublabel: t('student.materialsTitle', lang), href: '/student/materials' })
    }
    // student_exam_result is one row per subject, so an exam repeats — collapse.
    const seenExams = new Set<string>()
    for (const e of exams.data ?? []) {
      if (seenExams.has(e.exam_id)) continue
      seenExams.add(e.exam_id)
      hits.push({ label: e.exam_name, sublabel: t('student.resultsTitle', lang), href: `/student/results/${e.exam_id}` })
    }
    for (const s of subjects.data ?? []) {
      hits.push({ label: s.name, sublabel: t('student.subject', lang), href: '/student/routine' })
    }
  } else if (role === 'gov_official') {
    // Territory schools (definer-scoped RPC), filtered by name in-memory; the gov
    // landing lists them, so hits point there.
    const { data } = await supabase.rpc('my_territory_schools')
    const ql = q.toLowerCase()
    for (const s of ((data ?? []) as { name?: string }[]).filter((s) => s.name?.toLowerCase().includes(ql)).slice(0, 8)) {
      hits.push({ label: s.name ?? '', sublabel: 'School', href: '/gov' })
    }
  }

  return hits.slice(0, 12)
}
