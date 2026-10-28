---
schema_version: 3
template_version: 7
kind: component
id: component:AppShell
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/AppShell/AppShell.test.tsx,
    packages/core/src/MobileNav/MobileNavCloseEdgeCases.test.tsx,
    apps/storybook/stories/AppShell.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-regions]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:theme-application]
contributing: []
system_specs: [spec:AST-012, spec:AST-027]
---

# AppShell component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `AppShell` with `topNav`, `sideNav`, `banner`, `children`, `mobileNav` (`false`, a config object, or a node), `height` (`fill`, `auto`), `variant` (`wash`, `surface`, `section`, `elevated`), and `contentPadding`; targets `app-shell`, `app-shell-header`, `app-shell-sidenav`.                                                                                                                   |
| Behavior                | One page frame: skip link, then a header region, an inline side region, and one `main` region. Below the mobile breakpoint the side nav leaves the page and AppShell composes a mobile drawer from the nav slots, unless `mobileNav` disables or replaces it.                                                                                                                                        |
| End-user impact         | Keyboard users get a skip link to the main region; screen-reader users get one banner and one main landmark; phone-width users reach the side nav through a toggle and drawer while page content, its input values, and focus survive the layout switch. When the side nav collapses or expands, the content's old and new wrap swap on the rail's clock instead of re-wrapping in one frame (FR17). |
| Builder impact          | None. Callers fill slots and choose height, variant, content padding, and mobile behavior.                                                                                                                                                                                                                                                                                                           |
| Compatibility/readiness | Records shipped behavior; no prop, default, or export changes. Five current-state gaps, listed under Current-state impact: page-level stacking values, a banner pinned against its docs, an unmeasured late header, a raw `content` drawer the toggle cannot reach, and a fill-height main region that is not a tab stop.                                                                            |
| Review checks           | Reject a second `main` or banner landmark from AppShell, a skip link that is not the first focusable element or does not move focus to `main`, a breakpoint that treats equality as mobile, or remounting page content when the breakpoint changes. Also reject a content area that animates its width during a side nav collapse or expand (FR17).                                                  |
| Governing rules         | `spec:AST-012` FR8 (width points), `family:layout-regions` FR9, `architecture:theme-application` INV10, `spec:AST-027` FR1–FR5 (local stacking), `architecture:component-theming-surface`; `component:SideNav` FR6 and `spec:AST-105` FR8 (the content swap).                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

AppShell is the outermost frame of an application page. It places top
navigation, side navigation, an announcement banner, and the page's main
content; it owns the page-level skip link and the banner and main landmarks; and
it switches the navigation between an inline desktop layout and a mobile drawer
at a theme-resolved width point. Consumer usage lives in `AppShell.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`, except FR17: `no`, since every AppShell with
  an inline collapsible SideNav swaps its content wrap on a collapse or expand,
  with no prop to keep the earlier instant re-wrap
- Compatibility class: records shipped behavior, including FR17, a nonbreaking
  motion addition; no public prop, default, target, or export changes
- Controlled/uncontrolled behavior: the mobile drawer's open state is
  uncontrolled by default and controlled when `mobileNav.isOpen` is defined
  (FR11)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Shell stacking values are page-level, not local.** The AppShell root is not
  an isolation owner. In `height="auto"` the sticky header paints at
  `z-index: 1`, and the focused skip link paints at `z-index: 9999`, both
  ordered against unrelated page content rather than inside an isolated shell
  surface. `spec:AST-027` FR2–FR4 require local values inside a surface-owned
  isolation boundary and no page-wide bands.
- **The banner stays pinned in `auto`.** The `banner` prop's API docs say it
  scrolls away with the page in `auto`; the shipped header, which holds both the
  banner and the top nav, is sticky, so the banner stays pinned (FR6).
- **A header region that first renders after mount is not measured.** In
  `auto`, AppShell measures, and re-measures on resize, only a header region
  present when `auto` takes effect; a header region that first renders later,
  such as a banner or top nav on a page that had neither, is never measured, so
  the side region sticks at the top edge and its first rows slide under the
  sticky header.
- **A raw `content` drawer leaves the toggle pointing at nothing.**
  `mobileNav.content` accepts raw children; AppShell renders them as given while
  the auto toggle still renders, so its `aria-controls` names no element and its
  presses open nothing. WCAG 4.1.2 requires a control's relationships and state
  to be programmatically correct.
- **The fill-height main region is not a tab stop while it overflows.** In
  `height="fill"` the main region is a scroll container, but it is never a
  sequential tab stop, so keyboard users reach overflowing content only through
  the skip link or focusable content inside it. `spec:AST-025` FR12 requires
  effective scroll content to stay keyboard reachable.

## Ownership boundary

**Owns**

- The page frame: the root element, the order of skip link, header region,
  inline side region, and main region, and the slot-presence rule (FR1–FR4).
- The skip link and its focus move to the main region (FR5, AR2).
- The content area's swap during a side nav collapse or expand (FR17).
- The banner landmark around the header region and the main landmark around
  `children` (FR3, FR4, AR1).
- Height modes, including sticky header and sticky side region in `auto` (FR6).
- Variant backgrounds for the frame, header, side region, and content area, and
  the elevated content corner (FR7, FR16).
- The mobile breakpoint switch and what each nav slot renders on each side of it
  (FR8–FR10, FR12).
- The mobile drawer's open state and the mobile context AppShell provides to its
  subtree (FR11, FR13).
- Content continuity across the breakpoint switch (FR14).

AppShell's `.doc.mjs` documents no inline `components:` entries; this record is
the only component record in the AppShell root.

**Does not own / non-goals**

- How TopNav renders in its full, mobile-bar, and drawer modes — owned by
  TopNav and uncontracted here. AppShell only selects the mode.
- How SideNav renders in its inline, top-bar, drawer, and drawer-content modes,
  and the rail's own collapse motion — owned by SideNav (`component:SideNav`
  covers its row geometry and its rail motion, FR6). AppShell selects the mode
  and owns the content area's motion during a collapse or expand (FR17).
- The drawer dialog itself: modal presentation, focus containment and return,
  backdrop dismissal, slide motion, and its close delay — owned by MobileNav and
  uncontracted here; Escape and close-request ordering — owned by
  `family:overlay-dismissal`. The hamburger control is MobileNav's
  `MobileNavToggle`.
- Layout regions, their padding, and region scrolling — owned by
  `family:layout-regions`; keyboard access to an overflowing region — owned by
  `spec:AST-025`.
- The width-breakpoint vocabulary and the effective width map — owned by
  `spec:AST-012` and `architecture:theme-application`.
- The `useAppShellMobile` hook's public contract — an uncontracted module; this
  record covers only the values AppShell provides (FR13).
- Navigation landmark names inside the TopNav and SideNav slots — owned by
  TopNav (its `label` prop) and SideNav (its translated name).
- The page heading — owned by the caller; AppShell renders no heading.

## Public concepts

| Concept         | Closed values or states                                    | Meaning                                                              | Availability by variant/orientation/state    | Default    | Owner                | Stability | Invalid-value behavior                                                                      |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- | ---------- | -------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Height mode     | `fill`, `auto`                                             | Viewport-height frame with internal scrolling, or a page that grows. | All layouts.                                 | `fill`     | `component:AppShell` | Stable    | Another value gets the `auto` minimum height without sticky regions; TypeScript rejects it. |
| Variant         | `wash`, `surface`, `section`, `elevated`, augmented values | Background treatment of nav areas against content (FR7).             | All layouts; reflected on all three targets. | `elevated` | `component:AppShell` | Stable    | An augmented value reflects on the targets and paints the `elevated` frame background.      |
| Mobile nav mode | disabled (`false`), config object, node                    | Selects auto drawer, tuned auto drawer, or a caller-owned drawer.    | Below the breakpoint, except a node (FR12).  | Auto       | `component:AppShell` | Stable    | A non-element object is read as a config object.                                            |
| Breakpoint      | `sm`, `md`, `lg`, `xl`, `2xl`, `none`                      | Width point below which the mobile layout applies.                   | Config object only.                          | `md`       | `spec:AST-012`       | Stable    | TypeScript rejects other names.                                                             |
| Content padding | Spacing steps `0`–`10`                                     | Inset of the main region.                                            | All layouts.                                 | `0`        | `component:AppShell` | Stable    | TypeScript rejects other steps.                                                             |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FR1  | The root element carries `app-shell`, the forwarded `ref`, `data-testid`, and other DOM props, and contains, in order: the skip link, the Layout frame (header region, inline side region, content region), then any mobile drawer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                    |
| FR2  | A slot is present when its value is renderable: not `null`, `undefined`, a boolean, or an empty string. A component that renders nothing still counts as present.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and public types             |
| FR3  | The header region renders only when `topNav` or `banner` is present; it carries `app-shell-header` and `role="banner"`, places `banner` above `topNav`, and is never inside another landmark. The sidenav-only mobile top bar (FR9) also carries `app-shell-header` and takes `role="banner"` only when no header region renders. AppShell renders at most one banner landmark.                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                    |
| FR4  | `children` render in one region with `role="main"` and `id="astryx-app-shell-main"`, programmatically focusable so the skip link can move focus to it; programmatic focus on it draws no focus ring. Its padding is `contentPadding`, default `0`. Whether it is a sequential tab stop is keyboard access to a scroll region (`spec:AST-025` FR12).                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                    |
| FR5  | The skip link is the first focusable element in the shell. It links to `#astryx-app-shell-main`, shows the translated `@astryx.appShell.skipToContent` text, is visually hidden until focused, and on activation moves focus to the main region.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | WCAG 2.4.1; current source and tests        |
| FR6  | `fill` sizes the root to `100dvh` and the inline side region and main region scroll on their own. `auto` gives the root a `100dvh` minimum, makes the header sticky at the block start, keeps the inline side region sticky below the measured height of a header present when the shell mounts in `auto`, with its own scrolling, and lets the page scroll. Header height is measured only in `auto`.                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                    |
| FR7  | Variant backgrounds: `wash` paints body background on the frame, nav areas, and content; `surface` paints surface on all three; `section` paints surface on the frame and divides the nav areas from content, and in `auto` the header paints surface itself; `elevated` paints body background on the frame and nav areas and surface on content (FR16 for the corner).                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                    |
| FR8  | The mobile layout follows `mobileNav.breakpoint` under `spec:AST-012` FR8 and `architecture:theme-application` INV10; the breakpoint defaults to `md`, and `defaultIsMobile` is ignored when it is `none`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-012` FR8; tests                   |
| FR9  | In the mobile layout the side nav leaves the inline region. A present `topNav` renders in TopNav's mobile-bar mode, given the side nav content for its drawer, unless `mobileNav` is `false` or a node. With `sideNav`, no `topNav`, `mobileNav` not `false`, and `hasToggle` not `false`, a mobile top bar renders the side nav in SideNav's top-bar mode in a navigation region named by `@astryx.appShell.mobileNavigation`; the auto toggle beside it renders only while mobile navigation is enabled (FR11), so with a drawer node the top bar has no toggle.                                                                                                                                                                                                         | Current source and tests                    |
| FR10 | The auto drawer renders only in the mobile layout and only when `mobileNav` is not `false`, not a node, and has no `content`. Without `topNav` it is SideNav in drawer mode; with `topNav` it is TopNav in drawer mode carrying the side nav content; with a heading-only TopNav the side nav items render exactly once. It stays mounted while closed and, after a close, is not hidden before MobileNav's close delay has elapsed (hidden at once under reduced motion); an open is visible in the commit that carries it.                                                                                                                                                                                                                                               | Current source and tests                    |
| FR11 | The drawer is closed by default and AppShell owns its state unless `mobileNav.isOpen` is defined. Every requested change calls `mobileNav.onOpenChange`. Open and toggle requests do nothing unless mobile navigation is enabled: a nav slot is present, `mobileNav` is not `false`, and `mobileNav` is not a node.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                    |
| FR12 | `mobileNav={false}` renders no drawer and no toggle; in the mobile layout the side nav then renders neither inline nor in a drawer. A node (element or string) renders as given at every width, replaces the auto drawer, and leaves TopNav in its full mode. A config object's `content` replaces the auto drawer in the mobile layout when a nav slot is present. `hasToggle: false` removes the auto toggle.                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                    |
| FR13 | AppShell provides its subtree with: whether the mobile layout applies, whether the drawer is open, one drawer id that the toggle's `aria-controls` names and that the auto drawer, or a MobileNav passed as `content` or as the node, applies as its `id`, open, close, and toggle actions, whether mobile navigation is enabled, and whether auto toggles are enabled (`hasToggle` is not `false`; true at every width unless `hasToggle` is `false`).                                                                                                                                                                                                                                                                                                                    | Current source and tests                    |
| FR14 | Main content stays mounted across the breakpoint (`family:layout-regions` FR9); in addition, input values and focus inside `children` survive in both directions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                    |
| FR15 | `className`, `style`, and `xstyle` merge onto the root after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source                              |
| FR16 | With `elevated`, a present `topNav`, and an inline side nav, the content area is a raised surface whose block-start, inline-start corner uses the page radius; otherwise the content wrapper creates no layout box.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and stories                  |
| FR17 | While the side nav collapses or expands, the content area swaps its old wrap for its new one in place: the old wrap slides and fades out while the new wrap slides and fades in, on the side nav's one clock, `spec:AST-105` FR4's one shared motion (`springs.settle`; `component:SideNav` FR6). The old wrap is one transient copy, inert and hidden from assistive technology, removed when the swap ends (`architecture:component-style-authoring` INV7). When the old wrap is not copied, such as on a page too large to copy, no visible gap opens between the rail and the content during an expand. The content area never animates its width. Under reduced motion the swap follows `design:reduced-motion` DR2 under a coarse primary pointer and DR3 otherwise. | `spec:AST-105` FR8; `component:SideNav` FR6 |

### Allowed variation

- **AV1 — Slot content.** Caller-provided nav, banner, and page content vary
  without becoming AppShell-owned anatomy.
- **AV2 — Theme styling.** Themes may restyle the three targets per variant
  without changing region order, landmarks, or the breakpoint rule.
- **AV3 — Drawer timing.** The close-hold length follows MobileNav's close delay
  and may change with it, as long as the hold outlasts that delay.

### Representative states

| State                       | Required invariant                                                                   | Allowed variation                     |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| Content only                | Skip link and main region; no banner or navigation landmark.                         | Content padding.                      |
| TopNav and SideNav, desktop | Banner header, inline side region, main; elevated corner in `elevated`.              | Variant backgrounds.                  |
| SideNav only, mobile        | Mobile top bar as the one banner, toggle, auto SideNav drawer.                       | Drawer content and width (MobileNav). |
| TopNav and SideNav, mobile  | TopNav mobile bar with toggle; TopNav drawer holding TopNav and side nav items once. | TopNav mobile-bar layout.             |
| Banner and SideNav, mobile  | Exactly one banner landmark.                                                         | Banner content.                       |
| `height="auto"`             | Sticky header; sticky side region below it; page scrolls.                            | Header height.                        |
| `mobileNav={false}`, mobile | No drawer, no toggle, no side nav.                                                   | —                                     |
| Custom drawer node          | The node renders at every width; no auto drawer.                                     | Caller-owned drawer.                  |

### Transformation and precedence order

- **ORD1 — Mobile mode.** Resolve `mobileNav` shape (FR12), then the breakpoint
  (FR8), then the TopNav and SideNav render modes (FR9) and which drawer renders
  (FR10).
- **ORD2 — Root styling.** Component styles, then `xstyle`, `className`, and
  `style` (FR15).

### Performance and resources

- **PR1 — Header measurement.** AppShell observes the header's size only in
  `auto` and observes nothing in `fill`.
- **PR2 — One media query.** The breakpoint switch uses one media query
  subscription per shell.

## Accessibility contract

- **AR1 — Landmarks.** AppShell exposes at most one banner landmark, never inside
  another landmark, and exactly one main landmark. The sidenav-only mobile top
  bar is a navigation region with a translated name. Navigation landmarks inside
  the slots are owned by TopNav and SideNav.
- **AR2 — Bypass blocks.** The skip link is reachable with the first Tab and moves
  focus to the main region on activation (WCAG 2.4.1). Its focus indicator uses
  the shared focus-outline treatment.
- **AR3 — Drawer wiring.** With the auto drawer, or a MobileNav passed as
  `content`, the auto toggle's `aria-controls` names the drawer that opens and its `aria-expanded` reflects the drawer state (FR13). Focus
  containment and return inside the drawer belong to MobileNav and are
  uncontracted here.
- **AR4 — Focus continuity.** A breakpoint change does not move focus out of the
  main region's content (FR14).

## Design relationships

| Anatomy or state  | Design requirement                                                     | Representation authority       | Hierarchy role | Component contract |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Page shell        | Frames the page and paints the variant background.                     | Current source and public docs | Supporting     | FR1, FR7           |
| Skip link         | Hidden until focused, then a visible link at the inline-start corner.  | Current source and public docs | Supporting     | FR5, AR2           |
| Banner            | Sits above the top nav inside the header region.                       | Current source and public docs | Supporting     | FR3                |
| Top navigation    | Fills the header region; a compact bar in the mobile layout.           | Current source and public docs | Prominent      | FR3, FR9           |
| Side navigation   | Inline region on desktop; moves to the drawer in the mobile layout.    | Current source and public docs | Prominent      | FR6, FR9, FR10     |
| Main content      | The page's content; raised with a corner in `elevated` with both navs. | Current source and public docs | Prominent      | FR4, FR16          |
| Mobile nav drawer | Modal drawer composed from the nav slots.                              | Current source and public docs | Supporting     | FR10, FR12, AR3    |

No AppShell target reaches the skip link. Its `none` disposition records
reachability, not a decision that it must stay unthemeable.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Page shell": {"target": "app-shell"},
  "Skip link": {
    "none": {
      "reason": "reachability-gap: No public target reaches the skip link."
    }
  },
  "Banner": {"inherits": "app-shell-header"},
  "Top navigation": {"target": "app-shell-header"},
  "Side navigation": {"target": "app-shell-sidenav"},
  "Main content": {
    "delegatesTo": {"owner": "component:Layout", "target": "layout-content"}
  },
  "Mobile nav drawer": {
    "delegatesTo": {"owner": "component:MobileNav", "target": "mobile-nav"}
  }
}
```

## Family and system relationships

- `spec:AST-012` FR8 owns the width-point names, the exclusive upper edge, and
  the SSR hint; AppShell applies them (FR8).
- `architecture:theme-application` INV10 owns how AppShell finds the nearest
  effective width map.
- `family:layout-regions` owns Layout regions, their padding, and region
  scrolling, and (FR9) states that AppShell keeps main content mounted across
  the breakpoint.
- `spec:AST-027` owns local stacking; the shell's current values are recorded
  under Current-state impact.
- `architecture:component-theming-surface` owns target qualification and the
  dispositions above.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                        | Representative states                                                                                                                                                                                                                                              | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                         | Audit section                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1–FR4, AR1        | `AppShell.test.tsx` slot, landmark, banner, and ref suites                                                                                                                                                                                          | Content only; each slot; mobile top bar with banner                                                                                                                                                                                                                | A missing or duplicate landmark, or a nested banner, fails role queries.                                                                                                                                                                                                                                                                                                                                | `audit:AppShell/anatomy`       |
| FR5, AR2            | `AppShell.test.tsx` skip-link and keyboard suites                                                                                                                                                                                                   | First Tab; Enter; click; translated text                                                                                                                                                                                                                           | Losing the href, the focus move, or tab order fails.                                                                                                                                                                                                                                                                                                                                                    | `audit:AppShell/accessibility` |
| FR6, PR1            | `AppShell.test.tsx` height-mode suites                                                                                                                                                                                                              | `fill`, `auto`, section header in `auto`                                                                                                                                                                                                                           | Dropping the header's sticky placement or measuring in `fill` fails.                                                                                                                                                                                                                                                                                                                                    | `audit:AppShell/behavior`      |
| FR8                 | `AppShell.test.tsx` breakpoint suites                                                                                                                                                                                                               | `lg`, `xl`, `2xl`, explicit `md`, `none`; nearest, root, and built themes; SSR hint                                                                                                                                                                                | Wrong map, inclusive edge, or `none` entering mobile fails.                                                                                                                                                                                                                                                                                                                                             | `audit:AppShell/behavior`      |
| FR9–FR12            | `AppShell.test.tsx` mobile suites; `MobileNavCloseEdgeCases.test.tsx` AppShell drawer suites                                                                                                                                                        | Sidenav only; both navs; heading-only TopNav; custom node                                                                                                                                                                                                          | A missing toggle, duplicated items, a stale drawer, or an early hide fails.                                                                                                                                                                                                                                                                                                                             | `audit:AppShell/behavior`      |
| FR13, AR3           | `AppShell.test.tsx` keyboard drawer and `useAppShellMobile` suites                                                                                                                                                                                  | Outside a shell; inside, closed and open                                                                                                                                                                                                                           | A wrong id link or stale state fails.                                                                                                                                                                                                                                                                                                                                                                   | `audit:AppShell/accessibility` |
| FR14, AR4           | `AppShell.test.tsx` breakpoint continuity test                                                                                                                                                                                                      | Desktop to mobile and back with a focused input                                                                                                                                                                                                                    | Remounting content loses the value or focus.                                                                                                                                                                                                                                                                                                                                                            | `audit:AppShell/behavior`      |
| FR17                | `SideNavRailMotion.test.tsx`, `animatedLayout.boundary.test.ts`; `SideNavRailMotion.interaction.browser.spec.ts` frames of the content area during a side nav collapse (the scrolled `auto` page and `reducedMotion: 'always'` theme cases pending) | collapse and expand with an inline side nav; Reduce Motion under a coarse and under a fine primary pointer; `fill` and a scrolled `auto` page; a theme with `reducedMotion: 'always'`; a second toggle while the swap runs; an expand whose old wrap is not copied | a visible gap between the rail and the content, a content area that animates its width or moves on its own clock, an old wrap reachable by assistive technology or left after the swap, travel under Reduce Motion, anything but an opacity-only cross-fade of 200 ms or less under Reduce Motion on a coarse pointer (DR2), or any animated property under Reduce Motion on a fine pointer (DR3) fails | `audit:AppShell/behavior`      |
| FR7, FR16           | `AppShell.stories.tsx` and visual baselines                                                                                                                                                                                                         | `elevated` with both navs, at desktop width                                                                                                                                                                                                                        | A changed `elevated` background or missing corner shows in visual review.                                                                                                                                                                                                                                                                                                                               | `audit:AppShell/visual`        |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                       | Consumer anatomy and current targets                                                                                                                                                                                                                               | Missing, extra, stale, or multiply assigned mappings fail repository validation.                                                                                                                                                                                                                                                                                                                        | `audit:AppShell/theming`       |

Read from source, with no focused test or baseline yet:

- FR1: the placement of the three targets, other DOM props reaching the root,
  the header, side, and content order, and the drawer rendering last.
- FR2: `null`, `true`, `false`, and `''` slots counting as absent, and a slot that renders
  nothing counting as present.
- FR3: `banner` above `topNav`, and no header region with only `sideNav`.
- FR4: the `contentPadding` value and its `0` default, and no focus ring on main.
- FR5: the skip link's visual hiding until focus; AR2: its shared focus outline.
- FR6: root sizing and region scrolling in each height mode, and the sticky side
  region in `auto`.
- FR7: the `wash`, `surface`, and fill-height `section` backgrounds and
  `section`'s dividers.
- FR8: the default `md` breakpoint and `sm`.
- FR9: the `mobileNav={false}` exception, the mobile top bar's navigation name,
  and the drawer-node clause.
- FR10: the reduced-motion hold.
- FR11: controlled `isOpen`, the `mobileNav.onOpenChange` call, and no-op
  requests while disabled.
- FR12: the `mobileNav={false}`, string-node, `content`, and `hasToggle: false`
  branches, and full-mode TopNav beside a drawer node.
- FR13 and AR3: the open and close actions, `hasAutoToggle`, and the shared
  drawer id on a MobileNav passed as `content` or as the node.
- FR15, FR16's no-corner branch, and PR2.

## Decision log

No component-local decision is recorded. Width points and stacking are decided
by the system records linked above.

## Open questions

- **OQ1 — Should a page that sets `mobileNav={false}` keep its side nav
  reachable in the mobile layout?** (`human-design`) Today the side nav renders
  neither inline nor in a drawer there (FR12).

## Content boundary

This file does not duplicate consumer prop tables, examples, the drawer's
dialog behavior, Layout region rules, or system width and stacking rules. It
links to their owners.
