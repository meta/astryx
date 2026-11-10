---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-113
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture:
  [
    architecture:component-style-authoring,
    architecture:public-component-api,
    architecture:internationalization,
    architecture:theme-application,
  ]
affects_families: [family:buttons, family:navigation-destinations]
affects_contributing: []
affects_consumer_docs: []
---

# React Server Components system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/package.json",
    "scripts/sync-exports.js",
    "scripts/check-use-client.mjs",
    "packages/core/src/serverSafeComponents.test.ts",
    "packages/core/src/Text/Text.tsx",
    "packages/core/src/Heading/Heading.tsx",
    "packages/core/src/Kbd/Kbd.tsx"
  ]
}
```

## Intent

A product that renders its pages from React Server Components imports Astryx
components the way it always does, and the parts of a page that only present
render on the server. The page ships no Astryx client JavaScript for them. A
component loads client code only where it needs the client: to read React
context, to hold state, or to handle interaction. The HTML a person receives,
the props a builder passes, and the behavior after hydration are the same as
when the component renders as a client component.

## Non-goals

- Server-side translation. The translator and locale hooks stay client context
  (`architecture:internationalization` INV13).
- Data fetching, streaming, caching, and Server Actions. Astryx ships no
  `'use server'` module; a Server Action a caller passes is the caller's code.
- Making a provider, or a component given a function, a ref, or a component
  `as`, render on the server. React does not allow it (FR9).
- Which family gains a server build next (OQ1).
- Equivalent internal implementations remain valid when they satisfy this
  contract. The module that holds a client part, its file name, and how a
  server build shares markup with its client build are implementation
  choices.

## Requirements

- **FR1 — Presentational paths render on the server.** Under the
  `react-server` condition, a component with a server build MUST render its
  complete markup on the server and reference no client module when its props
  and the providers around it need no client behavior. Text and Heading MUST
  reference no client module unless a truncation tooltip needs one (table
  below).
- **FR2 — Client parts hold only what the server cannot.** A client part MUST
  exist only to read React context, hold state or Effects, or handle
  interaction. The server build MUST reference it only when the props or the
  client providers that need it are present, as the table below lists. Each
  server build MUST declare its client parts and the reason for each; a server
  graph that reaches an undeclared client module, or reaches client code with
  no declared part, is a defect.
- **FR3 — No new public API.** A server build MUST export the same names as
  its client build, with the same props, types, defaults, and behavior. Astryx
  MUST NOT add a prop, an export, or an import path that a caller chooses to
  get the server build (`architecture:public-component-api` INV1, INV9, INV12).
- **FR4 — The environment selects the build.** The package's `exports` map
  MUST carry a `react-server` condition on every entry that has a server
  build, listed before every other condition, so a bundler with both the
  `react-server` and `source` conditions picks the server build. The default
  condition MUST resolve the client build that client code uses. The same
  `import {Button} from '@astryxdesign/core'` MUST resolve the server build
  inside React Server Components and the client build everywhere else, and so
  MUST each component subpath.
  - FR4 gap: no entry in `@astryxdesign/core`'s `exports` carries a
    `react-server` condition, so every import inside a Server Component
    resolves the client build.
  - FR4 gap: the package root entry is a `'use client'` module, so a root
    import inside a Server Component resolves every component as a client
    reference.
  - FR4 gap: `withAstryx()` source builds alias every `@astryxdesign/core`
    request to its source entry in every bundler layer, so they resolve the
    client build inside Server Components.
- **FR5 — Directives mark client parts only.** Every client part MUST begin
  with a `'use client'` prologue before any statement. A server module MUST
  NOT carry `'use client'`. Astryx MUST NOT ship a `'use server'` module.
  - FR5 gap: Text and Heading begin with `'use client'`, so a Server Component
    that renders them ships their whole client implementation.
- **FR6 — The first HTML is identical and final.** For the same props and the
  same providers, the HTML a page receives MUST be identical whether the
  component resolved its server or its client build: the same elements,
  attributes, classes, and text. Hydrating a server-rendered page MUST NOT
  report a mismatch, and a client part MUST NOT change the markup between the
  server render and the first client commit. Hydration MUST NOT change
  anything a person sees: under default props, providers, viewport, and
  pointer, the layout does not shift, and no content, presentation, or
  behavior swaps between the server HTML and the first client frame
  (`spec:AST-013` FR9). A component that cannot meet this has no server build
  and renders through its client build.
- **FR7 — Styles render with the markup.** The StyleX output that server
  modules import MUST reach the page with the server-rendered markup, through
  the package stylesheet or a source build (`spec:AST-080` FR1, FR4, FR7). A
  server-rendered component MUST paint styled before any client module loads,
  and MUST NOT depend on a client module to inject its styles.
- **FR8 — One React, as a peer dependency.** Server and client builds MUST
  import `react` as a peer dependency and never bundle their own copy, so a
  bundler that compiles the package with the app's React resolves one React:
  its `react-server` build on the server. A server module MUST NOT import
  `react-dom`, call a client-only React API, or hold module-level mutable
  state.
- **FR9 — React's limits route to the client build.** React does not let a
  Server Component receive a function or read React context. A component
  given an event handler, a render prop, any other function prop, a `ref`, or
  a component `as` MUST render through its client build, and every provider
  MUST stay a client component. Astryx MUST NOT drop, wrap, or convert such a
  prop. Where a prop accepts a Server Action, the server build MUST pass it
  through.
- **FR10 — Presentational pages ship no client JavaScript.** A server page
  that renders Text and Heading with no truncation tooltip on an explicit
  `maxLines` MUST ship zero Astryx client JavaScript for them.
- **FR11 — Astryx never holds a page.** A server build MUST NOT suspend and
  MUST NOT add a Suspense boundary, and no Astryx component, provider, or
  layout wraps an application subtree in one. A client part MUST NOT suspend
  or replace the server build's initial HTML: the trigger, its accessible
  name, and the content it presents are in that HTML, and the client part
  only adds behavior after hydration. Whether a page streams or waits is the
  application's choice, never a side effect of rendering an Astryx component.
- **FR12 — Server HTML behaves like the client component before hydration.**
  Before hydration, the server HTML MUST behave for the person as the client
  build's HTML does: a link navigates the way the client build's link
  navigates, a disabled control does not submit a form or navigate, and
  grouped styling (group corners, elevation, size, and add-on styling) is
  present. A server build that cannot meet this for a prop or a context MUST
  route that render to the client build. These cases route to the client
  build: a link under a LinkProvider; Button and IconButton inside ButtonGroup,
  InputGroup, Toolbar, or SideNav; a disabled ButtonGroup; and TopNav inside
  AppShell's drawer.
  - FR12 gap: in a disabled ButtonGroup, a submit Button renders with
    `aria-disabled` and no `disabled` attribute, so a click before hydration
    submits its form, in the client build too.
- **FR13 — Server pages use the built theme stylesheet.** A server-rendered
  page MUST load its theme as the built theme stylesheet, so the first paint
  uses the theme's tokens (`architecture:theme-application` INV4). A runtime
  theme injects its CSS after JavaScript loads, so the first paint uses the
  default tokens and the page restyles after hydration, which breaks FR6 and
  FR7.

### Client parts

A server build references these client parts, and only when the condition in
the second column holds. Everything else renders on the server.

| Component     | Client part references when                                                                                              | Why it needs the client                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Text, Heading | an explicit `maxLines` with the truncation tooltip on                                                                    | measures overflow and shows the full-text tooltip; at `maxLines={0}` it measures nothing and keeps the element mounted |
| Button        | every server-rendered Button: a context gate                                                                             | reads the size, ButtonGroup, InputGroup, and LinkProvider contexts and installs the shared touch press controller      |
| Button        | `icon` is set: an icon size scope                                                                                        | the icon slot's default size is a context provider; it adds no DOM                                                     |
| Button        | `clickAction`, `isLoading`, `tooltip`, a `ref`, a function prop, a component `as`, or a provider that changes its output | the client Button: fire-once actions, the loading spinner and live region, tooltip triggers, refs and handlers         |
| IconButton    | as for Button                                                                                                            | IconButton is Button with `isIconOnly`                                                                                 |
| TopNav        | every server-rendered TopNav: a frame, and a slot scope per slot section                                                 | reads the AppShell render mode (desktop bar, mobile bar, drawer) and sets the slot context menus read; adds no DOM     |
| TopNav        | no `label`                                                                                                               | translates the default landmark label                                                                                  |
| TopNav        | the AppShell drawer, a `ref`, or a function prop                                                                         | the client TopNav                                                                                                      |
| TopNavItem    | every server-rendered TopNavItem: a gate                                                                                 | reads the render mode and LinkProvider and installs the shared touch press controller                                  |
| TopNavItem    | the drawer, a LinkProvider, `onClick`, a `ref`, or a component `as`                                                      | the client TopNavItem: a drawer item closes the drawer; handlers                                                       |

TopNavHeading, TopNavMenu, TopNavMegaMenu, and their items are client modules
through both builds. Kbd has no server build: it translates its key labels,
and on Apple platforms its modifier labels change to glyphs after hydration,
so it renders through its client build (FR6, OQ3).

### Props and contexts that defeat the saving

Under these props and contexts, a server build loads the full client
component, so the page ships the same client JavaScript for that instance as a
client-only render does.

| Component     | Loads the full client component when                                                                                                                                                                              | In an app with a LinkProvider                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Text, Heading | never; an explicit `maxLines`, `0` included, with the truncation tooltip on loads only the truncation part, and the Tooltip code when the text overflows                                                          | no effect                                                                                              |
| Button        | `clickAction`, `isLoading`, `tooltip`, a `ref`, `onClick` or any other function prop, or `as` other than `"a"`; inside ButtonGroup or InputGroup; inside Toolbar, SideNav, or ButtonGroup with no explicit `size` | gated: a Button with `href` loads the client Button, so links save nothing                             |
| IconButton    | as for Button; a `tooltip`, which most icon-only buttons carry, always loads it                                                                                                                                   | gated: as for Button                                                                                   |
| TopNav        | a `ref` or a function prop; its copy in AppShell's drawer, so an AppShell page with a drawer loads the full client TopNav; no `label` loads the translator and its message catalog                                | gated: its items load their client components, so a header of links saves only the frame               |
| TopNavItem    | `onClick`, a `ref`, any other function prop, or `as` other than `"a"`; inside AppShell's drawer                                                                                                                   | gated: an item that is not disabled and has no `as` loads the client TopNavItem, so links save nothing |

### Platform support

- Supported environments: frameworks and bundlers that honor the
  react-server condition (verified in a Next.js App Router app and a second
  RSC bundler).
- Unsupported behavior: an environment that does not honor the condition
  resolves the default condition and renders the client build, with today's
  output and behavior.
- Browser evidence: hydration of a server-rendered page reports no mismatch
  in a real browser, and a page's network log shows the client JavaScript it
  loads.

## Current-state impact

- `architecture:component-style-authoring` delegates React module boundaries
  (client entry points, directive placement, server-safe modules, built-output
  preservation, and RSC-usable exports) to this record.
- `architecture:public-component-api`: no public name, prop, type, or default
  changes (FR3). The `exports` map gains a condition, not an import path.
- `architecture:internationalization` INV13: TopNav's default label is
  translated in a client part. Kbd translates its key labels, so it renders
  through its client build (OQ3).
- `architecture:theme-application` INV4: a server-rendered page loads the
  built theme stylesheet (FR13).
- `spec:AST-013` FR9: FR6 holds server builds to the same rule, with no visible
  false state after hydration.
- `spec:AST-080`: the package stylesheet and source builds carry the styles of
  server modules (FR7).
- `family:buttons` and `family:navigation-destinations`: every member keeps
  its contract; size, group, and link resolution come from the client parts.

## Verification

| Contract  | Verification                                                                                                                                                              | Representative states                                                                                                           | Mutation or failure expectation                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FR1, FR2  | Server render tests that load React's `react-server` build and swap each `'use client'` module for a client reference                                                     | Text and Heading with and without `maxLines` and the truncation tooltip; presentational and interactive Button and TopNav props | A hook in a server module throws; a presentational render that references a client part fails                      |
| FR2, FR8  | `serverSafeComponents.test.ts`: the import-graph walk of each server build                                                                                                | every server build and its declared client parts                                                                                | An undeclared client module, client-only React API, `react-dom` import, or module state fails the walk             |
| FR3, FR4  | Export-map and export-name checks                                                                                                                                         | each entry with a server build; the package root                                                                                | A missing or misordered `react-server` condition, or a name present in only one build, fails                       |
| FR5       | Directive check over every client part and server module                                                                                                                  | client parts; server modules; the absence of `'use server'`                                                                     | A directive after a statement, on a server module, or a `'use server'` module fails                                |
| FR6       | DOM-parity check: static markup of the server build against the client build                                                                                              | every variant and size, icon and icon-only, links, disabled, inside each provider, AppShell's modes                             | Any byte of difference fails; a real-browser hydration reports no mismatch                                         |
| FR6       | Hydration test: `renderToString` of the server render, then `hydrateRoot` with an `onRecoverableError` handler                                                            | every component with a server build, under default props and providers, and inside each provider that changes its output        | Any recoverable error fails                                                                                        |
| FR6, FR13 | First-frame visual check in a real browser: the box and text of every visible element in the server HTML, with the built theme stylesheet, against the first client frame | a phone viewport with touch and a desktop viewport with a mouse; default props, providers, and the AppShell modes               | Changed text, or an element that moves, appears, or disappears, fails; a first paint with default tokens fails     |
| FR12      | Pre-hydration behavior test in a real browser with JavaScript off                                                                                                         | a disabled ButtonGroup's submit Button inside a form; a link under a LinkProvider; Button in ButtonGroup and InputGroup         | A form that submits, a disabled control that navigates, or missing grouped styling fails                           |
| FR7       | Server-rendered fixture page in a real browser before any client chunk loads                                                                                              | Text, Heading, Button, TopNav                                                                                                   | An unstyled first paint fails                                                                                      |
| FR9       | Server render tests that pass functions, refs, and providers                                                                                                              | `onClick`, render props, `ref`, a component `as`, a Server Action                                                               | A function rendered on the server, or a Server Action dropped, fails                                               |
| FR10      | Bundle check of a server page in each supported bundler                                                                                                                   | a page of Text and Heading with no truncation tooltip                                                                           | Any Astryx client JavaScript in the page's bundle fails                                                            |
| FR11      | Server render tests with a streaming renderer, and a scan of server builds and client parts for `Suspense`, `lazy` and thrown promises                                    | each server-renderable component, server and client part, rendered inside an application Suspense boundary                      | an Astryx component that suspends, adds a Suspense boundary, or changes the server HTML when its client part loads |

## Decision log

### DEC-1 — Server builds with small client parts

**Reference:** `spec:AST-113/DEC-1`
**Decider:** cixzhang, 2026-11-10
**Source:** Owner decision, 2026-11-10 (Cindy)

A component's presentational path renders on the server. Small client parts
read context or handle interaction, and load only when the props or providers
that need them are present. No prop or behavior changes. A family gains its
server build in one change of its own, with its own parity and bundle
evidence.

Rejected: every component stays a client module, which keeps a server page
shipping the whole client implementation of each component it renders.
Rejected: server-only builds with no client parts, which lose the provider
size cascade, ButtonGroup membership, and LinkProvider resolution.

### DEC-2 — No new public API; the environment chooses

**Reference:** `spec:AST-113/DEC-2`
**Decider:** cixzhang, 2026-11-10
**Source:** Owner decision, 2026-11-10 (Cindy)

Callers never choose between a server and a client build. A `react-server`
export condition in the package's `exports` selects the server build; the
default condition keeps the client build. The same import resolves the right
build in each environment (FR3, FR4).

### DEC-3 — Client parts carry the directive; output matches

**Reference:** `spec:AST-113/DEC-3`
**Decider:** cixzhang, 2026-11-10
**Source:** Owner decision, 2026-11-10 (Cindy)

Client parts carry a `'use client'` prologue at module top, and Astryx never
ships `'use server'`. The CSS that server modules import renders with them.
The package works when bundled as a package with `react` as a peer
dependency. Server and client builds render exactly the same initial DOM, so
hydration never mismatches (FR5 to FR8).

### DEC-4 — React's own limits stay React's

**Reference:** `spec:AST-113/DEC-4`
**Decider:** cixzhang, 2026-11-10
**Source:** Owner decision, 2026-11-10 (Cindy)

A Server Component cannot receive functions or read React context. These are
React's limits, not Astryx API: a component given a handler, a render prop, a
ref, or a component `as`, and every provider, stays a client component (FR9).

## Open questions

- **OQ1 — Which family gains a server build next?** (`human-design`)
  Candidates: Button and IconButton; TopNav and TopNavItem; Avatar and the
  Link variants.
- **OQ2 — How does CI run the two-bundler verification?** (`checkable`)
  Candidates: a fixture app per bundler on every change that touches a server
  build or the `exports` map; or the fixture apps on every release.
- **OQ3 — How does Kbd render on the server?** (`human-design`) Kbd
  translates its key labels in client context, and on Apple platforms its
  modifier labels change to glyphs after hydration, so it renders through its
  client build. Candidates: server-side translation; or English-only key
  labels on the server.
- **OQ4 — Can AppShell render one markup tree?** (`checkable`) AppShell picks
  its desktop or mobile layout in script after hydration, so it and the TopNav
  inside it render through their client builds (FR6). Candidate: one markup
  tree with CSS-only breakpoints and drawer state, which renders both layouts
  without script. The answer belongs to AppShell's own record.
