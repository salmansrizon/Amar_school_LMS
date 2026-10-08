import { t, type Lang } from '@/lib/i18n'
import { Card } from '@/components/ui/page'

/** DataTable's `empty` slot when filters or search hide every row. */
export function NoMatch({ lang }: { lang: Lang }) {
  return (
    <Card>
      <p className="text-sm text-muted">{t('search.noResults', lang)}</p>
    </Card>
  )
}
