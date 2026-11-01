---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-013
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-01
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [architecture:layer-runtime, architecture:public-component-api]
affects_families: [family:overlay-dismissal]
affects_contributing: [contributing:api-conventions]
affects_consumer_docs:
  [browser-support, useLayer, Popover, Toast, Dialog, useEntryAnimation]
---

# Browser and platform support system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "platform": [
      "FR1",
      "FR3",
      "FR5",
      "FR6",
      "FR7",
      "FR8",
      "FR9",
      "FR10",
      "FR12",
      "FR13"
    ]
  }
}
```

## Intent

Give stable Astryx web components one owner for browser support, native-feature
adoption, and reduced fallback. Component specs inherit this shared baseline and
record only explicit exceptions.

Full and fallback paths must satisfy the component's current accessibility
contract and applicable [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/)
requirements. Assistive-technology evidence remains separately owned.

## Non-goals

- Requiring identical implementation or pixels when user outcomes are equivalent.
- Polyfilling every missing browser feature.
- Replacing the layer-specific contract in [AST-003](../AST-003/spec.md) or the
  public API admission rules in [AST-002](../AST-002/spec.md).
- Implementing generated rows, consumer-doc updates, CI, or release tooling in
  this specification pull request.

## Requirements

- **FR1 — One rolling compatibility model.** Current Web Platform Baseline is the
  full-support tier. Baseline minus two years is the reduced-fallback tier. Astryx
  makes no support promise below that tier.
- **FR2 — Compatibility rows are generated.** Browser/version rows are generated
  from the approved Baseline data and authoritative browser release data; they are
  never maintained as handwritten version claims. The generated rows live in the
  public [Browser Support guide](../../../packages/cli/assets/docs/browser-support.doc.mjs)
  and record their source and refresh date. TypeScript targets, build targets, and
  feature tables are not support evidence.
- **FR3 — Explicit browser support rows are always included.** Independently
  of the generated Baseline coverage, Astryx explicitly supports:
  - the latest stable Chrome release on desktop;
  - Safari on the latest stable iOS release; and
  - for touch presentations, Chrome on the latest stable Android release
    (`spec:AST-094`).

  “Latest” means the current stable release identified and refreshed from
  authoritative browser release data, not a handwritten version. Other browsers
  may remain represented by the generated Baseline compatibility rows; this
  decision does not name desktop Safari or Firefox as additional explicit support
  rows.

- **FR4 — Compatibility, explicit support, and test coverage stay distinct.** The
  Browser Support guide labels generated Baseline compatibility, named explicit
  support, and current test coverage separately. A browser's inclusion in
  generated compatibility or explicit support does not imply an automated lane
  or per-pull-request proof in that browser.
- **FR5 — Supported browsers receive full required behavior.** Every browser in
  the full-support tier and each named explicit support row receives the
  component's current behavior, accessibility, state, renderer, and interaction
  contracts. A missing native feature does not silently narrow those requirements.
- **FR6 — Native features are capability-detected.** Components detect the API or
  CSS capability they use rather than inferring it from a browser name. A narrow
  engine workaround is allowed only for a reproduced defect with a regression
  fixture and a review or removal condition.
- **FR7 — Reduced fallback preserves the task.** In the Baseline-minus-two tier, a
  component either provides equivalent behavior or documents a reduced fallback.
  The fallback may omit only named enhancements and must preserve the primary
  task, applicable accessibility requirements, stable state and callbacks,
  cleanup, and repeated use.
- **FR8 — Reduced fallback must not be broken.** It must not throw, render invalid
  or `NaN` geometry, hide essential content, make controls unreachable, orphan or
  trap focus, block the surrounding page, corrupt controlled state, remain stuck
  pending, or flash a false open, closed, loading, positioned, or styled state.
- **FR9 — SSR and hydration are consistent.** A Core component is SSR-capable
  unless its component spec records an FR12 exception. A client directive does
  not exempt a component, because frameworks render client components on the
  server. SSR-capable components do not read browser capability, geometry, input
  modality, paint timing, or user-agent state during server render or during the
  client render that hydrates server markup. The hydrating render produces the
  same markup as the server. Post-hydration enhancement begins from a usable
  state and introduces no mismatch, broken intermediate state, or visible false
  state.
- **FR10 — Browser-owned behavior needs real-browser evidence.** Source, unit, and
  jsdom tests may prove guards and deterministic state. Changes to layout, paint,
  focus, native Popover or Dialog behavior, top-layer order, browser event timing,
  or hydration presentation require real-browser evidence. When a change makes a
  claim about a named browser, fixes a defect reproduced only there, or changes
  browser compatibility, that evidence must come from the actual browsers covered
  by the claim. Chromium does not substitute for an iOS Safari claim, and
  Playwright WebKit does not prove Safari behavior.

  Explicit support is a maintenance promise, not a per-change proof obligation.
  Routine changes use evidence appropriate to their claims and do not need to
  prove every supported browser before landing. A defect reproduced in an
  explicitly supported browser remains Astryx's responsibility to investigate
  and fix; missing automation does not narrow support or justify dismissal.

- **FR11 — Raising the floor is compatibility work.** Removing a supported browser,
  moving it from full behavior to reduced fallback, or removing a documented
  fallback requires owner approval, the classification and lifecycle required by
  [`spec:AST-017`](../AST-017/spec.md), user-impact and migration notes, updated
  generated rows, actual-browser evidence for the browsers affected by the
  compatibility claim, and evidence that every remaining full-support and named
  explicit support row still receives full required behavior.
- **FR12 — Component specs inherit the baseline.** Component specs link
  `spec:AST-013` and record only stricter requirements or explicit exceptions. An
  exception names the affected capability, observable reduction, preserved
  FR7–FR9 obligations, evidence, owner, and review condition.
- **FR13 — Server-rendered elements skip their mount animation.** An element present in
  server markup hydrates in its settled state and does not play the animation it
  plays when it mounts (its entry animation). That mount animation plays only for
  an element the client mounts after hydration, or in a client-only root after
  the first paint. Later open, show, and state transitions of a hydrated element
  are outside this requirement, and reduced-motion behavior is unchanged.

### Platform support

- Full support: current Web Platform Baseline, plus the named explicit support
  rows in FR3.
- Reduced fallback: Baseline minus two years, satisfying FR7–FR9.
- Unsupported: below Baseline minus two years; Astryx makes no support promise.
- Browser evidence: browser-owned behavior requires real-browser evidence. The
  actual named browser is required for claims specific to it, not as a blanket
  gate on every change.

## Current-state impact

The public guide currently has handwritten Baseline tiers and version rows. The
required three-way labeling of generated compatibility, explicit support, and
current test coverage remains implementation work. Current automated browser
coverage primarily exercises Chromium; that coverage neither defines nor narrows
support. Routine changes may land with evidence appropriate to their claims.
Defects reproduced in an explicitly supported browser remain actionable whether
or not an automated lane exists.

`useEntryAnimation`, and FieldStatus through it, decides whether to animate from a
first-paint flag captured on its first render. When markup hydrates after the
page paints, the hydrating render produces entry-animation classes the server did
not send, and the hook's consumer documentation says it does not support server
rendering.

Other known FR9 and FR13 gaps: a Dialog rendered open in server markup plays its
entry animation on page load; CodeBlock's collapse chevron plays its reveal
animation on page load; and CodeBlock chooses between token-span and Highlight
API markup from browser capability and user-agent checks during render, so the
hydrating render can differ from the server's markup.

## Verification

| Contract  | Required evidence                                                                                                                                                                                                                                            | Failure signal                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR5   | Generated-row check plus guide/package/support/test reconciliation                                                                                                                                                                                           | A handwritten/build version becomes a support claim, explicit support rows disappear, or supported behavior is reduced                                         |
| FR6–FR8   | Feature-present/absent tests and active fallback fixtures                                                                                                                                                                                                    | Browser sniffing selects ordinary behavior, or fallback is unusable, inaccessible, unstable, or visibly broken                                                 |
| FR9, FR13 | Server render then hydrate: no hydration warning or recoverable error, hydrated attributes equal the server markup, a client mount after hydration still plays its mount animation, plus a real-browser server render, hydration, and post-hydration fixture | Markup diverges, browser state is read on the server or while hydrating, a server-rendered element plays its mount animation, or a false/broken state flashes  |
| FR10      | Real-browser evidence for browser-owned behavior; the actual named browser for specific claims, browser-only defects, and compatibility changes                                                                                                              | Browser-owned behavior is credited to jsdom, another engine stands in for a named-browser claim, or a supported-browser defect is dismissed for lack of a lane |
| FR11–FR12 | Release review and knowledge-record checks                                                                                                                                                                                                                   | A floor/fallback disappears without compatibility treatment, or a component silently overrides the baseline                                                    |

## Decision log

### DEC-1 — Rolling Baseline tiers plus official browser rows

**Reference:** `spec:AST-013/DEC-1`
**Decider:** `cixzhang`, `2026-09-01`

Astryx uses current Web Platform Baseline for full support, Baseline minus two
years for reduced fallback, and no promise below that tier. Latest stable Chrome
on desktop and Safari on latest stable iOS are always included as official support
and test rows independently of generated Baseline coverage, and touch
presentations add Chrome on the latest stable Android (`spec:AST-094`). Generated compatibility
rows and the named official test matrix remain distinct public facts.

### DEC-2 — Explicit support does not require proof on every change

**Reference:** `spec:AST-013/DEC-2`
**Decider:** `cixzhang`, `2026-09-02`

DEC-1's named browser rows are explicit support rows, not a required automated
or per-change test matrix. Astryx investigates and fixes defects reproduced in
those browsers, but routine changes do not need to prove every supported browser
before landing. Actual-browser evidence is required when the change makes a
browser-specific claim, fixes a defect reproduced only there, or changes
compatibility. Missing automation neither narrows support nor justifies dismissing
a reproduced defect.

### DEC-3 — Core hydrates to the server markup; server-rendered elements skip their mount animation

**Reference:** `spec:AST-013/DEC-3`
**Decider:** `cixzhang`, `2026-10-15`

Core components render the same markup on the server and in the hydrating client
render, including client components, and a server-rendered element stays settled
rather than playing its mount animation. Rejected: consumer-doc "does not support
SSR" exceptions, because FR12 records exceptions only in component specs.
Rejected: a "has painted" snapshot that turns true after hydration, because it
animates elements present on page load.

## Open questions

None.
