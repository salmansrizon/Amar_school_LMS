---
status: accepted
---

# Dual typeface pairing per language, superseding the single-unified-font approach

The first UI mockup pass (this project's initial `/grill-with-docs` design session) settled on Hind Siliguri as one unified typeface for both Bangla and Latin text, to avoid a visual seam between scripts sitting side-by-side in dense tables. Adopting the Eduwave reference design system (Playfair Display headings + Inter body — neither has Bengali glyphs) forces a revisit: we're now pairing **Playfair Display + Inter for English-language screens/text, and Hind Siliguri for Bangla-language screens/text** (ADR 0004 still governs Bangla as the default/primary language; this ADR only changes which font renders it). We considered keeping the single-unified-font approach and dropping Playfair Display/Inter entirely (simpler, no dual voice) and finding a Bangla serif with Playfair-like character (avoids a font swap between languages, at the cost of a less proven/legible pairing). We chose the dual-pairing approach because only one language is visible at a time (the bn/en toggle swaps the whole UI, not mixed inline text), so "the app looks somewhat different per language" is a real but acceptable trade-off — and it lets English screens carry the actual Eduwave identity the redesign is adopting, rather than a compromise substitute in both languages.
