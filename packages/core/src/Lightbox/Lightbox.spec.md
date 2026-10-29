---
schema_version: 3
template_version: 3
kind: component
id: component:Lightbox
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Lightbox/Lightbox.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# Lightbox component contract

## Intent

Lightbox presents one active image or video in a full-viewport viewer and may
add gallery navigation, a caption, and a position counter. This draft records
current consumer anatomy and theming ownership without changing runtime
behavior, styling, targets, or public API.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive documentation only; runtime, DOM, styling,
  targets, aliases, and public API remain unchanged
- Controlled/uncontrolled behavior: unchanged
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Viewer overlay and its current `lightbox` target.
- Media presentation, optional Caption and Counter placement, gallery navigation,
  and current image zoom and pan behavior.

**Does not own / non-goals**

- The Close, Previous, and Next button surfaces — delegated to
  `component:Button` through IconButton.
- Caller-provided Caption content.
- New targets for Media, Caption, or Counter; none exist on current `main`.
- Shared layer hosting or dismissal policy.

## Public concepts

No new public concept is introduced. Consumer props and usage remain documented
in `Lightbox.doc.mjs`.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                | Basis                           | Draft review state                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| FR1 | The current viewer contains one active Media item and a Close button; galleries additionally contain Previous and Next buttons plus a Counter, and Caption renders only when supplied.                                                                                             | Current source, docs, and tests | Verified current behavior; no new behavior decided |
| FR2 | Viewer overlay carries the current `lightbox` target. Media, Caption, and Counter carry no Lightbox public target.                                                                                                                                                                 | Current source and public docs  | Verified current reachability; no target change    |
| FR3 | Close, Previous, and Next button surfaces use Button's `button` target through IconButton rather than Lightbox-owned button targets.                                                                                                                                               | Current source and target docs  | Verified current delegation; no ownership change   |
| FR4 | The open viewer is a focus region through Core's shared focus-region module (`component:Dialog/DEC-2`): Tab from its last control moves focus to its first and Shift+Tab from its first moves focus to its last, so focus never leaves the viewer for the browser's own interface. | `component:Dialog/DEC-2`        | Owner decision; tests land with the implementation |

### Allowed variation

- **AV1 — Media mode.** Media may be an image or video; zoom and pan are available
  only on the current image path.
- **AV2 — Gallery mode.** Previous, Next, and Counter are absent for a single
  item. Navigation button disabled state follows the current gallery boundary.
- **AV3 — Caption content.** Caller-provided Caption content may vary without
  becoming a Lightbox-owned target.

### Representative states

| State            | Required invariant                                                  | Allowed variation                             |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Single image     | Viewer overlay, Media, and Close button render.                     | Caption and zoom may be absent or present.    |
| Gallery boundary | Both navigation buttons and Counter remain rendered.                | Previous or Next is disabled at its boundary. |
| Video            | Media renders native video controls without image zoom interaction. | Autoplay follows the existing consumer prop.  |
| Captioned media  | Caption follows the active Media inside the centered media group.   | Caption content remains caller-provided.      |

### Transformation and precedence order

- No new index, zoom, pan, media, or styling precedence rule is introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

Apart from Tab containment (FR4), this draft does not change or extend
Lightbox's existing dialog naming, focus, media alternatives, announcements,
button labels, keyboard behavior, or dismissal behavior.

## Design relationships

| Anatomy or state | Design requirement                                                   | Representation authority       | Hierarchy role    | Component contract |
| ---------------- | -------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Viewer overlay   | Presents the full-viewport dialog and surrounding overlay treatment. | Current source and public docs | Supporting        | FR1, FR2           |
| Media            | Presents the active image or video.                                  | Current source and public docs | Prominent         | FR1, FR2           |
| Close button     | Provides the persistent viewer dismissal action.                     | `component:Button`             | Supporting        | FR1, FR3           |
| Previous button  | Moves gallery presentation to the preceding item.                    | `component:Button`             | Supporting        | FR1, FR3           |
| Next button      | Moves gallery presentation to the following item.                    | `component:Button`             | Supporting        | FR1, FR3           |
| Caption          | Presents caller-provided context below the active Media.             | Current source and public docs | Context-dependent | FR1, FR2           |
| Counter          | Presents current gallery position and total.                         | Current source and tests       | Supporting        | FR1, FR2           |

Media, Caption, and Counter are stable visible parts, but no current public
target reaches them. Their `none` dispositions record factual reachability, not
a decision that they must remain unthemeable.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Viewer overlay": {"target": "lightbox"},
  "Media": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the active image or video"
    }
  },
  "Close button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Previous button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Next button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Caption": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the caption container"
    }
  },
  "Counter": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the gallery counter"
    }
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:layer-runtime` owns the current native-dialog host and shared
  layer plumbing; Lightbox retains its current media and local backdrop behavior.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering and
  records Lightbox as a current adopter.
- `architecture:interaction-modality` and `architecture:public-component-api`
  own their shared modality and API boundaries; this draft changes neither.

## Verification map

| Contract            | Verification                                                         | Representative states                       | Mutation or failure expectation                                                                | Audit section            |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| FR1                 | `Lightbox.test.tsx` render, gallery, caption, media, and zoom suites | Single image, gallery edges, caption, video | Removing a documented part fails existing role, content, media, or navigation assertions.      | `audit:Lightbox/anatomy` |
| FR2                 | Source inspection and `themingTargets.test.ts`                       | Viewer overlay, Media, Caption, and Counter | Removing the root target or documenting an unshipped child target fails evidence or inventory. | `audit:Lightbox/theming` |
| FR3                 | Source inspection plus Button and IconButton public composition      | Close and gallery navigation controls       | Re-owning a control surface requires the delegated owner and this map to change.               | `audit:Lightbox/theming` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                        | Canonical anatomy and current target        | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.     | `audit:Lightbox/theming` |

## Decision log

None. This draft records current facts and introduces no component-local design,
API, theming, or layer-system decision.

## Open questions

- **OQ1 — Should Media, Caption, or Counter gain a stable public theming target?**
  (`human-api`) Their current lack of reachability is an audit gap, not settled
  intent.

## Content boundary

This file does not duplicate consumer prop tables/examples, media algorithms,
shared layer rules, current audit results, or implementation steps. It links to
their owners.
