# Palette Generator Lab

This sandbox page is experimental decision tooling for AST-008. It does not
define a public generator API, adopt generated colors into a theme, or claim
that a palette is accessible.

## Reference data

- **Neutral — PR #5628** is an exact snapshot of `neutralPalettes` from commit
  `b19fc7a740ee43fa52db5555ccd0ac63bd0305d4` in
  `neutralThemePaletteReference.ts`. Keeping the snapshot local makes the
  comparison reproducible while #5668 remains unmerged.
- **Neutral — legacy preview** uses the seeds and HCT-based light/dark behavior
  from `apps/sandbox/src/app/(fullscreen)/pages/neutral-palette/page.tsx`.
- **Stone**, **Gothic**, **Y2K**, and **Butter** use the exported palette objects
  consumed by their corresponding sandbox palette pages. Page-level mode
  behavior and Butter-specific overrides are represented in `themeCorpus.ts`.

The deployed GitHub Pages versions of those sandbox pages are visual
verification references. The lab does not fetch them at runtime because network
state cannot be part of deterministic generation.

Run the sandbox-owned generator tests with `pnpm --filter
@astryxdesign/sandbox test`.

## Interpretation

Existing-theme comparisons exclude the shared black and white endpoints from
the visual difference summary. Suggested vibrancy values minimize average OKLab
distance across stops 5–95 for the selected algorithm. They are starting points,
not approvals or immutable theme settings.
