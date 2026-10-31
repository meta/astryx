---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:theme-application
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/theme/Theme.tsx,
    packages/core/src/theme/MediaTheme.tsx,
    packages/core/src/theme/useTheme.ts,
    packages/core/src/theme/themeRegistry.ts,
    packages/core/src/AppShell/AppShell.tsx,
  ]
verified_by:
  [
    packages/core/src/theme/Theme.test.tsx,
    packages/core/src/theme/MediaTheme.dom.test.tsx,
    packages/core/src/theme/useTheme.test.tsx,
    packages/core/src/theme/themeRegistry.test.ts,
    packages/core/src/AppShell/AppShell.test.tsx,
  ]
deciding_specs: [spec:AST-012/DEC-1, spec:AST-087/DEC-2, spec:AST-108/DEC-1]
---

# Theme application

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "theming": ["INV1", "INV2", "INV3", "INV7", "INV8", "INV9", "INV11"]
  }
}
```

This record defines how a compiled theme becomes active for a React tree and the
browser document.

## Purpose

People should see the same theme in normal content, nested theme regions,
portals, and non-CSS consumers. Mounting more than one provider must not create
duplicate styles or let one provider remove styles another provider still uses.

## System model

`Theme` receives a `DefinedTheme`, a color mode, and children. A theme that holds
function icon entries or slot functions is passed to `Theme` from client code.
Server code may resolve icons with such a theme; passing it as a prop from a
Server Component to a Client Component is unsupported.

- It registers the theme by name.
- For a theme that was not built ahead of time, it asks the web compiler for CSS
  and mounts that CSS in the document.
- For a built theme, it assumes the consumer loaded the stylesheet and does not
  compile or inject it again.
- It wraps children with the theme name and color mode.
- The root provider also writes the active theme name and explicit light/dark mode
  to `<html>`. Nested providers do not change `<html>`.

`useTheme` normally reads the nearest provider through React context.

When there is no provider context—such as content rendered into a separate React
root or a fallback viewport—it can follow only the root theme through one shared
fallback path:

1. The root `Theme` writes its theme name and explicit light/dark mode to
   `<html>`.
2. `useTheme` reads those attributes and shares one observer per document.
3. It looks up the theme object by name in the shared registry.
4. Every no-provider consumer reuses that path instead of creating its own
   observer.

A normal React portal keeps provider context and does not need this fallback.
The fallback cannot recover a nested provider for a separate React root. Content
that needs a nested theme must keep that provider context in the same React tree.

`MediaTheme` marks a local surface as dark, light, automatically detected, or
off. Compiled theme CSS uses that marker to switch surface tokens while keeping
the parent theme's component rules.

`AppShell` uses the same provider/root-fallback identity path to resolve named
mobile-navigation width points. The nearest Theme wins; without provider context
it follows the registered root theme, and without an active theme it uses the
standard width map.

## Boundaries and invariants

- **INV1 — The nearest provider wins.** Children read the closest Theme context
  and CSS scope. One exception: a theme's `reducedMotion: 'always'` also reaches
  every nested provider (`spec:AST-108` FR6).
- **INV2 — Only the root provider changes `<html>`.** Nested providers stay local
  and cannot change browser chrome or portal-wide theme identity.
- **INV3 — Detached consumers share one root-theme store.** A separate React
  root or fallback viewport reads root attributes and the theme registry through
  one internal store with one observer per document. A normal React portal keeps
  provider context. The fallback cannot recover a nested provider.
- **INV4 — Built themes are not compiled again.** A theme marked as built uses its
  loaded stylesheet and skips runtime style generation and injection.
- **INV5 — Runtime styles are shared safely.** Multiple providers using the same
  unbuilt theme share one document-level style set. Styles are removed only when
  no mounted provider still needs them.
- **INV6 — Provider consumers avoid document observation.** `useTheme` under a
  provider reads context directly. Shared document observers exist only for
  no-provider consumers and are disconnected when unused.
- **INV7 — System mode follows the platform.** `system` resolves to the active
  light/dark preference without writing a forced mode to `<html>`.
- **INV8 — Media surfaces do not replace the theme.** `MediaTheme` changes local
  surface tokens and optional surface-specific component rules. It keeps the
  active theme and does not remount children when switched off.
- **INV9 — Application does not change compiled rules.** The provider may mount,
  share, and remove compiler output. It must not create different theme-to-CSS
  behavior from the build path.
- **INV10 — Named responsive consumers share Theme metadata.** AppShell resolves
  `sm`/`md`/`lg`/`xl`/`2xl` from the nearest active theme through the same root
  fallback as other no-provider consumers. Its mobile side is strictly below the
  point; equality belongs to the wider layout.
- **INV11 — Icon resolution agrees across server and client.** Server rendering
  and hydration resolve every icon and slot request to the same node for the
  active theme.

This record does not own theme authoring, token definitions, compiler output, or
which component parts are public theme targets.

## Change coupling

- A provider nesting change tests root, nested, portal, and cleanup behavior.
- A style-lifetime change tests two providers using the same theme and confirms
  that unmounting one does not break the other.
- A root-attribute change tests browser mode, portal reach, and no-provider hooks
  together.
- A `useTheme` fallback change tests provider and no-provider paths and confirms
  that provider consumers do not create document observers.
- A MediaTheme change tests dark, light, auto, off, fallback, and unchanged child
  identity.
- A change to runtime compilation belongs first in the shared compiler and is
  checked against the static build path.

## Owning code

- `Theme.tsx` owns provider scope, runtime style lifetime, and root document sync.
- `themeRegistry.ts` owns server-safe lookup by theme name.
- `useTheme.ts` owns provider access and the shared root fallback used by
  detached consumers. Its observation and subscription logic stays
  single-owned; extracting another module is not part of this contract.
- `MediaTheme.tsx` owns local light/dark surface context.
- `AppShell.tsx` consumes the nearest effective width map for mobile navigation.
- `architecture:theme-compilation` owns the CSS that Theme mounts.

## Deciding specs

- `spec:AST-012/DEC-1` owns the fixed width-point vocabulary AppShell consumes.
- `spec:AST-087/DEC-2` makes theme icon entries functions, so a theme holding
  them reaches `Theme` from client code.
- `spec:AST-108/DEC-1` lets a theme's `reducedMotion: 'always'` reach nested
  providers (INV1).

## Verification

| Invariant        | Evidence                                  | Failure signal                                                                                     |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| INV1, INV2, INV3 | `Theme.test.tsx` and portal/root fixtures | A nested provider changes `<html>`, or portal content cannot find the root theme                   |
| INV4, INV5       | Runtime injection and cleanup tests       | A built theme injects CSS, duplicate providers duplicate CSS, or one unmount removes shared styles |
| INV6, INV7       | `useTheme.test.tsx`                       | Provider consumers observe the DOM, fallback observers leak, or system mode resolves incorrectly   |
| INV8             | `MediaTheme.dom.test.tsx`                 | Surface mode replaces the theme, loses parent component rules, or remounts children                |
| INV9             | Runtime/build compiler comparison         | Provider-mounted CSS differs from built CSS for the same theme                                     |
| INV10            | `AppShell.test.tsx`                       | A named point ignores the nearest theme or treats equality as mobile                               |
| INV11            | SSR and hydration icon fixtures           | A server-rendered icon differs from the hydrated icon for the same theme                           |
