---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-111
authority: draft
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-11-04
phase: accepted
owners: [nynexman4464]
affects_architecture:
  [architecture:internationalization, architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs:
  [
    internationalization,
    Calendar,
    DateInput,
    DateRangeInput,
    DateTimeInput,
    Timestamp,
  ]
---

# Calendar systems system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/i18n/**",
    "packages/core/src/utils/plainDate.ts",
    "packages/core/src/utils/dateParser.ts",
    "packages/core/src/Calendar/**",
    "packages/core/src/DateInput/**",
    "packages/core/src/DateRangeInput/**",
    "packages/core/src/DateTimeInput/**",
    "packages/core/src/Timestamp/**",
    "packages/core/src/PowerSearch/formatFilterValue.ts",
    "packages/charts/src/formatters.ts",
    "packages/lab/src/Chart/formatters.ts",
    "packages/lab/src/Schedule/**"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

People who use a calendar other than the Gregorian calendar see, type, and
navigate dates in that calendar. A Persian user picks 8 Aban 1405, a Hebrew user
sees Adar I and Adar II in a leap year, and a Thai user sees Buddhist years. The
application chooses the calendar. The stored value does not change: every date
component reads and writes Gregorian ISO dates, so application data, forms, and
server code stay calendar-neutral.

## Non-goals

- Inferring a calendar from a locale tag that does not name one. `fa-IR` alone
  stays Gregorian.
- Values that carry their calendar, such as `2024-02-10[u-ca=hebrew]`.
- A public calendar adapter or plugin API.
- Calendar arithmetic owned by Astryx. Temporal owns it.
- Calendar identifiers outside FR1, including the observational Hijri
  calendars.
- Japanese era names before Meiji (1868).
- Guaranteed behavior for dates before 1900. Such dates display and navigate as
  `Temporal` computes them, on a best-effort basis; typed entry, read-back, and
  era display are specified and tested only from 1900 through 2100. Better
  support, particularly for typed input, waits for evidence that applications
  need it.
- Traditional numerals as typed input: Hebrew letter numerals, the day numerals
  of the Chinese calendar, and sexagenary year names.
- Typed range entry in `DateRangeInput`.
- Week numbering other than ISO 8601.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI
  job/workflow topology belong in architecture or implementation unless callers
  or interoperating systems intentionally depend on that exact mechanism as a
  public protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Public contract

```tsx
<InternationalizationProvider locale="fa-IR" calendar="persian">
  {/* value and onChange stay Gregorian ISO, for example '2026-10-30' */}
  <DateInput label="Start date" value={date} onChange={setDate} />
  {/* one component can use a different calendar */}
  <Calendar calendar="gregory" value={day} onChange={setDay} />
</InternationalizationProvider>;

{
  /* a -u-ca- keyword in the locale does not select the calendar */
}
<InternationalizationProvider locale="th-TH-u-ca-buddhist" calendar="buddhist">
  …
</InternationalizationProvider>;
```

```ts
// Calendars other than the Gregorian, Buddhist, Minguo, and Japanese calendars
// need Temporal. Where the runtime lacks it, the application loads a
// polyfill on the server and in the browser.
import 'temporal-polyfill/full/global';
```

`calendar` takes a `CalendarSystem`, exported from `@astryxdesign/core/i18n`.
`InternationalizationProvider`, `Calendar`, `DateInput`, `DateRangeInput`, and
`DateTimeInput` accept it. `formatSharedDate` in `@astryxdesign/core/utils`, and
`shortDate` and `monthYear` in `@astryxdesign/charts` and Lab `Chart`, take an
optional `calendar` argument that defaults to `gregory` (FR18). The public
`useCalendarDays` and `useCalendarNavigation` hooks in
`@astryxdesign/core/Calendar` take an optional `calendar` that defaults to
`gregory` and never read the provider's calendar (FR20).

## Requirements

### Calendar selection and values

- **FR1 — Supported calendars.** `CalendarSystem` is `gregory`, `iso8601`,
  `buddhist`, `roc`, `japanese`, `persian`, `indian`, `hebrew`, `chinese`,
  `dangi`, `coptic`, `ethiopic`, `ethioaa`, `islamic-civil`, `islamic-tbla`, or
  `islamic-umalqura`: the calendars that ECMA-402 and Temporal require. Any
  other identifier resolves to `gregory` and warns once in development. Each
  calendar goes by its CLDR name (DEC-8).
- **FR2 — The application selects the calendar.** A date component uses, in
  order: its own `calendar` prop; the `calendar` prop of its
  `InternationalizationProvider`; otherwise `gregory`. A locale never selects
  the calendar: neither its default calendar nor a `-u-ca-` keyword in it
  applies. The calendar is independent of language, numbering, and direction:
  `locale="en" calendar="persian"` shows Persian dates in English, and
  `locale="fa-IR"` with no calendar shows Gregorian dates in Persian.
- **FR3 — Values stay Gregorian ISO.** The calendar never changes what a
  component reads or reports. `value`, `defaultValue`, `onChange`, `min`, `max`,
  `focusDate`, `onFocusDateChange`, the `Date` that `dateConstraints` receives,
  form submission, and every `system_*` format stay Gregorian ISO in every
  calendar.
- **FR4 — Structure comes from the calendar.** Month lengths, the number of
  months in a year, leap months, and eras come from the calendar. No grid,
  wheel, list, or step in a component, or in a hook given a calendar (FR20),
  assumes 12 months or Gregorian month lengths. A leap
  month is a distinct month with its own name: Adar I and Adar II in a Hebrew
  leap year, or the leap month of a Chinese or Dangi calendar year.
- **FR5 — Some calendars need Temporal.** The Gregorian, Buddhist, Minguo,
  and Japanese calendars work everywhere. The other calendars use the
  runtime's `Temporal`, native or a polyfill the application loads; Astryx
  bundles none. Without it, a component that resolves one of them shows and
  accepts Gregorian dates and warns once in development, naming the polyfill.
  Server and browser markup match when both resolve the calendar the same way,
  so a server-rendered application loads `Temporal` on the server too. FR19
  names the one exception.

### Calendar

- **FR6 — The grid shows calendar months.** The month heading, the grid's
  accessible name, day-button names, and announcements use the calendar. Each
  grid lays out one calendar month: its first day sits in its weekday column and
  outside days fill the remaining cells. The default fixed six-row grid applies
  to every month, including the five- or six-day thirteenth month of the Coptic
  and Ethiopic calendars; `hasVariableRowCount` gives each month only the rows
  it needs. Day numbers use the locale's digits in every calendar, as the
  heading does.
- **FR7 — Navigation steps calendar months and years.** Previous and Next move
  one calendar month. PageUp and PageDown move the focused day one calendar
  month, keep its day of the month, and clamp to the target month's length.
  Shift+PageUp and Shift+PageDown move the focused day one calendar year, to the
  same month of that year; a leap month that the target year does not have
  becomes its common counterpart (Adar I becomes Adar), and a day the target
  month lacks clamps to its last day. `min` and `max` bound
  navigation by day in every calendar.
- **FR8 — Week numbers are ISO 8601.** `hasWeekNumbers` shows ISO 8601 week
  numbers in every calendar, and its documentation says so.

### Typed entry

These requirements apply to the text fields of `DateInput` and
`DateTimeInput`.

- **FR9 — The field reads dates written in the calendar.** The field accepts a
  date written the way `Intl.DateTimeFormat` writes it for the locale and the
  calendar. All-numeric input follows the locale's numeric field order; with a
  month name present, a number of three or more digits is the year wherever it
  stands. The field accepts any Unicode decimal digits, in mixed scripts, and
  month and era names in every width that the locale and English produce,
  ignoring case and Latin diacritics. A typed month number means what the
  locale's numeric month means for that calendar: the month's position in the
  typed year for Hebrew, and the month number with the locale's leap marker for
  the Chinese and Dangi calendars. A plain Adar typed for a Hebrew leap year is
  Adar II. In the Gregorian calendar, text that matches none of these forms, or
  that names a date the locale's numeric order does not have, still commits on
  Enter or blur when `parseDateInput` reads it: `13/5/2026` in `en-US` commits
  13 May 2026. Otherwise FR11 applies. A one-digit year is not a date, even when
  `parseDateInput` reads it.
- **FR10 — Years are years of the calendar.** A typed year is a year of the
  active calendar, never a converted Gregorian year: `2026` in a Buddhist field
  is Buddhist year 2026. The format hint and the committed text show the era
  when the locale's format includes it, such as `พ.ศ.` (B.E., the Buddhist Era)
  or `民國` (Minguo, the Minguo calendar's era), and add it when the year alone is
  ambiguous, following the ICU4X year-ambiguity model: a year before the
  calendar's epoch era always shows its era, and in the Japanese and Minguo
  calendars, whose era changes within 1900 through 2100, a format that omits the
  era gains it, written narrow when that keeps the locale's field order; where
  every era width reorders the fields, only a date before the latest era gains
  it, because a year without an era reads in the latest era. Without
  a typed era, a one- or two-digit Japanese year is in the current era and a
  four-digit Japanese year is Gregorian, a Minguo year of up to three digits is
  in the 民國 (Minguo) era, and an Ethiopic year is in the AM era. A two-digit
  year resolves to the year within the 80 years before and 19 years after the
  current year of the calendar. A Japanese era year outside its era is rejected.
  No default year range applies; `min` and `max` catch a year typed in the wrong
  calendar.
- **FR11 — Dates that the calendar does not have are rejected.** The field
  rejects and announces a date that does not exist in the calendar, such as 30
  Esfand in a common Persian year, Adar I in a common Hebrew year, or day 6 of
  the Ethiopic thirteenth month in a common year. It never adjusts the date. A
  typed date outside `min`, `max`, or `dateConstraints` shows and announces an
  out-of-range error that writes the bounds in the calendar.
- **FR12 — `onChange` fires once for each complete date.** While a person types,
  `onChange` fires only when every field is present, the year is complete or is
  an era year with its era, no separator trails, and the last field cannot take
  another digit. A two-digit year and input without a year commit on Enter or
  blur. `onChange` fires at most once for each distinct value. This rule applies
  to the Gregorian calendar too.
- **FR13 — Committed text reads back as the same date.** `date`, `date_long`,
  and `date_weekday` render in the calendar. `system_date` stays Gregorian ISO
  and the field also accepts ISO input with it. For every calendar, locale, and
  named format, the field reads its committed text back as the same date, for
  every day from 1900 through 2100. Committed text in the Chinese and Dangi
  calendars includes the related Gregorian year, and its month and day agree
  with the field's own arithmetic in the same environment.
- **FR14 — Custom display text is display-only.** Text from a custom `format`
  function that the field cannot read back cannot be re-committed after an edit.

### Presentations

- **FR15 — Calendars other than Gregorian use the Astryx picker.**
  `<input type="date">` is Gregorian by specification, and the calendar its
  picker shows comes from the device, not the application. With a calendar
  other than `gregory` or `iso8601`, every presentation that shows the native
  control uses the Astryx surface instead: the popover on a fine pointer and the
  bottom sheet on a coarse pointer. This covers `adaptive-native`, the default,
  the deprecated `nativePicker` values, and an explicit `presentation="native"`,
  which also warns in development.
- **FR16 — The bottom sheet follows the calendar.** Its scrolling month calendar
  shows calendar months, labels, and digits as FR6 requires for `Calendar`, and
  keeps one fixed pane height. Its month wheel lists the months of the selected
  calendar year, including leap months by name. When the year changes, the month
  stays if the new year has it and otherwise becomes its common counterpart.
  Year labels include the era where the calendar has eras, such as `令和8` (Reiwa
  8). A year that an era change splits takes the era of the selected date, as
  the native iOS picker does: 2019 reads `平成31` (Heisei 31) with January
  selected and `令和元` (Reiwa 1, the era's first year) with July selected.
- **FR17 — `DateRangeInput` shows the range in the calendar.** Its trigger text
  and its calendar use the calendar. It has no typed entry.

### Shared formatters

- **FR18 — Built-in date formats follow the provider's calendar.** Timestamp's
  date-bearing formats, PowerSearch date values, and Schedule date labels render
  in the calendar of their `InternationalizationProvider` (FR2, without a
  component prop). Time-only formats, relative formats, and `system_*` formats
  do not change. Pure date helpers keep a Gregorian default and take an explicit
  calendar: `plainDateFormat` through its existing `calendar` format option, and
  `formatSharedDate`, `shortDate`, and `monthYear` through an optional
  `calendar` argument. Astryx call sites pass the resolved calendar.
- **FR20 — The public calendar hooks take an explicit calendar.**
  `useCalendarDays` and `useCalendarNavigation` take an optional `calendar` that
  defaults to `gregory`; they never read the provider's calendar, so a caller's
  numbers keep their meaning when the application adds a provider calendar.
  Weekday names and `monthYearLabel` still use the provider's locale. With a
  calendar, `useCalendarDays` reads `year` and `month` as the calendar's year
  and the month's position in that year, as `Temporal.PlainDate` numbers them (1
  through 13 in a Hebrew leap year), and each day keeps its Gregorian date while
  `dayNumber` is its day of the calendar month. `useCalendarNavigation` steps
  calendar months, writes `monthYearLabel` in the calendar, and reports the
  visible month in the calendar's numbers so that it feeds `useCalendarDays`.
  Without `calendar`, both behave as released.

### Lunisolar calendars

- **FR19 — Lunisolar dates follow the runtime.** Month starts in the Chinese and
  Dangi calendars come from the runtime's `Temporal`. Native `Temporal` agrees
  with official observatory data from 1900 through 2100. A polyfill that reads
  the platform's `Intl` data can start nine Chinese calendar months and four
  Dangi calendar months in that range one day apart, the first month of the 2027
  Chinese calendar year among them. When a server and a browser use
  implementations that disagree on a month start, the browser's render of that
  month differs from the server markup, and React renders that part again on the
  client during hydration. The internationalization guide and the date component
  documentation state this. They advise loading a polyfill only where `Temporal`
  is missing, and loading the same implementation on the server and in the
  browser when a server-rendered application needs identical markup in the
  Chinese or Dangi calendar.

### Accessibility contract

- **AR1 — Spoken dates match the visible calendar.** Day-button names, grid
  names, selection and navigation announcements, error messages, and the bounds
  in error messages use the calendar.
- **AR2 — The field describes its format.** With a calendar other than `gregory`
  or `iso8601`, an empty focused field without a caller `placeholder` shows an
  example date in the calendar's numeric pattern: today when the field accepts
  it, else the nearest date it accepts within `min`, `max`, and
  `dateConstraints`. A caller's `placeholder` always wins. The field's
  description names its calendar, by the locale's CLDR display name (DEC-8),
  only when that calendar differs from its provider's calendar, so a page in one
  calendar does not repeat it and a page that mixes calendars says which field
  uses which.
- **AR3 — Each rejection has its own message.** Unreadable text, a date the
  calendar does not have, and an out-of-range date each announce a different
  message.

### Platform support

- Supported feature/engine floor: Gregorian-aligned calendars work in every
  supported browser and renderer. The other calendars need `Temporal`: native in
  the runtime, or a polyfill that the application loads. The
  internationalization guide lists the runtimes that ship it.
- Unsupported behavior: without `Temporal`, FR5's Gregorian fallback and
  development warning. Safari on macOS and iOS lacks `Temporal`, and
  `spec:AST-013` FR3 names iOS Safari explicitly, so every component that
  resolves a calendar records a `spec:AST-013` FR12 exception: `Calendar`,
  `DateInput`, `DateRangeInput`, `DateTimeInput`, and FR18's `Timestamp` and
  `PowerSearch`. The exception names the capability (calendars that need
  `Temporal`), the reduction (FR5's fallback unless the application loads a
  polyfill; an application that renders on the server loads it on the server
  too), the preserved obligations (`spec:AST-013` FR7 and FR8, and FR9 whenever
  the server and the browser resolve the calendar the same way, outside FR19's
  case of the Chinese and Dangi calendars), the evidence (real-browser runs with
  `Temporal` removed, with and without a polyfill), the owner (`nynexman4464`),
  and the review condition (Safari ships `Temporal`).
- Browser evidence: real Chromium and Firefox with native `Temporal`; real
  Chromium, Firefox, and WebKit with `Temporal` removed, with and without the
  polyfill; server render and hydration with and without `Temporal`.

## Current-state impact

- `architecture:internationalization` INV10 states FR2's calendar resolution,
  FR3's Gregorian ISO values, and FR5's `Temporal` boundary in place of
  Gregorian-only date semantics. INV8's named locale-sensitive helpers include
  the calendar-system helper.
- `component:InternationalizationProvider` adds the `calendar` prop and FR2.
- `component:Calendar`, `component:DateInput`, `component:DateRangeInput`, and
  `component:DateTimeInput` add the `calendar` prop, project FR4–FR17 and
  AR1–AR3, and record the `spec:AST-013` FR12 exception.
- `component:Timestamp` and `component:PowerSearch` follow FR18 and record the
  `spec:AST-013` FR12 exception. Schedule follows FR18, and the chart formatters
  take FR18's optional `calendar` argument.
- `spec:AST-043` FR1–FR3 name the calendar exception: under a calendar other
  than `gregory` or `iso8601`, `adaptive-native`, the deprecated `nativePicker`
  values, and an explicit `presentation="native"` use the Astryx surface for
  `DateInput` and `DateTimeInput` (FR15).
- `architecture:public-component-api` INV16, where a caller's explicit
  presentation choice wins over the default, names the same calendar exception:
  under a calendar other than `gregory` or `iso8601`, an explicit
  `presentation="native"` resolves to the Astryx surface for the pointer,
  because no native date picker shows the application's calendar (FR15, DEC-7).
- A provider locale with a `-u-ca-` keyword keeps the Gregorian dates that the
  latest stable release shows (FR2). Honoring the keyword would change output
  with no code change, which `spec:AST-017` FR1 classes as breaking, so it waits
  for a minor release (DEC-2).
- Gregorian behavior that changes, with its `spec:AST-017` class:
  - `component:Calendar` AR1 already steps a Gregorian year with Shift+PageUp
    and Shift+PageDown, clamping a missing day to the month's last day. FR7
    extends the step to calendar years and leap months: additive (FR5).
  - FR12's `onChange` timing stops reporting dates for incomplete input, which
    restores `component:DateInput` FR1's next-ISO-date contract: a nonbreaking
    fix (FR5).
  - AR3's messages are additive announcements for input the field already
    rejects (FR5).
  - FR11 keeps out-of-range typed text in the field with its error, where the
    field reverts the text on blur on the latest stable release. The value
    does not change in either case: a nonbreaking interaction change (FR5).
  - `parseDateInput` in `@astryxdesign/core/utils` does not change, and the
    Gregorian text field still commits any text it reads, except a one-digit
    year (FR9).
  - A two-digit year follows the locale's field order: `1/5/26` in `en-GB`
    commits 1 May 2026, where the latest stable release commits the
    month-first 5 January 2026. This restores the locale order that
    `parseDateInput` applies to four-digit years: a fix (FR5).
  - In month-first locales a two-digit year reads within FR10's window, where
    the latest stable release uses the runtime's `Date` parsing: in 2026,
    `1/5/46` to `1/5/49` in `en-US` commit 1946 to 1949 instead of 2046 to 2049.
    `component:DateInput` FR6 records the `Date` fallback as an implementation
    gap, so this restores FR6: nonbreaking (FR5).
  - A one-digit year is not a date: `1/5/2`, which the latest stable release
    reads through the runtime's `Date` as 5 January 2002, does not commit. This
    also restores `component:DateInput` FR6, which records that fallback as a
    gap: nonbreaking (FR5).
  - `formatSharedDate`, `shortDate`, and `monthYear` gain an optional argument:
    additive (FR5).
  - `useCalendarDays` and `useCalendarNavigation` gain an optional `calendar`
    that defaults to `gregory` (FR20): additive (FR5).
- Consumer docs: the internationalization guide covers choosing a calendar,
  loading a `Temporal` polyfill on the server and in the browser, and FR19's
  caveat. `Calendar` documents `hasWeekNumbers` as ISO 8601 and explains that
  `hasVariableRowCount` trades a fixed height for a compact grid. The
  `DateInput` family documents FR15's fallback and recommends `min` and `max`
  for Buddhist and Minguo fields.

## Verification

| Contract     | Verification                                                                                                 | Representative states                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR2      | Provider and component resolution tests                                                                      | Every identifier; an unknown identifier; component over provider over default; bare `fa-IR`; a `-u-ca-` locale stays Gregorian                                                                                                       | A locale selects a calendar, the precedence changes, or an unknown identifier throws                                                                                             |
| FR3          | Callback and form tests in non-Gregorian calendars                                                           | Select, type, clear, `min`, `max`, and `dateConstraints` in `persian` and `hebrew`                                                                                                                                                   | Any reported or submitted value is not Gregorian ISO                                                                                                                             |
| FR4, FR6–FR7 | Month-structure tests against `Temporal` for every calendar from 1900 through 2100; real-browser grid checks | Persian month boundaries, a Hebrew leap year, the Ethiopic thirteenth month, the Japanese era change, a Chinese leap month; PageUp, PageDown, Shift+PageUp, Shift+PageDown                                                           | A month start, length, or step differs from `Temporal`, or a leap month vanishes                                                                                                 |
| FR5          | Real-browser runs with `Temporal` removed, with and without the polyfill; server render and hydrate          | `persian` with and without `Temporal`; `buddhist` and `japanese` without `Temporal`                                                                                                                                                  | A crash, a missing warning, or a hydration mismatch                                                                                                                              |
| FR8          | Calendar week-number tests                                                                                   | `persian` and `hebrew` grids with `hasWeekNumbers`                                                                                                                                                                                   | A week number that is not ISO 8601                                                                                                                                               |
| FR9–FR14     | Parser tests; a round-trip matrix; DateInput and DateTimeInput interaction tests                             | Every calendar from 1900 through 2100 in native locales, English, and Swedish, in every named format; Adar; partial input; mixed digits; Japanese eras; invalid dates; Gregorian text that only `parseDateInput` reads               | A round trip fails, an invalid date is adjusted, `onChange` fires on partial input, or Gregorian text that `parseDateInput` reads, other than a one-digit year, stops committing |
| FR15–FR17    | Presentation tests and touch interaction tests                                                               | `adaptive-native` and `native` with `persian`; month counts in Hebrew leap and common years; era year labels; `DateRangeInput` trigger text                                                                                          | A native date input renders for a non-Gregorian calendar under any presentation, or a wheel shows 12 months for a 13-month year                                                  |
| FR18         | Formatter tests                                                                                              | Timestamp date formats, PowerSearch values, Schedule labels, and chart dates in `persian`                                                                                                                                            | A built-in date format ignores the provider's calendar, or a `system_*` format changes                                                                                           |
| FR19         | Documentation review                                                                                         | The internationalization guide and date component docs                                                                                                                                                                               | The caveat is missing                                                                                                                                                            |
| FR20         | Hook tests                                                                                                   | `useCalendarDays` without `calendar` matches released output; `persian` and a Hebrew leap year (month 13) with `calendar`; `useCalendarNavigation` steps and labels calendar months; a provider calendar does not change either hook | A hook reads the provider's calendar, changes released Gregorian output, or assumes 12 months when given a calendar                                                              |
| AR1–AR3      | Accessibility-tree and announcement assertions                                                               | Day buttons and announcements in `persian`; each rejection kind                                                                                                                                                                      | A spoken date uses another calendar than the grid, or two rejection kinds share a message                                                                                        |

Known verification gap: none of these suites exist on `main`.

## Decision log

### DEC-1 — Values stay Gregorian ISO

**Reference:** `spec:AST-111/DEC-1`
**Decider:** `nynexman4464`, 2026-11-02

The calendar changes presentation and input only, so application data, forms,
servers, and the values that existing callers handle stay the same. Date
libraries and platforms that support many calendars return calendar-neutral
values for the same reason: a date read back in an unexpected calendar is a
common source of bugs.

Rejected: values tagged with their calendar, because every consumer would then
need calendar-aware code.

### DEC-2 — The application chooses the calendar, separately from language

**Reference:** `spec:AST-111/DEC-2`
**Decider:** `nynexman4464`, 2026-11-02

The provider's `calendar` sets the calendar for a subtree, and Gregorian stays
the default, so screens in `fa`,
`th`, and `ar-SA` keep their Gregorian dates until the application opts in. A
component's own `calendar` serves a screen that shows two calendars side by
side, such as a Gregorian date of birth beside a Hijri date; a nested provider
would make the caller restate the locale, catalogs, and overrides, because a
nested provider replaces its parent's context.

Rejected: following the locale's default calendar, because it silently changes
every screen in a locale whose default calendar is not Gregorian.

A `-u-ca-` keyword in the locale does not select the calendar either. A locale
such as `th-TH-u-ca-buddhist` shows Gregorian dates on the latest stable
release, so honoring the keyword would change an application's output with no
code change, which `spec:AST-017` FR1 classes as breaking. The keyword can
become a selector in a minor release, with `calendar="gregory"` as the
restoring prop.

Rejected: honoring the keyword in a patch as the application's explicit
request, because `spec:AST-017` FR6 does not let an approval reclassify a
change FR1 calls breaking. Rejected: a `calendar="from-locale"` opt-in, because
it adds a public value whose only job is to repeat what a later minor release
makes the default.

### DEC-3 — Temporal does the calendar arithmetic, and the application loads any polyfill

**Reference:** `spec:AST-111/DEC-3`
**Decider:** `nynexman4464`, 2026-11-02

Astryx owns no calendar algorithms or tables, so correctness and maintenance
stay with the platform. Astryx bundles no polyfill, so a Gregorian application
pays nothing. An application that needs another calendar in a runtime without
`Temporal` loads a polyfill on the server and in the browser.

Rejected: calendar arithmetic owned by Astryx, because its correctness and
maintenance cost belong to the platform. Rejected: a bundled polyfill, because
every application would pay for it.

### DEC-4 — One parser reads typed dates in every calendar

**Reference:** `spec:AST-111/DEC-4`
**Decider:** `nynexman4464`, 2026-11-02

`Temporal` parses only machine strings and `Intl` has no parser, so Astryx reads
typed text itself. One parser, built from `Intl`'s own output and validated by
`Temporal`, serves every calendar including Gregorian, so the formats a field
shows are the formats it reads. Years are read literally in the calendar, as
other date libraries read them; the visible era tells people which year to type,
and `min` and `max` catch a mistake. A default year range is excluded because it
would reject dates that applications accept.

Rejected: segmented day, month, and year fields, because they replace the
free-text interaction of `DateInput`.

### DEC-5 — The lunisolar calendars follow the runtime

**Reference:** `spec:AST-111/DEC-5`
**Decider:** `nynexman4464`, 2026-11-02

People use these calendars, and native `Temporal` agrees with observatory data
everywhere it ships. The remaining disagreement comes from polyfills that read
the platform's `Intl` data and ends when every runtime ships `Temporal`, so the
documentation states it instead of withholding the calendars.

Rejected: forcing one polyfill everywhere, because drop-in polyfills read the
host's `Intl` data and make native environments less consistent.

### DEC-6 — Week numbers stay ISO 8601, and a year step keeps the month

**Reference:** `spec:AST-111/DEC-6`
**Decider:** `nynexman4464`, 2026-11-02

`Temporal` defines week numbering only for `iso8601`, the Gregorian calendar
with ISO 8601 weeks, so `hasWeekNumbers` keeps one meaning. In a thirteen-month
calendar, twelve months is not a year, so a year step moves to the same month of
the next calendar year.

### DEC-7 — A non-Gregorian calendar wins over the native picker

**Reference:** `spec:AST-111/DEC-7`
**Decider:** `nynexman4464`, 2026-11-02

The native date control is Gregorian on Android and follows the device's own
calendar on iOS, so it cannot show the application's calendar. A date shown in
the wrong calendar reads as a wrong date, unlike the precision a native control
loses for seconds or steps, so the calendar wins even over an explicit
`native`.

Rejected: keeping an explicit `native` native, because the device, not the
application, would then choose the calendar a person sees.

### DEC-8 — Calendars go by their CLDR names

**Reference:** `spec:AST-111/DEC-8`
**Decider:** `nynexman4464`, 2026-11-10

Astryx names a calendar the way CLDR names it. A component that names a
calendar reads the locale's display name from `Intl.DisplayNames` with type
`calendar` (AR2). Specs, docs, changesets, and source comments use the CLDR
English name, such as the Minguo calendar for `roc`, the Dangi calendar for
`dangi`, and the Chinese calendar for `chinese`. They write the ECMA-402
identifier in code font only where the API value itself is meant. The `iso8601`
calendar, which CLDR names the Gregorian calendar with ISO 8601 weeks, counts
as the Gregorian calendar where weeks do not matter. Era names that `Intl`
writes, such as `民國`, are data and appear as `Intl` writes them. Search
keywords may also list other common names so people can find a page.

Rejected: names that are not CLDR's, such as a country, a state, or a holiday
standing for a calendar, because a standard name stays neutral and matches what
the components show.

## Open questions

None.
