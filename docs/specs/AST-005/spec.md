---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-005
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: [architecture:public-component-api]
affects_families: [family:navigation-destinations]
affects_contributing: []
affects_consumer_docs:
  [Link, Button, ClickableCard, Item, List, Token, Markdown]
---

# Safe navigation destinations

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "navigation": ["FR2", "FR3", "FR4", "FR6", "FR7", "FR8", "DEC-1", "DEC-2"]
  }
}
```

## Intent

A person activating an Astryx link should get the same destination safety no
matter which component drew it, whether navigation is native or imperative, and
whether a framework router replaced the native anchor. Component composition
must not create a path around the shared rule.

This spec accepts the shared navigation-destination contract.
`family:navigation-destinations` records adoption across native, custom-router,
imperative, and Markdown navigation. Acceptance of the contract does not by
itself establish implementation or exact-head verification.

## Non-goals

- Validating URL syntax, requiring absolute URLs, or restricting destinations to
  an allowlist of hosts.
- Defining content policy for image, media, downloaded files, CSS, fetch, or
  other embedded resource URLs. Those sinks have different capabilities and
  content-type risks; downloads from accepted link destinations stay supported.
- Sanitizing caller-owned JSX, custom Markdown plugin output, or arbitrary
  consumer callbacks after control has left Astryx.
- Replacing Content Security Policy, router authorization, server validation, or
  application-level access control.
- Adding a public prop that lets a component bypass or configure the rule.
- Changing link labels, target/rel behavior, disabled semantics, or ordinary URL
  resolution.

## Requirements

- **FR1 — One rule covers every Astryx-owned navigation exit.** Before Astryx
  renders, delegates, or imperatively activates a caller-controlled navigation
  destination, the destination MUST pass the contract in this spec. Moving from
  a native anchor to a router component or enlarged clickable surface MUST NOT
  weaken that contract.
- **FR2 — Inspection follows browser scheme normalization.** Scheme inspection
  MUST remove ASCII control characters `U+0000–U+001F` and `U+007F`, trim outer
  whitespace, and compare ASCII scheme text case-insensitively. This prevents a
  blocked scheme from being hidden by characters the browser ignores.
- **FR3 — Executable document schemes are blocked.** A normalized navigation
  destination beginning with `javascript:`, `vbscript:`, or `data:text/html`
  MUST NOT become executable navigation. The check applies before query, hash,
  target, modifier-key, or pointer-button differences can select another sink.
- **FR4 — Ordinary destinations keep working.** Relative paths, same-document
  fragments, protocol-relative URLs, and ordinary schemes such as `http:`,
  `https:`, `mailto:`, `tel:`, and safe custom schemes MUST retain their existing
  navigation behavior, including downloads from accepted destinations. This
  contract does not rewrite, resolve, or host-filter accepted destinations.
  Accepted structured router destinations MUST retain their object identity.
- **FR5 — Native, custom, and imperative paths are all covered.** The full rule
  MUST hold for React DOM anchors, a custom component supplied through
  `LinkProvider` or an `as` seam, and imperative exits including `window.open`
  and `window.location`. React DOM's own sanitizer is not a native-anchor
  exception. Middle-click and Cmd/Ctrl-click are not exceptions either.
- **FR6 — Rejection fails closed at the navigation boundary.** A blocked
  destination MUST render inertly and MUST NOT reach an imperative browser API.
  A custom router MUST NOT be invoked for a rejected destination, including with
  `undefined` substituted for the rejected value. The component MAY preserve
  non-navigation rendering and consumer callbacks when doing so cannot activate
  the rejected destination.
- **FR7 — Router destination props are independent sinks.** When a custom link
  component can receive both `href` and `to`, each supplied value MUST pass the
  rule independently. If either is rejected, the result MUST be inert: no custom
  router invocation and no fallback to the other destination, even if it is safe.
  When both are accepted, an explicit `to` retains its documented precedence.
  Supported structured destinations MUST obey the same rule, including every
  scheme-bearing `href`, `pathname`, or `protocol` field and the destination
  those fields form. A separate protocol or an unchecked field MUST NOT provide
  a path around the rule. Accepted fields and object identity remain unchanged.
- **FR8 — Parser and rendering checks agree for navigation.** Markdown parsing,
  Markdown link rendering, and shared Core navigation plumbing MUST reject the
  same blocked navigation schemes after the same normalization. Markdown MAY use
  a stricter policy for embedded resource URLs without narrowing this navigation
  contract.
- **IR1 — Shared exits use a shared owner.** Core components that delegate links
  or navigate imperatively MUST use one shared policy owner rather than maintain
  component-local blocked-scheme lists. Parser-local implementations MAY remain
  separate only while conformance tests pin the same navigation matrix.
- **IR2 — Every distinct sink has mutation-sensitive coverage.** Verification
  MUST fail when the guard is removed from native anchors, custom `href`, custom
  `to`, supported structured destinations (including `protocol`), new-tab,
  modified-click, middle-click, plain imperative navigation, or Markdown link
  parsing/rendering. Rejected-router coverage MUST fail if the custom component
  is invoked with `undefined` or another destination used as fallback.
- **IR3 — New navigation surfaces join the family.** A new component or hook that
  accepts a caller-controlled navigation destination MUST join
  `family:navigation-destinations` and reuse the shared owner before shipping.

### Platform support

- Supported feature/engine floor: every browser and framework-link integration
  supported by Astryx Core.
- Unsupported behavior: a custom component that ignores the filtered destination
  props or manufactures a destination from other caller data is outside the
  guarantee; Astryx MUST NOT claim that caller-owned behavior is sanitized.
- Browser evidence: real Chromium verifies that every blocked scheme remains
  inert on native and imperative paths and that ordinary relative, external,
  modified, middle-click, and download behavior remains available. Unit
  integration tests verify custom router handoff and object identity; real
  framework SSR verifies that rejection renders without invoking a router that
  requires a destination.

## Current-state impact

`family:navigation-destinations` is the complete shared owner for the behavior.
Its membership covers every current Core component that accepts or derives a
navigation destination, including aggregate component records whose public
members own the actual `href`.

Implementation and verification must cover:

1. the full blocked-scheme rule on native anchors, not just React DOM's own
   `javascript:` protection;
2. custom `href` and `to`, including supported structured destinations and their
   separate `protocol`, with inert rendering whenever either value is rejected;
3. every imperative and delegated activation while preserving accepted
   destinations and consumer callbacks;
4. conformant Markdown navigation with separate embedded-resource policy; and
5. exact-head evidence before recording completed family adoption.

No component-local public prop is added. Exceptional behavior belongs in
caller-owned custom rendering outside this safe-navigation contract, not in a
`LinkProvider` or `as` bypass. Consumer documentation should state the shared
outcome where a component documents an `href` or router seam; it should link to
the shared rule rather than reproduce a scheme list in every prop row.

## Verification

| Contract           | Verification                                                 | Representative states                                                                                                                                       | Mutation or failure expectation                                                                                                                         |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR2, FR3, FR4, FR8 | Shared predicate and Markdown parser/render suites           | mixed case; embedded controls; relative/hash; http(s); mailto/tel; safe custom schemes; downloads; blocked schemes                                          | Removing normalization or changing one blocked prefix makes the navigation matrices disagree                                                            |
| FR5, FR6, FR7      | `useLinkComponent` integration tests and framework SSR tests | native anchor; provider; `as`; safe/rejected `href` and `to` in either combination; structured `pathname`/`href`/`protocol`; accepted object identity       | A rejected destination invokes the router, including with `undefined` or a safe fallback; accepted destinations lose identity or precedence; SSR throws |
| FR1, FR3, FR5, FR6 | `useClickableContainer` integration tests                    | plain click; `_blank`; Cmd/Ctrl-click; middle-click; delegated interactive ref                                                                              | A blocked value reaches `window.open`/`window.location`, or an ordinary navigation path stops working                                                   |
| FR1, IR1, IR3      | Family membership and source-usage audit                     | every current `useLinkComponent`, `useClickableContainer`, Markdown, and direct native-anchor destination owner                                             | A new caller-controlled navigation sink ships outside the family or duplicates a local rule                                                             |
| Browser contract   | Real Chromium probe                                          | all blocked prefixes on native anchors; custom-router stand-in; imperative same-tab/new-tab; modified and middle click; accepted destinations and downloads | Script executes, blocked navigation occurs, a rejected destination gains link activation, or ordinary browser affordances regress                       |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- every adoption gap in `family:navigation-destinations` is closed or documented
  as an explicit owner-approved exception;
- exact-head tests cover native anchors, structured router destinations, inert
  router rejection, and each distinct imperative and Markdown navigation sink;
- a source/member audit finds no caller-controlled Core navigation exit outside
  the family; and
- consumer docs describe the shared outcome without implying that embedded
  resources or caller-owned renderers receive the same policy.

## Decision log

### DEC-1 — Destination safety follows the navigation sink

**Reference:** `spec:AST-005/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

Every Astryx-owned path that can activate a caller-controlled navigation
destination follows one normalized blocked-scheme rule. The guarantee survives
component composition, custom framework routers, modified clicks, middle clicks,
and imperative navigation because those are alternate exits for the same user
intent.

Rejected: relying only on React DOM. React can protect an `href` it renders, but
it does not inspect props handed to a custom router and does not mediate
`window.open` or `window.location`.

### DEC-2 — Embedded resources remain a separate policy

**Reference:** `spec:AST-005/DEC-2`
**Decider:** `cixzhang`, `2026-08-31`

Navigation destinations and embedded resources are separate sink families. This
spec blocks executable document schemes for navigation without deciding which
image sources, downloaded content, or fetched resources are allowed. Downloads
from accepted navigation destinations keep working. Markdown may therefore
reject a broader resource set while matching the shared navigation matrix.

Rejected: one undifferentiated “safe URL” boolean for every URL-shaped value.
That hides material differences between navigating a document and embedding or
fetching a resource, and would accidentally broaden or narrow unrelated public
behavior.

## Open questions

None.
