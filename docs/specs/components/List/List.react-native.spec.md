---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/List
platform_of: component:List
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, scrolling, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: []
architecture:
  [architecture:container-padding, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# List (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `List` props `children`, `density`, `hasDividers`, `edge`, `edgeCompensation` and `header`, without `animatedLayout`, `reorderable`, `listStyle`, `start` and `xstyle`. React Native adds `density="table"`, `variant`, `dividerInset`, `footer` and `rowMinHeight`; data mode (`data`, `renderItem`, `extraData`, `keyOf`, `itemHeight`, `itemType`, `estimatedItemHeight`, `numColumns`, `overscan`, `hasRowReuse`, `isRefreshing`, `onRefresh`, `onEndReached`, `scrollProps`) with a `ListHandle` ref; and the parts `ListGroupedPage`, `ListGroupedHeader`, `ListGroupedFooter`, `useGroupedListMetrics` and `ListRowFrame`. |
| Behavior                | `edge` places rows as on the web. Inside a vertical scroller the List draws every row in flow; anywhere else it is its own vertical scroller and mounts only the rows near the viewport, in children mode and data mode alike. Dividers inset per row by default. `insetGrouped` draws the platform's grouped list.                                                                                                                                                                                                                                                                                                                     |
| End-user impact         | A person gets long lists that scroll at the platform's speed with every row read as one element, dividers that sit where the platform's lists put them, and grouped settings pages that match the system's.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Builder impact          | Web code that renders a `List` of `ListItem`s ports unchanged unless it passes one of the five props React Native does not offer. A long or remote collection passes `data` and `renderItem` to the same List; a screen whose body is one List hands it the screen's scroll props.                                                                                                                                                                                                                                                                                                                                                      |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR2 and FR3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Review checks           | Reject a second list component for long collections, a nested scroller that cannot window, a row drawn again when nothing it reads changed, a list read as one container stop, a divider or edge value taken from outside the theme, or a prop accepted and ignored.                                                                                                                                                                                                                                                                                                                                                                    |
| Governing rules         | `component:List` FR1–FR9; `architecture:container-padding`; `spec:AST-082` FR3, FR5, FR7; `spec:AST-093` FR1–FR5; `spec:AST-124` FR17, DEC-6; `spec:AST-125` FR5, FR8; DEC-1 to DEC-4 below.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

List on React Native is web's vertical collection of `ListItem` rows, with
the same density, dividers, edge treatment and header, drawn as a phone draws
lists: it scrolls itself where no scroller holds it, mounts only the rows a
person can reach, and offers the platform's table density, inset dividers and
grouped settings list.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `List`: its props, the edge offsets of its
  rows and its spacing (FR1, FR3, FR4).
- The platform additions: table density, the grouped list and its page parts,
  divider placement, the footer and the rows' minimum height (FR2,
  FR5–FR7).
- Who scrolls a List, how its rows are windowed and recycled, data mode, its
  scroll handle and the screen's scroll props (FR8–FR12).
- How a List keeps its scroller inside a pinch (FR13).

**Does not own / non-goals**

- The meaning of the web props and the edge vocabulary — owned by
  `component:List` and `architecture:container-padding`.
- Each row's layout, words, press, touch target, swipe actions and divider
  drawing — owned by `component:ListItem` and `component:Item`.
- Reordering rows — owned by `ReorderableList` and `spec:AST-124`.
- The pinch itself — owned by `spec:AST-124` FR17; the screen's scroll target
  and its chrome — owned by `spec:AST-125`.

## Public concepts

| Concept        | Closed values or states                    | Meaning                                                                                             | Availability by variant/orientation/state | Default      | Owner                         | Stability    | Invalid-value behavior                         |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------ | ----------------------------- | ------------ | ---------------------------------------------- |
| `density`      | `compact`; `balanced`; `spacious`; `table` | the rows' padding; `table` is the platform's table cell                                             | always                                    | `balanced`   | `component:react-native/List` | experimental | an unknown value is a type error               |
| `edge`         | `padded`; `flush`; `outset`; `bleed`       | where row content and row paint sit relative to the list's edges and the host's padding             | `plain`; ignored by `insetGrouped`        | `padded`     | `component:List`              | experimental | an unknown value is a type error               |
| `variant`      | `plain`; `insetGrouped`                    | the rows as a plain list, or in the platform's rounded grouped card                                 | always                                    | `plain`      | `component:react-native/List` | experimental | an unknown value is a type error               |
| `dividerInset` | `auto`; `full`; `text`; `content`; `none`  | where each divider runs                                                                             | with `hasDividers`                        | `auto`       | `component:react-native/List` | experimental | an unknown value is a type error               |
| scroll owner   | in flow; own scroller                      | inside a vertical scroller every row draws in flow; elsewhere the List scrolls and windows its rows | decided by the scroller around the List   | own scroller | `component:react-native/List` | experimental | none                                           |
| row source     | children; data                             | `ListItem` children, or one row per item of `data` drawn by `renderItem`                            | always                                    | children     | `component:react-native/List` | experimental | `data` without `renderItem` draws the children |
| row reuse      | fresh; reused                              | a recycled slot starts each item's row fresh, or keeps its component across items                   | own scroller                              | fresh        | `component:react-native/List` | experimental | none                                           |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                                             | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| FR1  | List MUST take web's `children`, `density`, `hasDividers`, `edge`, `edgeCompensation` and `header` with web's names, defaults (`balanced`, no dividers, `padded`) and meaning; `edgeCompensation="inline"` resolves to `outset`, and a defined `edge` wins. Base props follow `spec:AST-082` FR7: `id` identifies the root and `isHidden` hides it. It MUST NOT offer a prop it does not honor: `xstyle` is web styling; `animatedLayout` and `reorderable` take handles from `useAnimatedLayout` and `createReorderable`, which React Native does not export, so rows change at once, as web's List does without a handle; `listStyle` and `start` are OQ1. `children` holds `ListItem`s; any other child warns in development.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `component:List` FR1, FR12; `spec:AST-082` FR3, FR5, FR7                          | settled            |
| FR2  | React Native adds, each for a platform reason: `density="table"`, the platform's table cell (FR4); `variant`, the platform's grouped list (FR6); `dividerInset`, the platform's divider placement (FR5); `footer`, supporting words under the rows as secondary text; `rowMinHeight` (FR7); and data mode (FR10–FR12), because a phone list draws remote and long collections. An unset addition other than `dividerInset` draws web's look; unset dividers follow DEC-3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-082` FR5; `spec:AST-093` FR2, FR3; DEC-3                                | settled            |
| FR3  | `edge` MUST place rows as `component:List` FR3–FR6 and FR8 define: each row's frame moves outward on both inline edges, keeping the row's own inline inset inside it. `flush` moves it by the row's inset, with the list clipping at its edges so row paint stops on the content line; `outset` by the smaller of the row's inset and the host's, so content reaches the host content line when the host inset is at least the row's; `bleed` to the host's padding edge, with square rows, except that, when the list is a rounded host's first or last child, its first or last row takes that host's corner less the host block padding it keeps, and with row content on the host content line, or at the row's own inset from its edge when the host inset is smaller. The row's inset is the inline padding of its density, the value Item applies. The host inset is the padding the nearest eligible host publishes, the content area of a Card, Section, Dialog or BottomSheet among them (`component:List` FR8); with none, `outset` and `bleed` place rows as `padded`.                                                                                                                                                                                         | `component:List` FR3–FR6, FR8, DEC-4; `architecture:container-padding` INV6, INV9 | verify             |
| FR4  | Rows MUST take the list's density. Without dividers rows stand `space.s0_5` apart; with dividers they touch, and a divided or `bleed` List draws square rows whose press fill reaches the row's edges. The header sits `space.s2` above the rows and the footer `space.s2` below them. `table` rows sit at `space.s4` from the row's edge and are at least the platform's minimum touch target tall (44 pt on iOS, 48 dp on Android), grown with the text size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:List` FR2; `spec:AST-093` FR2                                          | verify             |
| FR5  | With `hasDividers`, `dividerInset` MUST place each divider: `full` across the row, as on the web; `text` from the row's text, past any start content or glyph, to the row's trailing content margin; `content` inset by the density's inline padding at both ends, so it holds for any row content from the first frame; `auto` as `text` for a row with a leading glyph or start content and as `content` for any other, each row drawing the line at its own bottom so the upper row of a boundary decides, with none under the last row; `none` no divider, with rows still square. Insets are logical, so they mirror in right-to-left. Without `hasDividers` no divider draws. A divider is `size.borderWidth` in the theme's divider colour: the border colour, `color.borderEmphasized` in dark.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-3; Apple Human Interface Guidelines, Lists and tables                         | verify             |
| FR6  | `variant="insetGrouped"` MUST draw the rows in a rounded card (`radius.container`, `color.backgroundSurface`, clipped at its corners) on the screen's grouped page in `color.backgroundBody`, with square, gapless rows and the header and footer outside the card on the rows' text line as secondary words; the header is the body size on iOS and supporting text elsewhere, and string words are a heading for assistive technology. `edge` does not apply. On iOS the List insets itself from its container's edges by the system layout margin (16 pt in windows narrower than 414 pt, 20 pt from 414) and its rows are at least 52 pt tall at the default text size, and the card draws no frame; on Android the card draws a hairline frame in the divider colour only where its surface is faint against the page. `ListGroupedPage` holds several grouped Lists on one vertical scroll in `color.backgroundBody`, `space.s6` apart and from its ends, padding the screen gutter (`space.s4`) on Android and nothing on iOS; horizontal padding or margin in its content style is ignored with one development warning. `useGroupedListMetrics`, `ListGroupedHeader` and `ListGroupedFooter` give the same metrics and parts to a page that windows its own rows. | DEC-4; Apple Human Interface Guidelines, Lists and tables; Material 3 lists       | verify             |
| FR7  | `rowMinHeight` MUST make every row at least that tall at the default text size, grown with the text size and uncapped, with the whole row as its tap target and content taller than it growing the row. A value under the platform's minimum touch target is raised to it, with one development warning. Unset, the density decides, and iOS `insetGrouped` rows keep 52 pt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-093` FR2                                                                | verify             |
| FR8  | A List inside a vertical scroller (any vertical `ScrollView` or list that holds it) MUST draw every row in flow as a plain view and scroll with that scroller. Anywhere else, a horizontal scroller included, it MUST be its own vertical scroller and window its rows (FR9), in children mode and data mode alike: in children mode it grows to its rows and shrinks to a bounded parent, and in data mode it fills its bounded parent. No prop chooses the mode. On Android its own scroller opts into nested scrolling, so a drag that starts on its rows scrolls the List rather than a scroller outside it. A tap on a control in a row acts while the keyboard is up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | DEC-2                                                                             | verify             |
| FR9  | As its own scroller, List MUST mount only the rows near the viewport plus a draw distance, and a row that leaves the window gives its slot to the row that enters, so a scroll renders one slot per row instead of mounting one. `overscan` sets the draw distance in viewport heights each way; unset, it is a viewport each way at rest (at least 900 pt; 1,200 dp on Android) and a quarter second of travel ahead while scrolling (at most two viewports; on Android 0.35 s and three). A row's own state belongs to its item: a slot's content is keyed by `keyOf`, the element key in children mode, or the index, and starts fresh for each item unless `hasRowReuse` keeps the row's component across items. `itemHeight` places rows at exact offsets with no measuring, one number for every row or one per item; a result that is not a finite number of at least 0 measures that row, with one development warning. Unset, rows are measured, `estimatedItemHeight` (default: the touch floor grown with the text size) placing them first. `itemType` keeps each kind of row in slots of its kind. A removed child unmounts.                                                                                                                                  | DEC-1                                                                             | verify             |
| FR10 | With `data` and `renderItem`, List MUST draw one row per item in place of `children`. A row MUST be drawn again only when its item, its index, `renderItem`'s identity or `extraData` changes. `numColumns` draws equal cells per row, windowed, or as wrapping cells keyed by item in flow. `onRefresh` turns on pull to refresh, with `isRefreshing` showing it; `onEndReached` is called once each time the end of the data comes within a viewport, once per data length.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | DEC-1                                                                             | verify             |
| FR11 | In data mode as its own scroller, the List's ref MUST be a `ListHandle` whose `scrollToOffset`, `scrollToIndex` (with `viewPosition`) and `scrollToEnd` draw the rows at the target in the same render that moves the scroll, so a jump never shows undrawn rows, a jump made from a layout effect in the render that changes the rows included. On iOS `scrollToOffset` keeps an offset above 0 as given; `scrollToIndex`, `scrollToEnd` and every Android scroll stop at the top. In flow or in children mode the ref stays null.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-1                                                                             | verify             |
| FR12 | In data mode as its own scroller, `scrollProps` MUST reach the List's scroll view: the props a screen gives its body scroller (`useScreenScrollProps()`'s result fits), so a screen whose body is one List collapses its large title and minimizes its tab bar with it. The List composes its own handling with the given ref, `onLayout`, `onContentSizeChange`, `onScroll`, `onScrollEndDrag` and `onMomentumScrollEnd`; honours the content style's numeric padding; keeps its own refresh control when it has `onRefresh`, its list role and Android's nested scrolling; and gives the screen's `nativeID` precedence over `id`'s. A `style` holding Animated values runs on the UI thread and stays the screen's scroll view. In flow, `scrollProps` is ignored. The List's scroller is the scroll source of content in its header that windows to the viewport.                                                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-125` FR5, FR8; DEC-2                                                    | verify             |
| FR13 | A data-mode List inside `PinchScaleView` MUST keep its own scroll view as the screen's scroll view, so a large title keeps collapsing with it while two fingers scale its content. The app sets the new layout at the pinch's end through `numColumns` and the List's handle, which draws the rows at the new offset in the commit that changes the columns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-124` FR17, DEC-6                                                        | verify             |

- FR2 gap: the package spells `dividerInset` as `separatorInset`, on List and
  on `ListRowFrame`.
- FR2 gap: the package also offers `separatorColor` (`auto` or `border`),
  which picks the divider colour at each call site; FR5 takes it from the
  theme only.
- FR3 gap: under `bleed`, row content keeps the row's own inset from the
  host's padding edge, so in a host whose inset is larger than the row's it
  sits outside the host content line.
- FR3 gap: a BottomSheet's content area publishes no inset, so `outset` and
  `bleed` place rows as `padded` there.
- FR3 gap: under `bleed`, the first and last rows stay square; they meet a
  rounded host's corner only where the host clips its content, as Card does.
- FR6 gap: where `color.backgroundBody` sits too close to
  `color.backgroundSurface` in lightness, the package steps the grouped page
  darker than any theme value, so the card stands apart.

### Allowed variation

- **AV1 — Draw distance.** How many rows stay mounted past the viewport may
  change with the scroll speed and the platform, within FR9's bounds.
- **AV2 — Platform press.** Row press feedback is the platform's: a fill on
  iOS and the bounded ripple on Android, as Item draws it.

### Representative states

| State                                 | Required invariant                                                       | Allowed variation |
| ------------------------------------- | ------------------------------------------------------------------------ | ----------------- |
| children, no scroller around          | own scroller; only rows near the viewport mounted                        | AV1               |
| children, in a vertical `ScrollView`  | every row in flow; no scroller of its own                                | none              |
| data, own scroller, a long collection | a bounded set of rows mounted; one slot render per row entering          | AV1               |
| `edge` `outset` in a Card             | content on the host content line; paint reaches past it by the row inset | none              |
| `edge` `outset` or `bleed`, no host   | rows as `padded`                                                         | none              |
| `hasDividers`, `dividerInset` unset   | each row's line at its own bottom, inset per FR5's `auto`                | none              |
| `insetGrouped` on iOS                 | card at the system layout margin; 52 pt rows; no frame                   | none              |
| `insetGrouped` on Android             | card at the screen gutter; hairline frame on a faint surface             | none              |
| largest text size                     | rows and `rowMinHeight` grow with the text                               | none              |
| right-to-left                         | edges and divider insets mirror                                          | none              |

### Transformation and precedence order

- **ORD1 — Edge.** `edge`, else `outset` for `edgeCompensation="inline"`, else
  `padded`; `insetGrouped` uses `padded`.
- **ORD2 — Scroll owner.** A vertical scroller around the List draws it in
  flow; otherwise it is its own scroller (FR8).
- **ORD3 — Row source.** `data` with `renderItem`, else `children` (FR10).
- **ORD4 — Row height.** `rowMinHeight` raised to the touch target, else iOS
  `insetGrouped`'s 52 pt, else the density; each grown with the text size
  (FR7).

### Performance and resources

- **PR1 — Edge is layout.** `edge` adds no measurement, listener or render
  pass. A `text` or `auto` divider reads the text inset its row reports before
  paint, after the first layout of a measured start slot.
- **PR2 — Bounded rows.** As its own scroller, the mounted rows stay bounded
  however long the collection is, and scrolling moves slots without mounting
  rows.
- **PR3 — No JavaScript per scroll frame.** The scroll is the platform's; the
  List places a slot only when it changes rows. After a data change, rows in
  the draw distance but off screen keep their last render for one frame, so
  the input frame pays for the visible rows only.
- **PR4 — Unchanged rows stay drawn.** Rows are memoised on their item, index,
  `renderItem` and `extraData`, and a `ListItem` with unchanged props is not
  drawn again when its List or screen renders.

## Accessibility contract

- **AR1 — A list of rows.** The List is a list to VoiceOver and TalkBack. Its
  header reads first, as its own element; React Native has no relation that
  names the list by its header.
- **AR2 — One stop per row.** Every row is one screen-reader stop, and the
  list is no container stop that reads every row. A `ListItem` is one element;
  on Android an app's own row that is not a `ListItem` is framed as one
  TalkBack stop; on iOS such a row keeps its own elements.
- **AR3 — Recycled rows read in order.** Screen readers read the mounted rows
  in row order; a parked slot is off screen and hidden from assistive
  technology. While a screen reader runs, the row it focused keeps its slot
  through the page scroll the reader makes at the edge.
- **AR4 — Quiet.** The List announces nothing of its own when its rows, density
  or dividers change.
- **AR5 — Text size.** Rows, `table` rows and `rowMinHeight` grow with Dynamic
  Type and Android's font scale.

## Design relationships

| Anatomy or state      | Design requirement                                  | Representation authority                   | Hierarchy role | Component contract |
| --------------------- | --------------------------------------------------- | ------------------------------------------ | -------------- | ------------------ |
| Rows and dividers     | the platform's table cells and their inset dividers | prescribed by core; inset per the platform | supporting     | FR4, FR5           |
| Grouped card and page | the platform's inset grouped list                   | prescribed by the platform                 | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform control: none (`spec:AST-093` FR2). React Native has no system list
view: the List is a `ScrollView` that holds only the mounted rows, or a `View`
in flow, and its rows are Items. Guideline pages: Lists and tables, and
Accessibility in the Apple Human Interface Guidelines; Lists and Dividers in
Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): Item's density padding for each
density, `space.s0_5`, `space.s2`, `space.s4`, `space.s6`, `size.borderWidth`,
the border colour and `color.borderEmphasized`, `color.backgroundSurface` and
`color.backgroundBody` for the grouped card and page,
`radius.container`, and the text size.

### Native pieces

| Native piece                           | Record                  | What this record uses it for                                       |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `AstryxPinchScaleView`                 | `spec:AST-124` FR17     | the pinch around a data-mode List, through `PinchScaleView` (FR13) |
| `AstryxStackScreen`, `AstryxTabScreen` | `spec:AST-125` FR5, FR8 | the scroll target a screen's large title and tab bar follow (FR12) |

## Family and system relationships

- `component:List` owns the props, the edge treatments and the deprecated
  alias; this record states only what React Native adds or does differently.
- `component:ListItem` and `component:Item` own each row; a `ListItem` reads
  the list's density, dividers, divider inset, edge offset and minimum height.
  `ListRowFrame` gives a row drawn outside a List the same divider. Item owns
  the row's touch target and its swipe actions, whose native piece
  `spec:AST-124` FR6 owns.
- `architecture:container-padding` owns host padding; Card, Section and
  Dialog publish it on React Native; BottomSheet's gap is under FR3.
- `spec:AST-124` owns the pinch (FR17) and drag and drop; `ReorderableList`
  owns reordering.
- `spec:AST-125` owns the screen's scroll target that `scrollProps` names.

## Verification map

| Contract           | Verification                                                                                                 | Representative states                                                                                                                                                                                                     | Mutation or failure expectation                                                                                                                                                                                             | Audit section                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1, FR2           | Type tests of the exports against web's types; a contract drift test                                         | each prop; the five web props absent; each addition unset; a non-`ListItem` child                                                                                                                                         | a missing web prop, a different default, an accepted and ignored prop, or no development warning fails                                                                                                                      | `audit:react-native/List/api`      |
| FR3                | Unit tests of the edge offsets and row placement; Simulator and emulator captures                            | each `edge` in a Card, a Section, a Dialog and a BottomSheet at two paddings, and standalone; a host inset smaller and larger than the row inset; a bleeding list as a rounded host's first and last child; right-to-left | a row moved by the wrong amount, a header that moves, `flush` paint past the list's edge, row paint past the host's padding edge, `bleed` content off the host content line, or a square corner row in a rounded host fails | `audit:react-native/List/edge`     |
| FR4, FR7           | Unit tests of row spacing and minimum height; captures at the largest text size                              | each density; dividers on and off; a header and a footer; `rowMinHeight` below and above the touch target                                                                                                                 | a gap with dividers, a missing gap without them, a row under the touch target, or a minimum that does not grow with the text fails                                                                                          | `audit:react-native/List/rows`     |
| FR5                | Unit tests of each divider inset; captures in light and dark                                                 | each `dividerInset` with and without a leading glyph; each density; right-to-left                                                                                                                                         | a divider where the value draws none, a physical margin, or a line under the last row fails                                                                                                                                 | `audit:react-native/List/dividers` |
| FR6                | Unit tests of the grouped metrics; Simulator and emulator captures beside the system's grouped lists         | phone widths below and above 414 pt; Android on a faint and a strong surface; a page of three groups; a content style with horizontal padding                                                                             | a margin other than the system's on iOS, a frame on iOS, a doubled page edge, or no warning fails                                                                                                                           | `audit:react-native/List/grouped`  |
| FR8, FR9, PR2, PR3 | Unit tests of scroll ownership and windowing; a scroll benchmark on device builds                            | children and data in no scroller, a vertical and a horizontal scroller; 1,200 rows scrolled with and without row reuse; exact and measured heights                                                                        | a nested scroller, rows mounted past the bound, a mount per row while scrolling, or row state that follows a slot to another item fails                                                                                     | `audit:react-native/List/scroll`   |
| FR10, PR4          | Unit tests of row renders                                                                                    | an unchanged parent render; a changed `extraData`; a new `renderItem` each render; refresh and the end reached                                                                                                            | a row drawn again with nothing changed, a stale row after `extraData` changes, or `onEndReached` twice for one length fails                                                                                                 | `audit:react-native/List/data`     |
| FR11               | Unit tests of the handle on iOS and Android                                                                  | each method; a jump in the render that changes the columns; a jump past the end                                                                                                                                           | a frame of undrawn rows, an Android scroll above the top, or a handle in flow fails                                                                                                                                         | `audit:react-native/List/handle`   |
| FR12, FR13         | Unit tests with a screen's scroll props; Simulator checks of the large title over a List and through a pinch | the screen's props on a data-mode List; in flow; an Animated style; a pinch that changes the columns                                                                                                                      | a large title that stops collapsing, a lost refresh control, or scroll props applied in flow fails                                                                                                                          | `audit:react-native/List/screen`   |
| AR1–AR5            | VoiceOver and TalkBack checks on the Simulator, the emulator and devices; unit tests of row elements         | static and pressable rows; an app's own row on Android; a scroll by the reader at the edge; the largest text size                                                                                                         | a list read as one stop, a row split into stops, a parked slot that reads, or focus lost on a recycled row fails                                                                                                            | `audit:react-native/List/a11y`     |

## Decision log

### DEC-1 — Long collections are List's data mode

**Reference:** `component:react-native/List/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

A long or remote collection is the same List with `data` and `renderItem`, so
it keeps List's density, dividers, edge, grouped look and accessibility, and a
builder learns one list. The windowing that keeps it fast is internal to the
library and serves children mode too.

### DEC-2 — The scroller around a List decides who scrolls

**Reference:** `component:react-native/List/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

Inside a vertical scroller the List draws in flow, because a nested scroller of
the same direction cannot window when the outer one does the scrolling; with
no such scroller it owns its scroll. The context decides, so a builder sets no
mode, and a page that scrolls keeps one scroll.

### DEC-3 — Dividers inset per row by default

**Reference:** `component:react-native/List/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

With dividers and no `dividerInset`, a row with a leading glyph or start
content runs its divider from its text to its trailing content margin, as the
platform's tables do, and any other row insets it symmetrically at the text
margin, so a divider never reads as a one-sided gap in a rounded group. `full`
draws web's divider.

### DEC-4 — The grouped list owns the page edge

**Reference:** `component:react-native/List/DEC-4`
**Decider:** imdreamrunner, 2026-11-18

On iOS an `insetGrouped` List insets itself by the system layout margin, as the
platform's grouped lists do, and `ListGroupedPage` applies the page edge once
on every platform, so an app places grouped Lists full width and adds no
horizontal padding of its own.

## Open questions

- **OQ1 — Does React Native List offer `listStyle` and `start`?**
  (`human-api`) Options: offer both, with `ListItem` drawing web's dot, ring
  and number markers as the Swift `ListItem` does; or keep both web-only, so
  React Native lists draw no markers.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
