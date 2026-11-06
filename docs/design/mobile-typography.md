---
schema_version: 1
template_version: 1
kind: design
id: design:mobile-typography
authority: current
archive_reason: null
superseded_by: null
approved_by: rubyycheung
approved_at: 2026-09-30
owners: [imdreamrunner, rubyycheung]
review_triggers: [visual, responsive, theming]
verified_by: [scripts/check-knowledge.mjs]
architecture: [architecture:theme-tokens, architecture:theme-authoring-contract]
components: []
families: []
deciding_specs: [spec:AST-102/DEC-2]
---

# Mobile typography design specification

## User intent

Balance the rest of the text styles with inputs' automatic 16px-reference
minimum on coarse-pointer iOS devices.

## Design principles

- **DR1 — Reading base.** The mobile base MUST be `M = max(B, 16)`; 16px-reference is `1rem`. When the person has set a text size, it replaces this base and DR2's pin does not apply (`spec:AST-102` FR3).
- **DR2 — Pin target.** The selected role MUST retain its desktop size; other roles follow the derived scale.

## Anatomy and hierarchy

`B` is the desktop base, `r` its ratio, `k` a raw step, and `a` the selected pin step.

| Desktop ratio r    | Pin target; step a | Design intent                                                                         |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------- |
| `r <= 1.25`        | Display 1; `+6`    | Retain the compact scale's display size as the reading base increases.                |
| `1.25 < r < 1.414` | Heading 2; `+2`    | Preserve Heading 2 while reducing larger display roles relative to body text.         |
| `r >= 1.414`       | Heading 3; `+1`    | Preserve Heading 3 so the display tier does not dominate body text on narrow screens. |

The required size relationships are:

```text
M = max(B, 16)
r_pin = r * (B / M)^(1/a)
desktop(k) = round(B * r^k)
mobile(k) = round(M * r_pin^k)
```

Round to the nearest whole reference pixel, with halfway ties rounded up;
divide by 16 for rem. Above the pin, roles shrink; below it, they grow
(`B < 16`, before rounding).

## State representation

Outside the mobile condition, retain desktop sizes.
When `B >= 16` and no text size is set, the mobile profile retains the desktop base and ratio.

## Responsive and input behavior

- **DR3 — Activation.** By default, mobile MUST match `(width < 1024px) and (pointer: coarse)`.

Width is the layout viewport; coarse refers to the primary pointer.
Use the effective `lg` breakpoint governed by `spec:AST-012`; the stock value is
1024 CSS px and the upper edge is exclusive.
Browser support and fallback follow `spec:AST-013`; browser-specific behavior
requires evidence from that browser.

## Accessibility intent

- **DR4 — Root sizing.** The mobile profile MUST NOT change the document-root font size.

## Representative examples

```text
B=14; r=1.333; a=2; M=16; r_pin=1.246907324142416
heading-2: 25→25px; body: 14→16px; display-1: 79→60px
```

### Verification

| Contract | Verification                       | Representative states                     | Failure signal                  |
| -------- | ---------------------------------- | ----------------------------------------- | ------------------------------- |
| DR2      | Review the ratio-to-target mapping | Below, at, and above 1.25/1.414           | Wrong target or boundary        |
| DR1, DR2 | Compare the required sizes         | Worked example; B>=16                     | Changed anchor or base          |
| DR3      | Check activation                   | Narrow/wide × coarse/fine; exactly 1024px | Wrong conjunction or boundary   |
| DR4      | Check root sizing                  | Mobile profile active/inactive            | Changed document-root font size |

## Visual references

No normative assets are included.

## Component contract links

No component-specific contract links are introduced.

## Decision log

### DEC-1 — Mobile size relationships

**Reference:** `design:mobile-typography/DEC-1`
**Decider:** `rubyycheung`, `2026-09-30`
**Decision:** Apply DR1–DR4 to balance mobile text styles with the input minimum.

## Open questions

- **OQ1 — Which desktop base sizes and ratios must this policy support?**

## Content boundary

This record defines mobile text-size relationships, not prop syntax,
implementation structure, current audit scores, or consumer usage examples.
