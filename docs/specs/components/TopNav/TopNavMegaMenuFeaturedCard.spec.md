---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavMegaMenuFeaturedCard
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by: [packages/core/src/TopNav/TopNav.test.tsx]
modules: []
families: [family:navigation-destinations]
design_specs: [design:bidirectionality]
architecture:
  [architecture:interaction-modality, architecture:component-theming-surface]
contributing: []
system_specs: []
---

# TopNavMegaMenuFeaturedCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavMegaMenuFeaturedCard` with `title`, `description`, `image`, `imageAlt`, `linkLabel`, `linkHref`, and `children`; target `top-nav-mega-menu-featured-card`. |
| Behavior                | A promotional card for a mega menu's featured slot: optional image, title, description, an optional call-to-action link, then caller content.                     |
| End-user impact         | Users see a highlighted destination; screen-reader users skip a decorative image unless `imageAlt` names it.                                                      |
| Builder impact          | None.                                                                                                                                                             |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps (see Current-state impact).                                                                   |
| Review checks           | Reject an image without `imageAlt` that is exposed to assistive technology, or a link rendered when only one of `linkLabel` and `linkHref` is set.                |
| Governing rules         | `design:bidirectionality` DR4; `architecture:interaction-modality`; `architecture:component-theming-surface`.                                                     |

This table is a review projection; the body below is authoritative.

## Intent

TopNavMegaMenuFeaturedCard fills a TopNavMegaMenu's featured slot with a card
that promotes one destination. Consumer usage lives in
`TopNavMegaMenuFeaturedCard.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The link arrow does not mirror.** The call-to-action link ends with a
  literal `→`, which points right in right-to-left layouts too.
  `design:bidirectionality` DR4 requires a progression glyph to mirror once.
- **Browser default focus ring.** The call-to-action link does not use the shared
  focus outline; keyboard focus paints the browser's default ring.
  `architecture:interaction-modality` provides the shared indicator it bypasses.

## Ownership boundary

**Owns**

- The card's content order, image semantics, and link condition (FR1–FR4).

**Does not own / non-goals**

- Destination acceptance and blocking for every `href` this component renders —
  owned by `family:navigation-destinations`.
- Placement in the panel and drawer — owned by `component:TopNavMegaMenu`.
- Caller `children` content.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                  | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root `div` carries `top-nav-mega-menu-featured-card`, the forwarded `ref`, and other DOM props, and shows: the image (full width, 140 px tall) when `image` is set, then the title, description, link, and `children`. | Current source and tests |
| FR2 | Without `imageAlt` the image is decorative: `alt=""`, `role="presentation"`, and `aria-hidden="true"`. With `imageAlt` it is a normal image with that alternative text.                                                    | Current source and tests |
| FR3 | The link renders only when both `linkLabel` and `linkHref` are set, through the `LinkProvider` link component, as `linkLabel` followed by ` →`.                                                                            | Current source and tests |
| FR4 | `className`, `style`, and `xstyle` merge after component styles.                                                                                                                                                           | Current source           |

### Allowed variation

- **AV1 — Optional parts.** Image, description, link, and children may each be
  absent.

### Representative states

| State            | Required invariant                      | Allowed variation |
| ---------------- | --------------------------------------- | ----------------- |
| Decorative image | Image hidden from assistive technology. | Image.            |
| Described image  | Image exposed with `imageAlt`.          | —                 |
| With link        | Link after the description.             | Label.            |

### Transformation and precedence order

- No precedence rule.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Image semantics.** FR2.

## Design relationships

| Anatomy or state | Design requirement                              | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Card             | Image above a body of title, description, link. | Current source and public docs | Supporting     | FR1, FR3           |

`TopNavMegaMenuFeaturedCard.doc.mjs` declares no anatomy of its own, so no
anatomy-theming map is recorded.

## Family and system relationships

- `family:navigation-destinations` owns the accept/block decision for each
  destination this component renders.
- `component:TopNavMegaMenu` renders the card in its featured area.
- `design:bidirectionality` DR4 governs the link glyph gap.

## Verification map

| Contract | Verification                                         | Representative states       | Mutation or failure expectation              | Audit section                                    |
| -------- | ---------------------------------------------------- | --------------------------- | -------------------------------------------- | ------------------------------------------------ |
| FR1      | `TopNav.test.tsx` featured-card rest-forwarding test | Root props                  | Dropped props fail.                          | `audit:TopNavMegaMenuFeaturedCard/behavior`      |
| FR2, FR3 | `TopNav.test.tsx` featured-card image tests          | With and without `imageAlt` | Exposed decorative image or lost link fails. | `audit:TopNavMegaMenuFeaturedCard/accessibility` |

Read from source, with no focused test yet: the content order (FR1); the forwarded `ref` and the `top-nav-mega-menu-featured-card` target (FR1); that the link renders only when both `linkLabel` and `linkHref` are set (FR3); the image size (FR1), the `LinkProvider` link and trailing arrow (FR3), and FR4.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples. It links to their
owners.
