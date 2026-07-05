---
status: accepted
---

# Design tokens support light + dark from day one, even though dark mode isn't in the PRD

Nothing in the PRD calls for dark mode, and the legacy Java Swing app is light-only. We're building the design token system (colors, especially the semantic status palette from ADR-adjacent decisions) to support both light and dark themes from the start anyway, rather than light-only. We considered light-only (simpler, matches legacy, nothing requested it) but rejected it: retrofitting dark-mode-safe tokens after hundreds of components already hardcode light-mode assumptions is expensive rework, while designing token pairs up front costs little and can sit unused (no dark-mode toggle needs to ship in v1) until there's demand.
