---
schema_version: 1
template_version: 1
kind: family
id: family:action-groups
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [behavior, interaction, accessibility]
verified_by:
  [
    packages/core/src/hooks/useMenuPress.test.tsx,
    packages/core/src/hooks/menuPressGesture.test.ts,
  ]
members:
  [
    component:DropdownMenu,
    component:DropdownMenuSubMenu,
    component:ContextMenu,
    component:Selector,
    component:MultiSelector,
    component:DateInput,
    component:DateTimeInput,
    component:TimeInput,
    component:AlertDialog,
    component:ButtonGroup,
    component:ToggleButtonGroup,
    component:Toolbar,
    component:Banner,
    component:Toast,
    component:TopNavMenu,
    component:SideNavHeading,
    component:TopNavHeading,
    component:TabMenu,
    component:DateRangeInput,
    component:NavHeadingMenu,
    component:BreadcrumbItem,
  ]
architecture: [architecture:interaction-modality]
contributing: []
deciding_specs: [spec:AST-094/DEC-17]
---

# Action groups contract

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "interaction": ["FR1", "FR2", "FR3", "FR4", "FR5"]
  }
}
```

## Intent

A person can press one action in a group of sibling actions, slide across the
others while the highlight follows, and act on the one they lift on, the same
way in every group, with SegmentedControl as the one named exception. Every
member gets the behavior from one shared implementation, or menus and
Selector's and MultiSelector's options from the menu press model, so no member builds its own.

## Membership rule

A component is a member when it renders a set of two or more sibling
momentary, toggle, or option actions that a person chooses one of. Members
today:

- menus: DropdownMenu, ContextMenu, and their sub-menus, the navigation
  menus of TopNav (TopNavMenu), SideNavHeading, TopNavHeading, and
  NavHeadingMenu; and
  BreadcrumbItem's `menu`, which renders DropdownMenu items;
- TabMenu's menu of tab options;
- option lists: Selector's and MultiSelector's options, and the wheels of
  DateInput, DateTimeInput, and TimeInput;
- AlertDialog's actions;
- ButtonGroup and ToggleButtonGroup;
- DateRangeInput's presets, one labeled group of preset buttons;
- Toolbar's buttons; a field inside a toolbar is skipped;
- the action rows of Banner and Toast when a row has two or more sibling
  actions.

Action rows in a Dialog's footer, a Card's footer, or any `LayoutFooter` get
the behavior by composing ButtonGroup.

A component built later that matches the rule joins by the rule, including an
action sheet, a tab bar or navigation bar, a filter-chip group, and a rating.

SegmentedControl is a named exception: this family's rule does not bind it.

These are not members:

- text inputs and InputGroup as a whole, whose input keeps the caret and
  selection and whose addons belong to that input rather than forming a group;
- TabList, whose scrollable rows need a drag to scroll and whose tabs switch
  views;
- Pagination and Stepper, inline page controls in the page flow rather than a
  menu;
- TopNavMegaMenu's panel, a browsing grid of links in a `role="group"`, not a
  menu (`component:TopNavMegaMenu` FR5);
- SideNavItem's collapsed-rail flyout, a popover of the item's navigation rows,
  not a menu;
- Popover itself, a surface whose content owns its role; a menu inside it
  follows its own component;
- Calendar's day grid, a two-dimensional date grid with its own keyboard and
  range-selection model, which a slide to commit would break;
- RadioList, CheckboxList, and SelectableCard, whose rows and cards sit in
  scrolling lists;
- Token chips, which are removable and have no group control.
- the suggestion lists of Typeahead (also Tokenizer's), CommandPalette, and the
  chat composer's trigger menu, whose focus stays in the text input, as a text
  input's does.

## Shared owner

One shared, internal implementation gives every member other than menus and
Selector's and MultiSelector's options FR1–FR5
(`architecture:interaction-modality` INV13); those get them from
`module:DropdownMenu/useMenuPress`. No member keeps another copy.

## Canonical concepts

- **Action group:** two or more sibling actions a person chooses one of.
- **Held pointer:** a press that has not lifted, tracked across the group.
- **Lifted action:** the enabled action under the pointer when it lifts.

## Cross-component invariants

- **FR1 — The lift decides.** In a member, a press on an action that slides
  across its siblings acts on the action the pointer lifts on, through that
  action's own activation; a press that never leaves its action acts on it.
  One gesture acts at most once (`spec:AST-094` FR26). After a slide, focus does what
  a click on the lifted action does.
- **FR2 — The highlight follows the pointer.** While the pointer is held, the
  enabled action under it is highlighted, at most one at a time, and nothing
  is highlighted over a disabled action, a gap, or outside the group
  (`spec:AST-094` FR27).
- **FR3 — Sliding off cancels.** A press that lifts outside the group acts on
  nothing; a cancelled pointer, a second finger, or the window losing focus
  ends the gesture with nothing acting (`spec:AST-094` FR28). Whether a
  member that opened for the gesture stays open stays with the member.
- **FR4 — A toggle group toggles only the lifted action.** In a toggle group,
  only the action lifted on toggles; sliding across never toggles the actions
  passed over.
- **FR5 — Every pointer, one target rule.** The behavior applies to every web
  pointer, mouse and pen as well as a finger. Under a fine pointer a group
  keeps one `pointerdown` listener on its element, cancelable where the member
  needs it, adds document listeners only during a press and removes them at
  the release, and may arm one per-document click swallower from the release
  until that gesture's click; nothing else is idle (`spec:AST-094` FR19,
  FR24). The 44 px target is each member's hit
  expansion under a coarse pointer only. Keyboard and assistive-technology
  behavior is unchanged.

## Allowed component variation

- What an action does on activation, and how a member shows its highlight,
  stay with the member.
- Menus keep their own opening and handoff (`spec:AST-094` FR29) and their
  scrolling rules.
- A wheel is a scroll container: a drag scrolls it, as it does today, and a
  tap acts on the option under it; only a press that does not scroll tracks.

## Representative matrix

| Member and state                       | Shared invariant                                    | Deliberate variation                           |
| -------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| DropdownMenu / slide from row to row   | the lifted row acts; one row lit at a time          | opening and handoff stay the menu's (FR29)     |
| AlertDialog / slide from Cancel        | the lifted action runs; a lift outside does nothing | the actions' order and stacking stay local     |
| ToggleButtonGroup / slide across three | only the lifted toggle changes                      | single or multiple selection stays the group's |
| Toolbar with a field / slide across    | buttons track; the field is skipped                 | which controls a toolbar holds stays local     |

## Adoption and exceptions

| Components or surface                                                                                | Required adoption                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Menus and Selector's and MultiSelector's options                                                     | Follow FR1–FR5 through `module:DropdownMenu/useMenuPress`.            |
| TopNav's, SideNavHeading's, TopNavHeading's, NavHeadingMenu's, BreadcrumbItem's, and TabMenu's menus | Follow FR1–FR5 through `module:DropdownMenu/useMenuPress`, as menus.  |
| Date and time wheels                                                                                 | Follow FR1–FR5 through the shared implementation.                     |
| AlertDialog's actions                                                                                | Track the actions only.                                               |
| ButtonGroup, ToggleButtonGroup, Toolbar                                                              | Track sibling buttons; a field inside is skipped; toggles follow FR4. |
| DateRangeInput's presets                                                                             | Track the preset buttons only.                                        |
| Banner and Toast action rows                                                                         | Track only a row with two or more sibling actions.                    |

These are required outcomes, not a claim of completed adoption. The excluded
components listed under the membership rule are not exceptions to approve;
they are outside the family.

## Verification map

| Contract | Verification                                                                  | Representative members and states                                                      |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| FR1–FR3  | Shared-implementation tests and each member's pointer-stream tests            | a slide across a menu, AlertDialog's actions, a ButtonGroup; a lift outside            |
| FR4      | ToggleButtonGroup pointer-stream tests                                        | a slide across three toggles; only the lifted one toggles                              |
| FR5      | Member tests with a mouse, a pen, a finger, the keyboard, and a screen reader | a 44 px target under a coarse pointer only; unchanged keyboard and screen-reader paths |

## Decision links

- `spec:AST-094/DEC-17` — every group of sibling actions tracks a held
  pointer the same way.

## Open questions

None.

## Content boundary

This file owns action-group membership and the shared press, slide, and lift
behavior. It does not duplicate component prop tables, what each action does,
menu opening, or the shared implementation's thresholds.
