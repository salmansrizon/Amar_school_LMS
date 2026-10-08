import { describe, it, expect } from 'vitest'
import { pageWindow, pageSizeFrom, pageRange } from '@/components/pager'
import { withParams } from '@/lib/url-params'

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3])
  })
  it('elides runs on both sides of the current page', () => {
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
  })
  it('does not add a gap between neighbours', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20])
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, 'gap', 20])
  })
  it('handles a single page', () => {
    expect(pageWindow(1, 1)).toEqual([1])
  })
})

describe('pageSizeFrom', () => {
  it('accepts allowed sizes only', () => {
    expect(pageSizeFrom('50', 20)).toBe(50)
    expect(pageSizeFrom('37', 20)).toBe(20)
    expect(pageSizeFrom(undefined, 20)).toBe(20)
  })
})

describe('pageRange', () => {
  it('gives the inclusive range of a page', () => {
    expect(pageRange('2', 45, 20)).toMatchObject({ page: 2, totalPages: 3, from: 20, to: 39 })
  })
  it('clamps an out-of-range or junk page', () => {
    expect(pageRange('99', 45, 20).page).toBe(3)
    expect(pageRange('0', 45, 20).page).toBe(1)
    expect(pageRange('abc', 45, 20).page).toBe(1)
    expect(pageRange('5', 0, 20)).toMatchObject({ page: 1, totalPages: 1 })
  })
})

describe('withParams with a second pager', () => {
  it('a filter change resets every *page key', () => {
    expect(withParams({ page: '3', rpage: '2' }, { q: 'a' })).toBe('?q=a')
  })
  it('moving one pager keeps the other', () => {
    expect(withParams({ page: '3', rpage: '2' }, { rpage: '4' }, 'rpage')).toBe('?page=3&rpage=4')
    expect(withParams({ page: '3', rpage: '2' }, { page: '4' })).toBe('?page=4&rpage=2')
  })
  it('changing the secondary size resets only its own page', () => {
    expect(withParams({ page: '3', rpage: '2' }, { rsize: '50', rpage: null }, 'rpage')).toBe('?page=3&rsize=50')
  })
})
