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
text field and picker dialogs on Android. The app or its theme can ask for
Astryx's drawn control instead. The component's API, words,
states and accessibility stay the same, the theme's accent and mode reach the
system control, and where the system has no equivalent the component draws its
own Astryx control. This record owns the native controls that make this
possible: their JavaScript API, their native contracts, how the library chooses
between the system control and its own, and how they behave.

The controls are part of the platform layer of `spec:AST-112`. They follow its
result vocabulary (`spec:AST-112/FR6`), capability shape (`spec:AST-112/FR7`),
additive evolution (`spec:AST-112/FR8`), its rule that the platform speaks
Astryx's design language for native controls (`spec:AST-112/FR9`), and Astryx
Stage as the contract developers build against (`spec:AST-112/FR12`). They
serve the native-first rule of `spec:AST-082/FR11`. In the library
components, a control's native-only visuals come from the theme (FR11), not
from component props (`spec:AST-082/DEC-2`).

## Why this exists

Each native control is a presentation of an Astryx component: the component's
API, with the theme reaching the system control (FR11), only the platform SDKs
and React Native as required dependencies (`spec:AST-082/FR13`), and the same
behaviour in Astryx Stage (`spec:AST-112/FR12`). Per piece:

- `AstryxNativeButton`: Astryx's variants, sizes, busy state and theme reach
  UIButton.Configuration (Liquid Glass on iOS 26 and later) and Material 3's
  button.
- `AstryxNativeSlider`: a throttled value with a separate commit, and a
  controlled value (FR4, FR9). Beyond that the gap is small (OQ1).
- `AstryxNativeTextField`: only the system's box; text editing is React
  Native's `TextInput` (OQ1).
- `AstryxSegmentedControl`: titles that follow Dynamic Type, and the drawn
  control before a title is cut (FR6).
- `AstryxDatePicker` (view and module): calendar dates as ISO wall-clock
  strings (DEC-4), Material 3's date range dialog, and results instead of
  rejections (`spec:AST-112/FR6`).
- `AstryxPasteControl`: no capability gap; PasteButton draws the system control
  with its own API (OQ1).

## Who uses it

| Native piece                | Kind                                       | Astryx components that use it                                                                                                                                                                    | What a person sees                                                                                                   |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `AstryxNativeButton`        | native component (Fabric Native Component) | `Button` under native presentation (outside a connected group such as `ButtonGroup` or `InputGroup`, not a toggle, not a glass surface, no icon on Android); apps through the `./controls` entry | The system button: UIButton.Configuration on iOS, a Material 3 button on Android                                     |
| `AstryxNativeSlider`        | native component (Fabric Native Component) | `Slider` under native presentation; `MediaScrubber`, which asks for it through `Slider`; apps through `./controls`                                                                               | UISlider on iOS; the drawn Astryx slider on Android                                                                  |
| `AstryxNativeTextField`     | native component (Fabric Native Component) | `TextInput` under native presentation, outside an `InputGroup`, no start icon on Android; apps through `./controls`                                                                              | The system text box inside Astryx's label, description and status                                                    |
| `AstryxSegmentedControl`    | native component (Fabric Native Component) | `SegmentedControl` under native presentation; apps through `./controls`                                                                                                                          | UISegmentedControl on iOS; the drawn Astryx segments on Android and at large text sizes                              |
| `AstryxDatePicker` (view)   | native component (Fabric Native Component) | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on iOS when their surface resolves to native; apps through `./controls`                                                              | UIDatePicker's compact pill in the field, or the inline calendar or wheels in the library's sheet                    |
| `AstryxDatePicker` (module) | native module (Turbo Native Module)        | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on Android when their surface resolves to native; apps through `./controls`                                                          | The Astryx field, which opens Material 3's date, date range or time dialog                                           |
| `AstryxPasteControl`        | native component (Fabric Native Component) | `PasteButton` on iOS 16 and later, in an app's own runtime; apps through `./controls`                                                                                                            | The system paste control, which pastes with no permission prompt; elsewhere the library Button with the word "Paste" |

`SearchField`, `TextArea`, `NumberInput` and the other text-entry components
edit through React Native's `TextInput` and do not use `AstryxNativeTextField`.

## Non-goals

- The contract of any one component (Button, Slider, TextInput,
  SegmentedControl, the date family, PasteButton). Each component's own record
  owns it; this record owns its native presentation.
- `Stepper`. The presentation seam knows it, but it has no native piece and no
  platform contract here.
- The contracts of the native-driver gesture views that ship in the same
  `./controls` entry (swipe row, drag snap, zoom pager, pan and zoom). The
  Gestures and drag record (AST-124) owns them; FR1's default link covers them.
- The date family's own surfaces (popover, bottom sheet, typed field) and their
  eligibility rules. `spec:AST-043` and the date components' records own them.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — The controls link by default.** The controls and the gesture views
  in `./controls` are part of the default set of `spec:AST-112/FR3`. Where an
  app uses the opt-out that record allows, every probe below answers false and
  every component draws its Astryx control. The `./controls` entry exports:
  - `NativeButton`, `NativeSlider`, `NativeTextField`,
    `NativeSegmentedControl`, `NativePasteControl`, each with its
    `is<View>Available()` probe;
  - `datePickerView()` and `isDatePickerViewAvailable()` (the iOS picker view),
    and `AstryxDatePicker` with `isAvailable()`, `version()`, `openDate`,
    `openDateRange` and `openTime` (the Android dialogs);
  - `AndroidDatePicker` and `AndroidDateRangePicker`, which open the dialogs
    from a field the caller draws (`renderField({open, isOpen})`).
- **FR2 — The library chooses the system control or its own.** A component
  resolves its presentation in this order: its `presentation` prop, where it has
  one (Button, TextInput, the date family); the nearest
  provider's `nativePresentation` entry for the control; the provider's `'all'`
  or `'none'`; the theme's native presentation default. With none of these, a
  control resolves `adaptive-native`: the system control wherever a host exists
  (`spec:AST-082/FR11`). The date family follows `spec:AST-043` FR1 to FR3.
  - `native` draws the system control where a host exists here; otherwise the
    component draws its own control and warns once per control in development.
    The date family's `native` follows `spec:AST-043/FR2`.
  - `adaptive-native` draws the system control where a host exists, else the
    component's own control, silently.
  - Any other value is the component's own surface. Under the provider's
    `isPlatformEnabled={false}` every control draws its own.
  - A host exists when the probe of FR1 answers true and the OS has an
    equivalent: Button and TextInput on iOS and Android; Slider,
    SegmentedControl and the date view on iOS; the date dialogs on Android.
    PasteButton has no presentation choice: it draws the system paste control
    wherever one exists (FR8).
  - A component also draws its own control for a shape the system control
    cannot show, whatever the presentation: Button as a toggle, with a glass
    surface, inside a connected group, or with an icon on Android; TextInput
    inside an `InputGroup`, or with a start icon on Android;
    Slider vertical, with marks, or with a disabled reason, and with the tooltip
    value on iOS unless the theme prefers platform controls; SegmentedControl
    with a disabled reason, with a segment that shows both an icon and a label,
    at large text sizes (AX1 and up), or once the control's fitting width
    exceeds its room (DEC-2). An icon never disappears because a control
    presents natively.
  - Switching presentation keeps the value. A text field that is focused when
    its presentation switches loses focus, and `onBlur` runs.
  - FR2 gap: `Switch` has no native contract. Its system presentation is React
    Native's own `Switch`, outside this group's appearance mapping (FR11),
    contract baseline (FR15) and Astryx Stage's contract checks (OQ6).
- **FR3 — Native button.** `NativeButton` takes `label`, `variant`
  (`primary`, `secondary`, `ghost`, `destructive`), `size` (`sm`, `md`, `lg`),
  `buttonStyle` (`standard`, `glass`), `symbolName`, `isLoading`, `isDisabled`,
  `width` (`content`, `fill`), `cornerStyle` (`theme`, `system`), the appearance
  props of FR11, `onPress`, and the accessibility props of FR12.
  - iOS draws UIButton with UIButton.Configuration: filled, tinted or plain by
    variant, the destructive role in the system red. `glass` draws
    `prominentGlass` (primary, destructive) or `glass` (secondary, ghost) on
    iOS 26 and later, and the standard mapping below. `symbolName` is an SF
    Symbol drawn before the label; the library resolves its icon names to it.
  - Android draws a Material 3 button: filled, tonal or text by variant, the
    theme's error colour for `destructive`. It draws no icon.
  - `symbolName` (`systemImage` in the contract) is an iOS-only member and
    says so in its tag (`spec:AST-112/FR8`). On Android, a set `symbolName`
    gives one development warning.
  - The system control decides when a touch is a press. On iOS a touch that
    moves further than the drawn Button's press distance is not a press. Every completed activation calls
    `onPress` once.
- **FR4 — Native slider.** `NativeSlider` takes `value`, `min`, `max`, `step`
  (0: continuous), `onChange`, `onChangeEnd`, `onSlidingChange`,
  `changeInterval` (default 100 ms), `isDisabled`, `isRTL`, the appearance
  props of FR11 and the accessibility props of FR12.
  - The thumb belongs to the UI thread (FR13). `onChange` hears the value at
    most once per `changeInterval` while the thumb moves, and the last value of
    a move before the commit. `onChangeEnd` hears the value when the finger
    lifts, when the touch is cancelled, and after each accessibility increment
    or decrement. `onSlidingChange` hears `true` when a drag starts and `false`
    when it ends.
  - `step` snaps the thumb as it moves. During a drag the finger controls the
    thumb; a new `value` from the caller takes effect when the drag ends.
  - `isRTL` mirrors the slider: the minimum is at the right edge and the track
    fills from the right.
- **FR5 — Native text field.** `NativeTextField` takes `value`,
  `onChangeText`, `placeholder`, `size`, `secureTextEntry`, `keyboardType`,
  `textContentType`, `returnKey`, `autoCapitalize`, `autoCorrect`,
  `spellCheck`, `hasClear`, `startSymbolName`, `isLoading`, `editable`,
  `isDisabled`, `status` (`error`, `warning`, `success`), `autoFocus`,
  `fieldStyle` (`bordered`, `filled`), the appearance props of FR11, `onFocus`,
  `onBlur`, `onSubmit` (the return key), the accessibility props of FR12, and a
  `ref` handle with `focus()`, `blur()` and `isFocused()`.
  - iOS draws a UITextField in the system's rounded style; `filled` draws no
    border, the theme's fill and element radius, its horizontal inset, the
    status colour as the border while a status is set, and the accent as the
    border while focused. `startSymbolName` is an SF Symbol at the start of the
    box.
  - Android draws a Material 3 outlined TextInputLayout with a
    TextInputEditText. It takes neither `filled` nor a start symbol; spelling
    suggestions follow `autoCorrect`.
  - `startSymbolName`, `fieldStyle`, `fill`, `cornerRadius` and `insetX`
    (`startSystemImage`, `fieldStyle`, `fill`, `cornerRadius`, `insetX` in the
    contract) are iOS-only members and say so in their tags
    (`spec:AST-112/FR8`). On Android, each one an app sets gives one
    development warning.
  - `status` colours the box's border, and for `error` the caret. The message
    stays the library's, below the box.
  - `focus()` and `blur()` are the view's `focus` and `blur` commands;
    `isFocused()` follows the field's focus events.
- **FR6 — Native segmented control.** `NativeSegmentedControl` takes
  `segments` (each a `title`, `isTitleHidden`, `symbolName`, `isDisabled`,
  `accessibilityLabel`), `selectedIndex` (-1: none), `onChange(index)`,
  `layout` (`hug`, `fill`), `size`, `isDisabled`, the appearance props of FR11,
  `accessibilityLabel`, and `onFittingSize`.
  - iOS draws UISegmentedControl. A segment draws its title, or with
    `isTitleHidden` its SF Symbol. A segment never shows both.
  - `hug` sizes each segment to its content; `fill` gives every segment the
    same width.
  - Titles scale with Dynamic Type, and the control grows with them.
    `onFittingSize` reports the control's fitting size, so the library draws its
    own segments when the titles do not fit (FR2). Every title shows in full.
  - The selected segment keeps UIKit's fill and title colours unless the theme
    paints them (FR11).
  - Android has no host; `SegmentedControl` draws its own segments there
    (OQ2).
- **FR7 — Native date pickers.** Values are ISO wall-clock strings in the
  mode's shape (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`), read and written
  through the Gregorian calendar in the device's time zone, never through UTC;
  `''` means no value.
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
    `no-module` when the module is absent, or `error`. It never rejects. A field
    shows one dialog at a time.
  - A failure other than `cancelled` reaches the field's `onError`; without
    one, a development build warns. A failed open is always visible to the
    caller.
  - The library plays its `select` haptic when a pick commits from a surface
    that played no system feedback (the compact pill's calendar, the inline
    calendar, the dialogs). The wheels give their own system feedback, so no
    library haptic follows them.
- **FR8 — System paste control.** `NativePasteControl` takes `onPaste`,
  `acceptedTypes` (a subset of `text`, `url`, `image`; default `text`),
  `isDisabled`, `foregroundTint`, `backgroundTint`, `cornerRadius` (negative:
  the system capsule), `displayMode` (`iconAndLabel`, `label`), the appearance
  props of FR11 and `accessibilityHint`.
  - iOS 16 and later draw UIPasteControl. A tap on it grants access to the
    pasteboard for that one paste, so iOS asks no paste question.
  - Each paste calls `onPaste` once with one value, in this order of
    preference among the accepted kinds: `{type: 'url', url}`,
    `{type: 'image', uri, width, height}`, `{type: 'text', text}`. An image
    arrives as a PNG file in the app's temporary folder. The file can disappear
    at the app's next launch, so an app that keeps the image copies it. Nothing reads the pasteboard (DEC-5).
  - The system enables the control only while the pasteboard holds an accepted
    kind. Its words and glyph are always the system's.
  - The view is never served to a preview project; PasteButton draws its
    fallback there, which reads the clipboard under the clipboard's consent
    policy.
  - Android and iOS before 16 have no host. PasteButton draws the library
    Button with the word "Paste", which reads the clipboard on the tap.
- **FR9 — A controlled value never fights the person.** The system control
  shows the person's change at once, and the caller's value stays the truth.
  - Slider: when the caller keeps its `value` after a commit, the thumb returns
    to the caller's value (the view's `restoreValue` command).
  - SegmentedControl: when the caller keeps its `selectedIndex` after a tap,
    the control selects the caller's segment again (`restoreSelectedIndex`).
  - TextField: each change event carries a count, and a `text` from JavaScript
    takes effect only with the latest count JavaScript has seen
    (`mostRecentEventCount`), so an older value never overwrites a keystroke.
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
  - `width: 'fill'` (Button) and `layout: 'fill'` (SegmentedControl) keep the
    caller's width and take only the height.
  - The paste control's fitting size is also its minimum, whatever the caller
    styles: UIKit refuses a paste control laid out smaller than it. A report
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
    | Slider           | mode; track and thumb tints when the component sends them                                            | none (no host)                                         |
    | SegmentedControl | mode; selected fill and title when the component sends them                                          | none (no host)                                         |
    | Date picker view | mode, accent                                                                                         | none (no host)                                         |
    | Date dialogs     | none (no host)                                                                                       | none: Material's own colours                           |
    | Paste control    | mode, fill and ink, element radius or capsule                                                        | none (no host)                                         |

  - A control forwards exactly the tokens this table lists. A theme value that
    a system control cannot take is said once in development. A theme with the
    system button shape sends no radius, and the control keeps the platform's
    own corners.
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
    which an app cannot replace; an app can set only the hint.
  - Host-level props (custom actions, escape, hidden, live region, modal) stay
    on the host view on both platforms.
  - Text follows the person's text size: Button and TextField fonts scale with
    Dynamic Type and Android's font scale, SegmentedControl titles scale and the
    control grows (FR6), and the paste control measures itself again when the
    text size changes. The controls' motion is the system's own and follows
    Reduce Motion by itself.
- **FR13 — Touch and value changes stay on the UI thread.** Each control's
  touch tracking, thumb, selection and text editing run on the UI thread. The
  JavaScript thread hears direct events only: a press, a throttled value, a
  commit, a tap's index, a text change with its count, a focus change, a return,
  a paste, a fitting size. No control runs JavaScript per frame while the person
  drags, types or scrolls a picker.
- **FR14 — An absent control reports itself and the library draws.** Each
  `./controls` view renders its `fallback` (nothing by default) where its native view is absent
  (opted out, an older binary, the OS has no equivalent, Jest, the web) and
  calls `onError({reason: 'no-native-view'})` once. Its probe says which, so the
  library draws its own control instead (`spec:AST-112/FR7`). A dialog call on
  a binary without the module resolves `not-linked` or `no-module`
  (`spec:AST-112/FR3`, `spec:AST-112/FR6`).
- **FR15 — The contracts follow the platform's evolution rules.** Every
  contract in the group follows `spec:AST-112/FR8`: it is at revision 1, and a
  later behaviour is a named feature that the JavaScript checks before it uses
  it, keeping the revision-1 behaviour or answering `unsupported` without it.
  Astryx Stage pairs with the package under `spec:AST-112/FR12`.
- **FR16 — Native code uses public platform API only.** The controls' native
  code calls only the public API of UIKit, Foundation, the Android SDK and
  Material Components: no private selector, private field or restricted API.
  The group has no exception.

### Native contracts

| Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                     | Commands               | Events                                                                 | Platforms    |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ------------ |
| `AstryxNativeButton`     | native component (Fabric Native Component) | `title`, `variant`, `size`, `buttonStyle`, `systemImage` (iOS), `loading`, `enabled`, `appearance`, `tintForeground`, `destructiveTint`, `pressSlop`, `axLabel`, `axHint`, `axLink`, `axBusy`, `axAccessible`, `axSelected`, `axValue`, `axLanguage`                                                                                                                                                                      | none                   | `onNativePress`, `onIntrinsicSize`                                     | iOS, Android |
| `AstryxNativeSlider`     | native component (Fabric Native Component) | `value`, `minimumValue`, `maximumValue`, `step`, `changeInterval`, `enabled`, `layoutDirection`, `appearance`, `minimumTrackTint`, `maximumTrackTint`, `thumbTint`, `axLabel`, `axHint`, `axValueText`, `axStep`                                                                                                                                                                                                          | `restoreValue`         | `onValueChange`, `onValueCommit`, `onSlidingChange`, `onIntrinsicSize` | iOS          |
| `AstryxNativeTextField`  | native component (Fabric Native Component) | `text`, `mostRecentEventCount`, `placeholder`, `size`, `secure`, `keyboard`, `contentType`, `returnKey`, `capitalize`, `autoCorrect`, `spellCheck`, `clearButton`, `startSystemImage` (iOS), `loading`, `editable`, `enabled`, `status`, `autoFocus`, `appearance`, `statusTint`, `fieldStyle` (iOS), `fill` (iOS), `cornerRadius` (iOS), `insetX` (iOS), `axLabel`, `axHint`, `axAccessible`, `axSelected`, `axLanguage` | `focus`, `blur`        | `onTextChange`, `onFocusChange`, `onReturn`, `onIntrinsicSize`         | iOS, Android |
| `AstryxSegmentedControl` | native component (Fabric Native Component) | `segments`, `selectedIndex`, `layout`, `size`, `enabled`, `appearance`, `selectedTint`, `selectedForeground`, `axGroupLabel`                                                                                                                                                                                                                                                                                              | `restoreSelectedIndex` | `onNativeChange`, `onIntrinsicSize`                                    | iOS          |
| `AstryxDatePicker`       | native component (Fabric Native Component) | `mode`, `pickerStyle`, `value`, `minimumValue`, `maximumValue`, `localeIdentifier`, `firstWeekday`, `minuteInterval`, `hourCycle`, `pillTitle`, `pillIsPlaceholder`, `pickerEnabled`, `appearance`, `pickerAccessibilityLabel`, `pickerAccessibilityHint`                                                                                                                                                                 | none                   | `onValueChange`, `onPillPress`, `onEditingChange`, `onPickerSize`      | iOS          |
| `AstryxPasteControl`     | native component (Fabric Native Component) | `acceptedTypes`, `enabled`, `foregroundTint`, `backgroundTint`, `cornerRadius`, `displayMode`, `appearance`, `axHint`                                                                                                                                                                                                                                                                                                     | none                   | `onPaste`, `onIntrinsicSize`                                           | iOS          |

| Contract           | Kind                                | Methods                                                                | Platforms |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------- | --------- |
| `AstryxDatePicker` | native module (Turbo Native Module) | `getConstants`, `isAvailable`, `openDate`, `openDateRange`, `openTime` | Android   |

The module's requests carry ISO strings, the dialog's words (`''`: Material's
own), the first day of the week (out of range: the locale's) and an optional
`rootTag`. Each method resolves one result object under `spec:AST-112/FR8`:
`status` `ok` with `value` (a range's start) and `end` (a range's end),
`cancelled` when the person dismisses the dialog, or `error` with a `reason`
(`unavailable` when no dialog can show) and a `message`. `AstryxDatePicker` maps it to
FR7's results.

### Platform support

| Contract                    | iOS                                                                            | Android                                                                       | Astryx Stage                                      |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `AstryxNativeButton`        | UIButton with UIButton.Configuration; glass configurations on iOS 26 and later | Material 3 MaterialButton                                                     | Draws it with the iOS or the Android look         |
| `AstryxNativeSlider`        | UISlider                                                                       | No host; Slider draws its Astryx control (OQ2)                                | iOS look; absent under the Android look           |
| `AstryxNativeTextField`     | UITextField, rounded or filled                                                 | Material 3 TextInputLayout with TextInputEditText                             | Draws it with the iOS or the Android look         |
| `AstryxSegmentedControl`    | UISegmentedControl                                                             | No host; SegmentedControl draws its Astryx control (OQ2)                      | iOS look; absent under the Android look           |
| `AstryxDatePicker` (view)   | UIDatePicker (compact, inline, wheels) and the pill                            | No host                                                                       | Simulated picker under the iOS look               |
| `AstryxDatePicker` (module) | No module: the view and the library's sheet                                    | MaterialDatePicker (date, date range), MaterialTimePicker as dialog fragments | Resolves each request with the request's value    |
| `AstryxPasteControl`        | UIPasteControl, iOS 16 and later                                               | No host: the library Button reads the clipboard                               | iOS look from iOS 16; absent in a preview project |

- Supported feature/engine floor: iOS at React Native's own minimum, with
  UIPasteControl from iOS 16 and Liquid Glass from iOS 26; Android API level 24
  with Material Components 3; React Native's New Architecture (Fabric and
  TurboModules) only (`spec:AST-112`).
- Unsupported behavior: a view a binary lacks reports `no-native-view` once and
  the library draws its own control (FR14); a dialog call resolves
  `not-linked`, `no-module` or `unavailable` (FR7); a behaviour a binary lacks
  answers by its named feature (FR15). Android has no slider or segmented
  control host, so Slider and SegmentedControl draw their Astryx controls there
  (OQ2).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR6, FR7, FR9 and FR10 for the controls listed here.
- Relies on `spec:AST-112` FR3 (amended): the native half of Astryx's
  components, the controls among them, links by default.
- Relies on `spec:AST-112` FR5 (amended): `./controls` holds the native
  controls and the gesture views of the library's components.
- Relies on `spec:AST-112` FR8 (amended): every contract is at revision 1, and
  later behaviour is a named feature.
- Relies on `spec:AST-112` FR12 (amended): Astryx Stage pairs with the package
  through its version floor.
- This record makes no departure from `spec:AST-043` or `spec:AST-082`; OQ2,
  OQ3, OQ7 and OQ8 ask whether React Native departs from them.
- No other record changes.

## Verification

| Contract | Verification                                                                                                                   | Representative states                                                                                                                                                                                                     | Mutation or failure expectation                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Built app without any opt-in: binary symbols and the probes; unit tests of the entry through the `./testing` doubles           | default link, gesture views included; opted out where an opt-out exists; each probe                                                                                                                                       | A default build lacks a control, or an opted-out build answers a probe true                                                                      |
| FR2      | Unit tests of the presentation resolution and of each component's shape rules                                                  | prop, provider map, `'all'`, `'none'`, theme default, the `adaptive-native` default; each ineligible shape, icons on Android and an icon-and-label segment included; platform off; a focused field switching presentation | A wrong surface, a missing or repeated development warning, a native control for an ineligible shape, or a lost value                            |
| FR3      | Simulator and emulator checks of each variant, size and style; Astryx Stage contract checks                                    | each variant; glass on iOS 26 and earlier; loading; disabled; a drag past the press slop                                                                                                                                  | A wrong system style, a press after the slop, a press without `onPress`, or no development warning for `symbolName` on Android                   |
| FR4      | Astryx Stage contract checks on the virtual clock; Simulator drag and VoiceOver checks; UI-thread frame check                  | a drag; step snapping; a value during a drag; an accessibility step; right to left                                                                                                                                        | More than one value per interval, a missing commit, a held value applied before release, or JavaScript run per frame                             |
| FR5      | Simulator and emulator checks of each style and status; unit tests of the handle                                               | bordered and filled; each status; secure entry; focus and blur                                                                                                                                                            | A wrong border or caret colour, a filled box on Android, a handle that misses focus, or no development warning for an iOS-only member on Android |
| FR6      | Astryx Stage contract checks; Simulator checks at the default text size and at AX1                                             | `hug` and `fill`; an image segment; disabled segments; a title that does not fit                                                                                                                                          | A cut title, a native control at AX1, or a wrong fitting size                                                                                    |
| FR7      | Unit tests of the module's results through the `./testing` doubles (absent, older, current); Simulator and emulator checks     | each mode; a range; a dismissed step; no activity; a second dialog; a date across time zones                                                                                                                              | A rejection, a shifted day, a silent `cancelled` for `unavailable`, two dialogs, or a haptic after the wheels                                    |
| FR8      | Astryx Stage contract checks; Simulator checks of each type and display mode; unit tests of the preview boundary               | text, URL and image pastes; `label` mode; a styled size below the fitting size; a preview project                                                                                                                         | A paste prompt, a pasteboard read, an invalid control from a small layout, or the system control in a preview project                            |
| FR9      | Unit tests of each controlled control with a caller that keeps its value; Astryx Stage contract checks of the restore commands | a kept slider value; a kept segment; fast typing with a late value                                                                                                                                                        | The control keeps the person's value, or a late value overwrites a keystroke                                                                     |
| FR10     | Unit tests of the sizing; Simulator checks of the first frame at default and large text sizes                                  | before the first report; a button drawn again; `fill`; a paste control styled small                                                                                                                                       | A jump after the first report, or a paste control laid out below its fitting size                                                                |
| FR11     | Unit tests that each control forwards exactly the listed tokens; Simulator and emulator checks in light and dark               | each theme value per platform; a system button shape; an override a control cannot take                                                                                                                                   | A token sent where the table says it does not reach, a missing one, or no development notice for an override                                     |
| FR12     | VoiceOver and TalkBack checks of each control; unit tests of the forwarded props; Dynamic Type and font scale checks           | each element prop; busy; an image segment; large text sizes                                                                                                                                                               | A host view read instead of the control, a lost label or state, or text that does not scale                                                      |
| FR13     | UI-thread frame checks during drags, typing and picker scrolls                                                                 | a slider drag; a segmented tap; typing; the wheels                                                                                                                                                                        | JavaScript runs per frame                                                                                                                        |
| FR14     | Unit tests through the `./testing` doubles in their absent, older and current shapes                                           | each view absent; the module absent; an older binary                                                                                                                                                                      | A throw, a rejection, a repeated `onError`, or a component that draws nothing                                                                    |
| FR15     | The platform's spec rules check; Astryx Stage contract checks                                                                  | every contract at revision 1; a missing named feature                                                                                                                                                                     | A feature used without its check, or a silently weaker path without it                                                                           |
| FR16     | Source review and symbol check of the controls' native code against the public SDKs                                            | each control's iOS and Android code                                                                                                                                                                                       | A private selector, a private field read, or a restricted API                                                                                    |

## Decision log

### DEC-1 — The system control is a presentation of the Astryx component

**Reference:** `spec:AST-126/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

An app writes one component and gets the system control or the Astryx control
from the same props, chosen by the component, a provider or the theme.
Wherever the system has the control it is the default, and the app or its
theme can ask for the Astryx control instead. The `./controls` views stay public for an app that wants a
system control directly.

Rejected: separate native components as the main app API, because every app
would branch between two components with different props.

### DEC-2 — A shape the system control cannot show draws the Astryx control

**Reference:** `spec:AST-126/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

When the system control would cut a title, drop a disabled reason, or lack
marks or a vertical form, the component draws its own control instead of a
weaker system one. The component's contract wins over the platform's look.

### DEC-3 — The platform owns touch; JavaScript owns the value

**Reference:** `spec:AST-126/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

The thumb, the selection and the text move on the UI thread with no JavaScript
per frame. JavaScript hears throttled values and commits, and stays the truth: a
kept value goes back to the control by command or by event count.

Rejected: driving the thumb or the selection from JavaScript props each frame,
because a busy JavaScript thread would then stall the person's finger.

### DEC-4 — Dates cross as ISO wall-clock strings

**Reference:** `spec:AST-126/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A picked date is a calendar date, not an instant. Crossing as `YYYY-MM-DD`,
`HH:mm` or `YYYY-MM-DDTHH:mm` in the device's calendar means a date never
shifts a day across time zones or the pickers' UTC midnight.

Rejected: `Date` objects or epoch values, because their time zone conversion
moves a date near midnight.

### DEC-5 — The system paste control delivers by event only

**Reference:** `spec:AST-126/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

A tap on UIPasteControl grants one paste without a system question. The
pasted content reaches JavaScript only through `onPaste`. The control has no
read call, and no code reads the pasteboard before the tap.

## Open questions

- **OQ1 — Do the controls whose ecosystem counterpart covers the capability
  stay platform contracts?** (`human-design`) The text editing of
  `AstryxNativeTextField` is React Native's own, and the slider, segmented
  control and paste control have maintained counterparts in the ecosystem; their gap is the theme,
  the presentation seam, the dependency set and matching behaviour in Astryx Stage. Options: keep all
  of them as platform contracts; or keep the ones with a capability gap
  (Button, SegmentedControl, the date pickers) and draw the text box around
  React Native's `TextInput`.
- **OQ2 — Do the iOS-only controls get Android hosts?** (`human-design`)
  `spec:AST-082/FR11` asks for the platform's control where one exists, and
  Android has none here for Slider and SegmentedControl. Options: Material 3's Slider and segmented button toggle group as hosts for
  Slider and SegmentedControl; or the drawn Astryx controls on Android. Android
  has no system paste control, so PasteButton draws its Button there in either
  case.
- **OQ3 — Does the React Native date family depart from `spec:AST-043` FR1
  to FR3?** (`human-api`) Options: no, as FR2 states (an omitted prop is
  `adaptive-native`, and an explicit `native` never falls back); or yes, with an
  amendment to `spec:AST-043`: an omitted prop is the Astryx sheet unless a
  theme or provider asks for native, and an explicit `native` the picker cannot
  express draws the Astryx surface with a development warning.
- **OQ4 — How do controls without a core `presentation` prop name their
  presentation?** (`human-api`) Button and TextInput take `presentation`
  (`default`, `native`, `adaptive-native`) as a React Native addition; Slider
  and SegmentedControl take none and follow the provider and the theme.
  Options: give every control that prop; or one rendering axis shared by every
  component.
- **OQ5 — Does the date picker keep one name for two kinds of contract?**
  (`human-api`) `AstryxDatePicker` is a native component on iOS and a native
  module on Android. Options: one contract per name, each of one kind; or one
  name for both, told apart by kind.
- **OQ6 — Does Switch get a native contract?** (`human-design`) Options: an
  Astryx switch contract over UISwitch and Material 3's switch, with this
  group's appearance mapping, named features and Astryx Stage contract checks; or React
  Native's own `Switch`, tinted by the library, as its system presentation.
- **OQ7 — Does React Native depart from `spec:AST-082/FR11`'s native-first
  default?** (`human-design`) Options: no, as FR2 states (the system control
  wherever a host exists, unless the app or its theme asks for the Astryx
  control); or yes, with an amendment to `spec:AST-082`: the Astryx control
  unless a theme or the app asks for native.
- **OQ8 — Do the `./controls` views keep per-instance visual props?**
  (`human-api`) `spec:AST-082/DEC-2` keeps native-only visuals in the theme.
  An app that uses a view directly sets `buttonStyle`, `fieldStyle`, `fill`,
  `cornerRadius`, `insetX`, and the paste control's tints and radius per
  instance. Options: keep them on the views as the platform's app API, with the
  library components feeding them from the theme; or move them into the theme
  for the views too.
