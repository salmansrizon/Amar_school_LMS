'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { publishBlock, publishMarksComplete, schemeHasUsableBands, type PublishBlock, type PublishFacts } from '@/lib/exam-setup'
import { numberFmt, t, type Lang, type MessageKey } from '@/lib/i18n'
import { setResultsPublished } from './actions'

const BLOCK_MESSAGE: Record<PublishBlock, MessageKey> = {
  noClass: 'exams.blockNoClass',
  noScheme: 'exams.blockNoScheme',
  noBands: 'exams.blockNoBands',
}

// Publishing results (#440). Reversible on purpose — unlike Closing, which is
// one-way — because a school that spots a marking error after publishing must
// be able to pull results back.
//
// Both directions ask first (owner workflow audit, AC2): publishing reaches
// every student of the class, so the dialog states how complete the marks are
// and refuses outright when the exam cannot produce a result at all. The
// server action re-checks the refusal; `facts` here is as old as the page.
export function PublishResults({
  lang,
  examId,
  publishedAt,
  facts,
}: {
  lang: Lang
  examId: string
  publishedAt: string | null
  facts: PublishFacts
}) {
  const router = useRouter()
  const published = publishedAt !== null
  const n = (x: number) => numberFmt(lang).format(x)

  const blocked = publishBlock(facts)
  const marksComplete = publishMarksComplete(facts)
  const checklist: { ok: boolean; label: MessageKey }[] = [
    { ok: facts.classSet, label: 'exams.readyClass' },
    { ok: schemeHasUsableBands(facts.schemeType, facts.bandCount), label: 'exams.readyScheme' },
    { ok: marksComplete, label: 'exams.readyMarks' },
  ]

  async function apply(next: boolean) {
    const result = await setResultsPublished(examId, next)
    if (result.blocked) return { error: t(BLOCK_MESSAGE[result.blocked], lang) }
    if (result.error) return { error: result.error }
    toast.success(t(next ? 'exams.resultsPublished' : 'exams.resultsUnpublished', lang))
    router.refresh()
  }

  return (
    <div className="mb-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch">
        <span className="text-sm">
          {published ? (
            <span className="font-semibold text-mint-deep">
              ✓ {t('exams.resultsPublished', lang)}
            </span>
          ) : (
            <span className="text-muted">{t('exams.publishHint', lang)}</span>
          )}
        </span>
        {published ? (
          <ConfirmDialog
            triggerLabel={t('exams.unpublishResults', lang)}
            triggerClassName="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted max-sm:inline-flex max-sm:min-h-11 max-sm:w-full max-sm:items-center max-sm:justify-center"
            title={t('exams.unpublishConfirmTitle', lang)}
            body={t('exams.unpublishConfirmBody', lang)}
            confirmLabel={t('exams.unpublishResults', lang)}
            cancelLabel={t('exams.closeModalCancel', lang)}
            onConfirm={() => apply(false)}
          />
        ) : (
          <ConfirmDialog
            triggerLabel={t('exams.publishResults', lang)}
            triggerClassName="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 max-sm:inline-flex max-sm:min-h-11 max-sm:w-full max-sm:items-center max-sm:justify-center"
            title={t('exams.publishConfirmTitle', lang)}
            body={t('exams.publishHint', lang)}
            confirmLabel={t(marksComplete || blocked ? 'exams.publishResults' : 'exams.publishAnyway', lang)}
            cancelLabel={t('exams.closeModalCancel', lang)}
            confirmDisabled={blocked !== null}
            confirmTone="brand"
            onConfirm={() => apply(true)}
          >
            <dl className="mb-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">{t('exams.countStudentsMarked', lang)}</dt>
              <dd className="font-semibold">
                {n(facts.studentsComplete)} / {n(facts.students)}
              </dd>
              <dt className="text-muted">{t('exams.countSubjectsComplete', lang)}</dt>
              <dd className="font-semibold">
                {n(facts.subjectsComplete)} / {n(facts.subjects)}
              </dd>
            </dl>
            <ul className="mb-3 space-y-1 text-sm">
              {checklist.map((item) => (
                <li key={item.label} className={item.ok ? 'text-mint-deep' : 'text-alert-deep'}>
                  <span aria-hidden>{item.ok ? '✓' : '✗'}</span> {t(item.label, lang)}
                </li>
              ))}
            </ul>
            {blocked ? (
              <p role="alert" className="mb-4 rounded-lg border border-alert bg-alert-soft p-3 text-sm font-semibold text-alert-deep">
                {t(BLOCK_MESSAGE[blocked], lang)}
              </p>
            ) : (
              !marksComplete && (
                <p className="mb-4 rounded-lg border border-sun bg-sun-soft p-3 text-sm font-semibold text-sun-deep">
                  {t('exams.warnMarksIncomplete', lang)}
                </p>
              )
            )}
          </ConfirmDialog>
        )}
      </div>
    </div>
  )
}
