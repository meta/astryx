---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-126
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

# React Native platform: Controls system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A developer who builds a notes app or a chat screen with Astryx writes
`<Button>`, `<Slider>`, `<TextInput>`, `<SegmentedControl>`, `<DateInput>` or
`<PasteButton>` once. Where the operating system has its own control, the
person using the app gets that control: UIKit's button, slider, text field,
segmented control, date picker and paste control on iOS, Material 3's button,
text field and picker dialogs on Android. The component's API, words,
states and accessibility stay the same, the theme's accent and mode reach the
system control, and where the system has no equivalent the component draws its
own Astryx control. This record owns the native controls that make this
possible: their native contracts, where each system control exists and which
shapes it shows, and how they behave.

The controls are part of the platform layer of `spec:AST-112` and follow the
shared platform rules of `spec:AST-140`: registration (`spec:AST-140/FR1`),
the result vocabulary (`spec:AST-140/FR3`), additive evolution
(`spec:AST-140/FR5`) and threading (`spec:AST-140/FR6`). They follow
`spec:AST-112`'s capability shape (`spec:AST-112/FR7`), its rule that the
platform speaks Astryx's design language for native controls
(`spec:AST-112/FR9`). They serve the native-first rule of
`spec:AST-082/FR11`. In the library components, a control's native-only
visuals come from the theme (FR11), so one theme styles every control the same
way (`spec:AST-082/DEC-2`).

## Why this exists

Each native control is a presentation of an Astryx component: the component's
API, with the theme reaching the system control (FR11), only the platform SDKs
and React Native as required dependencies (`spec:AST-082/FR13`). Per piece:

- `AstryxNativeButton`: Astryx's variants, sizes, busy state and theme reach
  UIButton.Configuration and Material 3's
  button.
- `AstryxNativeSlider`: a throttled value with a separate commit, and a
  controlled value (FR4, FR9). Beyond that the gap is small (OQ1).
- `AstryxNativeTextField`: the system's box around React Native's `TextInput`
  editing (OQ1).
- `AstryxSegmentedControl`: titles that follow Dynamic Type, and the drawn
  control before a title is cut (FR6).
- `AstryxDatePickerView` and `AstryxDatePicker`: calendar dates as ISO wall-clock
  strings (DEC-4), Material 3's date range dialog, and results that always
  resolve (`spec:AST-140/FR3`).
- `AstryxPasteControl`: PasteButton draws the system control with its own API
  (OQ1).

## Who uses it

| Native piece             | Kind                                       | Astryx components that use it                                                                                 | What a person sees                                                                                                   |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AstryxNativeButton`     | native component (Fabric Native Component) | `Button`, in the shapes the system button shows (FR2)                                                         | The system button: UIButton.Configuration on iOS, a Material 3 button on Android                                     |
| `AstryxNativeSlider`     | native component (Fabric Native Component) | `Slider`; `MediaScrubber`, which asks for it through `Slider`                                                 | UISlider on iOS; the drawn Astryx slider on Android                                                                  |
| `AstryxNativeTextField`  | native component (Fabric Native Component) | `TextInput`, in the shapes the system box shows (FR2)                                                         | The system text box inside Astryx's label, description and status                                                    |
| `AstryxSegmentedControl` | native component (Fabric Native Component) | `SegmentedControl`, in the shapes it shows (FR2)                                                              | UISegmentedControl on iOS; the drawn Astryx segments on Android and at large text sizes                              |
| `AstryxDatePickerView`   | native component (Fabric Native Component) | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on iOS when `presentation` resolves to native     | UIDatePicker's compact pill in the field, or the inline calendar or wheels in the library's sheet                    |
| `AstryxDatePicker`       | native module (Turbo Native Module)        | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on Android when `presentation` resolves to native | The Astryx field, which opens Material 3's date, date range or time dialog                                           |
| `AstryxPasteControl`     | native component (Fabric Native Component) | `PasteButton` on iOS 16 and later, in an app's own runtime                                                    | The system paste control, which pastes with no permission prompt; elsewhere the library Button with the word "Paste" |

`SearchField`, `TextArea`, `NumberInput` and the other text-entry components
edit through React Native's `TextInput` directly.

## Non-goals

- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The controls link by default and stay internal.** The native
  controls and the gesture views of `spec:AST-124` are part of the default set of
  `spec:AST-112/FR3`. They are internal implementation behind the library's
  components (`spec:AST-112/FR5`): `./controls` exports the components, and
  the native views stay behind them. Each
  native piece has an availability probe. Where it answers false (the app opted
  out, an older binary, or the OS has no equivalent), the component draws its
  Astryx control (FR14).
- **FR2 — Where each system control exists and what it shows.**
  - A host exists when the probe of FR1 answers true and the OS has an
    equivalent: Button and TextInput on iOS and Android; Slider,
    SegmentedControl and the date view on iOS; the date dialogs on Android;
    and PasteButton's system paste control wherever the OS has one (FR8).
  - The system controls do not show these shapes, and the component draws its
    own control for them: Button as a toggle, with `surface="glass"`, inside a
    connected group, or with an icon on Android; TextInput inside an
    `InputGroup`, or with a start icon on Android; Slider vertical, with marks,
    or with a disabled reason, and with the tooltip value on iOS;
    SegmentedControl with a disabled reason, with a segment that shows both an
    icon and a label, at large text sizes (AX1 and up), or once the control's
    fitting width exceeds its room (DEC-2). An icon stays visible whichever
    control draws it.
  - A move between the system control and the component's own control keeps
    the value. A text field that is focused when it moves loses focus, and
    `onBlur` runs.
  - FR2 gap: `Switch`'s system presentation is React Native's own `Switch`,
    apart from this group's appearance mapping (FR11) and contract baseline
    (FR15); see OQ6.
- **FR3 — Native button.** `AstryxNativeButton` takes the title, Astryx's
  `variant` (`primary`, `secondary`, `ghost`, `destructive`) and `size` (`sm`,
  `md`, `lg`), an iOS-only SF Symbol
  (`systemImage`), loading and enabled states, the appearance of FR11, the press
  slop and the accessibility props of FR12. It reports each completed press and
  its fitting size.
  - iOS draws UIButton with UIButton.Configuration: filled, tinted or plain by
    variant, the destructive role in the system red. `systemImage` is drawn
    before the title; the library resolves its icon names to SF Symbols.
  - Android draws a Material 3 button: filled, tonal or text by variant, the
    theme's error colour for `destructive`, with the title alone.
  - `systemImage` is an iOS-only member and says so in its tag
    (`spec:AST-140/FR1`). On Android, a set `systemImage` gives one
    development warning.
  - The system control decides when a touch is a press. On iOS a press is a
    touch that stays within the drawn Button's press distance. Every completed
    activation reaches `Button`'s `onClick` once.
- **FR4 — Native slider.** `AstryxNativeSlider` takes the value, its minimum
  and maximum, `step` (0: continuous), `changeInterval` (default 100 ms), the
  enabled state, `layoutDirection`, the appearance of FR11 and the
  accessibility props of FR12. It reports `onValueChange`, `onValueCommit`,
  `onSlidingChange` and its fitting size, and takes a `restoreValue` command
  (FR9). `Slider` hears the first two as its `onChange` and `onChangeEnd`.
  - The thumb belongs to the UI thread (FR13). `onValueChange` reports the
    value at most once per `changeInterval` while the thumb moves, and the last
    value of a move before the commit. `onValueCommit` reports the value when
    the finger
    lifts, when the touch is cancelled, and after each accessibility increment
    or decrement. `onSlidingChange` reports `true` when a drag starts and `false`
    when it ends.
  - `step` snaps the thumb as it moves. During a drag the finger controls the
    thumb; a new `value` from the caller takes effect when the drag ends.
  - `layoutDirection: 'rtl'` mirrors the slider: the minimum is at the right edge and the track
    fills from the right.
- **FR5 — Native text field.** `AstryxNativeTextField` takes the text with
  its event count (FR9), the placeholder, `size`, secure entry, the keyboard,
  content type and return key, capitalization, autocorrection, spell checking,
  a clear button, an iOS-only start SF Symbol (`startSystemImage`), loading,
  editable and enabled states, `status` (`error`, `warning`, `success`),
  autofocus, an iOS-only filled box (`fieldStyle`, `fill`, `cornerRadius`,
  `insetX`), the appearance of FR11 and the accessibility props of FR12. It
  reports text changes, focus changes, the return key and its fitting size,
  and takes `focus` and `blur` commands.
  - iOS draws a UITextField in the system's rounded style; `filled` draws the
    theme's fill and element radius and its horizontal inset, with a border in
    the status colour while a status is set and in the accent while focused. `startSystemImage` is drawn at the start of the
    box.
  - Android draws a Material 3 outlined TextInputLayout with a
    TextInputEditText in the outlined style; spelling suggestions follow
    `autoCorrect`.
  - `startSystemImage`, `fieldStyle`, `fill`, `cornerRadius` and `insetX` are
    iOS-only members and say so in their tags
    (`spec:AST-140/FR1`). On Android, each one set gives one
    development warning.
  - `status` colours the box's border, and for `error` the caret. The message
    stays the library's, below the box.
  - `TextInput`'s handle answers `focus()` and `blur()` through the view's
    commands, and `isFocused()` follows the field's focus events.
- **FR6 — Native segmented control.** `AstryxSegmentedControl` takes
  `segments` (each a title, whether the title is hidden, an SF Symbol, an
  enabled state and an accessibility label), `selectedIndex` (-1: none),
  `layout` (`hug`, `fill`), `size`, the enabled state, the appearance of FR11
  and the group's accessibility label. It reports each tapped index and its
  fitting size, and takes a `restoreSelectedIndex` command (FR9).
  - iOS draws UISegmentedControl. A segment draws either its title or, with
    its title hidden, its SF Symbol.
  - `hug` sizes each segment to its content; `fill` gives every segment the
    same width.
  - Titles scale with Dynamic Type, and the control grows with them.
    The control's fitting size (FR10) tells the library when to draw its
    own segments when the titles do not fit (FR2). Every title shows in full.
  - The selected segment keeps UIKit's fill and title colours unless the theme
    paints them (FR11).
  - On Android, `SegmentedControl` draws its own segments (OQ2).
- **FR7 — Native date pickers.** Values are ISO wall-clock strings in the
  mode's shape (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`), read and written
  through the Gregorian calendar in the device's time zone, so a date stays on
  its calendar day (DEC-4); `''` means no value.
  - iOS: the date picker view is one UIDatePicker (`compact`, `inline`,
    `wheels`) or a `pill` drawn like the compact picker. With a value and
    `compact`, the field row shows UIDatePicker's compact pill with its own
    popover. Otherwise the pill opens the library's sheet: the inline calendar
    or a time list, or the wheels, with a Cancel button at the start and a Done
    button at the end; only Done changes the value. A range opens a sheet with Starts and Ends rows that bound each
    other. The view takes the locale, first weekday, minute interval, hour
    cycle, bounds, and the appearance props of FR11.
  - Android: `openDate`, `openDateRange` and `openTime` show Material 3's date,
    date range and time dialogs over the calling surface's activity (a
    request's `rootTag`, else the activity in front). Every option has a
    default: `openDate({})` opens on today's date with Material's button
    labels. A `dateTime` field
    is two dialogs, date then time; dismissing either dialog leaves the value
    unchanged.
  - A dialog call resolves the picked value, `cancelled` when the person backs
    out, `unavailable` when no dialog can show at that moment (no activity, or one
    already showing), `invalid-value` when the dialog returns none, `not-linked` or
    `no-module` when the module is absent, or `error`. It always resolves. A field
    shows one dialog at a time.
  - The date component reports every failure other than `cancelled`, and a
    development build warns, so a failed open is always visible to the caller.
  - The library plays its `select` haptic when a pick commits from a surface
    that played no system feedback (the compact pill's calendar, the inline
    calendar, the dialogs). The wheels give their own system feedback.
- **FR8 — System paste control.** `AstryxPasteControl` takes the accepted
  types (a subset of `text`, `url`, `image`; default `text`), the enabled
  state, foreground and background tints, `cornerRadius` (negative: the system
  capsule), `displayMode` (`iconAndLabel`, `label`), the appearance of FR11 and
  an accessibility hint. It reports each paste and its fitting size.
  - iOS 16 and later draw UIPasteControl. A tap on it grants access to the
    pasteboard for that one paste, so iOS asks no paste question.
  - Each paste reports one value, and PasteButton's `onPaste` receives it, in
    this order of preference among the accepted kinds: `{type: 'url', url}`,
    `{type: 'image', uri, width, height}`, `{type: 'text', text}`. An image
    arrives as a PNG file in the app's temporary folder. The file can disappear
    at the app's next launch, so an app that keeps the image copies it. The paste
    reaches JavaScript only through this event (DEC-5).
  - The system enables the control only while the pasteboard holds an accepted
    kind. Its words and glyph are always the system's.
  - On Android and iOS before 16, PasteButton draws the library Button with the
    word "Paste", which reads the clipboard on the tap.
- **FR9 — A controlled value shows the person's change and keeps the
  caller's truth.** The system control
  shows the person's change at once, and the caller's value stays the truth.
  - Slider: when the caller keeps its `value` after a commit, the thumb returns
    to the caller's value (the view's `restoreValue` command).
  - SegmentedControl: when the caller keeps its `selectedIndex` after a tap,
    the control selects the caller's segment again (`restoreSelectedIndex`).
  - TextField: each change event carries a count, and a `text` from JavaScript
    takes effect only with the latest count JavaScript has seen
    (`mostRecentEventCount`), so the latest keystroke always stands.
    This is React Native's own `TextInput` protocol.
- **FR10 — A control sizes itself.** Every control reports its fitting size
  with `onIntrinsicSize` whenever its content, size, text size or style
  changes, and takes that size in the layout.
  - Before the first report, the view takes the platform control's height for
    its size at the default text size, scaled by the font scale, and an
    estimated width. At the default text size the first frame already has the
    final size, so a parent that measures twice sees no jump.
  - A button drawn again with the same content has its final size from its
    first frame.
  - A full-width Button and a SegmentedControl with `layout: 'fill'` keep the
    width their layout gives them and take only the height.
  - The paste control's fitting size is also its minimum, whatever the caller
    styles: UIKit lays out a paste control at its fitting size or larger. A report
    counts only for the `displayMode` it was measured for.
  - The date view reports its content size with `onPickerSize`.
- **FR11 — The theme reaches the control.** A control's `appearance` carries
  the mode (`light`, `dark`; `''`: the system's), the theme's name, the accent
  and the element radius, where the control takes them. The defaults come from
  the platform appearance provider: the app's accent and mode.
  - The tokens that reach each control, per platform:

    | Control          | iOS                                                                                                  | Android                                                |
    | ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
    | Button           | mode, accent, ink on the accent, element radius                                                      | mode, accent, ink on the accent, error, element radius |
    | TextField        | mode, accent, error, warning, success; with `filled`: neutral fill, element radius, horizontal inset | mode, accent, error, warning, success                  |
    | Slider           | mode; track and thumb tints when the component sends them                                            | the drawn Astryx slider                                |
    | SegmentedControl | mode; selected fill and title when the component sends them                                          | the drawn Astryx segments                              |
    | Date picker view | mode, accent                                                                                         | the date dialogs (below)                               |
    | Date dialogs     | the date picker view (above)                                                                         | Material's own colours                                 |
    | Paste control    | mode, fill and ink, element radius or capsule                                                        | the library Button                                     |

  - A control forwards exactly the tokens this table lists. A development build
    names, once, each theme value outside a control's list. With the theme's
    system button shape, the control keeps the platform's own corners.
- **FR12 — Accessibility is the system control's.** The system control is the
  accessibility element, and the component's accessibility props reach it.
  - Button: on iOS the UIButton takes the label (default: the visible label),
    hint, link role, selected, busy, value, language and custom actions; while
    loading its value is the library's busy word. On Android the button is the
    host view and takes React Native's standard props, with disabled and busy
    states.
  - Slider: one adjustable element with the label, hint, value words (default:
    the system's percentage) and step (default: `step`, else a tenth of the
    range). Each increment or decrement commits.
  - TextField: the inner field takes the label (default: the placeholder),
    hint, accessible, selected and language; its value is its text, read by the
    OS. On Android, custom actions stay on the host view, where TalkBack offers
    them.
  - SegmentedControl: the group's label is read before the segments; each
    segment is a button with the Selected trait, named by its title or, for an
    image segment, its label.
  - Date picker view: the label and hint reach the picker. The dialogs are
    Material's own.
  - Paste control: VoiceOver reads the system's own name for it ("Paste"),
    and an app sets the hint.
  - Host-level props (custom actions, escape, hidden, live region, modal) stay
    on the host view on both platforms.
  - Text follows the person's text size: Button and TextField fonts scale with
    Dynamic Type and Android's font scale, SegmentedControl titles scale and the
    control grows (FR6), and the paste control measures itself again when the
    text size changes. The controls' motion is the system's own and follows
    Reduce Motion by itself.
- **FR13 — Touch and value changes stay on the UI thread.** Under
  `spec:AST-140/FR6`, each control's
  touch tracking, thumb, selection and text editing run on the UI thread. The
  JavaScript thread hears direct events only: a press, a throttled value, a
  commit, a tap's index, a text change with its count, a focus change, a return,
  a paste, a fitting size. While the person drags, types or scrolls a picker,
  JavaScript runs only on these events.
- **FR14 — An absent control draws its Astryx control.** Where a native control
  is absent (the app opted out, an older binary, the OS has no equivalent,
  Jest, the web), its probe answers false and the component draws its Astryx
  control in its place (`spec:AST-112/FR7`, `spec:AST-140/FR2`). A dialog call
  on a binary without the module resolves `not-linked` or `no-module`
  (`spec:AST-112/FR3`, `spec:AST-140/FR3`).
- **FR15 — The contracts follow the platform's evolution rules.** Each contract keeps the baseline that `spec:AST-140/FR5` sets. A
  later behaviour is a named feature that the JavaScript checks before it uses
  it, keeping the baseline behaviour or answering `unsupported` without it.
- **FR16 — Native code uses public platform API only.** The controls' native
  code calls only the public API of UIKit, Foundation, the Android SDK and
  Material Components, for every control in the group.

### Native contracts

| Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                     | Commands               | Events                                                                 | Platforms    |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ------------ |
| `AstryxNativeButton`     | native component (Fabric Native Component) | `title`, `variant`, `size`, `systemImage` (iOS), `loading`, `enabled`, `appearance`, `tintForeground`, `destructiveTint`, `pressSlop`, `axLabel`, `axHint`, `axLink`, `axBusy`, `axAccessible`, `axSelected`, `axValue`, `axLanguage`                                                                                                                                                                                     | none                   | `onNativePress`, `onIntrinsicSize`                                     | iOS, Android |
| `AstryxNativeSlider`     | native component (Fabric Native Component) | `value`, `minimumValue`, `maximumValue`, `step`, `changeInterval`, `enabled`, `layoutDirection`, `appearance`, `minimumTrackTint`, `maximumTrackTint`, `thumbTint`, `axLabel`, `axHint`, `axValueText`, `axStep`                                                                                                                                                                                                          | `restoreValue`         | `onValueChange`, `onValueCommit`, `onSlidingChange`, `onIntrinsicSize` | iOS          |
| `AstryxNativeTextField`  | native component (Fabric Native Component) | `text`, `mostRecentEventCount`, `placeholder`, `size`, `secure`, `keyboard`, `contentType`, `returnKey`, `capitalize`, `autoCorrect`, `spellCheck`, `clearButton`, `startSystemImage` (iOS), `loading`, `editable`, `enabled`, `status`, `autoFocus`, `appearance`, `statusTint`, `fieldStyle` (iOS), `fill` (iOS), `cornerRadius` (iOS), `insetX` (iOS), `axLabel`, `axHint`, `axAccessible`, `axSelected`, `axLanguage` | `focus`, `blur`        | `onTextChange`, `onFocusChange`, `onReturn`, `onIntrinsicSize`         | iOS, Android |
| `AstryxSegmentedControl` | native component (Fabric Native Component) | `segments`, `selectedIndex`, `layout`, `size`, `enabled`, `appearance`, `selectedTint`, `selectedForeground`, `axGroupLabel`                                                                                                                                                                                                                                                                                              | `restoreSelectedIndex` | `onNativeChange`, `onIntrinsicSize`                                    | iOS          |
| `AstryxDatePickerView`   | native component (Fabric Native Component) | `mode`, `pickerStyle`, `value`, `minimumValue`, `maximumValue`, `localeIdentifier`, `firstWeekday`, `minuteInterval`, `hourCycle`, `pillTitle`, `pillIsPlaceholder`, `pickerEnabled`, `appearance`, `pickerAccessibilityLabel`, `pickerAccessibilityHint`                                                                                                                                                                 | none                   | `onValueChange`, `onPillPress`, `onEditingChange`, `onPickerSize`      | iOS          |
| `AstryxPasteControl`     | native component (Fabric Native Component) | `acceptedTypes`, `enabled`, `foregroundTint`, `backgroundTint`, `cornerRadius`, `displayMode`, `appearance`, `axHint`                                                                                                                                                                                                                                                                                                     | none                   | `onPaste`, `onIntrinsicSize`                                           | iOS          |

| Contract           | Kind                                | Methods                                                | Platforms |
| ------------------ | ----------------------------------- | ------------------------------------------------------ | --------- |
| `AstryxDatePicker` | native module (Turbo Native Module) | `isAvailable`, `openDate`, `openDateRange`, `openTime` | Android   |

The module's requests carry ISO strings, the dialog's words (`''`: Material's
own), the first day of the week (out of range: the locale's) and an optional
`rootTag`. Each method resolves one result object under `spec:AST-140/FR3`:
`status` `ok` with `value` (a range's start) and `end` (a range's end),
`cancelled` when the person dismisses the dialog, or `error` with a `reason`
(`unavailable` when no dialog can show) and a `message`. `AstryxDatePicker` maps it to
FR7's results.

### Platform support

| Contract                 | iOS                                                 | Android                                                                       |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AstryxNativeButton`     | UIButton with UIButton.Configuration                | Material 3 MaterialButton                                                     |
| `AstryxNativeSlider`     | UISlider                                            | Slider draws its Astryx control (OQ2)                                         |
| `AstryxNativeTextField`  | UITextField, rounded or filled                      | Material 3 TextInputLayout with TextInputEditText                             |
| `AstryxSegmentedControl` | UISegmentedControl                                  | SegmentedControl draws its Astryx control (OQ2)                               |
| `AstryxDatePickerView`   | UIDatePicker (compact, inline, wheels) and the pill | The date dialogs of `AstryxDatePicker`                                        |
| `AstryxDatePicker`       | The date picker view and the library's sheet        | MaterialDatePicker (date, date range), MaterialTimePicker as dialog fragments |
| `AstryxPasteControl`     | UIPasteControl, iOS 16 and later                    | The library Button reads the clipboard                                        |

- Supported feature/engine floor: iOS at React Native's own minimum, with
  UIPasteControl from iOS 16; Android API level 24
  with Material Components 3; React Native's New Architecture (Fabric and
  TurboModules) only (`spec:AST-112`).
- Unsupported behavior: where a view is absent its probe answers false and
  the component draws its own control (FR14); a dialog call resolves
  `not-linked`, `no-module` or `unavailable` (FR7); a behaviour a binary lacks
  answers by its named feature (FR15). On Android, Slider and SegmentedControl
  draw their Astryx controls (OQ2).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator and devices (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR7, FR9 and FR10, and `spec:AST-140` FR1 to FR3, FR5
  and FR6, for the controls listed here.
- Relies on `spec:AST-112` FR3 (amended): the native half of Astryx's
  components, the controls among them, links by default.
- Relies on `spec:AST-112` FR5 (amended): the native controls and the gesture
  views are internal; `./controls` holds the library's components whose
  native half they are.
- Relies on `spec:AST-140/FR5`: each contract keeps the baseline that `spec:AST-140/FR5` sets, and later behaviour is a named feature.
- Departs from `spec:AST-082/FR11` on Android: Slider and SegmentedControl,
  and a Button or TextInput with an icon, draw the Astryx control where
  Material 3 has its own. OQ2 asks whether this stands.
- Follows `spec:AST-082/FR11`'s native-first default (OQ7), and the date
  family follows `spec:AST-043`'s `presentation`.
- Extends `spec:AST-043`'s `presentation`, with the values `DateInput` takes,
  to `DateRangeInput` on React Native.
- iOS's button and text field draw UIButton and UITextField; whether they wrap
  the shared Swift controls of `spec:AST-112/FR10` is OQ9.

## Verification

| Contract | Verification                                                                                                               | Representative states                                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Built app without any opt-in: binary symbols and the probes; unit tests of the entry through the `./testing` doubles       | default link, gesture views included; opted out where an opt-out exists; each probe                                                                                                                                                                 | A default build lacks a control, or an opted-out build answers a probe true                                                                      |
| FR2      | Unit tests of host detection and of each component's shape rules                                                           | a host and no host on each platform; each ineligible shape, icons on Android and an icon-and-label segment included; a focused field moving between the system control and its own control; a value set in one control and read back from the other | A system control where no host exists, a system control for an ineligible shape, or a lost value                                                 |
| FR3      | Simulator and emulator checks of each variant, size and style                                                              | each variant; loading; disabled; a drag past the press slop                                                                                                                                                                                         | A wrong system style, a press after the slop, a press that does not reach `onClick`, or no development warning for `systemImage` on Android      |
| FR4      | Simulator drag and VoiceOver checks; UI-thread frame check                                                                 | a drag; step snapping; a value during a drag; an accessibility step; right to left                                                                                                                                                                  | More than one value per interval, a missing commit, a held value applied before release, or JavaScript run per frame                             |
| FR5      | Simulator and emulator checks of each style and status; unit tests of the handle                                           | bordered and filled; each status; secure entry; focus and blur                                                                                                                                                                                      | A wrong border or caret colour, a filled box on Android, a handle that misses focus, or no development warning for an iOS-only member on Android |
| FR6      | Simulator checks at the default text size and at AX1                                                                       | `hug` and `fill`; an image segment; disabled segments; a title that does not fit                                                                                                                                                                    | A cut title, a native control at AX1, or a wrong fitting size                                                                                    |
| FR7      | Unit tests of the module's results through the `./testing` doubles (absent, older, current); Simulator and emulator checks | each mode; a range; a dismissed step; no activity; a second dialog; a date across time zones                                                                                                                                                        | A rejection, a shifted day, a silent `cancelled` for `unavailable`, two dialogs, or a haptic after the wheels                                    |
| FR8      | Simulator checks of each type and display mode                                                                             | text, URL and image pastes; `label` mode; a styled size below the fitting size                                                                                                                                                                      | A paste prompt, a pasteboard read, or an invalid control from a small layout                                                                     |
| FR9      | Unit tests of each controlled control with a caller that keeps its value                                                   | a kept slider value; a kept segment; fast typing with a late value                                                                                                                                                                                  | The control keeps the person's value, or a late value overwrites a keystroke                                                                     |
| FR10     | Unit tests of the sizing; Simulator checks of the first frame at default and large text sizes                              | before the first report; a button drawn again; `fill`; a paste control styled small                                                                                                                                                                 | A jump after the first report, or a paste control laid out below its fitting size                                                                |
| FR11     | Unit tests that each control forwards exactly the listed tokens; Simulator and emulator checks in light and dark           | each theme value per platform; a system button shape; an override a control cannot take                                                                                                                                                             | A token sent where the table says it does not reach, a missing one, or no development notice for an override                                     |
| FR12     | VoiceOver and TalkBack checks of each control; unit tests of the forwarded props; Dynamic Type and font scale checks       | each element prop; busy; an image segment; large text sizes                                                                                                                                                                                         | A host view read instead of the control, a lost label or state, or text that does not scale                                                      |
| FR13     | UI-thread frame checks during drags, typing and picker scrolls                                                             | a slider drag; a segmented tap; typing; the wheels                                                                                                                                                                                                  | JavaScript runs per frame                                                                                                                        |
| FR14     | Unit tests through the `./testing` doubles in their absent, older and current shapes                                       | each view absent; the module absent; an older binary                                                                                                                                                                                                | A throw, a rejection, or a component that draws nothing                                                                                          |
| FR15     | The platform's spec rules check                                                                                            | each contract's baseline shape; a missing named feature                                                                                                                                                                                             | A feature used without its check, or a silently weaker path without it                                                                           |
| FR16     | Source review and symbol check of the controls' native code against the public SDKs                                        | each control's iOS and Android code                                                                                                                                                                                                                 | A private selector, a private field read, or a restricted API                                                                                    |

## Decision log

### DEC-1 — The system control is a presentation of the Astryx component

**Reference:** `spec:AST-126/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

An app writes one component and gets the system control or the Astryx control
from the same props. The native controls stay internal behind the components
(`spec:AST-112/FR5`).

### DEC-2 — A shape the system control cannot show draws the Astryx control

**Reference:** `spec:AST-126/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

When the system control would cut a title, drop a disabled reason, or lack
marks or a vertical form, the component draws its own control instead of a
weaker system one. The component's contract wins over the platform's look.

### DEC-3 — The platform owns touch; JavaScript owns the value

**Reference:** `spec:AST-126/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

The thumb, the selection and the text move on the UI thread, independent of
the JavaScript thread, so a busy JavaScript thread leaves the person's finger
free. JavaScript hears throttled values and commits, and stays the truth: a
kept value goes back to the control by command or by event count.

### DEC-4 — Dates cross as ISO wall-clock strings

**Reference:** `spec:AST-126/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A picked date is a calendar date. Crossing as `YYYY-MM-DD`,
`HH:mm` or `YYYY-MM-DDTHH:mm` in the device's calendar means a date
stays on its day across time zones and the pickers' midnight.

### DEC-5 — The system paste control delivers by event only

**Reference:** `spec:AST-126/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

A tap on UIPasteControl grants one paste without a system question. The
pasted content reaches JavaScript only through `onPaste`, after the person's
tap, so the person decides each paste.

## Open questions

- **OQ1 — Do the controls whose ecosystem counterpart covers the capability
  stay platform contracts?** (`human-design`) The text editing of
  `AstryxNativeTextField` is React Native's own, and the slider, segmented
  control and paste control have maintained counterparts in the ecosystem; their gap is the theme
  and the dependency set. Options: keep all
  of them as platform contracts; or keep the ones with a capability gap
  (Button, SegmentedControl, the date pickers) and draw the text box around
  React Native's `TextInput`.
- **OQ2 — Do the iOS-only controls get Android hosts?** (`human-design`)
  `spec:AST-082/FR11` asks for the platform's control where one exists, and
  Android has none here for Slider and SegmentedControl. Options: Material 3's Slider and segmented button toggle group as hosts for
  Slider and SegmentedControl; or the drawn Astryx controls on Android. Android
  has no system paste control, so PasteButton draws its Button there in either
  case.
- **OQ6 — Does Switch get a native contract?** (`human-design`) Options: an
  Astryx switch contract over UISwitch and Material 3's switch, with this
  group's appearance mapping and named features; or React
  Native's own `Switch`, tinted by the library, as its system presentation.
- **OQ7 — Does React Native depart from `spec:AST-082/FR11`'s native-first
  default?** (`human-design`) Options: no (the system control wherever a host
  exists); or yes, with an amendment to `spec:AST-082`: the Astryx control
  unless a theme or the app asks for native.
- **OQ9 — Do the iOS button and text field wrap the shared Swift controls?**
  (`checkable`) `spec:AST-112/FR10` asks the platform to wrap a shared native
  control where `@astryxdesign/native` provides one. Options: wrap the shared
  Swift `Button` and `TextInput`, with this record's contract on top; or keep
  UIButton and UITextField until the shared controls cover FR3 and FR5.
