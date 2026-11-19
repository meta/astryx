---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/BottomSheet
platform_of: component:BottomSheet
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    interaction,
    motion,
    theming,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093]
---

# BottomSheet (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `BottomSheet` under its core name with core's `isOpen`, `onOpenChange`, `purpose`, `label`, `children`, `padding`, `height`, `snapPoints` and `hasScrim`. `height` takes the named budgets and `snapPoints` takes viewport fractions; `finalFocusRef` and `sheetId` stay in the web contract. It adds `header`, `footer`, `detentIndex`, `onDetentChange`, `onDismissAttempt`, `onDismissed` and `closeButton`, and the iOS contract adds `render` (`auto`, `system`, `drawn`). |
| Behavior                | With `render="auto"`, the default, iOS presents the content in the system sheet wherever its host exists, and elsewhere, Android included, Astryx draws the sheet in its own window. Both follow `purpose`: an `info` sheet closes on a swipe, a scrim tap, Android back or the VoiceOver escape; a `form` or `required` sheet springs back and reports the attempt. Sheets stack in open order, and a sheet that replaces the top one hands over in place.                                          |
| End-user impact         | A person gets the platform's own sheet on iOS, with its detents, grabber, material and swipe, and a sheet that moves the same way on Android. An `info` sheet always has a visible Close beside the grabber unless its content has its own way out. VoiceOver and TalkBack read the sheet's name first and stay inside it.                                                                                                                                                                           |
| Builder impact          | The same BottomSheet code runs on the web, iOS and Android. An app pins a search field or a title row with `header`, and actions with `footer`; reads and sets the resting stop with `detentIndex`; asks to discard a draft from `onDismissAttempt`; and presents the next surface from `onDismissed`.                                                                                                                                                                                               |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Review checks           | Reject a `render` value Android cannot honor, a theme-painted container on the system sheet, a dismissal a `form` or `required` sheet allows by gesture, a dismissal that reaches a covered sheet, two Close buttons for a screen reader, an `info` sheet with no visible way out besides gestures, a scrim per stacked sheet, a next presentation started before the sheet has left, or a visual prop on the sheet.                                                                                 |
| Governing rules         | `component:BottomSheet`; `family:overlay-dismissal`; `spec:AST-082` FR3, FR4, FR7, FR11 and DEC-2; `spec:AST-093` FR1–FR5; DEC-1 below.                                                                                                                                                                                                                                                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

BottomSheet on React Native is core's sheet on a phone: content that rises
from the bottom edge, rests at one or more heights, and leaves as its
`purpose` allows. On iOS it is the platform's own sheet wherever the
presentation host exists; elsewhere Astryx draws a sheet that moves the way the
system sheet does. In this record, "core" is `component:BottomSheet`, and the
record states only what React Native adds or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component)
- Controlled/uncontrolled behavior: controlled; `isOpen` and `onOpenChange`,
  and the resting stop through `detentIndex` and `onDetentChange` when the app
  sets it
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR4 gap: the iOS contract names the choice `presentation`, with the values
  `auto`, `native` and `drawn`, where this record has `render` with `system`,
  as `spec:AST-112` FR21 records.
- FR3 gap: the package also takes `hasCloseButton`, a boolean this record
  does not specify (DEC-1).
- FR8 gap: a dismissal its owner refuses does not wait at a peek stop while
  the owner asks (core FR21–FR24).
- FR11 gap: Astryx's sheet does not scroll a focused field above the keyboard
  in a fully open `tall` sheet.
- FR13 gap: after Astryx's sheet closes, focus returns only to a library press
  control (a button, an icon button, a toggle button or an item); another
  opener gets no focus back.

## Ownership boundary

**Owns**

- Which props React Native offers on each platform (FR1–FR4).
- What the system sheet and Astryx's sheet each do: presentation, stops,
  drags, dismissal, the Close button, stacking, the keyboard and focus
  (FR5–FR13).
- Base props and the theme values the sheet reads (FR14, FR15).
- How VoiceOver and TalkBack read and leave the sheet (AR1–AR6).

**Does not own / non-goals**

- The meaning of BottomSheet's props, its purposes and its stacking order —
  owned by `component:BottomSheet` and `family:overlay-dismissal`.
- `render` — owned by `spec:AST-112` FR21.
- The presentation host, its detents, events, stacking and keyboard moves, and
  the modal host — owned by `spec:AST-128`.
- The keyboard dock a footer rides — owned by `spec:AST-129`.
- The Close button's glass look — owned by `component:IconButton` and
  `spec:AST-123`.

## Public concepts

| Concept                | Closed values or states                   | Meaning                                                                                                                                                      | Availability by variant/orientation/state | Default                             | Owner                                | Stability    | Invalid-value behavior                        |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------- | ------------------------------------ | ------------ | --------------------------------------------- |
| rendering              | `auto`; `system`; `drawn`                 | who draws the sheet's container: `system`, the system sheet; `drawn`, Astryx's sheet; `auto`, the system sheet wherever its host exists, else Astryx's sheet | iOS contract                              | `auto`                              | `component:react-native/BottomSheet` | experimental | an unknown value is a type error              |
| height budget          | `hug`; `capped`; `tall`                   | core's named budgets (FR2)                                                                                                                                   | always                                    | `capped`                            | `component:BottomSheet`              | experimental | another value is a type error                 |
| snap point             | a viewport fraction above 0 and at most 1 | an extra stop, as a share of the window's height (FR2)                                                                                                       | always                                    | none                                | `component:react-native/BottomSheet` | experimental | a value outside the range is ignored          |
| stop index             | an integer, 0 the tallest                 | `detentIndex`: the stop the sheet rests at, tallest first (FR3)                                                                                              | always                                    | the first snap point's stop, else 0 | `component:react-native/BottomSheet` | experimental | an index past the last stop rests at the last |
| Close button           | `auto`; `hidden`; `own`                   | `closeButton`: whether the library draws Close, keeps it for screen readers only, or adds none (FR9)                                                         | always                                    | `auto`                              | `component:react-native/BottomSheet` | experimental | an unknown value is a type error              |
| dismiss attempt reason | `swipe`; `scrim`; `escape`; `back`        | how the person tried to dismiss a sheet its purpose keeps open (FR8)                                                                                         | `form` and `required` sheets              | —                                   | `component:react-native/BottomSheet` | experimental | none                                          |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                                        | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native MUST export the component as `BottomSheet`, its name on every platform, and keep core's `isOpen`, `onOpenChange`, `purpose`, `label`, `children`, `padding`, `height`, `snapPoints` and `hasScrim` with core's meanings and defaults, except for the forms FR2 narrows (`spec:AST-082` FR3). It takes no `ref`; its base props are `id` and `isHidden` (FR14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:BottomSheet`; `spec:AST-082` FR3, FR7                                             | settled            |
| FR2  | React Native MUST offer the portable forms of core's props and leave the rest to the web contract (`spec:AST-082` FR3, FR4). `height` takes `hug`, `capped` and `tall`, as a share of the window's height; a number or a CSS length stays web. `snapPoints` takes viewport fractions above 0 and at most 1; core's `'<n>%'` and `'<n>px'` strings stay web, and a fraction outside the range is ignored. `finalFocusRef` stays web, since its value is a DOM element. `sheetId` and `BottomSheetSwitcher`, which core deprecates, are not offered: each step of a flow is its own `BottomSheet` with `isOpen`, and FR10's replace handoff joins them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `spec:AST-082` FR3, FR4; `component:BottomSheet`                                             | settled            |
| FR3  | React Native MUST add these props on iOS and Android. `header` is pinned above the scrolling body, and a vertical drag on it moves the sheet as the grabber does. `footer` is pinned below the body, lays its parts out as a row, and takes the bottom safe-area inset. `detentIndex` is the stop the sheet rests at, as an index into its stops tallest first (0 is the full `height`, then each snap point, taller first; stops a few points apart count as one): the sheet opens there and moves when it changes, and without it the sheet opens at its first snap point's stop, else at its full height. `onDetentChange(index)` reports a stop the person chose with a drag, a fling or a screen reader's adjust, never one `detentIndex` set. `onDismissAttempt({reason})` reports a dismissal the sheet's purpose kept from happening (FR8). `onDismissed()` reports, once, that the sheet has left the screen, whatever closed it; it does not run on unmount, while the sheet is hidden, or while a replacing sheet keeps it beneath. `closeButton` chooses the Close button (FR9, DEC-1). Core keeps the stop internal, pins a sheet's actions in each sheet's own markup, and has no report after a close; on a phone, an app restores a stop, asks before discarding a draft, and opens a system picker only after the sheet has gone. | `component:BottomSheet`; `spec:AST-128` FR6, FR7                                             | verify             |
| FR4  | The iOS contract MUST add `render`, which chooses who draws the sheet's container (`spec:AST-112` FR21). `system` is the system sheet, presented by the presentation host (`spec:AST-128` FR5, FR6); `drawn` is Astryx's sheet (FR6); `auto`, the default, is the system sheet wherever the host exists and Astryx's sheet elsewhere, silently, and `system` with no host draws Astryx's sheet with one development warning. The Android contract has no `render`: Android has no system sheet host, so the sheet is always Astryx's there, and a choice Android could not honor is not offered (`spec:AST-082` FR3; `spec:AST-128` records the Android sheet as a `spec:AST-082` FR11 gap).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-112` FR21; `spec:AST-128` FR1, FR5, FR14; `spec:AST-082` FR3, FR11                 | human decision     |
| FR5  | The system sheet MUST present the content in UISheetPresentationController (`spec:AST-128` FR5, FR6). UIKit draws the whole container: its material (Liquid Glass at partial heights), corner radius, grabber, dimming, spring, rubber band, scroll-to-expand and the card effect behind a full-height sheet; the theme draws only the content. `tall` is the system's large stop, `capped` the same budget Astryx's sheet uses, `hug` the content's measured height (the sheet rises once it is measured), and snap points the same fractions as Astryx's sheet. UIKit moves the sheet for the keyboard (`spec:AST-128` FR10): a `hug` sheet rises whole, a `capped` or snapped sheet grows to the large stop, and a `tall` sheet stays; only a sheet whose bottom edge stays on the window's bottom edge insets its scroll content for the keyboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-128` FR5, FR6, FR10, DEC-1                                                         | verify             |
| FR6  | Astryx's sheet MUST present a sheet with a scrim in a modal window that holds the scrim and the panel: on iOS through the modal host, so two drawn sheets can be open at once (`spec:AST-128` FR11), and on Android in a window of its own, where Android back is its close request. A sheet without a scrim (`hasScrim={false}`) presents its panel in the nearest layer above the screen, and the page behind stays interactive. A modal sheet's window holds its own layer, so a menu, a picker or a tooltip opened inside it floats over the sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-128` FR11; `component:BottomSheet` FR11                                            | verify             |
| FR7  | Astryx's sheet MUST move as the system sheet does (`spec:AST-093` FR3). It rises and settles on a critically damped spring and the scrim follows its position. A drag on the grabber or the header moves it. A vertical drag on the body moves the sheet while the sheet owns body drags: below its top stop, and at its top stop while the content is scrolled to its top. Dragged up, the sheet rises to its top stop and then the content scrolls. A release settles on a stop from its projected position and velocity (core FR19). A pull past the top stop stretches on a rubber band (core FR18), and a pull below the lowest stop of a sheet its purpose keeps open stretches on the same rubber band, so the sheet shows it heard the pull without closing. Under Reduce Motion the sheet fades in and out, and a settle lands at once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:BottomSheet` FR18, FR19; `spec:AST-093` FR3                                       | verify             |
| FR8  | Dismissal MUST follow `purpose` and reach only the top sheet of a stack (core FR7; `family:overlay-dismissal`). An `info` sheet closes on a swipe down, a scrim tap, Android back and the VoiceOver escape, through `onOpenChange(false)`. A `form` sheet closes on Android back and the VoiceOver escape, the counterparts of core's Escape, and blocks the swipe and the scrim tap; with `onDismissAttempt`, back and the escape become attempts too, so the app's discard question runs first. A `required` sheet closes on none of them. Each blocked dismissal springs back and calls `onDismissAttempt` with its reason: `swipe`, `scrim`, `escape` or `back`; the system sheet reports `swipe` and `escape`, the two the presentation host reports (`spec:AST-128` FR7). A dismissal its owner refuses rests as core FR21–FR24 state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `component:BottomSheet` FR7, FR21–FR24; `family:overlay-dismissal`; `spec:AST-128` FR7, FR12 | verify             |
| FR9  | With `closeButton="auto"`, an `info` sheet without a `header` MUST draw a Close button at its top trailing corner, a 44-point circle concentric with the sheet's corner that mirrors in right-to-left, as the system sheet's own close button sits; every other `info` sheet and every `form` sheet keeps Close for screen readers only, and a `required` sheet has none. `hidden` keeps Close for screen readers only, for content that ends in its own way out such as a Cancel row. `own` adds no Close at all, for a header or content that has its own Close, so a screen reader hears one. Close calls `onOpenChange(false)`. A swipe and a scrim tap are gestures, so an `info` sheet keeps a visible way out that is not one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `family:overlay-dismissal`; `spec:AST-093` FR3; `component:IconButton`                       | verify             |
| FR10 | Sheets with a scrim MUST stack in open order, drawn and system alike, as core states (core FR5, FR6): one scrim, the bottom sheet's, and covered sheets that keep their state, take no input, and are hidden from assistive technology. A covered drawn sheet recedes as core's does and also dims, as UIKit dims a covered sheet; a covered system sheet is UIKit's (`spec:AST-128` FR6, FR8). When exactly one sheet closes and one opens in the same update and the closing sheet was on top, the opening sheet replaces it (core FR10): it rises above the closing sheet, which keeps its place and the scrim, then fades, and leaves with it when the flow closes; focus returns to the flow's opener. React Native has no element containment to tell where the close came from, so every such update pairs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:BottomSheet` FR5, FR6, FR10; `spec:AST-128` FR6, FR8                              | verify             |
| FR11 | In Astryx's sheet, the keyboard MUST NOT cover the focused content. A `tall` sheet with a `footer` keeps its place, going to its top stop while the keyboard shows and back when it hides, and its footer rides the keyboard while the body shrinks above it, following an interactive dismissal through the keyboard dock (`spec:AST-129` FR6, FR7). Any other sheet rises whole by the part of the window the keyboard covers. A fully open `tall` sheet also scrolls each focused field above the keyboard, as core's does. On iOS the sheet moves on the keyboard's own duration and curve; on Android it moves when the keyboard's change ends, since Android sends no curve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:BottomSheet` `height`; `spec:AST-129` FR6, FR7; `spec:AST-128` FR10               | verify             |
| FR12 | A system presentation asked for right after a sheet closes (a file picker from one of its rows) MUST come up once the sheet has left the screen, and `onDismissed` marks that moment for the app's own next surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-128` FR7, FR8                                                                      | verify             |
| FR13 | Opening a sheet MUST move VoiceOver and TalkBack focus into it, onto its name, and a stacked or replacing sheet's name is read as it comes up. After the sheet has left, focus returns to the control that opened it (core FR9). The system sheet leaves both to the platform (`spec:AST-128` FR12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `component:BottomSheet` FR9; `spec:AST-128` FR12                                             | verify             |
| FR14 | The shared base props MUST attach to the sheet's container (`spec:AST-082` FR7): `id` is its test and native identifier, and `isHidden` removes an open sheet from the screen and the accessibility tree without closing it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-082` FR7                                                                           | verify             |
| FR15 | The sheet MUST take no visual prop (`spec:AST-082` DEC-2). Astryx's sheet reads its surface, corner radius, scrim, shadow and content inset from the theme; the system sheet takes the theme's light or dark mode, and the theme reaches only its content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-082` DEC-2; `spec:AST-093` FR4; `spec:AST-128` FR9                                 | verify             |

### Allowed variation

- **AV1 — The system sheet.** The system sheet's container, motion, covered
  look and keyboard moves are UIKit's own and may change with each OS release;
  a covered partial-height system sheet may move out of view.
- **AV2 — Lower stops move the sheet.** At a lower stop Astryx's sheet moves
  down, as the system sheet does, instead of resizing its scroll area; content
  below the visible part scrolls into view once the sheet is back at its top
  stop.
- **AV3 — Theme paint.** Themes may restyle Astryx's sheet without changing
  behavior.

### Representative states

| State                                        | Required invariant                                                                | Allowed variation         |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `render` unset on iOS, the host present      | the system sheet; the theme draws only the content                                | the system's container    |
| Android                                      | Astryx's sheet in its own window; back is its close request                       | theme paint               |
| `info`, no `header`                          | a drawn Close at the top trailing corner                                          | none                      |
| `form`, a swipe past the dismiss line        | the sheet springs back; `onDismissAttempt({reason: 'swipe'})`                     | the system's rubber band  |
| `form`, Android back with `onDismissAttempt` | an attempt with `back`; the sheet stays open                                      | none                      |
| two scrim sheets                             | one scrim; the covered sheet recedes and dims, takes no input                     | the system's covered look |
| one closes, one opens in one update          | the new sheet replaces the top one; focus returns to the flow's opener at the end | none                      |
| `tall` sheet with a `footer`, keyboard up    | the sheet holds its place; the footer rides the keyboard                          | none                      |
| `hasScrim={false}`                           | the page behind stays interactive                                                 | none                      |
| a picker asked for from a closing sheet      | it comes up after the sheet has left                                              | none                      |

### Transformation and precedence order

- **ORD1 — Rendering.** On iOS, `render`; `auto` resolves to the system sheet
  where its host exists, else to Astryx's sheet. On Android, Astryx's sheet.
- **ORD2 — Resting stop.** `detentIndex`, else the first snap point's stop,
  else the full `height`.
- **ORD3 — Close button.** `closeButton`, then `purpose` and `header` under
  `auto` (FR9).
- **ORD4 — Dismissal.** The top sheet only; then `purpose`; then
  `onDismissAttempt` for a blocked or attempted dismissal (FR8).

### Performance and resources

- **PR1 — Motion runs off the JavaScript thread where the platform allows.**
  The system sheet's drags, springs and detent changes run in UIKit, and
  JavaScript hears discrete events only (`spec:AST-128` FR13). Astryx's sheet
  springs on the native animation driver.
- **PR2 — One window per stack on iOS.** Astryx's drawn sheets of one tree
  share one modal window on iOS, so stacked sheets never ask UIKit for a
  second sibling presentation.

## Accessibility contract

- **AR1 — Name.** On iOS, the sheet's `label` is a heading element laid over
  the grabber's strip, in both sheets; on Android it is the panel's label.
- **AR2 — Modal.** While a modal sheet is open, VoiceOver and TalkBack stay
  inside it and ignore what lies under it; covered and replaced sheets are
  hidden from them (FR10).
- **AR3 — Escape and back.** The VoiceOver escape and Android back reach only
  the top sheet and act as `purpose` allows (FR8).
- **AR4 — One Close.** A screen reader hears exactly one Close, the library's
  or the content's own (FR9).
- **AR5 — Stops.** A screen reader's adjust moves the sheet between its stops,
  and `onDetentChange` reports the stop chosen (FR3).
- **AR6 — Reduced motion and text size.** Under Reduce Motion, Astryx's sheet
  fades and a covered sheet only dims; the system sheet follows the system.
  The Close circle and its glyph grow with the text size.

## Design relationships

| Anatomy or state  | Design requirement                                            | Representation authority   | Hierarchy role | Component contract |
| ----------------- | ------------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Sheet container   | the platform's sheet, or Astryx's panel that moves as it does | prescribed by the platform | prominent      | FR5–FR7            |
| Grabber and name  | a grabber strip with the sheet's name as a heading over it    | prescribed by the platform | supporting     | AR1                |
| Close             | a 44-point circle at the top trailing corner                  | prescribed by the platform | supporting     | FR9                |
| Header and footer | pinned content above and below the scrolling body             | human-selected             | supporting     | FR3, FR11          |
| Scrim             | one scrim per stack, tied to the bottom sheet's position      | current source             | supporting     | FR7, FR10          |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UISheetPresentationController on iOS,
through the presentation host. Android has no system sheet host, so Astryx's
sheet draws there (FR4). Guideline pages: Sheets, Modality and Accessibility
(Dynamic Type, Reduce Motion) in the Apple Human Interface Guidelines
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): in Astryx's sheet, the page and
surface colours, `radius.page`, the scrim colour, the sheet's shadow, the
`space` steps of `padding` and the theme's bottom-sheet padding, and the
motion tokens of its fades; the Close button reads `component:IconButton`'s
values. In the system sheet, the theme's light or dark mode and the content's
own values.

### Native pieces

| Native piece             | Record                             | What this record uses it for                                                                       |
| ------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `AstryxPresentationHost` | `spec:AST-128` FR5–FR10, FR12–FR14 | the system sheet, its stops, blocked dismissals, stacking and keyboard moves (FR4, FR5, FR8, FR10) |
| `AstryxModalHost`        | `spec:AST-128` FR11                | Astryx's drawn sheets on iOS, so two can be open at once (FR6)                                     |
| `AstryxKeyboardDock`     | `spec:AST-129` FR6, FR7            | a `tall` sheet's footer riding the keyboard and an interactive dismissal (FR11)                    |

## Family and system relationships

- `component:BottomSheet` owns the props, purposes, stacking order and the
  replace handoff; this record states only what React Native adds or does
  differently.
- `family:overlay-dismissal` owns which dismissals each purpose allows.
- `spec:AST-112` FR21 owns `render`; `spec:AST-128` owns the presentation and
  modal hosts; `spec:AST-129` owns the keyboard dock.

## Verification map

| Contract        | Verification                                                                                                                     | Representative states                                                                                                                                                  | Mutation or failure expectation                                                                                                                                            | Audit section                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| FR1–FR4         | Type tests of the shared, iOS and Android views against the generated contracts; a contract drift test                           | each core prop; a CSS-length `height`; a percentage snap point; `finalFocusRef`; `sheetId`; `render` on Android                                                        | a web-contract form accepted, `render` accepted on Android, or a renamed prop fails                                                                                        | `audit:react-native/BottomSheet/api`          |
| FR3, ORD2, AR5  | Unit tests through the package's testing doubles                                                                                 | `detentIndex` set and unset; a drag to another stop; stops that merge; a screen reader's adjust; `onDismissed` after a swipe, Close and `isOpen` false; a hidden sheet | `onDetentChange` for a stop `detentIndex` set, a stop index off by one, or `onDismissed` before the sheet has left or more than once fails                                 | `audit:react-native/BottomSheet/stops`        |
| FR4, FR5, ORD1  | Unit tests of the rendering choice; Simulator checks of the system sheet                                                         | each `render`; no host; each `height`; snap points; the keyboard over each height                                                                                      | a theme-painted container, a `hug` sheet that rises before it is measured, or a missing development warning fails                                                          | `audit:react-native/BottomSheet/system-sheet` |
| FR6, FR7        | Unit tests of the drawn sheet; Simulator, emulator and device checks with UI-thread frame checks, with and without Reduce Motion | a scrim sheet; a no-scrim sheet; a drag on the grabber, the header and the body; a fling; a pull past the top; Android back                                            | a second sibling window refused on iOS, a body drag that scrolls while the sheet owns it, a release that lands off its projected stop, or travel under Reduce Motion fails | `audit:react-native/BottomSheet/drawn-sheet`  |
| FR8, ORD4, AR3  | Unit tests of each purpose and dismissal path through the doubles; VoiceOver and TalkBack escape checks                          | each purpose; swipe, scrim, back and escape; with and without `onDismissAttempt`; a covered sheet                                                                      | a gesture that closes a `form` or `required` sheet, a dismissal that reaches a covered sheet, or a blocked attempt without its reason fails                                | `audit:react-native/BottomSheet/dismissal`    |
| FR9, ORD3, AR4  | Unit tests of the Close rules; VoiceOver and TalkBack checks; right-to-left captures                                             | each `closeButton` with each purpose, with and without a `header`                                                                                                      | a header-less `info` sheet without a drawn Close, two Close buttons for a screen reader, or a Close on a `required` sheet fails                                            | `audit:react-native/BottomSheet/close`        |
| FR10, AR2       | Stack unit tests through the doubles; Simulator and emulator checks                                                              | two and three stacked sheets; a replace; Back out of a replace; closing the flow                                                                                       | a scrim per level, input or screen-reader access to a covered sheet, or focus not returned to the flow's opener fails                                                      | `audit:react-native/BottomSheet/stacking`     |
| FR11            | Simulator, emulator and device keyboard checks                                                                                   | a `tall` sheet with a footer at its top and a lower stop; a `capped` sheet; an interactive dismissal on iOS                                                            | focused content under the keyboard, a footer behind the keyboard, or a sheet that does not return when the keyboard hides fails                                            | `audit:react-native/BottomSheet/keyboard`     |
| FR12, FR13      | Unit tests through the doubles; VoiceOver and TalkBack checks                                                                    | a picker asked for from a closing sheet; opening and closing from a button and from another opener                                                                     | a presentation started before the sheet has left, focus not moved to the name, or focus not returned to the opener fails                                                   | `audit:react-native/BottomSheet/focus`        |
| FR14, FR15, AR6 | Unit tests of base props and theme values; captures in each fixture theme, light and dark                                        | `id`; `isHidden` while open; a theme override; largest text size                                                                                                       | an identifier off the container, a hidden sheet that closes, a visual prop accepted, or a Close that does not grow with text fails                                         | `audit:react-native/BottomSheet/base`         |

## Decision log

FR2, FR3, FR4 and FR9 state the reason for each prop React Native narrows,
adds or leaves out.

### DEC-1 — `closeButton` is the sheet's one Close choice

**Reference:** `component:react-native/BottomSheet/DEC-1`
**Decider:** imdreamrunner, 2026-11-09

The sheet's Close button is one three-way choice, `closeButton` (`auto`,
`hidden`, `own`). A boolean could say only whether the library draws Close; it
could not say that the sheet's header or content carries its own Close, so a
screen reader heard two. The package is canary-only, and its public entries
may change in any canary (`spec:AST-112` FR5), so this record specifies
`closeButton` alone and carries no compatibility form. The package's
`hasCloseButton` is an FR3 gap, and no deprecation applies.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
