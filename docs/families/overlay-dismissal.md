---
schema_version: 1
template_version: 1
kind: family
id: family:overlay-dismissal
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
review_triggers: [behavior, accessibility]
verified_by:
  [
    packages/core/src/Layer/useLayerDismissal.test.tsx,
    packages/core/src/Layer/layerDismissalInvariants.test.tsx,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    packages/core/src/Drawer/Drawer.test.tsx,
    packages/core/src/hooks/useFocusTrap.test.tsx,
    packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx,
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/Popover/Popover.test.tsx,
    packages/core/src/Popover/__tests__/PopoverSecondDocument.a11y.chromium.spec.ts,
  ]
members:
  [
    component:Dialog,
    component:AlertDialog,
    component:Popover,
    component:DropdownMenu,
    component:DropdownMenuSubMenu,
    component:MoreMenu,
    component:Tooltip,
    component:HoverCard,
    component:Lightbox,
    component:MobileNav,
    component:BottomSheet,
    component:BottomSheetSwitcher,
    component:CommandPalette,
    component:ContextMenu,
    component:PowerSearchEditPopover,
    component:Drawer,
    component:BreadcrumbItem,
    component:ChatComposerInput,
    component:ComplexSelector,
    component:DateInput,
    component:DateRangeInput,
    component:DateTimeInput,
    component:Selector,
    component:MultiSelector,
    component:PowerSearch,
    component:BaseTypeahead,
    component:Typeahead,
    component:Tokenizer,
    component:SideNavHeading,
    component:SideNavItem,
    component:TabMenu,
    component:TopNavHeading,
    component:TopNavMenu,
    component:TopNavMegaMenu,
    component:TourStep,
    component:ChatEmojiPicker,
    component:Table,
  ]
architecture: [architecture:public-component-api]
contributing: []
deciding_specs: []
---

# Overlay dismissal family contract

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": ["FR1", "FR2", "FR3", "FR6"]
  }
}
```

## Intent

A person dismissing layered UI should affect only the topmost relevant surface.
A nested surface must not close its host on the same Escape press or platform
close request when logical depth or DOM containment establishes that ordering.

## Membership rule

A component belongs when it owns a layered surface for which Escape or a platform
close request is a valid dismissal command. Every member must participate in the
shared dismissal stack while that surface is present. Membership follows the
observable responsibility, not whether the current implementation has completed
adoption; a local Escape listener is a deviation to migrate, not an intentional
exclusion.

A component that creates its own popup with `usePopover`, `useLayer`, a focus
trap, or a native dialog is a member when it owns that popup's dismissal. A
component that merely composes another member as ancillary content inherits that
member's behavior without joining on that basis. Membership is open-ended:
every newly shipped surface that meets this rule must join the shared stack and
this record's current membership snapshot must be updated with it.

- **Current members:** Dialog, AlertDialog, Popover, DropdownMenu,
  DropdownMenuSubMenu, MoreMenu, Tooltip, HoverCard, Lightbox, MobileNav,
  BottomSheet, BottomSheetSwitcher, CommandPalette, ContextMenu,
  PowerSearchEditPopover, Drawer, and the component-owned popup surfaces
  listed below.
- **Component-owned input popups:** ChatComposerInput, ComplexSelector,
  DateInput, DateRangeInput, DateTimeInput, Selector, MultiSelector,
  PowerSearch, BaseTypeahead, Typeahead, and Tokenizer. TextInput, TextArea,
  NumberInput, TimeInput, and FileInput do not own a popup; rendering a Tooltip
  for supporting or disabled text does not make the input itself a member.
- **Other component-owned popups:** BreadcrumbItem, SideNavHeading,
  SideNavItem, TabMenu, TopNavHeading, TopNavMenu, TopNavMegaMenu, Table filtering,
  Lab TourStep, and Lab ChatEmojiPicker.
- **Collaborators:** `useLayerDismissal`, `layerStack`, `LayerDepthProvider`,
  and `useFocusTrap` own or adapt the shared protocol.
- **Nonparticipating layers:** A layer that has no dismissal behavior is not a
  member. A visual-only outline rendered through Layer is the canonical example:
  it neither handles Escape nor receives a platform close request.

## Shared owner

- `useLayerDismissal` registers an active surface and adapts a
  browser-initiated close request to the shared topmost check.
- `layerStack` owns presence filtering, ordering, and the document-level
  Escape listener: one in each document that holds a registered member (FR8,
  proposed; pending owner review).
- `LayerDepthProvider` carries logical nesting through the React tree for members
  that provide it to their descendants. Members without that provider do not
  guarantee nested ordering after descendant content leaves DOM containment.
- `useFocusTrap` joins the same stack when it is active and receives an
  `onEscape` callback. A focus trap without `onEscape` is not a dismissible
  surface and does not register.

## Canonical concepts

| Concept         | Values or states           | Default semantics                                                                 | Stability |
| --------------- | -------------------------- | --------------------------------------------------------------------------------- | --------- |
| membership      | member or nonparticipant   | A surface with Escape/platform-close behavior is a member                         | current   |
| adoption        | shared, partial, or local  | Local handling is a deviation to migrate, not a membership exception              | current   |
| registration    | active or inactive         | Only an active, enabled surface participates                                      | current   |
| presence        | present or absent          | An absent registered surface is skipped                                           | current   |
| Escape behavior | `close` or `block`         | `close` invokes the member's dismissal callback; `block` consumes without closing | current   |
| logical depth   | non-negative nesting level | A provider marks descendant surfaces as deeper than its host                      | current   |
| close request   | Escape or platform request | The topmost registered present member decides the result                          | current   |

## Cross-component invariants

- **FR1 — Every dismissible layered surface participates.** A member must join
  the shared dismissal stack while present. A component-specific Escape
  listener or registry does not satisfy this invariant.
- **FR2 — One request affects one surface.** An unclaimed Escape press is routed
  to exactly one topmost registered present member. That member either invokes
  its dismissal callback or blocks the request; the request does not continue
  to a member behind it.
- **FR3 — Platform close requests use the same topmost rule.** A member receiving
  a browser or platform close request closes only when it is the topmost
  registered present member. A request aimed at a lower member is declined.
- **FR4 — Available nesting signals outrank host placement.** When a member
  provides `LayerDepthProvider`, React-tree depth orders its descendant layers
  ahead of the member even when both mount in the same commit. DOM containment
  may resolve equal-depth nesting; stable active-cycle registration order resolves
  unrelated surfaces. A member without the provider does not guarantee this
  ordering for descendant content that is no longer DOM-contained.
- **FR5 — Content may claim Escape first.** The shared listener runs in the
  bubble phase and stands down when content has already handled the event.
- **FR6 — Text composition is not layer dismissal.** Escape used to cancel an
  active IME composition is consumed without dismissing a member, and a
  platform close request is declined while composition is active.
- **FR7 — Registration does not define open-state ownership.** The stack invokes
  the selected member's dismissal callback. Whether that request immediately
  closes the surface is owned by the member's component contract and caller.
- **FR8 — Each document ranks its own members.** A member belongs to the
  document of the element it registers with: Dialog (and CommandPalette through
  it), Lightbox, MobileNav, BottomSheet, BottomSheetSwitcher and Drawer register
  their dialog, ContextMenu its menu, and a focus trap its container. An Escape
  press or platform close request is ranked only among the registered present
  members of the document it arrives in, and FR2 and FR3 apply within that
  document, so a host and the members nested in it that register an element keep
  one order wherever they render. A member of another document is never a
  candidate. Tooltip and HoverCard register no element and read their presence
  from the page's document: they belong to the page, and in another document
  they take no request, so their host handles the first one. The stack listens
  once in each document that holds a member and stops when its last member
  leaves. Proposed; pending owner review (DEC-2).

## Allowed component variation

- **AV1 — Focus.** Members own focus entry, containment, movement, and return.
- **AV2 — Modality.** Members may be modal or non-modal and own any inertness or
  backdrop behavior.
- **AV3 — Positioning and hosting.** Members may use native dialog placement,
  CSS anchor positioning, fixed coordinates, or a component-owned host.
- **AV4 — Outside dismissal.** Members own whether and how pointer, hover,
  focus-loss, backdrop, touch, or gesture interaction dismisses them.
- **AV5 — Open-state API.** Members own controlled and uncontrolled state,
  defaults, callback names, and imperative commands.
- **AV6 — Presentation.** Members own animation, visual treatment, and theming
  anatomy. The dismissal registry exposes no theme target or rendered wrapper.

## Representative matrix

| Member and state                              | Shared invariant                               | Deliberate variation                                                          |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Dialog inside Dialog                          | Inner dialog handles the first request         | Dialog supplies native modality and focus behavior                            |
| Popover inside Dialog                         | Popover handles the first Escape               | Popover supplies anchoring, portal placement, and focus policy                |
| Registered descendant inside CommandPalette   | Descendant handles the first Escape            | CommandPalette inherits Dialog's shared stack participation                   |
| Tooltip or HoverCard inside Dialog, in page   | Present hover surface handles the first Escape | Hover families decide when they are present and how controlled state responds |
| Lightbox or MobileNav above a required Dialog | Top member handles the request                 | Required Dialog uses `block` only when it is topmost                          |
| Required Dialog alone                         | Request is consumed without closing            | Dialog purpose selects `block` behavior                                       |
| Self-owned input popup                        | Popup participates while present               | Input owns selection, focus, open state, positioning, and outside dismissal   |
| Two unrelated registered surfaces             | Later active-cycle registration is topmost     | Neither surface is treated as nested                                          |
| Platform close request sent to a lower Dialog | Lower Dialog stays open                        | The platform targets a host; the shared check decides whether it may close    |
| Popover in an iframe, Dialog in the page      | Request goes to its own document's top member  | The app renders into the second document through a portal                     |
| Popover inside Dialog in an iframe            | Popover handles the iframe's first request     | Both register their own elements, so they rank in the iframe's order          |
| Tooltip or HoverCard inside Dialog, in iframe | The Dialog handles the first Escape there      | Hover members register no element and read presence from the page (FR8)       |

## Adoption and exceptions

| Components or surface                                                                                                                                                                                                                                                                              | Adoption                                                      | Current deviation or limitation                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog, AlertDialog, Popover, DropdownMenu root, ContextMenu, MoreMenu, Lightbox, MobileNav, Drawer, CommandPalette                                                                                                                                                                                | shared owner; CommandPalette composes Dialog                  | none                                                                                                                                                                    |
| Tooltip, HoverCard                                                                                                                                                                                                                                                                                 | shared owner with DOM presence reporting                      | Neither provides nesting depth to descendant layers; both read presence from the page's document, so in another document they take no request (FR8)                     |
| Focus traps with `onEscape`                                                                                                                                                                                                                                                                        | shared owner through `useFocusTrap`                           | They provide DOM containment, not descendant depth                                                                                                                      |
| BreadcrumbItem, ChatComposerInput, ComplexSelector, DateInput, DateRangeInput, DateTimeInput, Selector, MultiSelector, PowerSearch, BaseTypeahead, Typeahead, Tokenizer, SideNavHeading, SideNavItem, TabMenu, TopNavHeading, TopNavMenu, TopNavMegaMenu, Table, Lab TourStep, Lab ChatEmojiPicker | shared owner through `usePopover` or a composed Popover owner | Table filtering owns controlled Popover state and discards its draft on close; TourStep routes Popover close to the Tour; ChatEmojiPicker owns controlled Popover state |
| BottomSheet, BottomSheetSwitcher                                                                                                                                                                                                                                                                   | shared owner                                                  | none                                                                                                                                                                    |
| DropdownMenuSubMenu, PowerSearchEditPopover                                                                                                                                                                                                                                                        | local only                                                    | Must migrate from component-specific listeners or registries to the shared owner                                                                                        |

The rows marked partial or local are current adoption gaps against FR1. They are
not approved exceptions. Migration must preserve each component's existing focus,
modality, positioning, outside-dismissal, and open-state contracts.

## Verification map

| Contract           | Verification                                                                                                    | Representative members and states                                                                                                                                                              | Mutation or failure expectation                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| FR1, FR2, FR4, FR5 | `useLayerDismissal.test.tsx`; `BottomSheetSwitcher.test.tsx`; `ContextMenu.test.tsx`; `CommandPalette.test.tsx` | synthetic provider depth, same-DOM containment, non-modal switcher nesting, ContextMenu nested layers, CommandPalette descendant nesting, unrelated, blocking, content-handled, present/absent | Removing depth, presence filtering, or event deferral sends Escape to the wrong surface           |
| FR2, FR3, FR4, FR6 | `layerDismissalInvariants.test.tsx`                                                                             | nested same-DOM Dialogs, Lightbox over Dialog, Dialog in BottomSheet, platform cancel, IME                                                                                                     | One request closes two surfaces, closes a host before its child, or dismisses during composition  |
| FR1, FR2, FR3, FR7 | `layerDismissalFamilies.test.tsx`                                                                               | Dialog, Lightbox, MobileNav, BottomSheet, Tooltip, HoverCard; controlled and blocking states                                                                                                   | A family bypasses the stack, a lower member handles a request, or controlled ownership is ignored |
| FR1                | `useFocusTrap.test.tsx`                                                                                         | active, nested, and deactivated traps with `onEscape`                                                                                                                                          | A dismissible trap stays off the shared stack or nested traps respond together                    |
| FR8                | `useLayerDismissal.test.tsx`; `Popover.test.tsx`                                                                | members in the page and a same-origin iframe; a Popover alone and inside a Dialog, in an iframe                                                                                                | A press in one document dismisses a member of another, or a host closes over its nested layer     |
| FR8                | `PopoverSecondDocument.a11y.chromium.spec.ts`                                                                   | a Popover in an iframe and in a Picture-in-Picture window, alone and with one open in the page                                                                                                 | A press in the second document misses its own layer or dismisses the page's                       |

## Decision links

### DEC-1 — Membership follows dismissal responsibility

**Decider:** `cixzhang`, `2026-08-30`

Every layered surface for which Escape or a platform close request is a valid
dismissal command belongs to this family and must participate in the shared
stack. Membership is open-ended: every newly shipped surface that meets this
rule must join the stack. Existing component-local listeners and registries are
adoption gaps, not intentional exclusions. Components that own their own input
popup are members; components that only compose another member as ancillary
content are not members on that basis. The members metadata and adoption table
are the audited current snapshot, not a closed set.

A layer with no dismissal behavior does not participate. A visual-only outline
rendered through Layer is the canonical nonparticipating example.

### DEC-2 — Each document ranks its own members

**Decider:** pending owner review

A key press and a platform close request reach only the document they happen
in, and each document keeps its own browser top layer. The stack therefore
orders the members of each document separately and listens once per document.
One request still affects exactly one surface: the topmost one in the document
where the person acted.

Rejected: one order across documents, where a press in one window dismisses a surface in another.

## Open questions

None. Focus, modality, positioning, outside dismissal, and open-state APIs are
explicitly outside this family contract. The mapped tests do not render a nested
layer through a real portal; a real portal fixture is required before this
contract can claim verified portal coverage.

## Content boundary

This file owns family membership, topmost registered Escape and platform-close
behavior, and the logical-depth and DOM-containment signals currently used to
order those requests. A member guarantees descendant depth only when it provides
`LayerDepthProvider`; this record does not claim verified nesting through a real
portal. It does not define focus entry or return, modality, positioning or
anchoring, portal placement, outside interaction, programmatic component
commands, open-state APIs, animation, or theming. Those remain component,
family, or architecture responsibilities.
