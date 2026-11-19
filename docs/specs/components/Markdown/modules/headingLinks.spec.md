---
schema_version: 3
template_version: 2
kind: module
id: module:Markdown/headingLinks
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, layout]
verified_by:
  [
    packages/core/src/Markdown/plugins/headingLinks.test.tsx,
    packages/core/src/Markdown/plugins/headingLinks.ssr.test.tsx,
    packages/core/src/Markdown/Markdown.public.test.ts,
    packages/core/src/Markdown/plugins/headingLinks.a11y.chromium.spec.ts,
    packages/core/src/Outline/parseOutlineFromMarkdown.test.ts,
    apps/storybook/stories/MarkdownHeadingLinks.stories.tsx,
  ]
parent_component: component:Markdown
references:
  [
    component:Markdown/DEC-2,
    module:Outline/parseOutlineFromMarkdown,
    spec:AST-002/DEC-8,
    spec:AST-036/DEC-11,
  ]
---

# Markdown heading-links module contract

## Contract at a glance

| Area            | Contract                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract | `createMarkdownHeadingLinks(options?)` returns one first-party entry exported from `@astryxdesign/core/Markdown/plugins`.                                                                                                               |
| Behavior        | Installing the entry gives every rendered h1–h6 a deterministic, collision-safe ID and gives each built-in heading an inline trailing `#` copy button.                                                                                  |
| End-user impact | Readers can copy a durable heading URL with immediate confirmation without changing the current hash, scroll position, or page; incoming fragment URLs still target the heading ID.                                                     |
| Builder impact  | Builders explicitly install one entry and may supply a stable heading namespace and safe URL base. The same entry keeps Markdown-derived Outline IDs aligned and root-only.                                                             |
| Compatibility   | Additive and default-off. Without this module, released Markdown/Outline heading traversal, IDs, DOM, styling, and custom heading ownership remain unchanged.                                                                           |
| Review checks   | Reject default-on behavior, a Markdown prop, an Outline-only namespace, runtime IDs, module-local entry state, unvalidated lookalikes, an anchor/fake link, bespoke reveal logic, imposed custom anatomy, or product-shaped navigation. |

This table is a review projection; the body below is authoritative.

## Intent

Builders who publish documents should be able to opt into portable, durable heading
links without turning product identity or navigation policy into a permanent Markdown
prop. The module owns one complete first-party composition: identity projection,
permalink copy-button rendering, localization, and cross-surface evidence.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive and opt-in
- Migration decision: `spec:AST-002/DEC-8`
- Existing builders do nothing. A builder that wants all-depth heading identities
  creates one stable entry and passes it to Markdown and any Outline derivation of the
  same source.

## Ownership boundary

**Owns**

- `createMarkdownHeadingLinks()` and `MarkdownHeadingLinksOptions`.
- The stable internal plugin name and a frozen, versioned, structurally validated
  configuration carried by the opaque entry across compatible Core package copies.
- NFKC Unicode slugging, fallback, emitted-ID reservation, namespace composition,
  and all-depth post-transform projection.
- The shared IDs, labels, sanitized permalink bases, and canonical copy URLs consumed by
  Markdown and Markdown-derived Outline.
- The built-in sibling copy-button renderer, `useContainerReveal` composition, i18n,
  interaction styles, Storybook example, SSR proof, and browser evidence.

**Does not own / non-goals**

- Markdown's generic plugin protocol, parser, transform order, default heading styles,
  or released no-plugin root-heading projection.
- Outline's root-only item selection, hook API, or memoization framework.
- A caller's custom `components.heading` DOM, styling, accessibility, or permalink UI.
- Product-specific document identity, versioning, host URL construction, viewer
  scrolling, callbacks, or routing.

## Public API and concepts

| Concept                        | Closed values or states                            | Meaning                                                                                  | Default          | Owner                          | Stability |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- | ------------------------------ | --------- |
| `createMarkdownHeadingLinks()` | one factory returning `MarkdownPluginEntry<never>` | Installs a portable module entry recognized by compatible Core copies.                   | absent           | `module:Markdown/headingLinks` | stable    |
| `headingIdPrefix`              | string or omitted                                  | Caller-owned stable namespace prepended as `<prefix>--<slug>`.                           | unprefixed       | caller                         | stable    |
| `permalinkBaseUrl`             | safe navigation URL or omitted                     | Caller-owned base whose existing fragment is replaced by the generated fragment.         | current document | caller                         | stable    |
| Heading projection             | absent or installed                                | Released root-only identity when absent; module-owned all-depth identity when installed. | absent           | module                         | stable    |
| Built-in copy control          | honest sibling `type="button"`                     | Copies the canonical URL without navigation and shows a check for 1.5s.                  | absent           | module                         | stable    |
| Custom heading renderer        | caller replacement                                 | Receives the generated ID only and keeps complete output ownership.                      | built-in         | caller                         | stable    |

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1  | The factory and options type are exported only through the server-safe `@astryxdesign/core/Markdown/plugins` entry point. The ordinary opaque `MarkdownPluginEntry<never>` carries a frozen, versioned module configuration inside the shared structurally validated `Symbol.for` protocol envelope, so a compatible Core copy can recognize it without module-local identity or state.                                                                                                                                                           | `spec:AST-036` FR1–FR5, DEC-11             |
| FR2  | `headingIdPrefix` and `permalinkBaseUrl` accept strings only and travel on the entry. The URL base uses Markdown's navigation sanitizer, rejects unsafe destinations, and replaces any existing fragment. Consumers recognize only the exact compatible module configuration. A valid generic same-name plugin with incompatible module data keeps ordinary plugin ordering but gains no heading-links behavior; malformed generic entries follow the existing Markdown/Outline fail-soft path. Direct invalid factory arguments may still throw. | `family:navigation-destinations`           |
| FR3  | After transforms, every heading at every depth participates once in document order. Labels use the canonical extension text projection. Slugs use NFKC, lowercase Unicode letters/numbers, quote removal, collapsed hyphens, and `section`.                                                                                                                                                                                                                                                                                                       | `component:Markdown` FR13, FR16            |
| FR4  | Every emitted ID is reserved. A natural numeric suffix can never collide with or re-emit an earlier generated ID.                                                                                                                                                                                                                                                                                                                                                                                                                                 | module identity ownership                  |
| FR5  | Omitting the module preserves released root-heading IDs, nested-heading behavior, DOM, styles, Outline results, and custom-renderer ownership.                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Markdown` FR12                  |
| FR6  | Passing the same entry to Markdown and Markdown-derived Outline shares one projection. Nested headings consume identity and collisions, while Outline continues to select root headings only.                                                                                                                                                                                                                                                                                                                                                     | `module:Outline/parseOutlineFromMarkdown`  |
| FR7  | A built-in heading remains one semantic h1–h6 and gains one honest sibling `type="button"`; a custom heading receives the generated ID and no imposed wrapper or control.                                                                                                                                                                                                                                                                                                                                                                         | `component:Markdown` FR2–FR3               |
| FR8  | IDs are deterministic across synchronous SSR, hydration, multiple namespaced instances, reordering, and independent rendering.                                                                                                                                                                                                                                                                                                                                                                                                                    | module identity ownership                  |
| FR9  | The public entry remains server-safe and tree-shakeable; the client renderer stays private to Markdown. Product identity, versioning, scrolling, callbacks, routing, and host URL construction never enter the module.                                                                                                                                                                                                                                                                                                                            | package export and side-effect conventions |
| FR10 | Unmodified click, tap, Enter, or Space copies the canonical absolute URL without navigation, scroll, or hash mutation. Success shows the check and localized polite announcement for 1.5s; failure stays silent. The heading row uses canonical `useContainerReveal`, line-height-sized flow layout, stable logical-end spacing, non-overlapping 24px coarse hit geometry, and one keyboard-only focus ring.                                                                                                                                      | module interaction and layout ownership    |

## Accessibility contract

- **AR1 — heading semantics stay intact.** The built-in control is a sibling, so the
  h1–h6 role/name excludes `#`; authored heading links remain valid. A custom heading
  receives identity only.
- **AR2 — custom ownership stays intact.** A custom heading receives identity only and
  remains responsible for all anatomy, styling, and accessibility beyond the ID.
- **AR3 — the renderer extension uses the canonical reveal primitive.** Its copy
  button stays mounted, named, in the accessibility tree, and in tab order while
  visually hidden at fine-pointer rest. Hovering anywhere in the heading row or moving
  keyboard focus into it reveals the marker immediately. Coarse-pointer/touch
  visibility, reduced motion, and focus safeguards follow `useContainerReveal`; the
  module must not add a parallel media-query, marker, token, or public reveal API.

## Copy-button reveal extension contract

The renderer extension spreads
`useContainerReveal().getContainerProps()` on the built-in heading row (the reveal
owner) and `getContentRevealProps({isLayoutPreserved: true})` on its honest sibling
`type="button"`. This produces the exact observable states: hidden at fine-pointer
rest; visible when any part of the heading row is hovered; visible when the button or
another row descendant owns focus; keyboard reachable without `display: none` or
`visibility`; and visible on coarse/touch input under the hook's existing supported
semantics. The in-flow control box has the computed block-size of its adjacent heading
line, so it never raises the heading line-height or changes wrapping. One stable logical
inline slot at the final visual line end keeps heading text, the control, and adjacent
controls disjoint in either direction; reveal and the `#`/check swap change no row
geometry or spacing. On coarse input, the interactive and focus geometry meets the
24px AA target minimum, centered on that line-height box through overflow-visible
internal geometry rather than block-size in flow. The extension remains unclipped and cannot overlap or
steal input from heading text, neighboring controls, or preceding/following lines.
Pointer activation does not paint a keyboard focus-visible ring; keyboard focus paints
exactly one canonical, unclipped Astryx ring.

Unmodified click, tap, Enter, or Space copies the canonical absolute permalink and
never navigates, scrolls, or mutates the current hash. The heading ID remains the
incoming fragment target. Success replaces `#` with Astryx's check icon for 1.5
seconds and announces localized `Link copied` once through the canonical polite live
region; failure stays silent and leaves `#` unchanged. Modified/non-primary pointer
activation does not copy, and the button exposes no anchor, open-in-new-tab, or link
context-menu semantics. Custom headings remain outside this renderer contract.

## Design relationships

| State              | Design requirement                                                                                    | Representation authority    | Module contract |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------- | --------------- |
| Built-in heading   | Preserve semantic h1–h6 content while adding the projected ID and sibling copy control.               | Current source and Markdown | FR5, FR7, FR10  |
| Copy control       | Align `#`/check in the heading line box; reveal canonically and extend only to the 24px AA hit floor. | Button and module contract  | FR10            |
| Custom heading     | Forward the projected ID without wrapping or adding sibling presentation.                             | Caller                      | FR7             |
| No-plugin Markdown | Preserve released root-only identity and nested-heading behavior byte-for-byte.                       | Current source and Markdown | FR5             |

The module adds no Markdown-local theme target. The button uses Button's existing target;
the row is private layout.

## Parent and system relationships

- `component:Markdown` owns the generic plugin seam, transformed tree, built-in
  heading part, default no-plugin projection, and custom-renderer replacement seam.
- `module:Outline/parseOutlineFromMarkdown` owns root-only item selection and consumes
  this module's projection only when the same entry is installed.
- `spec:AST-036` owns the opaque plugin protocol; this first-party module uses it
  without a privileged public capability.
- `spec:AST-002/DEC-8` admits this factory instead of a broad Markdown prop because
  installation, namespace, and URL base are caller decisions Astryx cannot derive.
- `family:navigation-destinations` owns URL accept/block policy; this module owns
  sanitizing the optional base and copying the canonical URL.

## Implementation plan and boundaries

1. Keep the server-safe factory and identity projection in
   `plugins/headingLinks.ts`; carry normalized module configuration inside the shared
   portable plugin envelope, and export only the factory and options type from
   `plugins/index.ts`.
2. Keep rendering and StyleX private under `plugins/`; Markdown's built-in heading path
   invokes the renderer only when projection supplies a canonical URL. Default and
   custom-renderer paths remain unchanged.
3. Keep module tests, SSR proof, Storybook, and Playwright evidence with the module;
   keep generic/no-plugin tests in Markdown and root selection in Outline.

## Verification map

| Contract   | Verification                                                                                              | Representative states                                                                                                              | Failure expectation                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR4    | module tests, public API test, typecheck, export/package checks                                           | public entry/options, duplicate copies, invalid entries/URLs, h1–h6, Unicode, suffix collisions                                    | Export drift, lost options, false recognition, unsafe URL, unstable slug, or duplicate ID fails.                                    |
| FR5–FR7    | module tests plus Markdown and Outline integration tests                                                  | omitted/installed plugin, root/nested, honest sibling button, custom heading                                                       | Default changes, custom output is wrapped, the control fakes link semantics, or IDs diverge.                                        |
| FR8–FR10   | SSR test, Storybook, and `plugins/headingLinks.a11y.chromium.spec.ts`                                     | hydration, copy/failure/timer, no location mutation, rest/hover/focus/touch, line-height rows, 24px target, RTL/zoom/forced colors | Hydration recovers, feedback lies/shifts, layout grows, targets overlap, pointer paints a keyboard ring, or reveal semantics drift. |
| Repository | formatting, ESLint, knowledge/sync, i18n, Changeset validation, core typecheck, focused tests, pre-commit | module files, locale catalogs, Markdown/Outline seams, docs/specs, Storybook, workflow                                             | Stale authority, untranslated drift, duplicate ownership, type/lint failure, or unrelated diff blocks.                              |

## Decision log

### DEC-1 — Ship one first-party plugin factory

**Reference:** `module:Markdown/headingLinks/DEC-1`
**Decider:** `cixzhang`, `2026-10-03`

One factory preserves the opaque plugin list while exposing only installation, an optional
stable namespace, and an optional safe URL base. Its configuration rides the existing
portable, versioned plugin envelope rather than a creating module's WeakMap or object
identity, so duplicate compatible Core copies agree. A broad Markdown prop or separate
Outline option would make one composition into permanent parallel API and could drift
across surfaces.

Compatible duplicate copies consume the exact envelope. A valid generic same-name plugin
with absent or incompatible module data stays an ordinary plugin in the caller's declared
order, but never gains this module's ID projection. A malformed generic envelope follows
the existing consumer fail-soft path, so Markdown and Outline preserve released behavior
instead of throwing during render. Invalid direct factory arguments remain programmer
errors.

Rejected: module-local option state; elevating same-name lookalikes into this module;
render-time crashes for package-version skew; default-on behavior; a Markdown boolean or
namespace prop; a separate Outline identity option; product-specific factory options.

### DEC-2 — Own one all-depth identity projection

**Reference:** `module:Markdown/headingLinks/DEC-2`
**Decider:** `cixzhang`, `2026-10-03`

Every transformed heading participates depth-first so rendered targets and root
Outline entries share one collision sequence. NFKC Unicode slugging and emitted-ID
reservation produce durable readable fragments. Caller namespace is stable data;
runtime tree position and `useId` are not.

Rejected: root-only plugin allocation; separate Markdown/Outline sluggers; ASCII-only
slugs; collision counting that can re-emit a natural numeric suffix; runtime IDs.

### DEC-3 — The renderer extension is an honest revealed copy button

**Reference:** `module:Markdown/headingLinks/DEC-3`
**Decider:** `cixzhang`, `2026-10-03`

The renderer extension uses an inline trailing `#` sibling with baseline/logical
spacing, secondary color, and inherited typography. Its primary action is copy, so it is
a real button rather than an anchor that suppresses navigation. `useContainerReveal`
owns fine-pointer rest, heading-row hover, focus-within, coarse/touch, and motion
semantics. Its in-flow box matches the heading line-height, with stable logical-end space
and non-overlapping 24px coarse hit geometry; pointer activation paints no keyboard ring.
The heading ID remains the incoming fragment target.

Rejected: native fragment navigation; a copy-plus-navigation anchor hybrid; bespoke
reveal media logic; product routing; a new public reveal API.

## Content boundary

The module reads only transformed heading nodes and caller-supplied configuration carried
by the validated plugin entry for the current document invocation. It does not persist
document content, labels, destinations, options, or generated IDs in module-local state.

## Open questions

None.
