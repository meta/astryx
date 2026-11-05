---
schema_version: 1
template_version: 2
kind: design
id: design:bidirectionality
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-10-15
owners: [nynexman4464, cixzhang, rubyycheung]
review_triggers: [visual, interaction, accessibility]
verified_by:
  [
    apps/storybook/rtl-audit/rtl-audit.mjs,
    apps/storybook/rtl-audit/targets.json,
    internal/eslint-plugin-astryx/no-physical-properties.test.mjs,
  ]
architecture:
  [architecture:internationalization, architecture:rtl-audit-evidence]
components: []
families: []
deciding_specs: [spec:AST-020]
---

# Bidirectionality design specification

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "accessibility": ["DR1", "DR2", "DR8", "DR10", "DR11", "DR12"],
    "interaction": ["DR1", "DR6", "DR8", "DR10", "DR11", "DR12", "DR13"],
    "layering": ["DR7", "DR10"],
    "layout": ["DR1", "DR2", "DR3", "DR7", "DR9", "DR10"],
    "navigation": ["DR1", "DR3", "DR4", "DR5", "DR6", "DR10", "DR11"],
    "react-runtime": ["DR9"],
    "responsive": ["DR1", "DR3", "DR10", "DR14"],
    "scrolling": ["DR1", "DR6", "DR10", "DR13"],
    "styling": ["DR3", "DR4", "DR5", "DR9", "DR10"],
    "visual": ["DR1", "DR4", "DR5", "DR10"]
  }
}
```

## User intent

People should understand and operate the same Astryx interface whether their
page, region, or content flows left-to-right or right-to-left. RTL support is not
a mechanical reflection of every pixel. It preserves meaning, reading order,
spatial relationships, target size, and interaction behavior for the active
writing direction.

## Design principles

- **DR1 — Preserve meaning, not coordinates.** An RTL presentation MUST preserve
  the same task meaning and affordance relationships as LTR. A physical left/right
  implementation detail is not a design requirement unless the content itself is
  physical.
- **DR2 — Content direction and layout direction are distinct.** A page or region
  has an ambient direction, while text, code, URLs, identifiers, and user content
  may carry their own direction. Mixed-direction content MUST retain readable
  character order and punctuation without moving to a different semantic slot.
- **DR3 — Reading-order relationships follow inline start and end.** Navigation,
  ordered progression, primary/supporting lanes, leading/trailing content, and
  start/end alignment MUST follow the containing region's direction.
- **DR4 — Directional artwork is handled exactly once.** A horizontal icon or
  decorative glyph whose meaning is previous, next, back, forward, start, end, or
  progression MUST mirror or swap once. Artwork that the Unicode bidi algorithm
  already mirrors MUST NOT receive a second manual mirror.
- **DR5 — Direction-neutral and physical content stays stable.** Vertical,
  symmetric, brand, media, chart, map, clock, hardware, and other physically
  meaningful content MUST remain unchanged unless its specific semantic role is
  directional. A reference sample that exposes caller-supplied left/right glyph
  geometry as data preserves that geometry; the same glyph used as a previous,
  next, or progression cue follows DR4 instead.
- **DR6 — Interaction follows the visual relationship.** Horizontal keyboard
  movement, drag/resize math, carousel or scroll progression, range navigation,
  and side placement MUST produce the action indicated by the RTL visual state.
- **DR7 — Overlays stay attached to their logical owner.** Menus, dialogs,
  tooltips, popovers, drawers, and other layered surfaces MUST preserve their
  start/end alignment and relationship to the trigger in the trigger's region.
- **DR8 — Hit targets follow visible controls.** A pointer or touch target MUST
  remain centered on the visible control in both directions and MUST preserve the
  component's required target size. Mirroring MUST NOT displace, shrink, or make
  only part of the visible control clickable.
- **DR9 — Direction changes must not flash the wrong relationship.** Server and
  first-paint output SHOULD agree with the document or region direction. A
  direction-dependent relationship MUST NOT wait for a post-render JavaScript
  correction when platform layout can express it.
- **DR10 — Exceptions require semantics, not convenience.** A component may keep a
  physical orientation only when that orientation carries stable user meaning.
  Implementation difficulty, current LTR behavior, or an all-N/A audit does not
  establish an exception.

## Anatomy and hierarchy

Bidirectionality applies to relationships rather than one shared DOM anatomy.

| Role                      | Purpose                                                            | Required relationship                                                                     |
| ------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Ambient region            | Establishes layout and browser text-flow direction                 | Descendants follow its `dir` unless a nested content region establishes another direction |
| Ordered sequence          | Communicates progression or reading order                          | First/previous/start and last/next/end exchange physical sides under RTL                  |
| Directional control       | Moves, reveals, or points along the inline axis                    | Artwork and behavior agree after exactly one directional treatment                        |
| Directional decoration    | Communicates hierarchy or progression without interactive behavior | Mirrors exactly once when its UI role is directional                                      |
| Direction-neutral content | Carries visual meaning independent of inline direction             | Retains its orientation                                                                   |
| Interactive target        | Receives pointer, touch, or keyboard input                         | Remains aligned with the visible affordance and preserves required size                   |
| Nested bidi content       | Carries text whose direction differs from its surrounding region   | Preserves its own character order, punctuation, and readable isolation                    |

## State representation

| State                                           | Required representation                                                                      | Allowed variation                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| LTR region                                      | Inline progression begins at the left and ends at the right                                  | Component-specific spacing and artwork                     |
| RTL region                                      | Inline progression begins at the right and ends at the left                                  | Component-specific spacing and artwork                     |
| Explicit direction override                     | The chosen direction governs the subtree even when locale normally implies another direction | Test and product reasons for the override                  |
| Nested opposite-direction region                | Local content flow changes without moving the region to another semantic slot                | Alignment chosen by the owning layout contract             |
| Mixed text, code, URL, or identifier            | Character order and ending punctuation remain readable                                       | Browser bidi behavior plus explicit isolation where needed |
| Manual-mirror glyph or icon                     | One horizontal mirror or one paired-glyph swap                                               | CSS transform or semantic glyph pair                       |
| Unicode bidi-mirrored glyph                     | Browser mirrors the unchanged glyph                                                          | Exact glyph choice                                         |
| Vertical, symmetric, brand, or physical artwork | Orientation remains unchanged                                                                | Scale, color, and theme treatment                          |
| Coarse-pointer control                          | Target stays centered and meets the component's minimum target size                          | Invisible hit-area shape beyond that minimum               |

## Responsive and input behavior

- **DR11 — Keyboard direction is resolved at interaction time.** Left/right
  behavior MUST follow the current rendered region, including nested regions and
  runtime direction changes. Labels remain semantic (`previous`, `next`, `start`,
  `end`) rather than becoming physical left/right instructions.
- **DR12 — Pointer and touch geometry is direction-invariant in quality.** The
  visible control, native input, and effective hit area MUST share a center within
  the component's stated tolerance in LTR and RTL, and MUST preserve the owning
  component's stated minimum target size. Proving centering alone is insufficient.
  WCAG 2.5.8 target-size ownership and exceptions remain with AST-020 and the
  component/composition contract.
- **DR13 — Drag, resize, and scroll outcomes mirror.** A gesture toward logical
  next/end MUST move toward logical next/end in both directions. Physical deltas
  may invert while the user-visible action remains equivalent.
- **DR14 — Responsive reflow preserves logical ownership.** Moving content into a
  drawer, sheet, overflow menu, or alternate layout MUST preserve which content is
  leading/trailing and how focus returns to its logical trigger.

## Accessibility intent

- Accessible names describe semantic actions, not physical icon direction. Use
  "Previous month" and "Next month," not "Left arrow" and "Right arrow."
- DOM `dir` must describe the browser's actual region direction so text flow,
  punctuation, native control behavior, focus/navigation order, and accessibility
  APIs agree with the visual presentation.
- Mixed-direction user content needs an explicit local direction or isolation when
  browser inference cannot keep weak punctuation, numbers, or URLs readable.
- RTL support must preserve focus visibility, keyboard reachability, target size,
  and announcement meaning. A mirrored picture with displaced focus or touch
  geometry is not equivalent behavior.
- Automated all-N/A output is not evidence that a component is RTL-ready. The
  evidence policy is owned separately by RTL audit architecture.

## Representative examples

| Example                                         | Required outcome                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb slash between hierarchy items        | Mirrors as progression decoration; `/` in a date, path, fraction, or prose does not                                                |
| Calendar previous/next buttons                  | Buttons exchange sides, chevrons point toward their action, and semantic labels stay previous/next                                 |
| Checkbox, Radio, and Switch on a coarse pointer | Native input remains centered over the visible control and preserves the owning component's minimum target size in both directions |
| Carousel next action                            | Control placement, icon, and scroll delta agree on logical next                                                                    |
| Arabic sentence containing a URL                | Arabic text flows RTL while the URL remains readable LTR and punctuation stays with the intended content                           |
| Raw glyph registry reference sample             | Caller-supplied left/right geometry remains unchanged as data; no directional-control behavior is implied                          |
| Brand logo or photograph                        | Does not mirror merely because the surrounding layout is RTL                                                                       |

## Visual references

No normative screenshots are required for this record. Repo-owned component
stories and relationship-based LTR/RTL audit output provide implementation
evidence; they do not replace the human intent in this record.

## Component contract links

No component record currently links this record. The explicit global routes
supply the matched RTL relationships to component and module reviews without
requiring a backlink from each component. A visual change loads
artwork meaning and exceptions; navigation, interaction, and scrolling load their
own directional outcomes together with the semantic-exception boundary. The routes
do not make every glyph directional, require a
particular implementation, or settle the open questions below.

Component, module, and family contracts own their local semantic relationships:
which artwork is a navigation cue versus data, which parts are leading/trailing,
which keyboard/scroll actions they expose, supported states, target-size
requirements, and the tests that prove those outcomes. They cite a specific shared
DR when a local requirement or exception needs that relationship; they do not
copy a universal RTL checklist or redefine the shared rules.

Review resolves the direct owner for the exact delta and applies only the matched
shared claims within their stated scope. Local exceptions require a consistent
semantic reason under DR5/DR10, not an implicit override of current authority.
Runtime/helper responsibility remains in `architecture:internationalization`;
RTL audit evidence and deliberate D1 exemption review remain in
`architecture:rtl-audit-evidence`.

## Decision log

### DEC-1 — Adopt DR1–DR14 as the shared bidirectional relationships

**Reference:** `design:bidirectionality/DEC-1`
**Decider:** `nynexman4464`, `2026-10-15`

People reading in either direction get the same task meaning, reading order,
and interaction outcomes when components follow DR1–DR14. Audit admission and
implementation evidence remain with their separate owners, and the open
questions below stay undecided.

## Open questions

- **OQ1 — Physical-orientation exception vocabulary.** Do components need a
  shared explicit way to document physical/world-oriented artwork exceptions, or
  are component-local decisions sufficient?
- **OQ3 — Mixed-content fixtures.** Which public-safe mixed Arabic/Hebrew plus
  URL/number/punctuation fixtures should become required representative stories?
- **OQ4 — Direction-change transitions.** Should runtime `dir` changes have an
  explicit no-animation rule, or may components animate when the resulting
  intermediate relationships remain understandable?

## Content boundary

This file does not define provider APIs, CSS or hook implementation, lint rules,
current audit scores, verified-N/A admission, or consumer examples. It links to
those owners.
