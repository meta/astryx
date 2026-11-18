---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-138
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [imdreamrunner]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# React Native component set system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer who knows Astryx on the web builds an iOS and Android app with
`@astryxdesign/react-native` and finds the same components under the same
names, with the same core contracts, plus the handful of components a phone
app needs that a web page does not: a screen, a header, tabs, sheets, a
keyboard dock and the system's own surfaces. A person using the app gets
controls and navigation that behave like the rest of their phone or tablet.

This record owns the component set of the React Native library layer
(`spec:AST-112/FR1`): which component families it ships, how each relates to
the web component of the same name, which components stay out of it, and the
API shape of the cross-cutting components (the screen container, the header,
tabs, sheets, toasts, lists, the media viewer and share). Each component keeps
its own record for the rest of its contract; this record decides membership,
names and the shapes that several components share.

It applies `spec:AST-082`: a component has one core contract and a contract
per platform (`spec:AST-082/FR3`), the core contract is portable
(`spec:AST-082/FR4`), and native platforms are native-first
(`spec:AST-082/FR11`). Its components follow the order `spec:AST-093/DEC-1`
states: the platform's own control, then the platform's guidelines, then the
theme.

## Why this exists

An Astryx app on a phone needs one vocabulary with the web, navigation chrome
that is the system's, a short list of phone-only components, and one shape for
each concept several components share. This record gives each:

| Need                                                   | What this record fixes                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| One vocabulary across web and native                   | The web names and core contracts for every family that fits, grouped by how far its interaction model carries to a phone (FR1 to FR5)        |
| Navigation chrome that is the system's                 | No web app shell; a header, tabs and screens declared once and rendered by the system or drawn from the same declaration (FR11 to FR24)      |
| Components a phone app needs and a web page does not   | A named list of native-essential components, each with an iOS and an Android answer (FR6)                                                    |
| A component set that stays small                       | Demo parts in the template kit, duplicates folded into one component, and a migration line for each name that is not in the set (FR7 to FR9) |
| Shared shapes (stops, scroll ownership, toasts, menus) | One shape each, taken from the web where the web has one and from the platform's public API where it does not (FR25 to FR34)                 |

## Who uses it

The set's components reach the platform layer only through these native
pieces. Each piece's contract lives in its own record, and each row matches
the native pieces column of the component table.

| Native piece               | Record         | Components in this set that use it                                                                                                                                               |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxStackHost`          | `spec:AST-125` | the stack and tab navigators                                                                                                                                                     |
| `AstryxStackScreen`        | `spec:AST-125` | `Screen`, the stack and tab navigators, `Header` and its parts, `BarButton`                                                                                                      |
| `AstryxHeaderSlot`         | `spec:AST-125` | `Header` and its parts                                                                                                                                                           |
| `AstryxTabsHost`           | `spec:AST-125` | the stack and tab navigators, `TabsItem`                                                                                                                                         |
| `AstryxTabScreen`          | `spec:AST-125` | the stack and tab navigators, `TabsItem`                                                                                                                                         |
| `AstryxTabAccessory`       | `spec:AST-125` | `BottomAccessory`                                                                                                                                                                |
| `AstryxGlassView`          | `spec:AST-123` | `Header` and its parts, `BottomAccessory`, `TabBar`, `KeyboardAccessoryView`, `SearchBar`, `FloatingHeader`                                                                      |
| `AstryxGlassContainerView` | `spec:AST-123` | `Header` and its parts, `TabBar`, `BarButtonGroup`                                                                                                                               |
| `AstryxScrollEdgeView`     | `spec:AST-123` | `Header` and its parts                                                                                                                                                           |
| `AstryxMaterialView`       | `spec:AST-123` | `IconButton`, `AlertDialog`, `BottomSheet`, `ContextMenu`, `Dialog`, `DropdownMenu`, `Popover`, `HoverCard`, `InlineSheet`                                                       |
| `AstryxGestureOwnerView`   | `spec:AST-124` | `Calendar`, `Carousel`, `CodeBlock`, `Item`, `Slider`, `Switch`, `Toast`, `BottomSheet`, `Resizable`, `InlineSheet`                                                              |
| `AstryxDragSnap`           | `spec:AST-124` | `Toast`, `BottomSheet`, `InlineSheet`, `ActionSheet`                                                                                                                             |
| `AstryxSwipeRow`           | `spec:AST-124` | `CheckboxList`, `Item`, `List`, `RadioList`, `TreeList`                                                                                                                          |
| `AstryxZoomPager`          | `spec:AST-124` | `Lightbox`                                                                                                                                                                       |
| `AstryxPanZoomView`        | `spec:AST-124` | `Lightbox`                                                                                                                                                                       |
| `AstryxDragItem`           | `spec:AST-124` | `List`                                                                                                                                                                           |
| `AstryxDropZone`           | `spec:AST-124` | `List`                                                                                                                                                                           |
| `AstryxNativeButton`       | `spec:AST-126` | `Button`                                                                                                                                                                         |
| `AstryxNativeSlider`       | `spec:AST-126` | `Slider`                                                                                                                                                                         |
| `AstryxNativeTextField`    | `spec:AST-126` | `TextInput`                                                                                                                                                                      |
| `AstryxSegmentedControl`   | `spec:AST-126` | `SegmentedControl`                                                                                                                                                               |
| `AstryxDatePicker`         | `spec:AST-126` | `DateInput`, `DateRangeInput`, `DateTimeInput`, `TimeInput`                                                                                                                      |
| `AstryxPasteControl`       | `spec:AST-126` | `PasteButton`                                                                                                                                                                    |
| `AstryxVectorView`         | `spec:AST-127` | `Icon`, `FileTypeArt`, `Vector`                                                                                                                                                  |
| `AstryxVectorInfo`         | `spec:AST-127` | `Vector`                                                                                                                                                                         |
| `AstryxIconView`           | `spec:AST-127` | `Icon`                                                                                                                                                                           |
| `AstryxSymbolView`         | `spec:AST-127` | `Icon`                                                                                                                                                                           |
| `AstryxSystemMenu`         | `spec:AST-128` | `FileInput`, `Selector`, `ContextMenu`, `DropdownMenu`, `MoreMenu`, `Header` and its parts, `BarButton`                                                                          |
| `AstryxActionSheet`        | `spec:AST-128` | `FileInput`, `ActionSheet`                                                                                                                                                       |
| `AstryxPresentationHost`   | `spec:AST-128` | `DateInput`, `DateRangeInput`, `MultiSelector`, `Selector`, `Tokenizer`, `BottomSheet`, `ContextMenu`, `DropdownMenu`, `Popover`, `ComplexSelector`, `PowerSearch`, sheet routes |
| `AstryxModalHost`          | `spec:AST-128` | `BottomSheet`, drawn sheet routes                                                                                                                                                |
| `AstryxSafeAreaProvider`   | `spec:AST-129` | `Chat`, `Layout`, `Screen`, `Header` and its parts, `TabBar`, `InlineSheet`, `KeyboardAccessoryView`, `VideoView`, the inset hooks (FR10)                                        |
| `AstryxKeyboardDock`       | `spec:AST-129` | `Chat`, `BottomSheet`, `CommandPalette`, `Screen`, `KeyboardAccessoryView`                                                                                                       |
| `AstryxSelectableText`     | `spec:AST-129` | `Markdown`                                                                                                                                                                       |
| `AstryxHaptics`            | `spec:AST-130` | `Button`, `CheckboxInput`, `Item`, `SegmentedControl`, `Selector`, `Slider`, `Switch`, `TabList`, `Toast`, `ToggleButton`, `BottomSheet`, `ContextMenu`, `InlineSheet`           |
| `AstryxClipboard`          | `spec:AST-130` | `Chat`, `CodeBlock`, `Timestamp`, `PasteButton`                                                                                                                                  |
| `AstryxBack`               | `spec:AST-130` | `Header` and its parts (`HeaderSearch`), `Drawer`, `Popover`, `HoverCard`, `SearchField`                                                                                         |
| `AstryxFilePicker`         | `spec:AST-130` | `FileInput`                                                                                                                                                                      |
| `AstryxWebView`            | `spec:AST-131` | `WebView`                                                                                                                                                                        |
| `AstryxWebViewInfo`        | `spec:AST-131` | `WebView`                                                                                                                                                                        |
| `AstryxAudio`              | `spec:AST-132` | `VideoView`                                                                                                                                                                      |
| `AstryxVideoView`          | `spec:AST-132` | `VideoView`                                                                                                                                                                      |

Components not listed here are JavaScript over React Native's own views and
`@astryxdesign/core`'s portable entry.

## Non-goals

- The native contracts above. Their records own props, events, revisions and
  platform behaviour; this record names which components use them.
- Each component's full contract. A component's own record (for web
  counterparts, `docs/specs/components/<ComponentRoot>/<Name>.spec.md` and its
  platform record) owns its props, states and accessibility beyond what this
  record fixes.
- Routing semantics (state, actions, linking) and the router protocol
  (`spec:AST-125/FR1`, `spec:AST-125/FR2`).
- Capability APIs that come with no component in this set: camera, photos,
  documents, storage, network, web data and sign-in, diagnostics
  (`spec:AST-130` to `spec:AST-137`).
- Glass and material surfaces (`spec:AST-123`) and the icon pipeline
  (`spec:AST-127`), beyond naming the components that draw them.
- A floating action button on Android.
- The template kit's own API: it is source the create command copies into an
  app, outside the package's compatibility promise.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

### Membership

- **FR1 — The set is closed and every family has one tier.** The component
  table below lists every family the package exports at its root and in its
  `./navigation` entry, and every family this record keeps out of the set,
  each with exactly one tier:
  - **Web parity** (105 families), in four tiers by interaction model, not by
    usage: **Core** (75), **Adaptive** (12), **Regular width** (11) and **Not
    ported** (7).
  - **Native essential**: components a phone app needs that the web has no
    family for (FR6).
  - **Part**: a piece another component renders, public only as that
    component's part, or internal (FR8).
  - **Platform primitive**: a view over one native piece that components and
    apps build on (FR8).
  - **Template kit** (10): demo parts the create command copies into an app;
    not exported by the package (FR7).
  - **Out or folded** (10): not in the set; each has a migration line (FR9).
  - A family the table does not list is not in the set. Adding one, or moving
    one between tiers, is a change to this record. A web family with no row
    (InfoTip) is outside the set until this record lists it. Web hooks with no
    family of their own are reached through the families that use them:
    `createSwipe` through `Item`'s and `ListItem`'s `swipe` prop, `useSnapPaging` through
    `Carousel`.
- **Compact and regular.** In this record, compact (also written "compact
  width") is `spec:AST-012/FR9`'s definition (a viewport width below the
  theme's `md` point, or a height below 500, in points on iOS and
  density-independent pixels on Android), and regular ("regular width") is
  every screen that is not compact. No component in the set chooses a
  presentation by platform size classes. The tab model's bar, sidebar or rail,
  and a navigator's detail column shown beside its list or pushed, are
  presentations of one declared navigation, so this definition chooses them
  too.
- **FR2 — Core families keep the web name and the core contract.** A Core
  family has the web family's name, its member names, and its core contract
  (`spec:AST-082/FR3`): the same props with the same meaning and defaults,
  states, words and accessibility semantics. It is touch-first and fully
  polished at every width.
  - A web prop that has no portable form (`spec:AST-082/FR4`) stays in the web
    contract; the React Native contract does not offer it, and never accepts
    and ignores it (`architecture:public-component-api/INV2`).
  - A web-parity family takes web's prop names and types. A React Native
    departure (a prop the web lacks, or a narrower type) is listed in the
    family's platform record with its platform reason, as a platform prop
    under `spec:AST-082/FR5` and `spec:AST-082/FR8`. No prop takes a second
    name for a concept the web already names.
  - By that rule: `CodeBlock` numbers its lines from `startLineNumber` and
    reports a failed copy through `onCopyError`; `List` reorders through
    `reorderable` (FR29), and the set has no `ReorderableList`; `Item` and
    `ListItem` take swipe actions through web's `swipe` prop, made by
    `createSwipe({leading, trailing, swipeBehavior})`, with `ListItem`'s
    `itemKey`, and offer no `swipeActions` or `swipeBehavior` prop.
  - FR2 gap: these web props have no React Native form: Calendar's and the
    date inputs' `calendar` (with `InternationalizationProvider`),
    CheckboxList's `isOptional` and `isRequired`, CodeBlock's `onCopyError`,
    ComplexSelector's `disabledMessage`, DropdownMenuSubMenu's `delay` and
    `hideDelay`, FormLayout's `defaultEntryErrorBehavior`, LayoutHeader's and
    LayoutFooter's `padding`, Link's `type`, MoreMenu's `isMenuOpen`,
    `entryErrorBehavior` and `onEntryErrorChange` on NumberInput, DateInput,
    DateTimeInput and TimeInput, Timestamp's `timezoneID`, Tokenizer's
    `onOpenChange`, Pagination's `getPageHref`, Table's virtualization, and
    the menu props of Typeahead, BaseTypeahead and Tokenizer; and these
    types differ from the web's: Carousel's `hasSnap` (a boolean or a snap
    paging configuration), LayoutPanel's and ResizeHandle's `resizable`,
    FileInput's `statusVariant` default, the date inputs' `calendar`
    presentation, and Layout's children slots.
- **FR3 — Adaptive families keep the contract and change the presentation.**
  An Adaptive family has the web name and core contract; its presentation
  follows the platform, by the mapping in its table row (a sheet at compact
  width and a popover at regular width; a system alert when the content is
  words and buttons). The mapping never changes a prop's meaning, and the
  component's record names each presentation and the condition that picks it.
- **FR4 — Regular-width families target large screens and stay operable at
  compact width.** A Regular-width family has the web name and core contract
  and is offered at every width. Its layout and interaction target regular
  width (tablets, foldables unfolded, resizable windows). At compact width it
  stays operable by touch and screen reader, with no behaviour that needs
  hover or a hardware keyboard; its record names its compact form.
- **FR5 — Not-ported families are absent and name their replacement.** The
  set has no web app shell: `AppShell`, `TopNav`, `SideNav`, `MobileNav`,
  `NavMenu`, `NavIcon` and `Breadcrumbs` (with their members) are not
  exported. Importing one fails at type check, and in a development build at
  run time, with a message that names its replacement
  (`spec:AST-082/FR3`):

  | Web family    | Native replacement                                                                                              |
  | ------------- | --------------------------------------------------------------------------------------------------------------- |
  | `AppShell`    | `NavigationRoot` with stack and tab navigators, and `Screen` for each screen's frame (FR10, FR11, FR20)         |
  | `TopNav`      | `Header` and its parts; the slot names follow `TopNav` (`heading` content, `startContent`, `endContent`) (FR12) |
  | `SideNav`     | The tab navigator's sidebar at regular width, with `TabsGroup` sections (FR21)                                  |
  | `MobileNav`   | The tab navigator's bar at compact width; `Drawer` for a secondary panel (FR21)                                 |
  | `NavMenu`     | `BarMenu` and `HeaderTitleMenu`, with the web menu vocabulary (FR13)                                            |
  | `NavIcon`     | The `icon` of `TabsItem` and `BarButton`                                                                        |
  | `Breadcrumbs` | The stack's back button and its menu of earlier screens (`HeaderBack`) (FR12)                                   |

- **FR6 — Native-essential components each have an iOS and an Android
  answer.** The set holds these, and each component's record states both
  platforms' rendering; "drawn" is a stated answer, never a gap.

  | Component                                  | What it is                                                                   | iOS                                            | Android                                                         |
  | ------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
  | `Screen`                                   | A screen's frame: insets, keyboard, refresh, large-title collapse (FR10)     | The stack screen's content view                | The stack screen's content view; drawn bottom chrome padding    |
  | Navigators (`createStack`, `createTabs`)   | Stack and tab navigation with a declared record (FR11, FR20)                 | `UINavigationController`, `UITabBarController` | Fragment stack with predictive back; Material bar or rail       |
  | `Header` and its parts                     | The screen's bar: title, back, bar items, search, bottom toolbar (FR11–FR19) | `UINavigationBar` and the screen's toolbar     | Material 3 top app bar; Material bottom app bar for the toolbar |
  | `TabsItem`, `TabsGroup`, `BottomAccessory` | Tab destinations, sidebar sections and the tab accessory (FR20–FR24)         | `UITab`, the sidebar, `UITabAccessory`         | Material navigation bar or rail; a docked band above the bar    |
  | `TabBar`                                   | The drawn renderer of the tab record (FR24)                                  | Drawn                                          | Drawn                                                           |
  | `InlineSheet`                              | A persistent, nonmodal sheet inside a screen (FR26)                          | Drawn, on the drag-snap view                   | Drawn, on the drag-snap view                                    |
  | `ActionSheet`                              | A list of actions for one subject                                            | System action sheet                            | Drawn, as a Material modal bottom sheet                         |
  | `KeyboardAccessoryView`                    | The one keyboard dock (FR35)                                                 | Native dock with interactive dismissal         | Native dock, inset per frame on the UI thread                   |
  | `PasteButton`                              | The system paste control                                                     | `UIPasteControl`                               | Drawn (Android has no paste prompt)                             |
  | `SearchField`                              | In-content search (FR36)                                                     | Drawn, with the system search field's look     | Drawn, with Material's search bar look                          |
  | `useShare`                                 | The share sheet with an anchor (FR33)                                        | `UIActivityViewController`, anchored on iPad   | The system share chooser                                        |
  | `AlertDialog` (system form)                | A system alert when the content is words and buttons (FR3)                   | `UIAlertController`                            | Material 3 dialog                                               |
  | `Lightbox`                                 | The media viewer (FR31)                                                      | Native zoom pager                              | Native zoom pager                                               |
  | `List` grouped style, edit and reorder     | Grouped lists and forms, edit mode, multi-select, reorder (FR28, FR29)       | Grouped list look; native swipe row            | Material list sections; native swipe row                        |

- **FR7 — Demo parts live in the template kit.** These ten are not exported
  by the package. The create command copies them into an app as source, and
  each is composed from public components:

  | Component          | Composed from                                                                  |
  | ------------------ | ------------------------------------------------------------------------------ |
  | `AvatarRing`       | `Avatar` inside a drawn ring                                                   |
  | `BarTitleCapsule`  | `HeaderCustomView` holding `Avatar` and `Text`                                 |
  | `ExpandableText`   | `Text` with a line limit and a `Link` to show the rest                         |
  | `LinkPreview`      | `ClickableCard` with `Image` and `Text`                                        |
  | `MediaScrubber`    | `Slider` with two `Timestamp`s; `VideoView` brings the platform's own controls |
  | `PlaceholderArt`   | `Vector` shapes seeded by a string; the colour palette stays in the library    |
  | `PlaybackRateMenu` | `DropdownMenu` with radio items                                                |
  | `RichText`         | `Text` and `Link`; parsing mentions and tags is the app's logic                |
  | `StackedAction`    | `Pressable` with `Icon` and `Text`                                             |
  | `ThreadConnector`  | Two `View`s in the row's avatar column                                         |

  The palette `PlaceholderArt` reads is the one `Thumbnail` uses to draw a
  file with no picture; it stays in the library, inside `Thumbnail`.

- **FR8 — Parts and primitives.**
  - `BarButton`, `BarMenu`, `BarSpacer` and `BarStatus` are public as header
    and toolbar parts (FR12). Their drawn bodies, `BarButtonGroup`,
    `SearchBar` and the floating header layout are internals of the drawn
    renderer. The package exports no `FloatingHeader`, `FloatingTabBar` or
    `DockedBar`.
  - `IconBadge` is an internal part of `BarButton` and the drawn header. An
    app that badges an icon composes `Icon` and `Badge`.
  - `FileTypeArt` is internal to `Thumbnail`.
  - `Image`, `Vector`, `VideoView` and `WebView` are platform primitives:
    `Image` with loading and failure states; `Vector`, the drawing primitive
    icons draw through; `VideoView` with the platform's own playback
    controls; `WebView`, the one web surface, with a height mode and loading
    and failure states.
  - The native controls' views live in the `./controls` entry
    (`spec:AST-112/FR5`), and the set's components wrap them.
- **FR9 — Every name that is not in the set has a migration line.**

  | Name                                                            | Migration                                                                                                                                       |
  | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
  | `Chip`, `ChipGroup`                                             | An entry chip is a `Token`. A filter chip is a `ToggleButton` in a `ToggleButtonGroup`.                                                         |
  | `Pager`, `PageDots`                                             | `Pager` is `Carousel` with `hasSnap`, which pages by `useSnapPaging`'s rules. `PageDots` is out of the set.                                     |
  | `AreaChart`, `BarChart`, `DonutChart`, `LineChart`, `Sparkline` | Out of the set. An app draws a chart with `Vector`.                                                                                             |
  | `ViewThatFits`                                                  | Out of the set. A layout picks its form by the container's measured size.                                                                       |
  | `WebContent`                                                    | `WebView`, whose height mode sizes it to its content.                                                                                           |
  | `DragDrop` (`Draggable`, `DropZone`, `ReorderableList`)         | `ReorderableList` is `List` with `reorderable` (FR29). Free drag and drop uses the drag item and drop zone contracts (`spec:AST-124`) directly. |
  | `IconBadge`                                                     | `Icon` with a `Badge` beside it (FR8).                                                                                                          |
  | `FloatingHeader`                                                | `Header`; its floating layout is the drawn renderer's (FR8).                                                                                    |
  | `FloatingTabBar`                                                | `TabBar`.                                                                                                                                       |
  | `DockedBar`, `useDockedBar`, `DockedBarBand`                    | `BottomAccessory` (FR22).                                                                                                                       |
  | `SplitView`                                                     | The tab navigator's width classes and detail column (FR21).                                                                                     |
  | `NavigationMenu`                                                | `DropdownMenu`'s item vocabulary, in `BarMenu` and `HeaderTitleMenu` (FR13).                                                                    |
  | `StackHeader*` parts                                            | The `Header` parts (FR12).                                                                                                                      |
  | Demo parts (FR7)                                                | The same component from the app's own template-kit source, with the same props.                                                                 |

  None of these names is exported. Each line is the documented mapping from
  that name to the set.

### Screen and insets

- **FR10 — One screen container and three inset hooks.**
  - `Screen` is every screen's frame. Its `mode` is `scroll` (the default: the
    screen's scroll target, which the header's large title collapses with and
    the tab bar minimizes with) or `fill` (no scroller; content fills the
    frame). It applies the screen's insets, keeps focused fields above the
    keyboard, hosts pull to refresh in `scroll` mode, and keeps sticky headers
    below the bar.
  - A component that brings its own scroller (`List` with its own scroller,
    `ChatMessageList`) becomes the screen's scroll target through
    `scrollProps` (FR30). An app's own scroller does so through
    `useScreenScrollProps()`. No other hook is needed to build a screen.
  - Insets have three names: `useWindowInsets()` (the window's safe area),
    `useScreenInsets()` (the window's safe area plus the room the header, tab
    bar, accessory and keyboard dock take) and `useReportInset()` (a component
    that draws bottom or top chrome reports the room it takes, so
    `useScreenInsets()` includes it). The `./safe-area-context` entry is the
    one compatibility alias (`spec:AST-129`).
  - A layout that sizes itself to the screen gets that size from `Screen`, not
    from measuring its own window position.

### Header

- **FR11 — The stack's options record is the one header declaration.** Each
  stack screen has one options record (`StackOptions`), and it is the only
  thing a renderer reads: the system renderer, the drawn renderer and a custom
  renderer (FR19) all read the same record.
  - The record has three layers: data (serialisable: titles, modes, item
    lists, search configuration), a handler table keyed by part id (each bar
    item's and menu row's handler), and view slots (hosted custom views).
  - The record is the router's low-level form. An app may write it as a
    screen's `options`; the documented API is the header parts (FR12), which
    write into it.
  - Search keys in the record have the parts' spelling (FR15): one spelling
    for one concept across the record and the parts.
  - The package exports no `astryxHeader` option, no `FloatingHeader`, no
    `NavigationMenu` and no `StackHeader*` parts. No second bag of
    renderer-specific header props exists.
- **FR12 — The header's parts.** `Header` takes `startContent` and
  `endContent` (the slot names of web `TopNav` and `Toolbar`; start and end
  follow the reading direction) and these parts as children. Each part is a
  flat export named as the web names parts (`DialogHeader`, `TopNavHeading`):

  | Part               | Meaning                                                                                                                 |
  | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
  | `HeaderTitle`      | The bar's title                                                                                                         |
  | `HeaderLargeTitle` | A large title that collapses into the bar as the screen's scroll target scrolls; the collapse rule belongs to this part |
  | `HeaderSubtitle`   | A line under the title                                                                                                  |
  | `HeaderTitleMenu`  | A menu opened from the title (FR13)                                                                                     |
  | `HeaderBack`       | The back button: `label`, `displayMode` (`default`, `generic`, `minimal`), and its menu of earlier screens              |
  | `HeaderSearch`     | The header's search field (FR15)                                                                                        |
  | `HeaderToolbar`    | The bottom toolbar, holding the same bar parts; the name keeps it apart from web's in-content `Toolbar`                 |
  | `HeaderCustomView` | The one escape hatch: app content in the title area                                                                     |
  | `BarButton`        | A bar button: `icon`, `label` (its accessible name when icon-only), `onClick`, `isDisabled`, `isSelected`               |
  | `BarMenu`          | A bar button that opens a menu (FR13)                                                                                   |
  | `BarSpacer`        | A fixed or flexible space between bar items                                                                             |
  | `BarStatus`        | Status text in a toolbar (`label`)                                                                                      |
  - Props follow web names: `label`, `onClick`, `isDisabled`, `is*` and
    `has*` booleans.
  - Parts register into the screen's record through context when they render,
    so a part inside an app's own wrapper component, a conditional or a
    fragment works. An app component that renders `BarButton` is a bar item.
  - `BarButton` and `TabsItem` take the same badge type.

- **FR13 — Header menus use the web menu vocabulary and the system-menu
  subset.** `HeaderTitleMenu` and `BarMenu` take `DropdownMenu`'s items
  (`DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`,
  `DropdownMenuRadioItem`, `DropdownMenuGroup`, `DropdownMenuDivider`,
  `DropdownMenuSubMenu`).
  - Under the system renderer the rows are typed to the subset the system menu
    takes as data (`spec:AST-128`): a label, an icon, a checked state,
    disabled and destructive states, one level of submenu. A row prop outside
    the subset (end content, a second submenu level, arbitrary React content)
    is a type error on the system renderer, never a silent drawn fallback.
  - Rows register through context like the header parts, so a row inside an
    app's wrapper component is legal.
- **FR14 — Static and dynamic parts, merged part by part.**
  - Static parts are header parts under the screen's declaration in the
    navigator (`<Stack.Screen name="files" component={Files}><Header>…</Header></Stack.Screen>`).
    They cannot read screen state and are known before the screen is pushed.
  - Dynamic parts are the same parts inside the screen (`<Screen><Header>…</Header>…</Screen>`).
    They register when the screen commits and override the static parts part
    by part: a dynamic `HeaderSearch` replaces the static one and leaves the
    static `HeaderLargeTitle` in place.
  - When a dynamic part unmounts, the static part of the same kind applies
    again.
  - Only the navigator factory keeps a dotted name (`Stack.Screen`,
    `Tabs.Navigator`); every part is a flat export.
- **FR15 — Header search.** `HeaderSearch` takes `placeholder`, `value`,
  `onChange`, `scopes` and its own `onScopeChange`, `hidesWhenScrolling`,
  `obscuresBackground` and `hasAutoFocus`.
  - `hidesWhenScrolling` and `obscuresBackground` keep the platform's verb
    form, and `hasAutoFocus` takes web's `has` prefix; FR37 states this
    exception.
  - On iOS the system renderer shows the system search field; on Android and
    under the drawn renderer the library draws the search row
    (`spec:AST-125/FR6`). Every prop means the same on each.
  - The field consumes back while it is active (`spec:AST-130`).
- **FR16 — First-frame guarantee.** Parts in a screen's first commit apply
  before the native transition begins: a pushed screen whose dynamic header
  sets a large title and a search field shows both in the first frame of the
  push, with no change to the bar's height afterwards. Changes after the
  first commit update the bar in place without remounting it.
- **FR17 — Lazy-screen fallback.** A lazy or suspended screen shows its static
  parts until its first commit; its dynamic parts then apply in place, under
  FR16's in-place rule.
- **FR18 — Conflict rule.** Two `Header`s rendered by one screen is a
  development error that names the screen. A nested navigator's screen header
  wins over its parent's header for that screen; the parent's static parts do
  not merge into it.
- **FR19 — The same parts render in place outside a stack.**
  - Inside a stack screen, the navigator's renderer draws the header.
  - Inside a presented sheet (`BottomSheet`, a sheet route), an `InlineSheet`,
    or a column with no stack, the same parts render in place as a compact bar:
    the title and the start and end bar parts; no large title, no collapse,
    no search scopes. `BottomSheet`'s and `InlineSheet`'s `header` prop takes
    these parts. A part with no in-place form (`HeaderLargeTitle`,
    `HeaderToolbar`) is a development warning there.
  - `DialogHeader` and `DrawerHeader` stay their families' own parts (web
    parity); they are not bars.
  - A navigator's `header` render function receives the screen's record and
    draws the app's own chrome in place of the renderer's (the custom-renderer
    seam). It reads the same record the built-in renderers read.
  - Each header and tab option has a row in a parity table with three columns
    (iOS system, Android system, drawn). A row a renderer does not honour is
    either implemented there or refused by that renderer's types; no option is
    accepted and ignored.

### Tabs

- **FR20 — The tabs' options record and parts.** Each tab screen has one
  options record (`TabsOptions`), read by every renderer, and the documented
  API is parts that write into it, under the same static and dynamic
  placement, first-frame, fallback and conflict rules as the header (FR14,
  FR16 to FR18):
  - `TabsItem`: `label`, `icon`, `badge`, `role` (`search`).
  - `TabsGroup`: a sidebar section with a `label` and its tab screens; at
    compact width its screens flatten into the bar in order.
  - `BottomAccessory`: the tab accessory (FR22).
  - The navigator takes the bar-level props `minimize` (`automatic`, `never`,
    `onScrollDown`, `onScrollUp`) and `sidebar` (`automatic`, `never`).
- **FR21 — Width classes are part of the tab model.** At compact width the
  tabs show a bar; at regular width a sidebar (iOS) or a rail with a drawer for
  groups (Android). A screen may declare a detail column, which the same
  navigator owns and shows beside the list at regular width and pushes at
  compact width. The set has no separate split view.
- **FR22 — One tab accessory.** `BottomAccessory` is the one accessory above
  the tab bar. Its placement is `'expanded'` (above the bar) or `'inline'`
  (beside a minimized bar). Its content is a function of the placement, or
  reads `useBottomAccessoryPlacement()`. On Android and on iOS below 26 the
  placement is always `'expanded'`, drawn as a band above the bar
  (`spec:AST-125/FR9`). The set has no docked-bar family and no third
  placement word.
- **FR23 — Android defaults.** On Android a `TabsItem` with `role="search"` is
  an ordinary destination with a search icon. The bar holds at most five
  destinations at compact width, counted after `TabsGroup`s flatten (FR20).
  More is a development error whose message names the remedies that work at
  compact width: keep five bar destinations and reach the rest from a screen
  inside one of them, from a `Drawer`, or from a `BarMenu`. At regular width
  the rail shows the destinations and the drawer holds the groups.
- **FR24 — The drawn tab bar.** `TabBar` is the drawn renderer of the tab
  record. Its circle button beside the bar is `action`; "accessory" means
  `BottomAccessory` only.

### Presentations

- **FR25 — Sheet stops are named by value.** A sheet has no stop indices.
  - `snapPoints` takes web `BottomSheet`'s value forms: a fraction, a
    percentage (`'50%'`) and a fixed height (`'320px'`). `'full'` names the
    sheet's own height. The order of `snapPoints` carries no meaning.
  - `detent` (controlled), `defaultDetent` (uncontrolled) and
    `onDetentChange(stop)` name the resting stop by its value exactly as
    passed, or `'full'`. An unset stop opens at the first snap point listed,
    or at `'full'` without snap points.
  - A `detent` that matches no snap point and is not `'full'` is a
    development warning, and the sheet opens as if it were unset.
  - A detent is a snap point; the `detent` prop names the one the sheet rests
    at, always one of its snap points or `'full'`, never a second list.
  - A sheet route takes the same values: `sheetAllowedDetents` lists its snap
    points and `sheetInitialDetent` names one by value. The route keeps the
    stack options' names, which follow the ecosystem's option vocabulary
    (`spec:AST-125/FR5`); its values are snap points with the same forms.
  - `BottomSheet`, `InlineSheet` and sheet routes share this one vocabulary.
- **FR26 — Inline sheet.** `InlineSheet` lives inside a screen's layout, is
  always present and is never dismissed; it takes FR25's stops and FR19's
  header parts. It needs the drag-snap view of the `controls` capability
  (`spec:AST-124`), and its record states its form on a build without it.
- **FR27 — Toast as on the web.** `useToast()` returns the show function, as
  web `useToast` does (`const showToast = useToast()`). Calling it with toast
  options shows a toast and returns its `dismiss` function. The toast renders
  in the nearest `LayerProvider`, and without one in a viewport the hook
  mounts itself, as on the web. The mounted `<Toast>` stays as the primitive
  for a caller that owns the toast's state.
- **FR28 — Menus share one item vocabulary.** `DropdownMenu`, `MoreMenu` and
  `ContextMenu` keep the web names, members included. On iOS they open through
  the system menu where their rows fit its subset; on Android they are drawn
  as Material menus. `BarMenu` and `HeaderTitleMenu` use the same items
  (FR13).

### Lists and scroll ownership

- **FR29 — List's recycler props are part of List's contract.** `List`'s data
  mode (`data`, `renderItem`, `keyOf`, `extraData`, `itemHeight`,
  `estimatedItemHeight`, `numColumns`, `overscan`, `hasRowReuse`,
  `isRefreshing`, `onRefresh`, `onEndReached`, `scrollProps`) and its grouped
  style are props of List's React Native contract, so contract coverage sees
  them.
  - A `List` inside a parent's vertical scroller (page flow) renders every row
    and owns no scroller. Passed a scroll-owning prop there (`onRefresh`,
    `isRefreshing`, `onEndReached`, `scrollProps`, `overscan`, `itemHeight`),
    it warns once in development, naming the prop.
  - Pull to refresh has one home per screen: `List`'s own scroller when the
    list owns one, otherwise `Screen` (FR10).
  - The grouped style is a style of `List` with section header and footer
    parts.
  - `List` takes web `List`'s `reorderable`, an edit mode and multi-select.
    Swipe actions are `Item`'s and `ListItem`'s `swipe` prop (FR2), over the
    native swipe row.
- **FR30 — One way to hand a list's scroller to the screen.** `scrollProps`
  is how `List` and `ChatMessageList` take the screen's scroll props (FR10),
  with one meaning: the supported uses are the screen's scroll target and
  insets. `ChatMessageList` takes `scrollProps` and exposes no prop that names
  its list engine. Its behaviour is the transcript's: it rests at the end,
  follows new rows while at the latest, and holds its place when older rows
  arrive.

### System surfaces and media

- **FR31 — Lightbox is the public media viewer.** `Lightbox` keeps web
  Lightbox's props (`isOpen`, `onOpenChange`, `media`, `index`, `defaultIndex`,
  `onIndexChange`, `hasZoom`, `hasAutoPlay`). On iOS and Android it zooms,
  pages and drags to dismiss through the native zoom pager
  (`spec:AST-124`), and `hasZoom` behaves the same on both. It gives next,
  previous, zoom and close as accessibility actions. The zoom pager is an
  internal contract, not a component of the set.
- **FR32 — The system alert.** `AlertDialog` shows the system alert when its
  content is a title, words and buttons, and draws its own dialog otherwise,
  with the same props and callbacks either way.
- **FR33 — Share has one entry with an anchor.** `useShare()` returns
  `share({url, text, files, anchor})` over the platform's two share routes
  (URLs and text, and files). `anchor` is a ref to the element an iPad
  popover points at.
  The call resolves an `AstryxResult` (`spec:AST-112/FR6`), with `cancelled`
  when the person dismisses the sheet.
- **FR34 — Paste and pickers.** `PasteButton` is the system paste control on
  iOS and a drawn button on Android (`spec:AST-126`). The date and time inputs
  use the platform's pickers when their surface is native (`spec:AST-126`).

### Keyboard and search

- **FR35 — One keyboard dock.** `KeyboardAccessoryView` is the one dock for a
  composer or a sheet footer. It sits above the tab bar and inside a sheet
  without app arithmetic, and its prop for the scroll view that rides with the
  keyboard is named for that scroll view, not for chat. Each prop means the
  same on iOS and Android; a behaviour one platform cannot give is a platform
  prop, not a shared prop with two meanings. One hook reports the keyboard's
  frame.
- **FR36 — In-content search.** `SearchField` is the in-content search field;
  header search is `HeaderSearch` only (FR15). The set has no other search
  entry point.

### Names and priority

- **FR37 — One name and one form for each concept.**
  - Library components use `is*` and `has*` booleans and `on*` events. The
    one exception is a boolean that names a system behaviour by the
    platform's verb (`HeaderSearch`'s `hidesWhenScrolling` and
    `obscuresBackground`): it keeps the verb form, because no `is*` or
    `has*` name says the same thing.
  - A component with no web counterpart offers `onClick` only, never both
    `onClick` and `onPress` for one event.
  - A public API offers one form of each prop, with no alias beside it.
  - A component's React Native contract is written against the web contract
    of the core release the package builds on, and is checked against it.
- **FR38 — The areas are ranked.** The set's component areas have this
  priority order, highest first; where two areas' requirements compete for
  one contract or one release, the higher one holds:
  1. Screen container and navigators (FR10, FR11, FR20)
  2. Header (FR11 to FR19)
  3. Tabs (FR20 to FR24)
  4. Insets (FR10)
  5. Presentations: sheets, alerts, action sheets, popovers (FR25 to FR27,
     FR32)
  6. Keyboard dock (FR35)
  7. Lists (FR29, FR30)
  8. Menus (FR13, FR28)
  9. In-content search (FR36)
  10. System surfaces: share, paste, media viewer, pickers (FR31, FR33, FR34)
  11. Primitives (FR8)

### Component table

Tier key: **Core**, **Adaptive**, **Regular** (regular width) and **Not
ported** are the web-parity tiers (FR2 to FR5); **Essential** is FR6; **Part**
and **Primitive** are FR8; **Kit** is FR7; **Out** is FR9. The native pieces
column names the contracts each family uses (records in "Who uses it"); a
dash means JavaScript only.

| Family                                                         | Tier       | Web counterpart                        | Native pieces used                                                                                                                                                         | Notes                                                                                                |
| -------------------------------------------------------------- | ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AspectRatio                                                    | Core       | AspectRatio                            | —                                                                                                                                                                          |                                                                                                      |
| Avatar, AvatarStatusDot                                        | Core       | Avatar                                 | —                                                                                                                                                                          |                                                                                                      |
| AvatarGroup, AvatarGroupOverflow                               | Core       | AvatarGroup                            | —                                                                                                                                                                          |                                                                                                      |
| Badge                                                          | Core       | Badge                                  | —                                                                                                                                                                          | Also the badge of bar and tab items                                                                  |
| Banner                                                         | Core       | Banner                                 | —                                                                                                                                                                          |                                                                                                      |
| Blockquote                                                     | Core       | Blockquote                             | —                                                                                                                                                                          |                                                                                                      |
| Button                                                         | Core       | Button                                 | `AstryxNativeButton`, `AstryxHaptics`                                                                                                                                      | The system button under native presentation                                                          |
| ButtonGroup                                                    | Core       | ButtonGroup                            | —                                                                                                                                                                          |                                                                                                      |
| Calendar                                                       | Core       | Calendar                               | `AstryxGestureOwnerView`                                                                                                                                                   | Month swipe                                                                                          |
| Card                                                           | Core       | Card                                   | —                                                                                                                                                                          | Takes its track's or parent's size                                                                   |
| Carousel                                                       | Core       | Carousel                               | `AstryxGestureOwnerView`                                                                                                                                                   | Absorbs `Pager` (FR9)                                                                                |
| Center                                                         | Core       | Center                                 | —                                                                                                                                                                          |                                                                                                      |
| Chat (ChatLayout, ChatMessageList, ChatComposer and members)   | Core       | Chat                                   | `AstryxKeyboardDock`, `AstryxClipboard`, `AstryxSafeAreaProvider`                                                                                                          | `ChatMessageList` takes `scrollProps` (FR30); the dock follows FR35                                  |
| CheckboxInput                                                  | Core       | CheckboxInput                          | `AstryxHaptics`                                                                                                                                                            |                                                                                                      |
| CheckboxList, CheckboxListItem                                 | Core       | CheckboxList                           | `AstryxSwipeRow` (through Item)                                                                                                                                            |                                                                                                      |
| Citation                                                       | Core       | Citation                               | —                                                                                                                                                                          |                                                                                                      |
| ClickableCard                                                  | Core       | ClickableCard                          | —                                                                                                                                                                          |                                                                                                      |
| Code                                                           | Core       | Code                                   | —                                                                                                                                                                          |                                                                                                      |
| CodeBlock                                                      | Core       | CodeBlock                              | `AstryxGestureOwnerView`, `AstryxClipboard`                                                                                                                                | `startLineNumber`, `onCopyError` (FR2)                                                               |
| Collapsible, CollapsibleGroup                                  | Core       | Collapsible                            | —                                                                                                                                                                          |                                                                                                      |
| DateInput                                                      | Core       | DateInput                              | `AstryxDatePicker`, `AstryxPresentationHost`                                                                                                                               | The platform's picker when native                                                                    |
| DateRangeInput                                                 | Core       | DateRangeInput                         | `AstryxDatePicker`, `AstryxPresentationHost`                                                                                                                               |                                                                                                      |
| DateTimeInput                                                  | Core       | DateTimeInput                          | `AstryxDatePicker`                                                                                                                                                         |                                                                                                      |
| Divider                                                        | Core       | Divider                                | —                                                                                                                                                                          |                                                                                                      |
| EmptyState                                                     | Core       | EmptyState                             | —                                                                                                                                                                          |                                                                                                      |
| Field, FieldLabel, InputClearButton                            | Core       | Field                                  | —                                                                                                                                                                          |                                                                                                      |
| FieldStatus                                                    | Core       | FieldStatus                            | —                                                                                                                                                                          |                                                                                                      |
| FileInput                                                      | Core       | FileInput                              | `AstryxFilePicker`, `AstryxSystemMenu`, `AstryxActionSheet`                                                                                                                | Values are file records, not browser files                                                           |
| FormLayout                                                     | Core       | FormLayout                             | —                                                                                                                                                                          |                                                                                                      |
| Grid, GridSpan                                                 | Core       | Grid                                   | —                                                                                                                                                                          |                                                                                                      |
| HStack                                                         | Core       | HStack                                 | —                                                                                                                                                                          |                                                                                                      |
| Heading                                                        | Core       | Heading                                | —                                                                                                                                                                          |                                                                                                      |
| Icon                                                           | Core       | Icon                                   | `AstryxVectorView`, `AstryxIconView`, `AstryxSymbolView`                                                                                                                   | The one icon component; system symbols draw through it                                               |
| IconButton                                                     | Core       | IconButton                             | `AstryxMaterialView`                                                                                                                                                       |                                                                                                      |
| Indicator, CheckIndicator, CheckboxIndicator, RadioIndicator   | Core       | Indicator                              | —                                                                                                                                                                          |                                                                                                      |
| InputGroup, InputGroupText                                     | Core       | InputGroup                             | —                                                                                                                                                                          |                                                                                                      |
| Item                                                           | Core       | Item                                   | `AstryxSwipeRow`, `AstryxGestureOwnerView`, `AstryxHaptics`                                                                                                                | `swipe` from `createSwipe` (FR2)                                                                     |
| Layer, LayerProvider                                           | Core       | Layer                                  | —                                                                                                                                                                          | Hosts `useToast`'s toasts (FR27)                                                                     |
| Layout, LayoutContent, LayoutFooter, LayoutHeader, LayoutPanel | Core       | Layout                                 | `AstryxSafeAreaProvider`                                                                                                                                                   |                                                                                                      |
| Link, LinkProvider                                             | Core       | Link                                   | —                                                                                                                                                                          | Links open through the system                                                                        |
| List, ListItem, grouped sections                               | Core       | List                                   | `AstryxSwipeRow`, `AstryxDragItem`, `AstryxDropZone`                                                                                                                       | Recycler props, grouped style, edit, `reorderable` (FR29); `swipe` and `itemKey` on `ListItem` (FR2) |
| Markdown                                                       | Core       | Markdown                               | `AstryxSelectableText`                                                                                                                                                     |                                                                                                      |
| MetadataList, MetadataListItem                                 | Core       | MetadataList                           | —                                                                                                                                                                          |                                                                                                      |
| MultiSelector                                                  | Core       | MultiSelector                          | `AstryxPresentationHost`                                                                                                                                                   |                                                                                                      |
| NumberInput                                                    | Core       | NumberInput                            | —                                                                                                                                                                          |                                                                                                      |
| Overlay                                                        | Core       | Overlay                                | —                                                                                                                                                                          |                                                                                                      |
| ProgressBar                                                    | Core       | ProgressBar                            | —                                                                                                                                                                          |                                                                                                      |
| RadioList, RadioListItem                                       | Core       | RadioList                              | `AstryxSwipeRow` (through Item)                                                                                                                                            |                                                                                                      |
| Section                                                        | Core       | Section                                | —                                                                                                                                                                          |                                                                                                      |
| SegmentedControl, SegmentedControlItem                         | Core       | SegmentedControl                       | `AstryxSegmentedControl`, `AstryxHaptics`                                                                                                                                  |                                                                                                      |
| SelectableCard                                                 | Core       | SelectableCard                         | —                                                                                                                                                                          |                                                                                                      |
| Selector, SelectorOption                                       | Core       | Selector                               | `AstryxSystemMenu`, `AstryxPresentationHost`, `AstryxHaptics`                                                                                                              | A system menu for a short plain list                                                                 |
| SizeContext, SizeProvider                                      | Core       | SizeContext                            | —                                                                                                                                                                          |                                                                                                      |
| Skeleton                                                       | Core       | Skeleton                               | —                                                                                                                                                                          |                                                                                                      |
| Slider                                                         | Core       | Slider                                 | `AstryxNativeSlider`, `AstryxGestureOwnerView`, `AstryxHaptics`                                                                                                            |                                                                                                      |
| Spinner                                                        | Core       | Spinner                                | —                                                                                                                                                                          |                                                                                                      |
| Stack, StackItem                                               | Core       | Stack                                  | —                                                                                                                                                                          |                                                                                                      |
| StatusDot                                                      | Core       | StatusDot                              | —                                                                                                                                                                          |                                                                                                      |
| Stepper, Step                                                  | Core       | Stepper                                | —                                                                                                                                                                          |                                                                                                      |
| Switch                                                         | Core       | Switch                                 | `AstryxGestureOwnerView`, `AstryxHaptics`                                                                                                                                  |                                                                                                      |
| TabList, Tab, TabMenu                                          | Core       | TabList                                | `AstryxHaptics`                                                                                                                                                            | In-content tabs; navigation tabs are `TabsItem`                                                      |
| Text                                                           | Core       | Text                                   | —                                                                                                                                                                          |                                                                                                      |
| TextArea                                                       | Core       | TextArea                               | —                                                                                                                                                                          |                                                                                                      |
| TextInput                                                      | Core       | TextInput                              | `AstryxNativeTextField`                                                                                                                                                    |                                                                                                      |
| Thumbnail                                                      | Core       | Thumbnail                              | —                                                                                                                                                                          | Draws `FileTypeArt` for a file with no picture                                                       |
| TimeInput                                                      | Core       | TimeInput                              | `AstryxDatePicker`                                                                                                                                                         |                                                                                                      |
| Timer                                                          | Core       | Timer                                  | —                                                                                                                                                                          |                                                                                                      |
| Timestamp                                                      | Core       | Timestamp                              | `AstryxClipboard`                                                                                                                                                          |                                                                                                      |
| Toast                                                          | Core       | Toast, useToast                        | `AstryxDragSnap`, `AstryxGestureOwnerView`, `AstryxHaptics`                                                                                                                | `useToast()` returns the show function (FR27)                                                        |
| ToggleButton, ToggleButtonGroup                                | Core       | ToggleButton                           | `AstryxHaptics`                                                                                                                                                            | The filter chip (FR9)                                                                                |
| Token                                                          | Core       | Token                                  | —                                                                                                                                                                          | The entry chip (FR9)                                                                                 |
| Tokenizer                                                      | Core       | Tokenizer                              | `AstryxPresentationHost`                                                                                                                                                   |                                                                                                      |
| Typeahead, BaseTypeahead, TypeaheadItem                        | Core       | Typeahead                              | —                                                                                                                                                                          |                                                                                                      |
| VStack                                                         | Core       | VStack                                 | —                                                                                                                                                                          |                                                                                                      |
| VisuallyHidden                                                 | Core       | VisuallyHidden                         | —                                                                                                                                                                          |                                                                                                      |
| AlertDialog                                                    | Adaptive   | AlertDialog                            | `AstryxMaterialView`                                                                                                                                                       | System alert for words and buttons, drawn otherwise (FR32)                                           |
| BottomSheet                                                    | Adaptive   | BottomSheet                            | `AstryxPresentationHost`, `AstryxModalHost`, `AstryxDragSnap`, `AstryxGestureOwnerView`, `AstryxKeyboardDock`, `AstryxMaterialView`, `AstryxHaptics`                       | System sheet on iOS, drawn on Android; stops by value (FR25); header parts (FR19)                    |
| ContextMenu and members                                        | Adaptive   | ContextMenu                            | `AstryxSystemMenu`, `AstryxPresentationHost`, `AstryxMaterialView`, `AstryxHaptics`                                                                                        | System menu with preview on iOS; Material menu on Android                                            |
| Dialog, DialogHeader                                           | Adaptive   | Dialog                                 | `AstryxMaterialView`                                                                                                                                                       | Form-sheet presentation at regular width                                                             |
| Drawer, DrawerHeader                                           | Adaptive   | Drawer                                 | `AstryxBack`                                                                                                                                                               | Material navigation drawer as the Android analogue                                                   |
| DropdownMenu and members                                       | Adaptive   | DropdownMenu                           | `AstryxSystemMenu`, `AstryxPresentationHost`, `AstryxMaterialView`                                                                                                         | System menu on iOS; Material menu on Android (FR28)                                                  |
| Lightbox                                                       | Adaptive   | Lightbox                               | `AstryxZoomPager`, `AstryxPanZoomView`                                                                                                                                     | The media viewer (FR31)                                                                              |
| MoreMenu                                                       | Adaptive   | MoreMenu                               | `AstryxSystemMenu`                                                                                                                                                         | Icon-only `DropdownMenu`                                                                             |
| Pagination                                                     | Adaptive   | Pagination                             | —                                                                                                                                                                          | Compact form at compact width                                                                        |
| Popover                                                        | Adaptive   | Popover                                | `AstryxPresentationHost`, `AstryxMaterialView`, `AstryxBack`                                                                                                               | A sheet at compact width, a popover at regular width                                                 |
| Toolbar                                                        | Adaptive   | Toolbar                                | —                                                                                                                                                                          | In-content toolbar; the screen's bottom bar is `HeaderToolbar`                                       |
| Tooltip                                                        | Adaptive   | Tooltip                                | —                                                                                                                                                                          | Long press, as core's touch trigger defines                                                          |
| CommandPalette and members                                     | Regular    | CommandPalette                         | `AstryxKeyboardDock`                                                                                                                                                       |                                                                                                      |
| ComplexSelector                                                | Regular    | ComplexSelector                        | `AstryxPresentationHost`                                                                                                                                                   |                                                                                                      |
| HoverCard                                                      | Regular    | HoverCard                              | `AstryxMaterialView`, `AstryxBack`                                                                                                                                         | Opens on press at compact width                                                                      |
| Kbd                                                            | Regular    | Kbd                                    | —                                                                                                                                                                          |                                                                                                      |
| Outline                                                        | Regular    | Outline                                | —                                                                                                                                                                          |                                                                                                      |
| OverflowList                                                   | Regular    | OverflowList                           | —                                                                                                                                                                          |                                                                                                      |
| PowerSearch and members                                        | Regular    | PowerSearch                            | `AstryxPresentationHost`                                                                                                                                                   |                                                                                                      |
| Resizable, ResizeHandle                                        | Regular    | Resizable                              | `AstryxGestureOwnerView`                                                                                                                                                   |                                                                                                      |
| ScrollableArea                                                 | Regular    | ScrollableArea                         | —                                                                                                                                                                          |                                                                                                      |
| Table and members                                              | Regular    | Table                                  | —                                                                                                                                                                          |                                                                                                      |
| TreeList                                                       | Regular    | TreeList                               | `AstryxSwipeRow` (through Item)                                                                                                                                            |                                                                                                      |
| AppShell                                                       | Not ported | AppShell                               | —                                                                                                                                                                          | Navigators and `Screen` (FR5)                                                                        |
| Breadcrumbs, BreadcrumbItem, BreadcrumbMenu\*                  | Not ported | Breadcrumbs                            | —                                                                                                                                                                          | `HeaderBack` and its menu (FR5)                                                                      |
| MobileNav, MobileNavToggle                                     | Not ported | MobileNav                              | —                                                                                                                                                                          | The compact tab bar; `Drawer` (FR5)                                                                  |
| NavIcon                                                        | Not ported | NavIcon                                | —                                                                                                                                                                          | `TabsItem` and `BarButton` icons (FR5)                                                               |
| NavMenu, NavHeadingMenu, NavHeadingMenuItem                    | Not ported | NavMenu                                | —                                                                                                                                                                          | `BarMenu`, `HeaderTitleMenu` (FR5)                                                                   |
| SideNav and members                                            | Not ported | SideNav                                | —                                                                                                                                                                          | The tabs sidebar with `TabsGroup` (FR5)                                                              |
| TopNav and members                                             | Not ported | TopNav                                 | —                                                                                                                                                                          | `Header` and its parts (FR5)                                                                         |
| Screen                                                         | Essential  | none                                   | `AstryxStackScreen`, `AstryxSafeAreaProvider`, `AstryxKeyboardDock`                                                                                                        | Scroll and fill modes; the screen's scroll target (FR10)                                             |
| Navigators: NavigationRoot, createStack, createTabs            | Essential  | none                                   | `AstryxStackHost`, `AstryxStackScreen`, `AstryxTabsHost`, `AstryxTabScreen`                                                                                                | One options record per screen (FR11, FR20)                                                           |
| Header and its parts (FR12)                                    | Essential  | TopNav's slot names                    | `AstryxStackScreen`, `AstryxHeaderSlot`, `AstryxSystemMenu`, `AstryxGlassView`, `AstryxScrollEdgeView`, `AstryxGlassContainerView`, `AstryxSafeAreaProvider`, `AstryxBack` | Record plus parts; in place outside a stack (FR19)                                                   |
| TabsItem, TabsGroup                                            | Essential  | none                                   | `AstryxTabsHost`, `AstryxTabScreen`                                                                                                                                        | Width classes and sidebar (FR21)                                                                     |
| BottomAccessory                                                | Essential  | none                                   | `AstryxTabAccessory`, `AstryxGlassView`                                                                                                                                    | `'expanded'` or `'inline'` (FR22)                                                                    |
| TabBar                                                         | Essential  | lab TabBar                             | `AstryxGlassView`, `AstryxGlassContainerView`, `AstryxSafeAreaProvider`                                                                                                    | Drawn renderer of the tab record; `action` (FR24)                                                    |
| InlineSheet                                                    | Essential  | BottomSheet without a scrim            | `AstryxDragSnap`, `AstryxGestureOwnerView`, `AstryxMaterialView`, `AstryxHaptics`, `AstryxSafeAreaProvider`                                                                | Persistent, never dismissed (FR26)                                                                   |
| ActionSheet                                                    | Essential  | none                                   | `AstryxActionSheet`, `AstryxDragSnap`                                                                                                                                      | System action sheet on iOS                                                                           |
| KeyboardAccessoryView                                          | Essential  | none (web keeps its keyboard internal) | `AstryxKeyboardDock`, `AstryxGlassView`, `AstryxSafeAreaProvider`                                                                                                          | The one dock (FR35)                                                                                  |
| PasteButton                                                    | Essential  | none                                   | `AstryxPasteControl`, `AstryxClipboard`                                                                                                                                    | System control on iOS (FR34)                                                                         |
| SearchField                                                    | Essential  | none                                   | `AstryxBack`                                                                                                                                                               | In-content search only (FR36)                                                                        |
| useShare                                                       | Essential  | none                                   | The platform's share routes (`spec:AST-130`)                                                                                                                               | With an iPad anchor (FR33)                                                                           |
| BarButton, BarMenu, BarSpacer, BarStatus                       | Part       | none                                   | `AstryxStackScreen`, `AstryxSystemMenu`                                                                                                                                    | Public header and toolbar parts (FR12)                                                               |
| BarButtonGroup                                                 | Part       | none                                   | `AstryxGlassContainerView`                                                                                                                                                 | Drawn renderer internal                                                                              |
| SearchBar                                                      | Part       | none                                   | `AstryxGlassView`                                                                                                                                                          | Drawn renderer internal behind `HeaderSearch`                                                        |
| FloatingHeader                                                 | Part       | none                                   | `AstryxGlassView`                                                                                                                                                          | The drawn header's floating layout; not exported                                                     |
| FloatingTabBar                                                 | Part       | none                                   | —                                                                                                                                                                          | Not exported; `TabBar`                                                                               |
| DockedBar                                                      | Part       | none                                   | —                                                                                                                                                                          | Not exported; `BottomAccessory` (FR22)                                                               |
| IconBadge                                                      | Part       | none                                   | —                                                                                                                                                                          | Internal to `BarButton` and the drawn header (FR8)                                                   |
| FileTypeArt                                                    | Part       | none                                   | `AstryxVectorView`                                                                                                                                                         | Internal to `Thumbnail`                                                                              |
| Image                                                          | Primitive  | none (web uses the image element)      | —                                                                                                                                                                          | Loading and failure states                                                                           |
| Vector, VectorPath                                             | Primitive  | none                                   | `AstryxVectorView`, `AstryxVectorInfo`                                                                                                                                     | The drawing primitive                                                                                |
| VideoView                                                      | Primitive  | none                                   | `AstryxVideoView`, `AstryxAudio`, `AstryxSafeAreaProvider`                                                                                                                 | The platform's own playback controls                                                                 |
| WebView                                                        | Primitive  | none                                   | `AstryxWebView`, `AstryxWebViewInfo`                                                                                                                                       | The one web surface; absorbs `WebContent`                                                            |
| AvatarRing                                                     | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| BarTitleCapsule                                                | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| ExpandableText                                                 | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| LinkPreview                                                    | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| MediaScrubber                                                  | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| PlaceholderArt                                                 | Kit        | none                                   | —                                                                                                                                                                          | FR7; the palette stays in the library                                                                |
| PlaybackRateMenu                                               | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| RichText                                                       | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| StackedAction                                                  | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| ThreadConnector                                                | Kit        | none                                   | —                                                                                                                                                                          | FR7                                                                                                  |
| AreaChart                                                      | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| BarChart                                                       | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| Chip, ChipGroup                                                | Out        | Token, ToggleButton                    | —                                                                                                                                                                          | FR9                                                                                                  |
| DonutChart                                                     | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| DragDrop: Draggable, DropZone, ReorderableList                 | Out        | List `reorderable`                     | —                                                                                                                                                                          | Split (FR9)                                                                                          |
| LineChart                                                      | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| Pager, PageDots                                                | Out        | Carousel                               | —                                                                                                                                                                          | FR9                                                                                                  |
| Sparkline                                                      | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| ViewThatFits                                                   | Out        | none                                   | —                                                                                                                                                                          | FR9                                                                                                  |
| WebContent                                                     | Out        | none                                   | —                                                                                                                                                                          | Folds into `WebView` (FR9)                                                                           |

### Platform support

- Supported feature/engine floor: `spec:AST-112`'s floor (iOS at React
  Native's minimum, Android API level 24, the New Architecture only). A
  native piece with a newer OS floor degrades as its record says; the
  component keeps its contract and draws its own form where the system piece
  is absent.
- Unsupported behavior: a not-ported family fails at type check and in a
  development build with its replacement named (FR5); a header or tab option
  a renderer does not honour is refused by that renderer's types (FR19); a
  component never accepts a prop and ignores it (FR2).
- Browser evidence: none. Claims are proven with unit tests through the
  package's testing doubles, Astryx Stage on its iOS and Android profiles, the
  iOS Simulator, the Android emulator and devices (`spec:AST-112/FR15`).

## Current-state impact

- `spec:AST-112/FR1` and `spec:AST-112/FR5`: this record fixes the library
  layer's component list and which names the `.` and `./navigation` entries
  export.
- `spec:AST-125`: its "Who uses it" names `Header` and `BottomAccessory`, as
  here. Its Android tabs host shows a More list past five destinations; under
  FR23 the navigator refuses more than five at compact width before the host
  is reached. `spec:AST-125/OQ4` asks whether Android has a
  bottom toolbar and a Material search bar at all; FR6's Android answer for
  `HeaderToolbar` (a Material bottom app bar) is one of its two options, and
  answering OQ4 the other way changes that row.
- `spec:AST-125`: its Android tabs host switches from the bar to the rail at
  600 dp, while FR21 here picks the bar or the rail by compact; and its "Who
  uses it" names `ScreenView` and `ScreenScroll` and draws the header search
  row with `SearchField`, where this set has `Screen` (FR10), `HeaderSearch`
  over the drawn renderer's internal search bar (FR8, FR15), and `SearchField`
  for in-content search only (FR36).
- `spec:AST-124`: `Lightbox` is the zoom pager's public face, as here (FR31).
- `spec:AST-128`: the system menu's row subset is the one FR13 types.
- The web counterparts' component records do not change; each web-parity
  family's React Native contract is its platform contract under
  `spec:AST-082/FR3`.

## Verification

| Contract  | Verification                                                                                                                                | Representative states                                                                    | Mutation or failure expectation                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| FR1       | A package export check against this record's table: every export has a row, and no Kit, Out, Not-ported or internal Part family is exported | an export with no row; a Kit, Out or Not-ported name exported; an internal part exported | An exported family has no row, or a family the table keeps out is exported                                 |
| FR2, FR3  | Contract checks of each Core and Adaptive family against the web core contract; component unit tests                                        | each prop's default; a web-only prop passed on native                                    | A core prop differs in meaning or default, or a prop is accepted and ignored                               |
| FR4       | Screen-reader and touch checks of each Regular family at compact width on the Simulator and the emulator                                    | compact width; regular width; no hardware keyboard                                       | A Regular family needs hover or a keyboard at compact width                                                |
| FR5       | Type tests importing each not-ported family; a development-build import                                                                     | each of the seven families                                                               | An import type-checks, or its message names no replacement                                                 |
| FR6       | Each essential component's record has an iOS and an Android row; Simulator and emulator captures                                            | each essential on both platforms                                                         | An essential has no Android answer                                                                         |
| FR7       | Package export check; the create command's output builds with the kit                                                                       | each of the ten kit components                                                           | A kit component is exported, or a template fails to build without it                                       |
| FR8, FR9  | Export check that each internal part and each FR9 name is absent; FR5's import message for the not-ported families                          | each FR9 name; each internal part                                                        | An FR9 name or an internal part is exported                                                                |
| FR10      | Unit tests of `Screen`'s modes and the three inset hooks; first-frame captures of a pushed screen                                           | scroll; fill; a list as scroll target; a reported bottom bar                             | An edge is padded twice, or a large title does not collapse with the scroll target                         |
| FR11      | Unit tests that every renderer reads only the record; a record serialisation test over data, handler table and view slots                   | system; drawn; custom renderer                                                           | A renderer reads a prop outside the record, or two spellings of one search concept exist                   |
| FR12      | Unit tests of part registration through wrappers, conditionals and fragments                                                                | an app component rendering `BarButton`; a part in a fragment                             | A wrapped part does not reach the record                                                                   |
| FR13      | Type tests of `BarMenu` rows under the system renderer                                                                                      | a row with end content; a second submenu level; a wrapped row                            | An out-of-subset row type-checks, or a wrapped row is dropped                                              |
| FR14      | Unit tests of the part-by-part merge                                                                                                        | static title with dynamic search; a dynamic part unmounting                              | A dynamic part replaces unrelated static parts, or the static part does not return                         |
| FR15      | Unit tests of the search mapping; Simulator check of the system field; Stage and emulator checks of the drawn row                           | scopes; controlled value; active field and back                                          | A prop means different things on the two renderings                                                        |
| FR16      | Frame captures on the Simulator and the emulator: push a screen whose dynamic header sets a large title and a search field                  | push; push with a slow first commit                                                      | The bar's height changes after the first frame, or the title or search field appears after the push starts |
| FR17      | Frame captures of a lazy screen's push                                                                                                      | a lazy screen; a suspended screen                                                        | The bar is empty before the first commit                                                                   |
| FR18      | Unit tests in a development build                                                                                                           | two headers in one screen; a nested navigator                                            | No error, or the parent's parts merge into the child's header                                              |
| FR19      | Captures of the in-place bar in a sheet, an inline sheet and a column; the parity table checked against each renderer's types               | `BottomSheet` header; sheet route; a custom header renderer                              | A sheet hand-builds its bar, or an option a renderer does not honour type-checks there                     |
| FR20–FR22 | Unit tests of tab parts and placement; Simulator and emulator captures at compact and regular width                                         | a group flattened at compact width; a detail column; minimized bar with accessory        | A group's screens are lost at compact width, or a third placement word exists                              |
| FR23      | Emulator checks and a development-build test                                                                                                | a search-role tab; six destinations at compact width                                     | A search tab is hidden, or six destinations render without the error                                       |
| FR24      | Type test of `TabBar`'s props                                                                                                               | the circle button                                                                        | A prop named `accessory` exists on `TabBar`                                                                |
| FR25      | Unit tests of stops by value on `BottomSheet`, `InlineSheet` and sheet routes                                                               | reordered snap points; `'full'`; a fixed height; an unknown detent                       | A stop resolves by position, or an unknown detent changes the open stop without a warning                  |
| FR26      | Unit tests; a build without the drag-snap view checked against the record's stated form                                                     | each stop; no drag view; screen reader                                                   | The sheet can be dismissed, or a build without the drag view shows a form its record does not state        |
| FR27      | Unit tests of `useToast` against web `useToast`'s contract                                                                                  | show; dismiss through the returned function; two toasts                                  | `showToast` returns no dismiss function, or a toast renders outside its `LayerProvider`                    |
| FR28      | Unit tests of the shared item vocabulary across the menus                                                                                   | a menu in a bar and in content                                                           | One menu takes item names another does not                                                                 |
| FR29      | Contract coverage over List's props; development-build tests in page flow                                                                   | each scroll-owning prop in page flow; list's own scroller; grouped style; reorder        | A listed prop is missing from the contract, or an ignored prop does not warn                               |
| FR30      | Unit tests of `scrollProps` on both components; transcript tests                                                                            | screen scroll target; prepend older rows; new row at the latest                          | A prop exposes the list engine, or the transcript jumps on prepend                                         |
| FR31      | Simulator and emulator checks of zoom, paging and drag to dismiss; screen-reader actions                                                    | `hasZoom` on each platform; a single item; an array                                      | `hasZoom` does nothing on one platform, or an action is missing                                            |
| FR32      | Simulator and emulator captures of each `AlertDialog` content shape                                                                         | words and buttons; custom content                                                        | Words-and-buttons content draws its own dialog, or the callbacks differ between forms                      |
| FR33      | Unit tests through the testing doubles; iPad Simulator anchor check                                                                         | URL; text; files; anchor; dismiss                                                        | The popover ignores `anchor`, or a dismissal rejects instead of resolving `cancelled`                      |
| FR34      | The controls records' checks (`spec:AST-126`)                                                                                               | paste on each platform; native pickers                                                   | As the controls record states                                                                              |
| FR35      | Simulator and emulator captures above a tab bar and inside a sheet                                                                          | tab bar; sheet footer; interactive dismissal                                             | The app must add the bar's height, or a prop behaves differently per platform                              |
| FR36      | Export check                                                                                                                                | header search; in-content search                                                         | A third search entry point is exported                                                                     |
| FR37      | A naming check over the package's public types                                                                                              | a component with no web counterpart; a contract with an alias                            | `onPress` beside `onClick`, a bare boolean adjective, or an alias inside an unreleased contract            |
| FR38      | Review of each change that trades one area's requirement for another's against the ranking                                                  | a conflict between two areas                                                             | A lower area's requirement holds over a higher one's                                                       |

## Decision log

### DEC-1 — Web parity is tiered by interaction model

**Reference:** `spec:AST-138/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A web family carries to a phone as far as its interaction model does, not as
far as apps happen to use it: Core families work the same by touch, Adaptive
families change presentation and keep their contract, Regular-width families
serve large screens, and the web app shell has native replacements. One name
per concept across web and native keeps an Astryx developer's knowledge
transferable.

Rejected: classing families by how many apps use them, because usage
misclassifies layout and form families that every app needs.

### DEC-2 — The header is one record with composed parts

**Reference:** `spec:AST-138/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

The system bar is configured from data before a push starts, so a serialisable
record is what every renderer reads. Parts are the documented API because composition lets an app
put its own components in the bar and keeps one vocabulary with the web's
slot names. Static and dynamic placement, the first-frame guarantee, the lazy
fallback and the conflict rule keep parts from regressing the record's timing.
The same parts render in place wherever a header appears, so no container
needs its own bar.

Rejected: header props on a standalone component that differ from the
record's keys, because two vocabularies for one bar drift.

### DEC-3 — One tab accessory with the platform's placement words

**Reference:** `spec:AST-138/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

`BottomAccessory` with `'expanded'` and `'inline'` uses the platform's public
names for the same states. How a renderer draws the expanded state (floating
or docked) is its own concern, not a placement. Tabs follow the header's record
and parts model, and the split view folds into the tab model's width classes.

### DEC-4 — Sheet stops are named by value

**Reference:** `spec:AST-138/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A stop named by its own value uses the web's stop vocabulary and cannot be off
by one in either direction.

Rejected: stop indices, because the component and the route would count in
opposite directions.

### DEC-5 — Toast, scroll ownership and the media viewer follow one public shape each

**Reference:** `spec:AST-138/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

A toast is raised with the function web's `useToast()` returns, which returns
`dismiss`.
A component that owns a scroller hands it to the screen through
`scrollProps`, so no prop exposes a list engine. `Lightbox` is the media
viewer's public face, and the zoom pager stays an internal contract.

### DEC-6 — List's recycler props are contract, and ignored props warn

**Reference:** `spec:AST-138/DEC-6`
**Decider:** imdreamrunner, 2026-11-17

Props outside a component's contract escape parity and coverage checks, so
List's data mode is part of its contract. A prop that has no effect where the
list sits is a development warning, because a silent no-op is a debugging
trap.

### DEC-7 — Demo parts ship as template source, not as components

**Reference:** `spec:AST-138/DEC-7`
**Decider:** imdreamrunner, 2026-11-17

A component that exists for one demo screen, or composes in a few lines from
public parts, would become a compatibility promise for no general use. The
create command's templates carry them as source, so templates keep building
and the package stays small.

### DEC-8 — The areas are ranked

**Reference:** `spec:AST-138/DEC-8`
**Decider:** imdreamrunner, 2026-11-17

Screens and navigators rank highest because every other area renders inside
them; insets come before presentations because sheets and docks report into
them; lists come before menus because more screens are lists than menus.

## Open questions

- **OQ1 — Is the default navigation chrome the system renderer or drawn
  chrome?** (`human-design`) Both renderers read the same record (FR11,
  FR20), so either default holds this record's API.
  - System by default: the back gesture, large-title collapse, the search
    controller, the sidebar and vertical bars behave exactly as the
    platform's, and the option set has no parity gap on iOS. The cost: the
    system renderer must read the theme itself, and the two platforms look
    less alike.
  - Drawn by default: the theme applies with no extra work and both
    platforms look the same. The cost: the drawn renderer must match the
    system's behaviour row by row, and options it does not honour are refused
    on the default path (FR19).
- **OQ2 — Is the drawn header and tab chrome specified in this record, or in
  a later record gated on a green parity table?** (`human-design`) This
  record holds the in-place bar and the custom-renderer seam either way
  (FR19).
  - In this record: one place for every header and tab rule; the record is
    larger, and the drawn rows of the parity table must be green before it
    can be current.
  - In a later record: this record can become current on the system
    renderer, the in-place bar and the seam; until the later record, an app
    that wants identical chrome on both platforms draws it through the seam.
