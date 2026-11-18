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
`<PasteButton>` once. Where a theme or the app asks for the operating system's
own control, the person using the app gets that control: UIKit's button, slider,
text field, segmented control, date picker and paste control on iOS, Material 3's
button, text field and picker dialogs on Android. The component's API, words,
states and accessibility stay the same, the theme's accent and mode reach the
system control, and where the system has no equivalent the component draws its
own Astryx control. This record owns the native controls that make this
possible: their JavaScript API, their native contracts, how the library chooses
between the system control and its own, and how they behave.

The controls are part of the platform layer of `spec:AST-112`. They follow its
result vocabulary (`spec:AST-112/FR6`), capability shape (`spec:AST-112/FR7`),
additive evolution (`spec:AST-112/FR8`), its rule that the platform speaks
Astryx's design language for native controls (`spec:AST-112/FR9`), and Astryx
Stage as the contract developers build against (`spec:AST-112/FR12`).

## Why this exists

React Native and its ecosystem already wrap most of these controls, and do it
well. Astryx owns them for reasons that apply to all of them, plus one per
control:

- One component, two presentations. Each control is a presentation of an Astryx
  component with that component's API, chosen by the component, a provider, or
  the theme (FR2). An ecosystem control is a second component with its own props
  that an app would branch to by hand.
- The theme reaches the control. The accent, the ink on the accent, the mode,
  the element radius and the status colours cross to the native control (FR11).
- One dependency set. The package's required native dependencies are the
  platform's SDKs and React Native (`spec:AST-082/FR13`, `spec:AST-112/FR2`), and
  no package requires an Expo runtime library (`spec:AST-112/FR11`). A community
  or Expo package can stay an optional integration, never a requirement.
- Astryx Stage parity. Every control has a Stage implementation that matches iOS
  and Android (`spec:AST-112/FR12`), so previews and scripted checks show the
  same control the device shows.

| Native piece                | What the ecosystem offers                                                                                                                                                        | Why Astryx owns it                                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxNativeButton`        | React Native's `Button` draws the system button but takes no theme, icon or loading state. Expo UI's SwiftUI and Jetpack Compose buttons give system buttons with system styles. | Astryx's variants and sizes map to UIButton.Configuration (Liquid Glass for a floating button on iOS 26 and later) and to Material 3 buttons, with the theme's accent, ink and radius, busy state and press slop that match the drawn Button. Expo UI needs the Expo modules runtime. |
| `AstryxNativeSlider`        | `@react-native-community/slider` wraps UISlider and Android's seek bar, with the thumb on the UI thread.                                                                         | The capability gap is small. Astryx adds a throttled value stream with a separate commit, a controlled value that snaps back (FR9), accessibility value words and step, and right-to-left mirroring; the main reasons are the dependency set and Stage parity. OQ1.                   |
| `AstryxNativeTextField`     | React Native's `TextInput` is already UITextField or EditText: keyboard, IME, selection and autofill are the system's.                                                           | No gap in text editing: the library's default TextInput uses React Native's `TextInput`. The native piece adds only the system's box: UITextField's rounded or filled style and Material 3's outlined TextInputLayout, with status colours and an SF Symbol. OQ1.                     |
| `AstryxSegmentedControl`    | `@react-native-segmented-control/segmented-control` wraps UISegmentedControl on iOS and draws its own on Android.                                                                | UISegmentedControl's titles stay one size at every text size; Astryx's control scales its titles with Dynamic Type, grows with them, and hands back to the drawn control before a title would be cut (FR6). Icons come from Astryx icon names, and the selection is controlled (FR9). |
| `AstryxDatePicker` (view)   | `@react-native-community/datetimepicker` wraps UIDatePicker (compact, inline, spinner).                                                                                          | Values cross as ISO wall-clock strings, never `Date` objects, so a date never shifts a day across time zones (DEC-4). The view sits inside the library's date sheet and field (FR7), with the theme's accent and mode.                                                                |
| `AstryxDatePicker` (module) | The same package shows Android's date and time dialogs, including a Material design option.                                                                                      | Material 3's date range dialog, results instead of rejections (`spec:AST-112/FR6`), presentation from the calling surface, one dialog at a time, and ISO strings in both directions.                                                                                                  |
| `AstryxPasteControl`        | `expo-clipboard`'s paste button wraps UIPasteControl on iOS 16 and later.                                                                                                        | No capability gap. Astryx owns it for the dependency set, Stage parity, the theme's fill and radius on the control, and so that PasteButton draws it with PasteButton's API (FR8). OQ1.                                                                                               |

## Who uses it

| Native piece                | Kind                                       | Astryx components that use it                                                                                                                                                | What a person sees                                                                                                   |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AstryxNativeButton`        | native component (Fabric Native Component) | `Button` under native presentation (outside a connected group such as `ButtonGroup` or `InputGroup`, not a toggle, not a glass surface); apps through the `./controls` entry | The system button: UIButton.Configuration on iOS, a Material 3 button on Android                                     |
| `AstryxNativeSlider`        | native component (Fabric Native Component) | `Slider` under native presentation; `MediaScrubber`, which asks for it through `Slider`; apps through `./controls`                                                           | UISlider on iOS; the drawn Astryx slider on Android                                                                  |
| `AstryxNativeTextField`     | native component (Fabric Native Component) | `TextInput` under native presentation, outside an `InputGroup`; apps through `./controls`                                                                                    | The system text box inside Astryx's label, description and status                                                    |
| `AstryxSegmentedControl`    | native component (Fabric Native Component) | `SegmentedControl` under native presentation; apps through `./controls`                                                                                                      | UISegmentedControl on iOS; the drawn Astryx segments on Android and at large text sizes                              |
| `AstryxDatePicker` (view)   | native component (Fabric Native Component) | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on iOS when their surface resolves to native; apps through `./controls`                                          | UIDatePicker's compact pill in the field, or the inline calendar or wheels in the library's sheet                    |
| `AstryxDatePicker` (module) | native module (Turbo Native Module)        | `DateInput`, `TimeInput`, `DateTimeInput`, `DateRangeInput` on Android when their surface resolves to native; apps through `./controls`                                      | The Astryx field, which opens Material 3's date, date range or time dialog                                           |
| `AstryxPasteControl`        | native component (Fabric Native Component) | `PasteButton` on iOS 16 and later, in an app's own runtime; apps through `./controls`                                                                                        | The system paste control, which pastes with no permission prompt; elsewhere the library Button with the word "Paste" |

`SearchField`, `TextArea`, `NumberInput` and the other text-entry components
edit through React Native's `TextInput` and do not use `AstryxNativeTextField`.

## Non-goals

- The contract of any one component (Button, Slider, TextInput,
  SegmentedControl, the date family, PasteButton). Each component's own record
  owns it; this record owns its native presentation.
- `Switch` and `Stepper`. The presentation seam knows them, but Switch's system
  control is React Native's own `Switch` and Stepper has no native piece; neither
  has a platform contract here.
- The native-driver gesture views that ship beside the controls (swipe row,
  drag snap, zoom pager, pan and zoom). The gestures record owns them.
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

- **FR1 — The controls link with the platform by default.** The native controls
  are the native half of Astryx's own components, so an app's native build links
  them with the platform's core, with no opt-in. A minimal opt-out may exist; an
  app that opts out gets every probe below answering false and every component
  drawing its Astryx control. The `./controls` entry exports, for apps and the
  library alike:
  - `NativeButton`, `NativeSlider`, `NativeTextField`,
    `NativeSegmentedControl`, `NativePasteControl`, each with its
    `is<View>Available()` probe;
  - `datePickerView()` and `isDatePickerViewAvailable()` (the iOS picker view),
    and `AstryxDatePicker` with `isAvailable()`, `version()`, `openDate`,
    `openDateRange` and `openTime` (the Android dialogs);
  - `AndroidDatePicker` and `AndroidDateRangePicker`, which open the dialogs
    from a field the caller draws (`renderField({open, isOpen})`).

  The library reaches the entry only through
  `AstryxPlatform.capability('controls')` (`spec:AST-112/FR2`).

- **FR2 — The library chooses the system control or its own.** A component
  resolves its presentation in this order: its `presentation` prop, where it has
  one (Button, TextInput, the date family); the nearest
  provider's `nativePresentation` entry for the control; the provider's `'all'`
  or `'none'`; the theme's native presentation default; the component's own
  default; `default`.
  - `native` draws the system control where a host exists here; otherwise the
    component draws its own control and warns once per control in development.
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
    surface, or inside a connected group; TextInput inside an `InputGroup`;
    Slider vertical, with marks, or with a disabled reason, and with the tooltip
    value on iOS unless the theme prefers platform controls; SegmentedControl
    with a disabled reason, at large text sizes (AX1 and up), or once the
    control's fitting width exceeds its room (DEC-2).
  - Switching presentation keeps the value. A text field that is focused when
    its presentation switches loses focus, and `onBlur` runs.
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
  - The control's own touch tracking decides a press. On iOS the button stops
    tracking once the finger travels further than the library's press slop, the
    same distance the drawn Button uses. Every completed activation calls
    `onPress` once.
- **FR4 — Native slider.** `NativeSlider` takes `value`, `min`, `max`, `step`
  (0: continuous), `onChange`, `onChangeEnd`, `onSlidingChange`,
  `changeInterval` (default 100 ms), `isDisabled`, `isRTL`,
  `showsValueIndicator`, the appearance props of FR11 and the accessibility
  props of FR12.
  - The thumb belongs to the UI thread (FR13). `onChange` hears the value at
    most once per `changeInterval` while the thumb moves, and the last value of
    a move before the commit. `onChangeEnd` hears the value when the finger
    lifts, when the touch is cancelled, and after each accessibility increment
    or decrement. `onSlidingChange` hears `true` when a drag starts and `false`
    when it ends.
  - `step` snaps the thumb as it moves. A `value` that arrives while the thumb
    is held applies on release.
  - `isRTL` mirrors the slider: the minimum is at the right edge and the track
    fills from the right.
  - `showsValueIndicator` asks for a floating value label; iOS has none and
    draws none.
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
    `isTitleHidden` its SF Symbol; UIKit draws one or the other, not both.
  - `hug` sizes each segment to its content; `fill` gives every segment the
    same width.
  - Titles scale with Dynamic Type, and the control grows with them.
    `onFittingSize` reports the control's fitting size, so the library draws its
    own segments when the titles do not fit (FR2). A title is never cut.
  - The selected segment keeps UIKit's fill and title colours unless the theme
    paints them (FR11).
  - Android has no host; `SegmentedControl` draws its own segments there.
- **FR7 — Native date pickers.** Values are ISO wall-clock strings in the
  mode's shape (`YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm`), read and written
  through the Gregorian calendar in the device's time zone, never through UTC;
  `''` means no value.
  - iOS: the date picker view is one UIDatePicker (`compact`, `inline`,
    `wheels`) or a `pill` drawn like the compact picker. With a value and
    `compact`, the field row shows UIDatePicker's compact pill with its own
    popover. Otherwise the pill opens the library's sheet: the inline calendar
    or a time list, or the wheels, with Cancel leading and Done trailing; Done
    commits. A range opens a sheet with Starts and Ends rows that bound each
    other. The view takes the locale, first weekday, minute interval, hour
    cycle, bounds, and the appearance props of FR11.
  - Android: `openDate`, `openDateRange` and `openTime` show Material 3's date,
    date range and time dialogs over the calling surface's activity (a
    request's `rootTag`, else the top-most). Every option has a default:
    `openDate({})` opens at today with the platform's words. A `dateTime` field
    is two dialogs, date then time; a dismissed step keeps the value.
  - A dialog call resolves the picked value, `cancelled` when the person backs
    out, `unavailable` when no dialog can show at that moment (no activity, or one
    already showing), `invalid-value` when the dialog returns none, `not-linked` or
    `no-module` when the module is absent, or `error`. It never rejects. A field
    shows one dialog at a time.
  - A failure other than `cancelled` reaches the field's `onError`; without
    one, a development build warns. The field never does nothing silently.
  - The library plays its `select` haptic when a pick commits from a surface
    that played no system feedback (the compact pill's calendar, the inline
    calendar, the dialogs), never after the wheels, which tick.
- **FR8 — System paste control.** `NativePasteControl` takes `onPaste`,
  `acceptedTypes` (a subset of `text`, `url`, `image`; default `text`),
  `isDisabled`, `foregroundTint`, `backgroundTint`, `cornerRadius` (negative:
  the system capsule), `displayMode` (`iconAndLabel`, `label`), the appearance
  props of FR11 and `accessibilityHint`.
  - iOS 16 and later draw UIPasteControl. The person's tap on the system's own
    control is the permission, so iOS shows no paste prompt.
  - What was pasted reaches JavaScript only as `onPaste`, once per paste, the
    most specific accepted kind first: `{type: 'url', url}`, then
    `{type: 'image', uri, width, height}`, then `{type: 'text', text}`. An image
    is a PNG file under the app's temporary folder, valid until the next launch;
    the app copies what it keeps. Nothing reads the pasteboard (DEC-5).
  - The system enables the control only while the pasteboard holds an accepted
    kind. Its words and glyph are always the system's.
  - The view is never served to a preview project; PasteButton draws its
    fallback there, which reads the clipboard under the clipboard's consent
    policy.
  - Android and iOS before 16 have no host. PasteButton draws the library
    Button with the word "Paste", which reads the clipboard on the tap.
- **FR9 — A controlled value never fights the person.** The system control
  shows the person's change at once, and the caller's value stays the truth.
  - Slider: after each commit the wrapper renders once more; when the caller's
    `value` still differs from the committed value, it sends
    `restoreValue(value)` and the thumb goes back.
  - SegmentedControl: after each tap the wrapper renders once more; when
    `selectedIndex` still differs from the tapped index, it sends
    `restoreSelectedIndex(index)` and the control snaps back.
  - TextField: every change the field reports carries a count, and the wrapper
    sends the latest count it has seen back as `mostRecentEventCount` with
    `text`. The field applies `text` only when it has seen every change it sent,
    so an older value never overwrites a keystroke. This is
    React Native's own `TextInput` scheme.
- **FR10 — A control sizes itself.** A Fabric component without a measure
  function has no intrinsic size, so every control reports its fitting size
  with `onIntrinsicSize` whenever its content, size, text size or style changes,
  and the wrapper sizes the view with it.
  - Before the first report, the view takes the platform control's height for
    its size at the default text size, scaled by the font scale, and an
    estimated width. The estimate equals the report at the default text size,
    so a parent that measures twice sees no jump.
  - A later mount of the same button (label, size, variant, style, icon,
    loading, text size) starts at the size it reported last.
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
  - The `tint` and `dark` props carry the same accent and mode for a binary
    that reads them; `appearance` wins when its mode is set.
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
  - Paste control: its spoken name is the system's ("Paste"), so a screen
    reader user knows what the tap grants; only the hint is settable.
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
  wrapper renders its `fallback` (nothing by default) where its view is absent
  (opted out, an older binary, the OS has no equivalent, Jest, the web) and
  calls `onError({reason: 'no-native-view'})` once. Its probe says which, so the
  library draws its own control instead (`spec:AST-112/FR7`). A dialog call on
  a binary without the module resolves `not-linked` or `no-module`
  (`spec:AST-112/FR3`, `spec:AST-112/FR6`).
- **FR15 — Contracts are at revision 1 and grow by named features.** Every
  contract in the group (see Native contracts) is at revision 1. A behaviour
  added after revision 1 is a named feature, `<Contract>.<feature>`, that the
  binary lists and the JavaScript checks with `hasContractFeature` before it
  uses it. Without the feature, the JavaScript keeps the revision-1 behaviour or
  answers `unsupported`, and warns once; it never takes a silently weaker path.
  Astryx Stage pairs with the package through the package's Stage version floor:
  the package names the oldest Stage that implements its contract set, and an
  older Stage refuses the project and lists the gaps.

### Native contracts

| Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                       | Commands               | Events                                                                 | Platforms    |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ------------ |
| `AstryxNativeButton`     | native component (Fabric Native Component) | `title`, `variant`, `size`, `buttonStyle`, `systemImage`, `loading`, `enabled`, `appearance`, `tint`, `tintForeground`, `destructiveTint`, `dark`, `pressSlop`, `axLabel`, `axHint`, `axLink`, `axBusy`, `axAccessible`, `axSelected`, `axValue`, `axLanguage`                                                                                                                                              | none                   | `onNativePress`, `onIntrinsicSize`                                     | iOS, Android |
| `AstryxNativeSlider`     | native component (Fabric Native Component) | `value`, `minimumValue`, `maximumValue`, `step`, `changeInterval`, `enabled`, `showsValueIndicator`, `layoutDirection`, `appearance`, `minimumTrackTint`, `maximumTrackTint`, `thumbTint`, `axLabel`, `axHint`, `axValueText`, `axStep`                                                                                                                                                                     | `restoreValue`         | `onValueChange`, `onValueCommit`, `onSlidingChange`, `onIntrinsicSize` | iOS          |
| `AstryxNativeTextField`  | native component (Fabric Native Component) | `text`, `mostRecentEventCount`, `placeholder`, `size`, `secure`, `keyboard`, `contentType`, `returnKey`, `capitalize`, `autoCorrect`, `spellCheck`, `clearButton`, `startSystemImage`, `loading`, `editable`, `enabled`, `status`, `autoFocus`, `appearance`, `tint`, `statusTint`, `fieldStyle`, `fill`, `cornerRadius`, `insetX`, `dark`, `axLabel`, `axHint`, `axAccessible`, `axSelected`, `axLanguage` | `focus`, `blur`        | `onTextChange`, `onFocusChange`, `onReturn`, `onIntrinsicSize`         | iOS, Android |
| `AstryxSegmentedControl` | native component (Fabric Native Component) | `segments`, `selectedIndex`, `layout`, `size`, `enabled`, `appearance`, `selectedTint`, `selectedForeground`, `axGroupLabel`                                                                                                                                                                                                                                                                                | `restoreSelectedIndex` | `onNativeChange`, `onIntrinsicSize`                                    | iOS          |
| `AstryxDatePicker`       | native component (Fabric Native Component) | `mode`, `pickerStyle`, `value`, `minimumValue`, `maximumValue`, `localeIdentifier`, `firstWeekday`, `minuteInterval`, `hourCycle`, `pillTitle`, `pillIsPlaceholder`, `pickerEnabled`, `appearance`, `pickerTint`, `colorScheme`, `pickerAccessibilityLabel`, `pickerAccessibilityHint`                                                                                                                      | none                   | `onValueChange`, `onPillPress`, `onEditingChange`, `onPickerSize`      | iOS          |
| `AstryxPasteControl`     | native component (Fabric Native Component) | `acceptedTypes`, `enabled`, `foregroundTint`, `backgroundTint`, `cornerRadius`, `displayMode`, `appearance`, `axHint`                                                                                                                                                                                                                                                                                       | none                   | `onPaste`, `onIntrinsicSize`                                           | iOS          |

| Contract           | Kind                                | Methods                                                                | Platforms |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------- | --------- |
| `AstryxDatePicker` | native module (Turbo Native Module) | `getConstants`, `isAvailable`, `openDate`, `openDateRange`, `openTime` | Android   |

The module's requests carry ISO strings, the dialog's words (`''`: Material's
own), the first day of the week (out of range: the locale's) and an optional
`rootTag`; its result is `{action: 'set' | 'dismissed' | 'unavailable', value,
end}`, which the wrapper maps to FR7's results.

### Platform support

| Contract                    | iOS                                                                            | Android                                                                       | Astryx Stage                                      |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `AstryxNativeButton`        | UIButton with UIButton.Configuration; glass configurations on iOS 26 and later | Material 3 MaterialButton                                                     | Both looks                                        |
| `AstryxNativeSlider`        | UISlider                                                                       | No host: the library's drawn slider                                           | iOS look; absent under the Android look           |
| `AstryxNativeTextField`     | UITextField, rounded or filled                                                 | Material 3 TextInputLayout with TextInputEditText                             | Both looks                                        |
| `AstryxSegmentedControl`    | UISegmentedControl                                                             | No host: the library's drawn segments                                         | iOS look; absent under the Android look           |
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
  answers by its named feature (FR15).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR1 (the `controls` content), FR6 and FR7 (results and
  probes of the controls), FR8 (their contracts), FR9 (native controls speak
  Astryx's design language), FR10 and FR12 for the controls listed here.
- Changes `spec:AST-112` FR1, FR3 and FR5: the controls link with the platform's
  core by default instead of as an opt-in capability, a minimal opt-out may
  exist, and `./controls` stays their entry (FR1).
- The date family's presentation on React Native differs from
  `spec:AST-043/FR2` and FR3 in two places: an omitted prop resolves to the
  Astryx sheet unless a theme or provider asks for native, and an explicit
  `native` that the picker cannot express draws the Astryx surface with a
  development warning. OQ3 asks which rule governs.
- No other record changes.

## Verification

| Contract | Verification                                                                                                               | Representative states                                                                                                             | Mutation or failure expectation                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FR1      | Built app without any opt-in: binary symbols and the probes; unit tests of the entry through the `./testing` doubles       | default link; opted out; each probe                                                                                               | A default build lacks a control, or an opted-out build answers a probe true                                           |
| FR2      | Unit tests of the presentation resolution and of each component's shape rules                                              | prop, provider map, `'all'`, `'none'`, theme default; each ineligible shape; platform off; a focused field switching presentation | A wrong surface, a missing or repeated development warning, a native control for an ineligible shape, or a lost value |
| FR3      | Simulator and emulator checks of each variant, size and style; Astryx Stage contract suite                                 | each variant; glass on iOS 26 and earlier; loading; disabled; a drag past the press slop                                          | A wrong system style, a press after the slop, or a press without `onPress`                                            |
| FR4      | Astryx Stage contract suite on the virtual clock; Simulator drag and VoiceOver checks; UI-thread frame check               | a drag; step snapping; a value during a drag; an accessibility step; right to left                                                | More than one value per interval, a missing commit, a held value applied before release, or JavaScript run per frame  |
| FR5      | Simulator and emulator checks of each style and status; unit tests of the handle                                           | bordered and filled; each status; secure entry; focus and blur                                                                    | A wrong border or caret colour, a filled box on Android, or a handle that misses focus                                |
| FR6      | Astryx Stage contract suite; Simulator checks at the default text size and at AX1                                          | `hug` and `fill`; an image segment; disabled segments; a title that does not fit                                                  | A cut title, a native control at AX1, or a wrong fitting size                                                         |
| FR7      | Unit tests of the module's results through the `./testing` doubles (absent, older, current); Simulator and emulator checks | each mode; a range; a dismissed step; no activity; a second dialog; a date across time zones                                      | A rejection, a shifted day, a silent `cancelled` for `unavailable`, two dialogs, or a haptic after the wheels         |
| FR8      | Astryx Stage contract suite; Simulator checks of each type and display mode; unit tests of the preview boundary            | text, URL and image pastes; `label` mode; a styled size below the fitting size; a preview project                                 | A paste prompt, a pasteboard read, an invalid control from a small layout, or the system control in a preview project |
| FR9      | Unit tests of each controlled control with a caller that keeps its value; Astryx Stage restore scripts                     | a kept slider value; a kept segment; fast typing with a late value                                                                | The control keeps the person's value, or a late value overwrites a keystroke                                          |
| FR10     | Unit tests of the sizing; Simulator checks of the first frame at default and large text sizes                              | before the first report; a remount; `fill`; a paste control styled small                                                          | A jump after the first report, or a paste control laid out below its fitting size                                     |
| FR11     | Unit tests that each control forwards exactly the listed tokens; Simulator and emulator checks in light and dark           | each theme value per platform; a system button shape; an override a control cannot take                                           | A token sent where the table says it does not reach, a missing one, or no development notice for an override          |
| FR12     | VoiceOver and TalkBack checks of each control; unit tests of the forwarded props; Dynamic Type and font scale checks       | each element prop; busy; an image segment; large text sizes                                                                       | A host view read instead of the control, a lost label or state, or text that does not scale                           |
| FR13     | UI-thread frame checks during drags, typing and picker scrolls                                                             | a slider drag; a segmented tap; typing; the wheels                                                                                | JavaScript runs per frame                                                                                             |
| FR14     | Unit tests through the `./testing` doubles in their absent, older and current shapes                                       | each view absent; the module absent; an older binary                                                                              | A throw, a rejection, a repeated `onError`, or a component that draws nothing                                         |
| FR15     | The platform's spec rules check; Astryx Stage contract suites and its version floor                                        | every contract at revision 1; a missing named feature; an older Stage                                                             | A revision other than 1, a feature used without its check, or an older Stage that runs the project                    |

## Decision log

### DEC-1 — The system control is a presentation of the Astryx component

**Reference:** `spec:AST-126/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

An app writes one component and gets the system control or the Astryx control
from the same props, chosen by the component, a provider or the theme. A theme
that prefers platform controls asks for them; an app keeps Astryx's drawn
controls by default. The `./controls` views stay public for an app that wants a
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

The person's tap on UIPasteControl is the permission, so the content reaches
JavaScript only as `onPaste`. No read call exists beside it, and nothing reads
the pasteboard before the tap.

## Open questions

- **OQ1 — Do the controls whose ecosystem counterpart covers the capability
  stay platform contracts?** (`human-design`) The text editing of
  `AstryxNativeTextField` is React Native's own, and the slider, segmented
  control and paste control have maintained wrappers; their gap is the theme,
  the presentation seam, the dependency set and Stage parity. Options: keep all
  of them as platform contracts; or keep the ones with a capability gap
  (Button, SegmentedControl, the date pickers) and draw the text box around
  React Native's `TextInput`.
- **OQ2 — Do the iOS-only controls get Android hosts?** (`human-design`)
  Options: Material 3's Slider and segmented button toggle group as hosts for
  Slider and SegmentedControl; or the drawn Astryx controls on Android. Android
  has no system paste control, so PasteButton draws its Button there in either
  case.
- **OQ3 — Which rule governs the date family's presentation on React Native?**
  (`human-api`) Options: `spec:AST-043/FR2` and FR3 as written (an omitted prop
  is `adaptive-native`, and an explicit `native` never falls back); or this
  record's rule (an omitted prop is the Astryx sheet unless a theme or provider
  asks for native, and an explicit `native` the picker cannot express draws the
  Astryx surface with a development warning), recorded as an amendment to
  `spec:AST-043`.
- **OQ4 — How do controls without a core `presentation` prop name their
  presentation?** (`human-api`) Button and TextInput take `presentation`
  (`default`, `native`, `adaptive-native`) as a React Native addition; Slider
  and SegmentedControl take none and follow the provider and the theme.
  Options: give every control that prop; or one rendering axis shared by every
  component.
