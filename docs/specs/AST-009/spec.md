---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-009
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Assistive-technology verification system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "accessibility": [
      "FR1",
      "FR2",
      "FR3",
      "FR4",
      "FR5",
      "FR6",
      "FR7",
      "FR8",
      "FR9",
      "FR10",
      "FR11",
      "FR12",
      "FR13",
      "FR14",
      "FR15",
      "FR16",
      "FR17",
      "FR19"
    ]
  }
}
```

## Intent

People who depend on assistive technology should get the focus and announcement
outcome Astryx claims, not only plausible test-DOM markup. Astryx proves each
claim with the strongest evidence it can produce: unit, DOM, accessibility-tree,
axe, and real-browser checks. Real assistive-technology (AT) observation adds
proof of what is actually spoken or navigated. It is recommended follow-up when an
outcome depends on AT behavior.

No requirement in Astryx gates merge or release on evidence that cannot be
produced. Missing real-AT observation never blocks merge to `main` or a stable
release.

## Non-goals

This spec does not:

- require every accessibility change to run any assistive technology or every browser;
- gate merge or release on real-AT observation;
- treat real AT as a substitute for unit, DOM, accessibility-tree, axe, or browser tests that prove different claims more precisely;
- define consumer accessibility requirements or claim conformance with an entire accessibility standard from one tool or matrix;
- require a stable announcement transcript when an AT intentionally changes harmless wording but keeps the required information and order;
- implement release automation, contribution forms, labels, bots, fixtures, or test infrastructure; or
- copy this policy into contributor or release guidance before those separately owned records exist.

### Authority boundary

AST-009 supersedes the public [Accessibility Checklist](https://github.com/meta/astryx/wiki/Accessibility-Checklist) only for real-AT follow-up classification, evidence boundaries, the merge and release evidence bar, and durable receipts. The checklist remains the consumer and contributor bar for component accessibility requirements.

AST-009 does not own focus-ring appearance, interaction-modality behavior, visual or contrast methodology, browser support, component theming, or overlay behavior. Those stay with [interaction modality](../../architecture/interaction-modality.md), [browser support](../AST-013/spec.md), [component theming](../../architecture/component-theming-surface.md), [theme tokens](../../architecture/theme-tokens.md), [layer runtime](../../architecture/layer-runtime.md), [overlay dismissal](../../families/overlay-dismissal.md), and the owning component records.

## Requirements

### When real-AT follow-up is recommended

| ID  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1 | The recommendation follows the claimed user outcome. Real AT/browser follow-up is recommended only when the intended outcome depends on AT-specific behavior: how AT exposes or announces focus, AT-specific focus order, spoken/braille output, browse or virtual-cursor behavior, mode changes, or a known AT/browser divergence. A semantic code change or focus-only browser behavior is not the trigger. The recommendation never makes real-AT evidence a merge or release requirement (FR17).                                                                               |
| FR2 | Focus changes warrant follow-up only for AT-specific outcomes. Real-AT follow-up is recommended when the claim depends on how AT exposes, announces, or orders programmatic, initial, restored, composite, or after-dismissal focus. Focus destination, order, return, keyboard operation, focus-ring styling, a refactor preserving the same browser focus target, or a static `tabIndex` correction does not warrant it by itself. The owning component and [interaction-modality record](../../architecture/interaction-modality.md) define those browser and visual behaviors. |
| FR3 | Role, name, and description are proved at the accessibility tree. A computed role, accessible name, or description is proved by accessibility-tree evidence. Real-AT follow-up is additionally recommended when the change relies on that semantic being announced during entry or a state transition, changing interaction/browse mode, or resolving a known AT/browser divergence.                                                                                                                                                                                               |
| FR4 | Announcements are proved by their routing. A live region, status message, alert, validation announcement, or loading/completion transition is proved by DOM and accessibility-tree evidence of which element or channel carries it, its text, its urgency, and how many updates each occasion produces. Real-AT follow-up is recommended when success depends on what is spoken, its order, when it occurs, whether it repeats, or whether it is skipped.                                                                                                                          |
| FR5 | Virtual-cursor entry warrants follow-up. Real-AT follow-up is recommended when success depends on where screen-reader browse or virtual cursor enters, whether content is discoverable from that entry point, or whether the user can move between browse and interaction modes. Ordinary keyboard Tab order with no browse-mode claim does not warrant it.                                                                                                                                                                                                                        |
| FR6 | Known divergence widens follow-up. When a changed pattern has a recorded AT/browser divergence, follow-up covers every named side of it until an owner records that the divergence no longer applies. A passing result from one side does not stand in for another known to differ.                                                                                                                                                                                                                                                                                                |
| FR7 | Other changes use proportionate evidence. Static semantics, keyboard behavior, color/contrast, target size, source order, and similar accessibility changes use the least expensive evidence layer that directly proves the claim. They do not acquire a real-AT follow-up merely because they are accessibility work.                                                                                                                                                                                                                                                             |
| FR8 | AT-dependent claims are named. A change whose intended outcome depends on AT behavior says so in its record and names the lower-layer evidence that proves what can be proved. It needs no matrix, scenario, or release record to merge.                                                                                                                                                                                                                                                                                                                                           |

### What each evidence layer proves

This table bounds what each layer may claim. It does not replace evidence required by current component, family, browser-support, visual, theming, or audit records.

Each layer is bounded. Passing one layer MUST NOT be described as proving a claim assigned to a later layer.

| Evidence           | It proves                                                                                                                                                           | It does not prove                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | State derivation, branch selection, callback effects, application-owned ordering, and deterministic regressions.                                                    | Browser focus navigation, accessibility API exposure, or AT output.                                                              |
| DOM                | Rendered elements, attributes, ownership markers, source order, and author-supplied ARIA relationships in the tested state.                                         | Computed accessible name/description, platform accessibility mapping, speech, browse mode, or real browser event behavior.       |
| Accessibility tree | The browser's computed role, name, description, state, relationships, and focused accessible node for the tested engine.                                            | What an AT announces, announcement timing/order, virtual-cursor placement, or behavior in another engine/platform stack.         |
| axe                | Rules the configured axe version can mechanically detect in the rendered states it was given.                                                                       | Absence of all accessibility defects, task usability, correct focus destination, complete announcements, or AT interoperability. |
| Real browser       | Actual focus destination/order/return, keyboard and pointer behavior, browser event timing, native semantics, and engine-specific state transitions.                | Speech/braille output, browse or virtual-cursor entry, or AT-specific divergence.                                                |
| Real AT/browser    | Observed speech/braille content and order, announcement timing/repetition, browse or virtual-cursor entry, mode transitions, and named AT/browser interoperability. | Untested pairings, future versions, or claims outside the recorded scenario.                                                     |

| ID   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR9  | Evidence composes by claim. A change keeps its lower-layer evidence. Real-AT observation, when it runs, adds only the claims it can prove and MUST NOT replace deterministic regression coverage for behavior the lower layers own.                                                                                                                                                                                                                 |
| FR10 | The tested state is the claimed state. Evidence exercises the transition or state that carries the user outcome, such as opening the surface, moving focus, producing the status update, dismissing and restoring focus, or entering with the virtual cursor. A static baseline that merely contains the component is insufficient.                                                                                                                 |
| FR11 | Real means the shipping pairing. A real-AT check runs the named assistive technology against the named shipping browser on its supported operating system. A virtual machine, remote machine, or simulator is acceptable only when it runs that actual pairing and preserves the input/mode under test. A DOM emulator, accessibility snapshot, synthetic speech stub, or browser engine standing in for a branded browser is not real-AT evidence. |

### Representative matrix

When real-AT follow-up runs, its pairings are selected from the outcome and supported platform, not copied in full onto every change.

| Representative pairing       | Use when the outcome includes                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| NVDA + Chrome on Windows     | Browser-neutral desktop AT-specific focus exposure/order or announcement behavior on the Chromium/Windows stack.      |
| VoiceOver + Safari on macOS  | Browser-neutral desktop AT-specific focus exposure/order or announcement behavior on the Safari/macOS platform stack. |
| NVDA + Firefox on Windows    | Gecko-specific behavior or a named NVDA Chrome/Firefox divergence.                                                    |
| VoiceOver + Safari on iOS    | Touch-driven iOS behavior, mobile Safari, rotor/browse navigation, or iOS-specific divergence.                        |
| TalkBack + Chrome on Android | Touch-driven Android behavior, Android virtual navigation, or Android-specific divergence.                            |

| ID   | Rule                                                                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR12 | Desktop-neutral follow-up uses two independent stacks: NVDA + Chrome on Windows and VoiceOver + Safari on macOS. A platform-specific claim uses its matching pairing only unless FR14 expands it.                                             |
| FR13 | Mobile follow-up uses a matching mobile stack. A mobile or touch/virtual-cursor outcome uses at least one matching mobile pairing, and both iOS and Android only when the claim covers both and there is reason to expect different outcomes. |
| FR14 | Divergence expands rather than replaces. Every side named in a known divergence is included even when that adds a pairing beyond FR12 or FR13.                                                                                                |
| FR15 | Versions and modes are part of the result. A receipt names OS, AT, browser, input mode, and material settings or verbosity that affect the result. “Screen reader checked” or a browser name without its AT is not a matrix.                  |
| FR16 | Representative does not mean exhaustive. Passing the selected pairings supports only the recorded outcome and pairings. It does not claim every AT, browser, verbosity setting, locale, or input method behaves identically.                  |

### Merge, release, and follow-up

| ID   | Rule                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR17 | Merge and release need only producible evidence. A change merges to `main` and ships in a stable release once the unit, DOM, accessibility-tree, axe, and real-browser evidence its owning records require passes. Pending, missing, or not-yet-run real-AT observation MUST NOT block merge or stable release, and no record may make it a gate.           |
| FR18 | Follow-up is tracked, not held. A recommended real-AT follow-up MAY be tracked in a public issue naming the claim, scenario, and pairings. The issue holds no pull request or release.                                                                                                                                                                      |
| FR19 | Lower layers set the bar where real AT is unavailable. An announcement claim is met at merge by FR4 evidence. Focus-exposure, mode, and virtual-cursor claims are met by the accessibility-tree and real-browser evidence that observes the nearest producible state. That evidence MUST NOT be described as proving speech, timing, or cursor placement.   |
| FR20 | Failures remain findings. A failed real-AT observation is a defect: it records the user impact and links a fix, and is handled like any other defect. Editing an expected result to match an undesirable observation does not turn failure into pass.                                                                                                       |
| FR21 | Receipts remain valid until invalidated. A passing receipt stays usable while the tested semantic, focus, announcement, virtual-cursor, or divergence-sensitive path and relevant support claim remain unchanged. A material change to that path, a fix for the observed behavior, or a newly recorded divergence makes it stale. Unrelated commits do not. |
| FR22 | Stale receipts are labelled. When a later change makes a receipt stale, the tracking record says so and the follow-up returns to recommended. This is information, not a gate.                                                                                                                                                                              |

### Durable receipts and evidence storage

| ID   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR27 | The textual receipt is durable and public. When a real-AT check runs, its canonical receipt lives in the merged pull request, a linked public tracking issue, or a repository-owned record. It MUST remain readable without access to expiring CI artifacts, private systems, or an unversioned local file.                                                                                                                                                                                                                                               |
| FR28 | Every receipt is reproducible. It records the source pull request and commit or tested build identifier; stable story, fixture, route, or exact reproduction steps; the claim under test; expected focus destination, semantics, announcement, timing, or virtual-cursor outcome; OS, AT, browser, and relevant settings/versions; input sequence and starting state; observed result, including announcement transcript or focus/cursor destination when applicable; `pass` or `fail`, tester, and date; and linked defect or follow-up when applicable. |
| FR29 | Text carries the decision-critical facts. Screenshots, recordings, speech logs, and CI artifacts may supplement the receipt. They MUST NOT be the only place that records the pairings, expected outcome, observation, or result. Evidence must contain no private user data or internal-only links.                                                                                                                                                                                                                                                      |
| FR30 | Reusable scenarios live with the code. When a scenario will be reused or represents a component contract, its stable story or fixture is checked into the repository. A one-off external test page is not the sole reproduction path.                                                                                                                                                                                                                                                                                                                     |
| FR31 | Guidance projects this spec. Future contributor accessibility guidance links to this spec for follow-up classification, evidence bounds, and receipt requirements. Future release guidance links to this spec for the merge and release evidence bar. Those guides may explain the current workflow but MUST NOT duplicate or redefine this policy.                                                                                                                                                                                                       |

### Platform support

- Supported feature/engine floor: [AST-013](../AST-013/spec.md) and the affected component or package own browser support. Follow-up pairings are selected within that support claim.
- Unsupported behavior: no passing claim is made for an untested pairing; a known supported-pairing divergence follows FR6 and FR14.
- Browser evidence: Playwright or another real-browser runner proves browser behavior and accessibility-tree exposure. It is real-AT evidence only when the actual named assistive technology is operating against the named browser.

## Current-state impact

- Earlier recorded stable-release holds for read-only Popover initial focus and
  CommandPalette empty-result announcements are recommended follow-ups. Their
  checked-in scenarios (`Read-only dialog focus`; `CommandPalette / Audit
Matrix`) and pairings stay valid for a real-AT run and hold no release.
- `spec:AST-086` status-announcement fixes merge on FR4 evidence (FR17, FR19).
- `spec:AST-001`, `spec:AST-020`, `spec:AST-021`, `spec:AST-056`, `spec:AST-086`,
  `component:FieldStatus`, `module:Table/useTableRowStatus`, and
  `module:Table/useTableColumnResize` describe real-AT observation as
  recommended follow-up, not a merge or release requirement.
- No contributing record owns assistive-technology verification. When one is
  authored, it links back to `spec:AST-009` rather than copying its policy.

## Verification

| Contract  | Verification                                                     | Representative states                                                                                                       | Mutation or failure expectation                                                                                            |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR8   | Classification review against the change's claimed user outcome. | static semantic fix; browser-only focus change; AT-announced autofocus; live update; virtual-cursor entry; known divergence | An AT-dependent claim ships without its lower-layer proof, or an unrelated accessibility fix is sent to real-AT follow-up. |
| FR9–FR11  | Evidence-map review plus focused tests/observations.             | unit state; DOM attributes; computed tree; axe state; browser focus; spoken/braille result                                  | A lower layer is credited with speech, timing, cursor, or interoperability it cannot observe.                              |
| FR12–FR16 | Pairings named in a real-AT receipt.                             | desktop-neutral; platform-specific; mobile; known divergent stacks                                                          | A generic “screen reader checked” result substitutes for the required independent or divergent pairing.                    |
| FR17–FR22 | Merge and release review.                                        | announcement fix with FR4 evidence; pending follow-up issue; failed real-AT observation; stale receipt                      | A pull request or release waits on real-AT evidence, or lower-layer proof is described as proving speech.                  |
| FR27–FR31 | Receipt completeness and link-durability review.                 | PR receipt; linked issue; reusable checked-in fixture; supplementary recording                                              | Critical evidence exists only in an expired/private artifact, cannot be reproduced, or guidance forks this policy.         |

### Completion criteria

A change meets this policy when:

- an AT-dependent claim is named under FR8;
- each claim has evidence from the producible layer that can observe it under FR4, FR9–FR11, and FR19;
- no merge or release waited on real-AT observation under FR17; and
- any real-AT receipt that exists is durable and reproducible under FR27–FR29.

## Decision log

### DEC-1 — Real-AT follow-up is outcome-triggered, not category-wide

**Reference:** `spec:AST-009/DEC-1` · **Decider:** `cixzhang`, `2026-08-31`
**Decision:** FR1–FR8 recommend real AT/browser follow-up for AT-specific focus exposure/order, announcement behavior, virtual-cursor entry, or known divergence. Focus destination, keyboard behavior, focus appearance, and other accessibility changes use the evidence and authority that directly own their claim.
**User-impact rationale:** AT-dependent outcomes get targeted attention without making unrelated changes run costly shallow checks. **Rejected:** running every AT on every accessibility change.

### DEC-2 — Evidence layers keep distinct proof boundaries

**Reference:** `spec:AST-009/DEC-2` · **Decider:** `cixzhang`, `2026-08-31`
**Decision:** Unit, DOM, accessibility-tree, axe, browser, and real-AT evidence each prove a different boundary. Changes compose needed layers instead of treating one tool as general accessibility proof.
**User-impact rationale:** People must get the heard or navigated result, not only plausible markup or a green automated check. **Rejected:** describing a green axe run, plausible ARIA, or an accessibility snapshot as proof of what a person hears or where their virtual cursor enters.

### DEC-3 — The real-AT matrix is representative and claim-specific

**Reference:** `spec:AST-009/DEC-3` · **Decider:** `cixzhang`, `2026-08-31`
**Decision:** Desktop-neutral follow-up uses NVDA + Chrome on Windows and VoiceOver + Safari on macOS. Mobile, platform-specific, and known-divergent claims select or expand that matrix according to the affected outcome. Passing results make no universal compatibility claim.
**User-impact rationale:** The pairings cover the claim without implying untested AT, browser, verbosity, locale, or input behavior. **Rejected:** one fixed exhaustive matrix for every change, or one convenient pairing standing in for a stack already known to behave differently.

### DEC-4 — Real-AT evidence never gates merge or release

**Reference:** `spec:AST-009/DEC-4` · **Decider:** `cixzhang`, `2026-10-22`
**Decision:** Merge and stable release require only evidence Astryx can produce. DOM, accessibility-tree, axe, and real-browser evidence set the bar; real-AT observation is recommended follow-up (FR17–FR19).
**User-impact rationale:** A requirement no contributor can meet stalls the fixes that remove known accessibility defects, which keeps those defects in front of users longer. **Rejected:** holding stable releases until named real-AT receipts pass.

### DEC-5 — Real-AT receipts stay durable at the change boundary

**Reference:** `spec:AST-009/DEC-5` · **Decider:** `cixzhang`, `2026-08-31`
**Decision:** When a real-AT check runs, the change or linked tracking record carries a reproducible textual receipt with build identity and result. Expiring artifacts may supplement it but cannot own its facts.
**User-impact rationale:** Future contributors and maintainers can audit what was observed and on which build. **Rejected:** private notes, local files, or transient CI artifacts as the only record.

## Open questions

None.
