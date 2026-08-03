import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/lib/engines/notification/engine'

const tpl = {
  title: { bn: 'নতুন ইনভয়েস', en: 'New invoice' },
  body: { bn: 'ইনভয়েস {{number}} — মোট {{total}}', en: 'Invoice {{number}} — total {{total}}' },
}

describe('renderTemplate', () => {
  it('interpolates placeholders in the default (bn) language', () => {
    expect(renderTemplate(tpl, { number: 'INV-1', total: 2000 })).toEqual({
      title: 'নতুন ইনভয়েস',
      body: 'ইনভয়েস INV-1 — মোট 2000',
    })
  })

  it('renders the requested language', () => {
    expect(renderTemplate(tpl, { number: 'INV-2', total: 5 }, 'en')).toEqual({
      title: 'New invoice',
      body: 'Invoice INV-2 — total 5',
    })
  })

  it('falls back and blanks missing placeholders', () => {
    expect(renderTemplate({ title: { en: 'Hi {{name}}' }, body: { en: '' } }, {}, 'bn')).toEqual({
      title: 'Hi ',
      body: '',
    })
  })
})
