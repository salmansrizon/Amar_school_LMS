import { describe, expect, it } from 'vitest'
import { SIGN_IN_ERROR_KEY, signInErrorCode } from '@/lib/auth/sign-in-error'

describe('signInErrorCode', () => {
  it('maps user_banned to the banned message', () => {
    expect(SIGN_IN_ERROR_KEY[signInErrorCode('user_banned')]).toBe('login.banned')
  })
  it('keeps the ordinary message for anything else', () => {
    for (const c of ['invalid_credentials', '', undefined, null]) {
      expect(SIGN_IN_ERROR_KEY[signInErrorCode(c)]).toBe('login.failed')
    }
  })
})
