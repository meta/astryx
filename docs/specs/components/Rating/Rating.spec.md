---
schema_version: 3
template_version: 7
kind: component
id: component:Rating
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers:
  [public-api, behavior, theming, accessibility, interaction, testing, visual]
verified_by:
  [
    packages/lab/src/Rating/Rating.test.tsx,
    packages/lab/src/Rating/RatingTracking.test.tsx,
    apps/storybook/stories/Rating.stories.tsx,
  ]
modules: []
families: [family:action-groups]
design_specs: []
architecture:
  [
    architecture:component-test-sufficiency,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:theme-tokens,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-085]
---

# Rating component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `@astryxdesign/lab` exports one `Rating` component, its props, and its `RatingSize` type.                                                                                                                                                                   |
| Behavior                | As an input, Rating is a radio group of `max` stars with one tab stop. A press, a lifted touch slide, or an arrow key chooses a star. With `isReadOnly`, it is one image that shows a whole or fractional rating.                                           |
| End-user impact         | People rate with a pointer, a finger, or the keyboard, and screen-reader users hear each star as "N of M stars". A shown average, such as 4.3, reads as one value and takes no tab stop.                                                                    |
| Builder impact          | Callers own the value: they pass `label`, `value`, and `onChange`, and may set `max`, `size`, `isDisabled`, `isReadOnly`, `allowClear`, and `getStarLabel`.                                                                                                 |
| Compatibility/readiness | Additive experimental Lab component. The API and paint stay draft until an engineering owner approves this record.                                                                                                                                          |
| Review checks           | Reject an uncontrolled value, a fractional value in the input, wrapping arrows, a selection on Tab or pointer focus, a disabled group that leaves the tab order, star buttons in the read-only image, hover paint without a hover guard, or literal colors. |
| Governing rules         | `family:action-groups`, `architecture:public-component-api`, `architecture:component-theming-surface`, `architecture:interaction-modality`, `architecture:component-test-sufficiency`, `spec:AST-002`, and `spec:AST-085`.                                  |

This table is a review projection; the body below is authoritative.

## Intent

Rating lets a person give a score from 1 to a small maximum, and lets a page
show a score, such as a product average. The input uses the radio-group model,
so the keyboard and screen-reader paths match other single-choice groups.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive experimental Lab API
- Controlled/uncontrolled behavior: controlled only. The caller owns `value`
  and updates it in `onChange`. The component keeps no value state.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The star group, its stars, their glyphs, and the three sizes.
- The radio-group keyboard model, the touch slide-and-lift choice through the
  action-groups family, and hover preview under a hover-capable pointer.
- The read-only image and its text name.
- The `rating` theming target and its reflected size.

**Does not own / non-goals**

- Value storage, persistence, averages, or vote counts — owned by the caller.
- A visible label, help text, or a field wrapper — owned by the caller or a
  field component.
- Half-star input. Only the read-only image shows fractions.
- Icons other than the star.

## Public concepts

Consumer prop syntax and examples remain in `Rating.doc.mjs`.

| Concept       | Closed values or states                         | Meaning                                                         | Availability by variant/orientation/state | Default                | Owner                               | Stability        | Invalid-value behavior                                                                                                               |
| ------------- | ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | ---------------------- | ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| label         | non-empty caller-authored string                | the accessible name of the group or the image                   | every rating                              | required               | product                             | experimental Lab | TypeScript requires a string; blank text is a caller error                                                                           |
| value         | `null` or a number from 0 to `max`              | the chosen star; `null` or 0 means not rated                    | every rating                              | required               | product                             | experimental Lab | non-finite or non-positive resolves to 0; above `max` resolves to `max`; the input rounds to a whole star, the image keeps fractions |
| onChange      | callback with a star from 1 to `max`, or `null` | reports the person's choice                                     | the editable input                        | none                   | product                             | experimental Lab | without it, choices report nothing and the value stays as passed                                                                     |
| max           | positive whole number                           | the number of stars                                             | every rating                              | `5`                    | product                             | experimental Lab | a non-finite value resolves to 5; others floor to a whole number of at least 1                                                       |
| size          | `sm`, `md`, `lg`                                | star size of 16, 24, or 32 px                                   | every rating                              | `md`                   | product                             | experimental Lab | closed union                                                                                                                         |
| isReadOnly    | read-only, editable                             | shows the value as one image with no stars to choose            | every rating                              | editable               | product                             | experimental Lab | closed boolean                                                                                                                       |
| isDisabled    | disabled, enabled                               | stops choices; the group stays focusable and announces disabled | every rating                              | enabled                | product                             | experimental Lab | closed boolean                                                                                                                       |
| allowClear    | clears, keeps                                   | a second choice of the checked star reports `null`              | the editable input                        | keeps                  | product                             | experimental Lab | closed boolean                                                                                                                       |
| getStarLabel  | function of star and max to a string            | the text name of a rating, such as "3 of 5 stars"               | every rating                              | localized catalog text | product                             | experimental Lab | without it, the catalog text applies                                                                                                 |
| DOM extension | supported `BaseProps`, styling, and ref         | positions the group and wires caller handlers                   | every rating                              | no additional inputs   | `architecture:public-component-api` | experimental Lab | `children`, `role`, `aria-label`, and native `onChange` are not accepted                                                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                               | Basis                                                         | Draft review state                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| FR1 | The editable Rating MUST render one radio group named by `label`, with one radio per star named by the star label. Exactly one radio, the checked star or the first star when none is checked, MUST be in the tab order.                                                          | radio-group pattern                                           | candidate implementation; pending owner approval |
| FR2 | A press on a star MUST report that star through `onChange` unless it is already checked. With `allowClear`, a press on the checked star MUST report `null`; without it, that press MUST report nothing.                                                                           | product direction                                             | candidate implementation; pending owner approval |
| FR3 | Down and the inline-end arrow MUST move the choice one star higher, and Up and the inline-start arrow one star lower. Home and End MUST choose the first and last star. Arrows MUST NOT wrap. Space or Enter on the checked star MUST follow FR2. A modified key MUST do nothing. | radio-group pattern; product direction for the Down direction | candidate implementation; pending owner approval |
| FR4 | Only a focus move from an arrow key, Home, or End MUST choose a star. Tab, a pointer, and a script focus MUST choose nothing.                                                                                                                                                     | radio-group pattern                                           | candidate implementation; pending owner approval |
| FR5 | Under the touch presentation, a finger or pen slide across the stars MUST choose the star under the lift, and a lift outside the group or a cancel MUST choose nothing (`family:action-groups` FR1–FR3). Coarse-pointer targets MUST reach 44 px without larger glyphs.           | `family:action-groups`                                        | candidate implementation                         |
| FR6 | With `isDisabled`, the group MUST stay focusable, MUST announce disabled, and MUST block every choice path (`spec:AST-085`).                                                                                                                                                      | `spec:AST-085`                                                | candidate implementation                         |
| FR7 | With `isReadOnly`, Rating MUST render one image named by `label` and the rating text, with no radios and no tab stop. A fractional value MUST fill the last star partway from the inline start, in LTR and RTL.                                                                   | product direction                                             | candidate implementation; pending owner approval |
| FR8 | Under a hover-capable pointer, hovering a star MUST preview the stars up to it; the preview MUST end when the pointer leaves. Hover paint MUST be guarded by hover capability.                                                                                                    | `architecture:interaction-modality`                           | candidate implementation                         |
| FR9 | The root MUST combine `xstyle`, `className`, and `style`, forward supported DOM props, event handlers, and its ref, and keep its role, name, and disabled state authoritative. A caller key or focus handler that calls `preventDefault` MUST stop the component's handling.      | `architecture:public-component-api`                           | candidate implementation                         |

### Allowed variation

- **AV1 — Star count.** Callers choose `max`; the keyboard and label rules do
  not change.
- **AV2 — Wording.** Callers replace the star text with `getStarLabel`.
- **AV3 — Theme output.** Themes may repaint the admitted `rating` target and
  the token roles below without changing behavior.

### Representative states

| State              | Required invariant                                                     | Allowed variation      |
| ------------------ | ---------------------------------------------------------------------- | ---------------------- |
| Not rated          | no star checked; the first star holds the tab stop                     | size, `max`            |
| Rated              | stars up to the value filled; the checked star holds the tab stop      | size, `max`            |
| Hover preview      | stars up to the hovered star painted as filled; the value is unchanged | hover-capable pointers |
| Disabled           | focusable, announced disabled, filled stars in the disabled text color | rated or not           |
| Read-only fraction | one image; the last star partly filled from the inline start           | LTR and RTL            |
| Forced colors      | filled stars in Highlight; empty stars in CanvasText                   | every state            |

### Transformation and precedence order

- **ORD1 — Count.** Resolve `max` to a whole number of at least 1.
- **ORD2 — Value.** Resolve `value` to 0 when missing, non-finite, or not
  positive; cap it at `max`; round it to a whole star unless read-only.
- **ORD3 — Choice.** A caller handler that prevents the default wins; then
  disabled and read-only block the choice; then FR2 decides the report.

### Performance and resources

- **PR1 — Bounded anatomy.** Rendering work is one group and `max` stars, each
  with at most two glyph paths.
- **PR2 — Shared interaction resources.** Touch choice uses the shared
  action-groups press tracking and adds no star-local listener or timer.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Group.** The editable Rating is a `radiogroup` named by `label`. Each
  star is a `radio` button named by the star label, with `aria-checked` on the
  checked star.
- **AR2 — Disabled.** `isDisabled` sets `aria-disabled` on the group and the
  radios, keeps the tab stop, and blocks every choice path.
- **AR3 — Read-only.** The read-only Rating is one `img` named "label: rating
  text". The glyphs are hidden from assistive technology.
- **AR4 — Focus.** Each star shows the shared focus-visible outline.
- **AR5 — Wording.** The star text comes from the localized catalog unless
  `getStarLabel` replaces it; the component mints no other copy.

## Design relationships

| Anatomy or state | Design requirement                                               | Representation authority                       | Hierarchy role          | Component contract |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ----------------------- | ------------------ |
| Star glyph       | One outlined star shape; filled stars fill with the rating color | candidate implementation pending visual review | primary content         | FR1, FR7           |
| Sizes            | Three sizes, 16, 24, and 32 px                                   | candidate implementation pending visual review | density                 | public concepts    |
| Hover preview    | A preview fill that ends when the pointer leaves                 | candidate implementation pending visual review | supporting state signal | FR8                |
| Disabled         | Filled stars in the disabled text color                          | candidate implementation pending visual review | supporting state signal | FR6                |

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                                                                                        | Intent or reason                                                          | Applies to    | Allowed variation         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------- | ------------------------- |
| DD1 | Filled stars use `--color-icon-yellow`; empty star outlines use `--color-border-emphasized`; disabled filled stars use `--color-text-disabled`. | The rating color reads as a score; the outline keeps empty stars visible. | every star    | themes repaint the tokens |
| DD2 | Under forced colors, filled stars use Highlight and empty stars use CanvasText.                                                                 | System colors keep the score visible in high-contrast modes.              | forced colors | none                      |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Star group": {"target": "rating"},
  "Star glyph": {"inherits": "rating"}
}
```

## Family and system relationships

- `family:action-groups` owns the touch slide-and-lift choice across the
  stars and its cancel rules.
- `architecture:public-component-api` owns DOM reachability, prop semantics,
  styling composition, handler forwarding, and React 19 refs.
- `architecture:component-theming-surface` owns the root painting target and
  its reflected size.
- `architecture:interaction-modality` owns hover capability, touch press, and
  focus-visible behavior.
- `architecture:component-test-sufficiency` owns representative-state and
  mutation-sensitive regression evidence.
- `architecture:theme-tokens` owns the color and spacing vocabulary.
- `spec:AST-002` owns admission of the public Lab surface and invalid-input
  behavior; `spec:AST-085` owns the focusable disabled state.

## Verification map

| Contract               | Verification                                         | Representative states                                                       | Mutation or failure expectation                                                                                  | Audit section              |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1–FR4, FR6, AR1, AR2 | `Rating.test.tsx`                                    | not rated, rated, each key, Tab and pointer focus, clear, disabled          | a wrapping arrow, a selection on Tab, a lost tab stop, or a choice while disabled fails focused assertions       | `audit:Rating/behavior`    |
| FR5, PR2               | `RatingTracking.test.tsx`                            | a slide across stars, a lift outside, a cancel                              | a choice on a lift outside, or a choice on cancel, fails the pointer-stream tests                                | `audit:Rating/interaction` |
| FR7, AR3               | `Rating.test.tsx` plus the Storybook read-only story | whole and fractional values, LTR and RTL                                    | radios in the image, a tab stop, or a fill from the wrong edge fails assertions or rendered review               | `audit:Rating/read-only`   |
| FR8, FR9, AR4          | focused tests and source inspection                  | hover, caller handlers that prevent the default, custom DOM and style input | unguarded hover, dropped inputs or ref, or a handler that cannot stop the component fails tests or source checks | `audit:Rating/api`         |

## Decision log

None. This record remains draft; its candidate requirements await
engineering-owner approval.

## Open questions

- **OQ1 — Does the Down arrow raise the rating, as it moves to the next radio
  in a radio group, or lower it, as on a vertical scale?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables or examples, audit results,
implementation steps, or family and system rules. It links to their owners.
