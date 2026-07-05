---
status: accepted
---

# Bangla-primary bilingual UI, not legacy's English-only chrome

The legacy Java Swing app has zero Bangla in its interface (verified against source: no Bengali-script strings anywhere in `AmarSchoolManagement/src`) — all labels, menus, and messages are English, with Bangla appearing only as user-entered data (names, addresses, notices). For the web rebuild we're deliberately deviating from that: the UI ships bilingual, with **Bangla as the default/primary language** and English as a switchable secondary, rather than porting the English-only chrome as-is. We considered staying English-only (cheapest, matches legacy exactly) and English-primary-with-Bangla-secondary (the more common default for B2B software), but rejected both — the product serves Bangladeshi school staff day-to-day, for whom Bangla is more natural, and the legacy app's English-only chrome reads as an inherited limitation rather than a deliberate choice worth preserving. This is real added scope over legacy: full i18n infrastructure and translated copy across every screen in the PRD, not a visual theme choice.
