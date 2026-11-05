---
schema_version: 1
template_version: 1
kind: family
id: family:navigation-destinations
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
owners: [cixzhang, imdreamrunner]
review_triggers: [behavior, accessibility, public-api]
verified_by:
  [
    packages/core/src/utils/safeUrl.test.ts,
    packages/core/src/Markdown/parser.test.ts,
    packages/core/src/Markdown/Markdown.test.tsx,
    packages/core/src/Markdown/Markdown.renderBoundary.test.tsx,
    packages/core/src/Link/useLinkComponent.test.tsx,
    packages/core/src/Link/__tests__/Link.navigation.a11y.chromium.spec.ts,
    packages/core/src/Citation/Citation.test.tsx,
    packages/core/src/TopNav/TopNavMenu.test.tsx,
    apps/docsite/src/__tests__/link-navigation.test.ts,
    packages/core/src/hooks/useClickableContainer.test.tsx,
    packages/core/src/ClickableCard/ClickableCard.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
  ]
members:
  [
    component:Avatar,
    component:BreadcrumbItem,
    component:Button,
    component:Citation,
    component:ClickableCard,
    component:DropdownMenuItem,
    component:Item,
    component:Link,
    component:ListItem,
    component:Markdown,
    component:NavHeadingMenuItem,
    component:SideNavHeading,
    component:SideNavItem,
    component:Tab,
    component:Token,
    component:TopNavHeading,
    component:TopNavItem,
    component:TopNavMenu,
    component:TopNavMegaMenuItem,
    component:TopNavMegaMenuFeaturedCard,
    component:TreeListItem,
  ]
architecture: [architecture:public-component-api]
contributing: []
deciding_specs: [spec:AST-005/DEC-1, spec:AST-005/DEC-2]
---

# Navigation destinations contract

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "navigation": ["FR1", "FR3", "FR4", "FR5"]
  }
}
```

## Intent

People should receive the same safe navigation behavior from every Astryx
component that accepts or derives a destination. A component's visual role,
router integration, or enlarged click target must not determine whether a
blocked destination can execute.

## Membership rule

A component belongs when Astryx accepts or derives a destination that the
component can render, delegate, or activate as navigation. Membership follows
that observable responsibility rather than the component's visual category or
which shared hook it currently uses.

A component that only lays out caller-owned links does not join. A component that
creates a fixed same-document link from an Astryx-owned ID does not join unless
it also accepts caller-controlled destination text. Caller-owned JSX, plugin
renderers, and callbacks are outside the boundary after Astryx hands over
control.

- **Current members:** Avatar; BreadcrumbItem; Button link mode; Citation;
  ClickableCard; DropdownMenuItem link rows (and the data-mode item they render,
  in the pointer menu and the touch sheet); Item; Link; ListItem; Markdown
  links; NavHeadingMenuItem;
  SideNavHeading and SideNavItem; navigation-mode Tab; Token link mode;
  TopNavHeading, TopNavItem, TopNavMenu, TopNavMegaMenuItem, and
  TopNavMegaMenuFeaturedCard; and TreeListItem.
- **Collaborators:** `useLinkComponent`, `LinkProvider`,
  `useClickableContainer`, React DOM's native-anchor sanitizer, and Markdown's
  parser/render boundary.
- **Excluded:** Outline's Astryx-generated `#id` links; AppShell's fixed
  skip-to-content fragment; arbitrary links supplied as children; Markdown
  plugin output; image/media/resource URLs; and components that only compose a
  member without accepting or deriving its destination.

Membership is open-ended. A newly shipped Core component that meets the rule
must be added here even when it delegates to an existing member or shared hook.

## Shared owner

- `spec:AST-005` owns the normalized blocked-scheme rule for every navigation
  destination. This family owns its application across members.
- `useLinkComponent` owns destination handoff to native and custom link
  components, including the router-facing `href` and `to` seams. Accepted
  structured destinations retain object identity. Rejected destinations render
  inertly without invoking the custom component.
- `useClickableContainer` owns imperative navigation from enlarged surfaces,
  including same-tab, new-tab, modifier-click, middle-click, and delegated
  activation. Every activation preserves the same accept/block result.
- Markdown owns parsing untrusted source into a destination and preserving the
  same navigation decision through rendering. Its image/resource policy remains
  separate.
- Native anchors follow the full shared navigation rule. React DOM's own
  sanitization is not an exception to any blocked scheme.

## Canonical concepts

| Concept            | Values or states                                           | Default semantics                                                                        | Stability |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| destination source | caller prop, parsed content, Astryx-derived                | caller/parsed values require inspection; fixed Astryx fragments are safe by construction | current   |
| sink               | native anchor, custom router, imperative browser API       | every Astryx-owned sink enforces the same navigation decision                            | current   |
| decision           | accepted or blocked                                        | accepted destinations keep existing behavior; blocked destinations do not navigate       | current   |
| activation         | plain, new-tab, modified, middle-click, programmatic proxy | activation method does not change the decision                                           | current   |
| resource kind      | navigation or embedded/fetched resource                    | this family owns navigation only                                                         | current   |

## Cross-component invariants

- **FR1 — Every caller-controlled navigation destination is decided before its
  sink.** No member may render a native navigation destination or pass one to a
  custom router or imperative browser API before the shared rule runs.
- **FR2 — Alternate rendering keeps the rule.** Replacing a native anchor through
  `LinkProvider` or `as` does not bypass destination handling.
- **FR3 — Alternate activation keeps the rule.** `_blank`, Cmd/Ctrl-click,
  middle-click, same-tab assignment, and delegated surface clicks produce the
  same accept/block decision.
- **FR4 — Blocked schemes cannot execute.** After browser-compatible scheme
  normalization, `javascript:`, `vbscript:`, and `data:text/html` do not become
  navigation, including through native anchors.
- **FR5 — Accepted destinations retain browser behavior.** Relative paths,
  fragments, protocol-relative destinations, HTTP(S), mailto, tel, and safe custom
  schemes retain native and router navigation, targets, downloads, and browser
  affordances. Accepted structured router destinations retain their fields and
  object identity.
- **FR6 — Both custom-router props are sinks.** A supplied `href` and explicit
  `to` are checked independently, including the scheme-bearing fields of
  supported structured forms (`href`, `pathname`, and `protocol`) and the
  destination they form. If either supplied destination is rejected, the result
  is inert: the custom router is not invoked, even with `undefined`, and there is
  no fallback to the other destination. Accepted explicit `to` values keep their
  documented precedence when every supplied destination is accepted.
- **FR7 — Disabled and rejected are distinct.** Members keep their own disabled
  semantics. Rejecting a destination prevents navigation without inventing a
  disabled state, label, or visual treatment.
- **FR8 — Resource handling does not inherit navigation policy.** Images, media,
  CSS URLs, fetch targets, and downloaded content use their own sink-specific
  contracts. An accepted link's existing download behavior is preserved. A member
  that handles both navigation and resources applies this family only to its
  navigation path.

## Allowed component variation

- **AV1 — Rejected presentation.** Markdown may render rejected source as text;
  a custom-link member renders inert content without invoking its custom router;
  an enlarged surface may simply omit navigation. Each member preserves its own
  non-navigation structure and accessibility contract. No component bypass prop
  is provided; exceptional behavior belongs to caller-owned custom rendering
  outside this contract.
- **AV2 — Native versus router navigation.** Members may use React DOM anchors,
  provider-level router components, per-component `as` overrides, or imperative
  browser APIs when their public contract requires that mode.
- **AV3 — Destination vocabulary.** Public APIs may expose `href`, structured
  item data containing `href`, a Citation `url`, or parsed Markdown syntax. The
  shared behavior does not require renaming released props.
- **AV4 — Target and relationship.** Members retain their existing `target`,
  `rel`, referrer, download, and external-link presentation behavior after a
  destination is accepted.
- **AV5 — Embedded resources.** Markdown and Citation may separately own image
  or resource policy; those decisions do not alter this family's navigation
  matrix.

## Representative matrix

| Member and state                                    | Shared invariant                                          | Deliberate variation                                                       |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `component:Link` / native anchor                    | all three blocked destination prefixes remain inert       | accepted destinations retain native anchor affordances                     |
| `component:Link` / custom provider or `as`          | either rejected `href`/`to` prevents router invocation    | router owns accepted client-side navigation and receives unchanged objects |
| `component:ClickableCard` / plain or modified click | every imperative or delegated exit uses the same decision | visible Card structure and nested-interactive handling remain local        |
| `component:Token` / link with remove action         | surface activation and hidden link agree                  | remove action remains an independent sibling control                       |
| `component:Markdown` / parsed link                  | blocked source does not become navigation                 | rejected source may render as text; resource policy remains separate       |
| navigation aggregate / member item                  | item destination uses the shared owner                    | tree, tab, breadcrumb, side-nav, top-nav, and menu semantics remain local  |
| `component:Citation` / linked source                | blocked URL does not execute                              | native-anchor path and citation presentation remain local                  |

## Adoption and exceptions

| Components or surface                             | Required adoption                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Markdown parsed and rendered links                | Parsing and rendering preserve the shared navigation decision; image/resource policy remains separate (AV5).                        |
| Native React anchors, including Citation          | The full blocked-scheme rule holds; React DOM's `javascript:` protection alone is not sufficient.                                   |
| `useLinkComponent` custom provider and `as` paths | Both supplied destinations and supported structured forms, including `protocol`, obey the rule; rejection never invokes the router. |
| `useClickableContainer` imperative paths          | Same-tab, new-tab, modifier, middle-click, and delegated activation agree; non-navigation consumer callbacks remain available.      |
| Components composing the two shared hooks         | Both delegated destinations and any separately rendered native anchor meet the full rule.                                           |

These are required outcomes, not a claim of completed verification. Adoption is
complete only after exact-head evidence covers every applicable row. Neither a
native-anchor React-only check, unchecked scheme-bearing fields, nor invoking a
router with an undefined rejected destination is an approved exception.

## Verification map

| Contract           | Verification                                                                         | Representative members and states                                                                                                                                       | Mutation or failure expectation                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR4, FR5           | `safeUrl.test.ts`                                                                    | string and structured destinations; mixed case; controls; relative, fragment, protocol-relative, ordinary, safe custom schemes, and `data:image/*`; separate `protocol` | The shared rule accepts a blocked destination or rejects an ordinary one, including when a protocol is separate from its pathname.                                            |
| FR1, FR2, FR6      | `useLinkComponent.test.tsx` and `apps/docsite/src/__tests__/link-navigation.test.ts` | native Link, Button, navigation members; provider and `as`; safe/rejected `href` and `to` in either combination; structured destinations and object identity            | A rejected destination invokes the router (including with `undefined` or fallback), an accepted object loses identity, or a real router throws while rendering inert content. |
| FR1, FR3, FR4, FR5 | `useClickableContainer.test.tsx` and real Chromium navigation coverage               | ClickableCard and Token shapes; native Link; plain, `_blank`, Cmd/Ctrl-click, middle-click, delegated activation; accepted downloads                                    | A rejected destination remains activatable, a blocked native, imperative, or delegated navigation occurs, or an accepted destination loses an activation mode.                |
| FR4, FR5           | `parser.test.ts`, `Markdown.test.tsx`, and `Markdown.renderBoundary.test.tsx`        | parsed, reference, autolink, and transformed built-in links; mixed case; controls; ordinary schemes; `data:image/*` links versus images                                 | Markdown accepts a blocked scheme, rejects an ordinary navigation destination, applies resource policy to a link, or renders a rejected node as navigation.                   |
| FR1, IR3           | source/member audit required by `spec:AST-005`                                       | every caller-controlled Core navigation destination                                                                                                                     | A new sink or destination-bearing component ships outside this member snapshot                                                                                                |
| FR7, FR8           | member-focused behavior and resource suites                                          | disabled link modes; Markdown links versus images; Citation link versus image                                                                                           | Destination rejection changes disabled semantics or navigation policy silently becomes resource policy                                                                        |

## Decision links

- `spec:AST-005/DEC-1` — destination safety follows every navigation sink.
- `spec:AST-005/DEC-2` — embedded resources remain a separate policy.

## Open questions

None.

## Content boundary

This file owns navigation-destination membership, the cross-component
accept/block result, and adoption of the shared sinks. It does not duplicate
component prop tables, router implementation details, component-local disabled
or rendering behavior, embedded-resource policy, current audit results, or the
system-spec rationale.
