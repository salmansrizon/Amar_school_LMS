// Minimal bilingual dictionary — Bangla default, English secondary (ADR 0004).
// Grows per feature slice; keep keys flat and screen-prefixed.

export type Lang = 'bn' | 'en'
export const DEFAULT_LANG: Lang = 'bn'
export const LANG_COOKIE = 'asm-lang'

type Entry = { bn: string; en: string }

const dict = {
  'app.name': { bn: 'আমার স্কুল', en: 'Amar School' },
  'login.title': { bn: 'লগইন', en: 'Log in' },
  'login.email': { bn: 'ইমেইল', en: 'Email' },
  'login.password': { bn: 'পাসওয়ার্ড', en: 'Password' },
  'login.submit': { bn: 'লগইন করুন', en: 'Log in' },
  'login.forgot': { bn: 'পাসওয়ার্ড ভুলে গেছেন?', en: 'Forgot password?' },
  'login.noAccount': { bn: 'অ্যাকাউন্ট নেই? স্কুল নিবন্ধন করুন', en: 'No account? Register a school' },
  'login.failed': { bn: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়', en: 'Invalid email or password' },
  'signup.title': { bn: 'স্কুল নিবন্ধন', en: 'Register School' },
  'signup.schoolName': { bn: 'প্রতিষ্ঠানের নাম', en: 'School name' },
  'signup.submit': { bn: 'নিবন্ধন করুন', en: 'Register' },
  'signup.haveAccount': { bn: 'অ্যাকাউন্ট আছে? লগইন করুন', en: 'Have an account? Log in' },
  'reset.title': { bn: 'পাসওয়ার্ড রিসেট', en: 'Reset password' },
  'reset.send': { bn: 'রিসেট লিংক পাঠান', en: 'Send reset link' },
  'reset.sent': { bn: 'ইমেইল পাঠানো হয়েছে — ইনবক্স দেখুন', en: 'Email sent — check your inbox' },
  'reset.newPassword': { bn: 'নতুন পাসওয়ার্ড', en: 'New password' },
  'reset.save': { bn: 'সংরক্ষণ করুন', en: 'Save' },
  'shell.logout': { bn: 'লগআউট', en: 'Log out' },
  'shell.welcome': { bn: 'স্বাগতম', en: 'Welcome' },
  'home.school': { bn: 'স্কুল ড্যাশবোর্ড', en: 'School Dashboard' },
  'home.dealer': { bn: 'ডিলার ড্যাশবোর্ড', en: 'Dealer Dashboard' },
  'home.superAdmin': { bn: 'সুপার অ্যাডমিন', en: 'Super Admin' },
  'home.gov': { bn: 'সরকারি পর্যবেক্ষণ', en: 'Government Oversight' },
  'home.placeholder': {
    bn: 'এই ভূমিকার ফিচারগুলো পরবর্তী ধাপে যুক্ত হবে।',
    en: 'Features for this role arrive in later slices.',
  },
  'staff.title': { bn: 'স্টাফ অনুমতি', en: 'Staff Permissions' },
  'staff.create': { bn: 'নতুন স্টাফ লগইন', en: 'New staff login' },
  'staff.fullName': { bn: 'পূর্ণ নাম', en: 'Full name' },
  'staff.createBtn': { bn: 'স্টাফ তৈরি করুন', en: 'Create staff' },
  'staff.list': { bn: 'স্টাফ তালিকা', en: 'Staff list' },
  'staff.none': { bn: 'এখনো কোনো স্টাফ ইউজার নেই', en: 'No staff users yet' },
  'staff.permissions': { bn: 'অনুমতি', en: 'Permissions' },
  'staff.screens': { bn: 'স্ক্রিন অ্যাক্সেস', en: 'Screen access' },
  'staff.granted': { bn: 'অনুমোদিত', en: 'Granted' },
  'denied.title': { bn: 'অনুমতি নেই', en: 'Permission denied' },
  'denied.body': {
    bn: 'এই স্ক্রিনে আপনার অ্যাক্সেস নেই। স্কুল মালিকের সাথে যোগাযোগ করুন।',
    en: 'You do not have access to this screen. Contact your School Owner.',
  },
  'denied.back': { bn: 'ড্যাশবোর্ডে ফিরুন', en: 'Back to dashboard' },
  'common.add': { bn: 'যোগ করুন', en: 'Add' },
  'locations.title': { bn: 'টেরিটরি ও লোকেশন', en: 'Territory & Locations' },
  'locations.tree': { bn: 'লোকেশন ট্রি', en: 'Location tree' },
  'locations.empty': { bn: 'এখনো কোনো লোকেশন নেই — একটি বিভাগ দিয়ে শুরু করুন', en: 'No locations yet — start with a Division' },
  'locations.clusters': { bn: 'ক্লাস্টার', en: 'Clusters' },
  'locations.clusterName': { bn: 'ক্লাস্টারের নাম', en: 'Cluster name' },
  'locations.confirmDelete': {
    bn: 'এই নোড এবং এর অধীনের সব লোকেশন মুছে যাবে — নিশ্চিত?',
    en: 'Delete this node and ALL locations under it?',
  },
  'locations.confirmDeleteCluster': {
    bn: 'এই ক্লাস্টারটি মুছে যাবে — নিশ্চিত?',
    en: 'Delete this cluster?',
  },
} satisfies Record<string, Entry>

export type MessageKey = keyof typeof dict

export function t(key: MessageKey, lang: Lang): string {
  return dict[key][lang]
}
