import { describe, it, expect } from 'vitest'
import { pageWindow, pageSizeFrom } from '@/components/pager'

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
