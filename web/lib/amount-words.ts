// Amount-in-words for fee receipts (issue #11), Bangladeshi lakh/crore scale.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(belowHundred(rest))
  return parts.join(' ')
}

function integerInWords(n: number): string {
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  const parts = []
  if (crore) parts.push(`${integerInWords(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

export function takaInWords(amount: number): string {
  if (amount < 0 || !Number.isFinite(amount)) throw new Error('amount must be a non-negative number')
  // Work in integer paisa from the start — no IEEE754 drift on fractions.
  const totalPaisa = Math.round(amount * 100)
  const taka = Math.floor(totalPaisa / 100)
  const paisa = totalPaisa % 100
  if (paisa > 0) {
    return `${integerInWords(taka)} Taka and ${integerInWords(paisa)} Paisa Only`
  }
  return `${integerInWords(taka)} Taka Only`
}
