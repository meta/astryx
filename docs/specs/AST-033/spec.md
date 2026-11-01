---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-033
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-21
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: [family:navigation-destinations]
affects_contributing: []
affects_consumer_docs: [docsite]
---

# Docsite interaction and product-data contract

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "docsite": [
      "DEC-1",
      "DEC-2",
      "DEC-3",
      "DEC-5",
      "FR3",
      "FR8",
      "FR13",
      "FR16",
      "FR17",
      "FR18",
      "FR19",
      "FR20",
      "FR21",
      "DEC-7",
      "DEC-8"
    ]
  }
}
```

<!-- path-applicability:v1 -->

```json
{
  "paths": ["apps/docsite/**"]
}
```

## Intent

People using the Astryx Docsite should see truthful projections of the owning
product catalogs and one current interaction state. Links, browser history, visible
content, analytics, and latest/canary presentation should agree about what the person
selected and what is actually available.

This contract owns shared Docsite interaction and product-data rules. It makes
ordinary fixes that restore those rules reviewable without inventing a specification
for each bug.

## Non-goals

- Defining upstream component, template, theme, package, or catalog authoring
  schemas. This contract begins at the registry boundary the Docsite consumes.
- Defining template fixture preview and copy behavior owned by `spec:AST-028`.
- Choosing visual design, animation, layout, or copy for an individual Docsite page.
- Choosing a telemetry vendor, transport, retention policy, or dashboard.
- Adding a package API, theme target, or consumer runtime.
- Treating one pull request, bug, or current implementation mechanism as authority.

## Requirements

### Canonical product data

- **FR1 — Upstream owners supply product facts.** Canonical component, template,
  theme, package, and catalog owners define item identity, package ownership,
  taxonomy, readiness, release-channel admission, and explicit visibility. Route
  owners define stable destinations. The Docsite pipeline and generated registries
  materialize those facts; they MUST NOT invent a second identity, classification,
  readiness state, availability rule, or visibility rule. When no current upstream
  owner defines a needed fact, the Docsite reports or routes that authority gap
  rather than deciding it in view code.
- **FR2 — Projections preserve catalog facts.** Gallery, sidebar, direct
  routes, detail pages, preview, playground handoff, and Docsite API projections
  MUST derive membership and canonical item facts from the generated registries. A
  surface MAY define local display order, shorten labels, or derive display-only
  groups from canonical fields with a deterministic fallback. Those presentation
  choices MUST NOT change catalog membership or be exported or reused as canonical
  taxonomy. Site search answers with the CLI's own search: the site's search
  endpoint calls `search()` from the CLI package the site builds with and returns
  its results in the CLI's order, so the site and `astryx search` give one answer.
  The generated registries stay the source for the pages and links those results
  open.
- **FR3 — Availability and visibility are separate projections.** Availability
  means that a named Docsite operation has the source, loader, route, or handoff
  required to present an admitted item on the current content line. Visibility means
  that an otherwise available item is listed on a named surface. A visibility field MUST name or
  document the projections it excludes. Hiding an item from an overview MUST NOT
  silently remove its direct route, search result, preview, or playground
  availability, and a projection MUST NOT infer those effects from a similar flag.
  Missing, invalid, or contradictory admission metadata fails closed rather than
  making an unavailable item appear usable.

### Latest, canary, and readiness

- **FR4 — Release channel, readiness, and visibility are distinct.** Package
  `canaryOnly` metadata owns package release-channel admission. Generated components
  currently project that package channel as `isReady: false`; they do not author an
  independent component-readiness field. Template `isReady` remains
  template-authored item readiness. Explicit visibility metadata owns where an
  admitted item is listed. No projection invents another channel, readiness, or
  visibility state.
- **FR5 — Each build identifies its actual content sources.** `latest` pins
  published stable package metadata and package documentation. Canary, local
  development, and pull-request previews may read configured workspace/canary
  packages. Executable CLI templates and blocks, their live examples, long-form CLI
  docs, and Docsite-authored content remain workspace-backed on both targets where
  the pipeline currently declares that boundary. A projection MUST NOT describe
  workspace-backed content as release-pinned merely because the build target is
  `latest`. Site search is workspace-backed on both targets: it runs the CLI the
  site builds with, over the workspace docs and packages that CLI reads, the same
  source as the site's CLI reference pages. On `latest` it leaves out
  integrations without published docs, and a result whose page is not published
  links to the nearest published index page.
- **FR6 — Canary status is projected once at the owning level.** A surface SHOULD
  group canary status at the package or category level when children share it,
  instead of repeating a marker on every item. The install command, search result,
  detail page, and API output MUST remain consistent with the same channel and
  readiness facts. Visibility remains an independent projection.

### Navigation and browser history

- **FR7 — Docsite destination actions use the shared navigation contract.** An
  action whose result is a URL or another addressable Docsite state is a navigation
  destination. `family:navigation-destinations` owns destination acceptance and
  supported native/router behavior, including real `href`/`to` sinks and browser
  affordances. A click handler MAY add analytics but MUST NOT become a second or
  only navigation mechanism.
- **FR8 — Addressable state has one canonical URL per surface.** A component,
  template, theme, tab, or other state intended for direct linking or restoration
  MUST have one canonical URL encoding on its owning surface. Historical or
  convenience aliases MAY redirect or normalize to it. Direct load, in-app open and
  close, soft navigation, Back, and Forward MUST agree. Catalog-backed identities
  resolve through the owning registry; route-local tabs and other view values resolve
  through the route owner rather than embedding or duplicating product data.
- **FR9 — Primary selection pushes; secondary view state replaces.** Selecting a
  different primary catalog item creates a history entry, and Back and Forward
  traverse those selections. URL-encoded tabs, pickers, filters, sort order, and
  canonicalization replace the current entry. Purely local transient presentation
  state need not enter the URL. A surface MUST NOT use replacement merely to avoid
  restoring a primary addressable selection.

### Selection and asynchronous work

- **FR10 — Current selection owns visible content.** Header, body, actions, command,
  accessible name, and analytics context for a selected item MUST resolve from the
  same current committed selection. Opening, reopening, deep linking, URL
  restoration, or direct selection MUST NOT show content from a previously selected
  item.
- **FR11 — Deferred content is scoped to its initiating transition.** A transition
  MAY retain the previous content beneath an explicit pending treatment only while
  the exact navigation that initiated that work remains current. Closing,
  cancellation, a newer selection, a newer navigation, or unmount supersedes that
  work. Closed or superseded work MUST NOT repaint visible content, replace current
  metadata, move focus, update the canonical URL, or emit a success event.
- **FR12 — Selection-affecting async completion commits through current
  ownership.** Async work that can repaint a selected preview or commit
  selection-owned metadata, focus, or URL state MUST verify that its request still
  owns that selection before committing. Request identity or cancellation is
  implementation-owned; global pending state without request ownership is
  insufficient. General Docsite request lifetime and external synchronization remain
  with this record and the owning Docsite component;
  `architecture:react-component-runtime` supplies analogous Core/Lab lifecycle
  constraints but does not own `apps/docsite`. Copy, save, export, and share
  settlement timing remains with FR15.

### Interaction analytics

- **FR13 — One typed module owns custom analytics.** The shared Docsite analytics
  module owns the small custom event vocabulary and property schema. Item, package,
  and category properties use canonical registry identifiers. Every finite
  code-owned dimension—including page, target, source, type, direction, tab, view,
  and toggle value—uses a closed code-owned vocabulary rather than an unrestricted
  caller string. Events MUST NOT include user-authored source, free-form content,
  URL fragments, or other personally identifying or unexpectedly high-cardinality
  data.
- **FR14 — The semantic action owner emits once.** The code that accepts or commits
  a direct user action emits at most one matching custom event. Rendering,
  hydration, effects, URL restoration, router synchronization, prefetch, background
  work, and automatic page loading emit no custom interaction event. Root analytics
  owns automatic page views.
- **FR15 — Event timing follows the claim.** Navigation intent may log when a valid
  user activation is accepted because the real link owns completion. Copy, export,
  save, share, and similar success claims log only after the operation succeeds.
  Cancelled, rejected, failed, ignored, closed, or superseded work MUST NOT emit a
  success event.

### Playground storage and parent-page isolation

- **FR16 — Production playground code is isolated from storage and the parent page.**
  Production previews, including deployed pull-request previews, MUST execute
  user-authored code with an opaque origin, without access to the Docsite's
  origin-bound storage or parent-page DOM. Local storage may be blocked entirely;
  previewed code has no persistence guarantee. The playground MUST explain these
  restrictions to users. Local development MAY differ, but MUST NOT stand in for
  production isolation evidence.

  Reload or hostile navigation may reset preview runtime state. The playground
  MUST recover a trusted preview with the editor's current code and active
  theme/mode. Replacement content MUST NOT receive editor source, theme state, or
  authority to edit the parent merely because it occupies the preview.

  Changes to this boundary require real production-browser evidence for storage
  and parent-DOM denial, trusted recovery after reload and hostile navigation,
  and restoration of current code and theme/mode.

### Published surfaces and deployment identity

- **FR17 — Production has one exact-head owner.** The canonical production
  Docsite origin MUST serve the documentation, `/storybook/`, and `/sandbox/`
  from the same successful main-branch deployment. A build that cannot stage
  either static application MUST fail rather than publish a partial release.
  The Docsite MUST expose real links to both applications.
- **FR18 — Static application routes remain addressable.** Storybook manager and
  iframe URLs, Sandbox route directories and embeds, static assets, query
  parameters, and fragments MUST survive direct load on their canonical paths.
  Route normalization MAY preserve or remove a trailing slash, but MUST retain
  the selected application state and MUST NOT fall through to unrelated Docsite
  content.
- **FR19 — Canonical and indexing metadata match the surface.** Production entry
  and addressable route pages identify their `https://astryx.atmeta.com`
  canonical URL. Pull-request previews, standalone Storybook frames, Sandbox
  embeds, and compatibility pages MUST be `noindex`; a preview MUST NOT claim a
  production canonical URL.
- **FR20 — Deployment identity is exact and generated.** Every Vercel Preview
  and Production build MUST expose its complete 40-character source commit and
  deployment environment at `/version.json`. Missing source identity fails the
  build. Generated identity and staged applications MUST NOT enter source
  control.
- **FR21 — The former Pages origin is one compatibility surface.** GitHub Pages
  MUST serve only a small, accessible, responsive landing page and equivalent
  deep-path recovery page. Documentation is the primary canonical destination;
  Storybook and Sandbox are labeled secondary destinations. An old Storybook or
  Sandbox path MAY be carried into the corresponding link with its query and
  fragment, but the compatibility page MUST NOT automatically redirect, build
  either application, or host CI evidence.

### Authority routing

`architecture:knowledge-contracts` owns public-delta routing and change disposition.
This record supplies the expected Docsite behavior; it does not pre-approve a pull
request because its title says bug fix. Reviewers map every observable delta to the
applicable current owner. A new interaction model, exception, public API, event
meaning, visibility axis, taxonomy, or data owner remains a separate contract delta.

### Platform support

- Supported feature/engine floor: the Docsite's current supported browsers and
  Next.js router integration.
- Unsupported behavior: a client that cannot preserve a real link or canonical URL
  MUST retain a usable full-page navigation; it MUST NOT substitute a click-only
  control or silently lose the destination.
- Browser evidence: real Chromium verifies link affordances, Back/Forward,
  selection restoration, focus, and pending/close/supersession behavior. DOM-only
  evidence does not prove browser history or painted stale-content absence.

## Current-state impact

The current Docsite already generates package, component, template, docs, block,
theme, and component-preview registries from repository metadata. Published package metadata
and package docs use the latest/canary content roots, while executable templates,
blocks, examples, long-form CLI docs, and Docsite-authored content remain
workspace-backed.
Most navigation actions expose real links, and one analytics module owns a small
event vocabulary.

Known conformance gaps remain implementation work:

- some gallery and playground membership/classification data remains in page- or
  script-local lists instead of canonical metadata or generated registries, and
  template live-preview membership remains in a hand-maintained map;
- template readiness and visibility are not projected consistently across gallery,
  search, direct routes, preview, and playground;
- primary theme selection currently replaces history, and theme search results
  collapse every selected theme to bare `/themes`, which restores the default seed
  instead of the searched identity;
- addressable template previews have canonical `?preview=` URLs, but gallery cards
  and Preview buttons remain click-only controls rather than link-backed
  destinations;
- primary template preview selection currently replaces history rather than creating
  a browsing step;
- template preview may retain a deferred prior selection outside the exact pending
  navigation that owns it;
- analytics still permits unrestricted string context for item, package, category,
  source, type, tab, view, and toggle-value fields, and nested template-preview
  activation can reach the same semantic action twice; and
- existing interaction tests do not yet cover the complete primary-selection,
  Back/Forward, close, cancellation, and supersession matrix.

Stable Storybook and Sandbox currently use a split deployment: pull-request
previews are staged inside the Vercel Docsite, while stable main is rebuilt and
published through a separate GitHub Pages branch. That duplicates application
builds, leaves production ownership ambiguous, and makes the former Pages origin
carry unrelated preview and evidence storage.

The accepted target makes Vercel the one production owner for all three surfaces
and reduces GitHub Pages to the FR21 compatibility page. It adds no package or
consumer runtime API; `/version.json` is deployment evidence for verifying the
exact source already serving those public surfaces.

## Verification

| Contract  | Verification                                                                             | Representative states                                                                                                    | Mutation or failure expectation                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | generator/data-extraction tests plus cross-projection inventory; search endpoint parity with `astryx search --json` | package, component, template, theme; gallery, sidebar, search, direct route, preview, playground                         | a local map changes membership or a canonical item fact, or availability and visibility collapse into one projection                                      |
| FR4–FR6   | latest/canary generation and projection tests                                            | stable package, canary-only package, ready/unready item, overview-hidden item, invalid integration metadata              | latest exposes canary package docs, workspace-backed content is called release-pinned, a second readiness state appears, or projections disagree          |
| FR7–FR9   | navigation-family checks plus real-browser navigation/history tests                      | direct link, modified click, new tab, deep link, primary selection, secondary tab/filter, canonicalization, Back/Forward | Docsite misclassifies a destination, canonical identity diverges, primary selections replace one another, or secondary state clutters history             |
| FR10–FR12 | selection/transition tests plus real-browser visible-content checks                      | initial open, reopen, deep link, direct selection, pending previous/next, close, supersede, reject, unmount              | header/body/actions disagree, stale content paints without its owning pending state, or obsolete selection work commits after supersession                |
| FR13–FR15 | analytics schema and interaction tests with transport spies                              | navigation intent, successful/failed copy, cancel, URL restoration, render/effect, duplicate activation                  | event names/properties drift, free-form/high-cardinality data is logged, a passive lifecycle emits, success logs on failure, or one action emits twice    |
| FR16      | production-browser playground isolation and recovery tests                               | direct load, reload, hostile navigation, storage and parent-DOM denial                                                   | preview code reaches parent/storage or trusted recovery restores stale source/theme                                                                       |
| FR17–FR21 | exact-head Vercel build, route/asset probes, metadata checks, and Pages landing contract | production and PR Preview; Storybook manager/frame; Sandbox route/embed; old root/deep path; desktop/mobile; light/dark  | one app is absent or stale, a direct asset/route fails, metadata claims the wrong owner, identity drifts, or Pages hosts more than the compatibility page |

## Decision log

### DEC-1 — Product data has one registry-backed owner

**Reference:** `spec:AST-033/DEC-1`
**Decider:** `cixzhang`, `2026-09-09`

Upstream canonical metadata and catalog owners define product facts. Generated
registries materialize those facts for the Docsite; views project them without
creating another catalog.

Rejected: page-owned item lists, parallel membership/classification maps, and a
generator inventing product policy absent an upstream owner.

Site search is governed by DEC-8.

### DEC-2 — Browser history follows semantic weight

**Reference:** `spec:AST-033/DEC-2`
**Decider:** `cixzhang`, `2026-05-01`

Primary catalog-item selection is navigation and pushes history. URL-encoded
secondary tabs, pickers, filters, sort order, and canonicalization replace the
current entry. Purely local transient presentation need not enter the URL. This lets
Back and Forward follow the person's browsing path without making secondary controls
tedious.

Rejected: replacing primary selections, pushing every secondary adjustment, and
putting non-addressable transient presentation into history.

### DEC-3 — Custom analytics belongs to direct user actions

**Reference:** `spec:AST-033/DEC-3`
**Decider:** `cixzhang`, `2026-06-10`

One typed vocabulary records direct interaction. Root analytics owns automatic page
views; renders, effects, and URL restoration do not manufacture custom engagement.
Success events follow success.

Rejected: page-load effects duplicating automatic analytics and optimistic copy/save
success events that fire before completion.

### DEC-4 — Canary channel and readiness remain separate

**Reference:** `spec:AST-033/DEC-4`
**Decider:** `cixzhang`, `2026-09-06`

Canary-only packages are publicly visible on the canary line for pre-promotion
vetting and absent from latest package documentation. Package channel may project
component `isReady: false`; Docsite views do not invent another unstable state, and
visibility stays independent.

Rejected: parallel unstable flags, hidden canary-only content, and page-local canary
allowlists.

### DEC-5 — Current selection outranks stale async work

**Reference:** `spec:AST-033/DEC-5`
**Decider:** `cixzhang`, `2026-09-09`

The current committed selection owns visible content. Deferred content is allowed
only for the exact pending transition that retains it, with an explicit pending
treatment. Closing or superseding the transition ends that authority.

Rejected: one global pending/deferred value repainting a newly opened, closed, or
newer selection.

### DEC-6 — Trying code does not require persistence or parent-page access

**Reference:** `spec:AST-033/DEC-6`
**Decider:** `cixzhang`, `2026-09-23`

The playground is for trying Astryx code, not storing local data. Production
previews have an opaque origin and no access to the Docsite's origin-bound
storage or parent-page DOM. Previewed code has no persistence guarantee;
restrictions are explained to users. Development may differ. Reload and hostile
navigation recover a trusted preview with current editor code and theme/mode.

Rejected: treating local persistence or parent-page DOM access as a playground
guarantee.

### DEC-7 — Vercel owns every maintained production surface

**Reference:** `spec:AST-033/DEC-7`
**Decider:** `cixzhang`, `2026-09-29`

The production Docsite, Storybook, and Sandbox ship together from the exact main
commit on the canonical Vercel origin. GitHub Pages remains only as one noindex
compatibility landing for old bookmarks, with documentation first and direct
Storybook and Sandbox destinations alongside it. Pull-request previews keep the
same Vercel paths and remain non-canonical.

Rejected: continuing a second stable-app build on `gh-pages`, silently dropping
old bookmarks, automatically redirecting every old deep path without recovery
choice, and using the compatibility origin for visual or test evidence.

### DEC-8 — Site search uses the CLI's search

**Reference:** `spec:AST-033/DEC-8`
**Decider:** `josephfarina`, `2026-10-21`

Maintainer decision: site search uses the CLI's search instead of a separate index
derived from the registries, and reads the workspace docs the site builds with on
every target, so each search improvement reaches the live site. One ranking implementation means every search
improvement reaches the site with no copy to keep in sync. A parity test holds the
endpoint equal to `astryx search --json` for the site's project.

Rejected: a site-owned index or ranking, and a browser copy of the CLI's search
data that has to track every CLI release.

## Open questions

None.
