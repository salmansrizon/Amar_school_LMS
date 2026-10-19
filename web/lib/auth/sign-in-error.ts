/** Map a Supabase sign-in error code to the login form's error code. A login the
 *  School Owner disabled comes back as `user_banned`; everything else keeps the
 *  ordinary wrong e-mail/password message. */
export function signInErrorCode(authCode: string | null | undefined): 'banned' | 'failed' {
  return authCode === 'user_banned' ? 'banned' : 'failed'
}

export const SIGN_IN_ERROR_KEY = { banned: 'login.banned', failed: 'login.failed' } as const
