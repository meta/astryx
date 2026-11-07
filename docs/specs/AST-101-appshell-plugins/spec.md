---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-101
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [cixzhang]
affects_architecture:
  [architecture:react-component-runtime, architecture:component-theming-surface]
affects_families: [family:layout-regions, family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: [AppShell, useAppShellMobile]
---

# AppShell region plugins and Focus Mode

## Intent

An application can temporarily remove its navigation chrome while keeping its
page content and navigation state. AppShell owns the coordinated region change;
a caller supplies the task state that determines when it applies. Named plugins
transform shell-owned region descriptions without requiring the caller to
replace the shell, inspect its DOM, or discard its navigation children.

This draft is not implementation authority. `component:AppShell` owns the
aggregate shell contract; this record owns only the coordination boundary
between shell-region visibility and a cooperating navigation drawer's modal
lifecycle. The built-in preset's independent behavior belongs to its module.

## Non-goals

- Presence-based slot removal does not acquire buffering or exit animation.
- SideNav collapse, resize, saved width, and navigation-item behavior stay with
  SideNav; Focus Mode does not write their state.
- Focus Mode is not browser fullscreen, a modal focus trap, or a global keyboard
  shortcut. The caller owns activation and a reachable exit action in content.
- No animation tuning props, new theme targets, preset augmentation, or changes
  to the package's React or browser support floor are introduced.
- Existing AppShell conformance gaps unrelated to transformed visibility remain
  outside this decision.
- Equivalent internal implementations remain valid when they satisfy this
  contract. Rendering helpers, transition bookkeeping, and resource topology are
  private; the observable public boundary is the region description.

## Requirements

- **FR1 — Named plugins are optional.** `AppShellProps.plugins` accepts
  `Record<string, AppShellPlugin>`. An omitted or empty record preserves the
  existing shell behavior. Hooks are called by the consumer, not by the shell
  while iterating the record.
- **FR2 — Transforms describe shell regions, not child-component props.**
  `AppShellPlugin` has optional `transformShellContext`, `transformBanner`,
  `transformTopNav`, `transformSideNav`, `transformContent`, and
  `transformMobileNav` methods. Region transforms synchronously return a
  description of the same region. They do not require Banner, TopNav, SideNav,
  or MobileNav elements in a slot and do not clone or reinterpret arbitrary
  caller nodes as those components.

  The candidate exported region types are:

  ```ts
  interface AppShellRegionProps {
    children: ReactNode;
    isHidden?: boolean;
  }

  type AppShellBannerProps = AppShellRegionProps;
  type AppShellTopNavProps = AppShellRegionProps;
  type AppShellSideNavProps = AppShellRegionProps;
  type AppShellMobileNavProps = AppShellRegionProps;

  interface AppShellContentProps {
    children: ReactNode;
    padding: SpacingStep;
  }

  interface AppShellPlugin {
    transformShellContext?: (children: ReactNode) => ReactNode;
    transformBanner?: (props: AppShellBannerProps) => AppShellBannerProps;
    transformTopNav?: (props: AppShellTopNavProps) => AppShellTopNavProps;
    transformSideNav?: (props: AppShellSideNavProps) => AppShellSideNavProps;
    transformContent?: (props: AppShellContentProps) => AppShellContentProps;
    transformMobileNav?: (
      props: AppShellMobileNavProps,
    ) => AppShellMobileNavProps;
  }
  ```

  All types and `AppShellPlugin` are exported from the AppShell entry point.
  Region visibility defaults to visible for supplied content. Content has no
  visibility switch: the shell retains one main landmark and its skip target.
  Padding starts from `contentPadding ?? 0`; transforms can replace it with a
  supported spacing step. Replacing `children` is deliberate caller replacement,
  not a state-preservation promise for a different child.

- **FR3 — Ordering is deterministic and explicit.** The first-party `focusMode`
  entry runs before custom entries. Custom entries follow JavaScript own-entry
  enumeration order. Each transform receives the preceding transform's output;
  the last write to a field wins. The `focusMode` name controls ordering only;
  a caller can put a custom plugin there without acquiring built-in semantics.
  Registering the built-in hook under another name makes it a custom entry.
  There is no hidden priority inferred from a function name or object identity.
  A custom transform can deliberately override Focus Mode's output under this
  same rule. Every slot description receives its transforms even when the
  original slot is absent; the final `children` value determines presence using
  AppShell's existing renderability rule. Transforms can populate an absent
  slot. A mobile transform can replace supplied drawer content but cannot enable
  mobile navigation explicitly disabled by `mobileNav={false}`.
- **FR4 — One visibility decision covers every presentation of a slot.** Banner,
  top-nav, side-nav, and content descriptions are transformed before responsive
  presentation is selected. A hidden top or side slot is unavailable in its full,
  mobile-bar, drawer, and drawer-content presentations. A side-nav-only generated
  mobile top bar does not reintroduce a hidden side slot. Mobile-nav transforms
  receive the final composed drawer node, including a supplied node or config
  content, without gaining control of the existing mobile config or open-state
  API. No generated toggle advertises a hidden or unavailable drawer.
  Modal-close and focus guarantees apply to the generated drawer and supplied
  MobileNav content that uses shell context without an explicit `isOpen`
  override. An independently controlled or portalled custom modal remains
  caller-owned: the caller closes it and completes its focus handoff before
  suppressing its region. A plugin does not discover or close arbitrary portals
  by traversing slot nodes. The public docs identify this cooperation boundary.
- **FR5 — Context wrappers include the complete shell.** `transformShellContext`
  receives the shell subtree, including its skip link and mobile presentation,
  inside the shell's existing mobile context. Context wrappers compose so the
  first plugin is outermost, matching Table's context-transform convention.
  Region field writes still follow FR3's forward transform order. Wrappers
  cannot replace the existing provider contract or make a hook called outside
  the wrapper read that wrapper's context. Stable provider type, key, and
  placement preserve descendant state; replacing them is an explicit consumer
  remount.
- **FR6 — Hidden regions retain state and become unavailable to interaction.**
  A visibility transform does not remove the supplied region's child identity.
  A fully hidden region retains React state, occupies no layout space, has no
  active effects, and is absent from tab order and the accessibility tree.
  React Activity's hidden mode supplies this lifecycle where available. A
  renderer without Activity must provide the same state and interaction safety;
  any effect-lifecycle reduction needs an explicit compatibility ruling (OQ3).
  A fragment-only fallback that leaves hidden navigation exposed is invalid.
- **FR7 — Transitions preserve interaction safety.** A later visibility change
  animates navigation and the released content space together. A departing region
  becomes non-interactive when the change takes effect, remains painted only for
  its exit, and reaches FR6 after the exit. An entering region does not expose
  hidden controls before it is visible. Rapid reversal follows the latest
  visibility value and cannot leave stale timers or a stuck hidden region.
  MobileNav's native dialog closes and releases page inertness before its
  Activity boundary suspends cleanup. Its ordinary restoration to the opener
  does not target navigation that is becoming hidden: the cooperating drawer
  completes native close, suppresses that obsolete restoration, and hands focus
  to main before its region becomes fully hidden. No invisible modal remains
  in the top layer or blocks the page. During a delayed modal exit, focus stays
  in the closing modal until native blocking ends; main is not focused while
  it is inert.
- **FR8 — Initial presentation is settled.** First client render and server
  hydration render the supplied active or inactive state without a navigation
  entry animation or a flash of the opposite state. Only subsequent visibility
  changes animate. A post-hydration breakpoint correction alone does not count
  as a Focus Mode action. `spec:AST-013` FR9 and FR13 remain applicable.
- **FR9 — Motion remains token-based.** Shell motion uses `--duration-medium`
  and `--ease-standard`, respects rendered writing direction, and removes
  displacement animation under reduced motion. A missing motion capability can
  omit the enhancement, never the final layout, state, or interaction safety.
  CSS entry rules such as `@starting-style` are not themselves proof that first
  paint or exit behavior meets FR7 and FR8.
- **FR10 — Focus Mode has one controlled meaning.**
  `useFocusMode({isActive, preset?: 'focus'})` returns an `AppShellPlugin`; the
  preset defaults to `focus`. Inactive transforms preserve their inputs. The
  active preset hides top navigation, side navigation, and mobile navigation,
  keeps the banner, and retains content and its padding. Content takes the space
  released by navigation in both height modes. There is no additional internal
  active state, toggle component, preset map, or implicit shortcut.
- **FR11 — Focus and recovery remain usable.** If focus is in departing
  non-modal navigation, it moves to the existing main focus target before the
  region becomes fully hidden. A cooperating modal drawer uses FR7's native
  close and focus-handoff sequence instead. Focus already in content is
  untouched. Revealing navigation does not steal focus back. The skip link
  remains first in the shell's focus order. The caller
  retains an exit control in visible content; the shell does not promise an exit
  control hidden inside a transformed navigation slot.
- **FR12 — Drawer intent and visibility are separate.** A visibility transform
  suppresses the drawer's effective presentation without rewriting controlled
  `mobileNav.isOpen`, calling `onOpenChange` solely because a transform changed,
  or changing uncontrolled requested state. While suppressed,
  `useAppShellMobile().isMobileNavOpen` and `isMobileNavEnabled` report false;
  drawer presentation and any retained toggle's `aria-expanded` follow that
  effective state, never a stale requested true. The breakpoint's `isMobile`
  value is unchanged. Open and toggle commands do nothing while the drawer is
  unavailable; explicit close commands retain their existing requested-state
  semantics. After visibility returns, the drawer follows
  the existing requested open state; a caller that wants it closed also sets its
  controlled value to false through its activation action. Close cleanup still
  meets FR7, and reopening cannot strand focus or reuse a stale close timer.
- **FR13 — Invalid transforms cannot silently damage the frame.** Public types
  reject wrong method signatures and malformed region descriptions. At runtime,
  a recognized non-function method or malformed result fails with a diagnostic
  identifying the plugin and region instead of committing a broken shell.
  Unknown method names are diagnosed and ignored. Missing optional transforms
  are identity operations. Transform exceptions propagate; the shell does not
  present a partial successful result as a healthy plugin run.
- **FR14 — Visibility does not rewrite theming or state ownership.** Existing
  shell, header, side-nav, content, and drawer targets retain their owner and
  semantic variant in every visible presentation. Hiding does not change
  SideNav's collapse/resize state, reset content input values, or change the
  theme. No new target or public custom property follows from adding a plugin.

### Platform support

- Browser support inherits `spec:AST-013` and the public Browser Support guide;
  this contract does not raise their floor.
- The React support floor remains the Core package's peer dependency. Activity
  capability and effect-lifecycle compatibility are separate from CSS support.
- Reduced motion and an unsupported transition enhancement settle immediately
  into the same usable final state. State retention, focus, and a closed native
  modal are not optional enhancements.
- Browser evidence covers paint, layout, native dialog cleanup, focus, first
  paint, hydration, and reversal in the actual engines needed for each claim.
  Source and jsdom evidence do not prove those browser-owned outcomes.

## Current-state impact

- `component:AppShell` owns aggregate ordering, region visibility, responsive
  composition, skip-link behavior, and drawer intent. Its current contract does
  not settle coordinated suppression of a native modal or the focus handoff to
  page content. Those cross-component coordination claims are this record's
  distinct boundary; component-local API and preset claims are projections to
  their direct owners, not a second aggregate owner.
- A colocated `module:AppShell/useFocusMode` record owns the built-in preset's
  independent controlled behavior when that module is admitted. It does not own
  aggregate plugin ordering or redefine MobileNav.
- The existing AppShell entry point exports shell and mobile configuration types,
  not region-transform types. Its slots accept arbitrary React nodes; component
  props are therefore not a faithful description of a shell-region boundary.
- AppShell's current closed-drawer Activity hold protects MobileNav's delayed
  native close. Coordinated visibility preserves that guarantee rather than
  suspending the native close operation early.
- `family:layout-regions` owns structural scrolling and content continuity;
  `family:overlay-dismissal` owns overlay dismissal. Their rules are inherited,
  not rewritten for a shell plugin.
- AppShell consumer docs describe plugin registration, region descriptions,
  precedence, the one preset, and drawer-state responsibility. The public module
  owns a same-stem `useFocusMode.doc.mjs` when discoverable.
- `architecture:react-component-runtime` and
  `architecture:component-theming-surface` retain lifecycle and theme ownership.
  No global runtime or theme policy changes are required by this draft.

## Verification

| Contract      | Verification                                                                              | Representative states                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1-FR3, FR13 | Public type fixtures and component tests through AppShell                                 | No plugins; empty record; two conflicting custom transforms; canonical and renamed Focus Mode; malformed method and result                                                          | Reversed ordering, incorrect region types, or a bad result accepted as success fails                                                                                                                    |
| FR4-FR5       | Component tests through real shell composition                                            | All slots; side-only/top-only/combined navigation; supplied drawer node; config content; nested context wrappers                                                                    | A hidden slot reappearing in a drawer, a dangling toggle, or the wrong wrapper order fails                                                                                                              |
| FR6-FR7       | Stateful child tests and real-browser interaction/native-dialog checks                    | Activity present and absent; transition capability absent; visible-hidden-visible; context-cooperating and independently controlled drawers; repeated reversal; unmount; StrictMode | Unmounting a visibility-hidden child resets its input; early suspension leaves a modal open; stale cleanup hides a reopened region; main focused while inert or focus restored to a hidden opener fails |
| FR8-FR9       | Server markup plus hydrated and client-only browser captures; canonical visual regression | Initially active and inactive; later enter/exit; theme changes; reduced motion; both writing directions                                                                             | A first-paint animation, false-state flash, wrong logical motion, or displacement under reduced motion fails                                                                                            |
| FR10-FR12     | Component interaction tests and browser focus checks                                      | Focus inside top/side/drawer/content; controlled true/false and uncontrolled drawer; caller exit control                                                                            | Losing content focus, hiding the only exit, firing a synthetic callback, or changing requested state fails                                                                                              |
| FR14          | Canonical visual regression and stateful component fixtures                               | Every shell variant; light/dark; fill/auto; collapsed/resized side nav; both sides of the mobile breakpoint                                                                         | Lost targets, altered variants, content remount, or overwritten side state fails                                                                                                                        |

Verification describes required evidence, not completed results. Each behavior
check drives the shipped AppShell path. Removing the relevant implementation
must invalidate the check; direct tests of an extracted transform alone are
insufficient. Visual contracts extend the canonical visual regression harness
before adding any separate guard.

## Decision log

No owner decision is recorded. FR1-FR14 remain draft requirements.

## Open questions

- **OQ1 — Are the region descriptors and composition order admitted?**
  (`human-api`) FR2 preserves arbitrary node slots instead of exporting child
  component props as region props. FR3 gives custom transforms explicit final
  precedence. The AppShell owner must approve both public boundaries.
- **OQ2 — Is the single Focus Mode preset admitted?** (`human-design`) FR10
  retains announcements and padding while removing navigation. A presentation
  or immersive preset is not included without separate caller-need evidence.
- **OQ3 — What effect lifecycle is supported without React Activity?**
  (`human-api`) The existing React floor cannot silently rise. Either hidden
  regions have equivalent effect suspension on that floor, or the owner admits
  and documents retained effects as a narrow compatibility reduction while
  preserving state, layout, inertness, focus, and modal cleanup.
- **OQ4 — Does drawer visibility restore the requested open state?**
  (`human-api`) FR12 preserves controlled intent and makes a caller-requested
  close explicit. Clearing uncontrolled intent or suppressing a still-true
  controlled value instead needs an owner-approved state contract.
