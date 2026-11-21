---
title: 'What year is it? Bringing other calendars to Astryx'
description: "Supporting the calendars Western developers rarely think about: Persian, Hebrew, Japanese, and others that many people live by now work in Astryx's date components."
date: '2026-11-12'
type: 'engineering'
draft: false
authors:
  - 'nynexman4464'
tags:
  - 'i18n'
  - 'AI'
  - 'Design systems'
relatedDocs:
  - title: 'Calendars'
    href: '/docs/calendars'
  - title: 'Astryx now speaks multiple languages!'
    href: '/blog/internationalizing-astryx'
---

Today is November 12, 2026. It's also 21 Aban 1405 in the Persian calendar, 2 Kislev 5787 in the Hebrew calendar, 2569 in Thailand's Buddhist calendar, and the eighth year of Reiwa in Japan. Western developers don't often think about the other calendar systems in use around the world, and Astryx was no exception: until version 0.7.9, it could only show the first of those dates. A locale changed the language, the digits, and the order of the fields, but never the calendar.

We first looked at this during the [internationalization work](/blog/internationalizing-astryx) and parked it, for two reasons. Getting calendars right is complex: every date path in Calendar and the date inputs assumed Gregorian months. And we had no evidence anyone needed it yet. A [draft RFC](https://github.com/meta/astryx/issues/5498) captured the problem space and a dozen open questions, and then it waited.

## The request that got it moving

At the end of October, [a community RFC](https://github.com/meta/astryx/issues/9051) asked for the Jalali (Persian) calendar in Calendar and the date inputs. It came with exactly the evidence ours was missing. Jalali is the civil calendar for more than 110 million people in Iran and Afghanistan. Ant Design, MUI X, and React Spectrum already support it, `date-fns-jalali` alone has millions of npm downloads, and swapping in a Jalali date picker is one of the first things a Persian localization does.

We claimed the issue that day. Supporting only Persian would have been the narrow fix, but once you support one calendar that isn't Gregorian, you've built most of what the rest need. Browsers already know many calendars through `Intl`, so the scope became every calendar that ECMA-402 and Temporal require: Persian, Hebrew, three Hijri variants, Buddhist, Japanese, Minguo, Indian National, Chinese, Dangi, Coptic, two Ethiopic eras, and Gregorian itself. That's 16 identifiers in all.

Here's where it ended up. Pick a calendar, and notice that the value never changes:

```tsx live
import {CalendarSwitcher} from './CalendarSwitcher';

export default function Example() {
  return <CalendarSwitcher />;
}
```

Persian and Hebrew need the browser's `Temporal`, which Safari doesn't have yet, so there they fall back to Gregorian. The [InternationalizationProvider docs](/components/InternationalizationProvider) have a version with calendars that work in every browser.

## Where does a calendar belong?

The first question was where a calendar setting even belongs. Before writing any code, we had a few agents survey how other libraries and platforms handle it, and they split into camps:

- React Aria reads the calendar from the locale: a `-u-ca-` keyword, or the locale's default.
- MUI X, Angular Material, and Vuetify have you plug in a date library adapter, and some calendars have more than one competing adapter.
- iOS, Windows, and Qt treat the calendar as its own setting next to the locale, with a per-control override.
- Temporal never infers a calendar from the environment. You always ask for one.

We went with the platforms. `InternationalizationProvider` takes a `calendar`, and Calendar, DateInput, DateTimeInput, and DateRangeInput each take one that overrides it:

```tsx
<InternationalizationProvider locale="fa-IR" calendar="persian">
  {/* shows Aban 1405; value and onChange stay '2026-10-30' */}
  <Calendar value={date} onChange={setDate} />
</InternationalizationProvider>
```

A locale on its own doesn't pick the calendar yet. We'd like a locale's calendar keyword (`th-TH-u-ca-buddhist`) to count, but it changes what existing apps show, and we didn't want a breaking release for that alone, so it's [waiting for 0.8.0](https://github.com/meta/astryx/pull/10000).

The other early decision was easy, because every source agreed: values stay Gregorian ISO dates (`YYYY-MM-DD`) in every calendar, so `value`, `onChange`, `min`, and `max` don't change. Temporal's own docs warn about the "Unexpected Calendar Problem": code written for one calendar breaks when a date in another calendar shows up. A date picker that hands your app Persian dates is how that happens. With ISO values, your server, your database, and your handlers keep working, and only what people see and type changes.

## Prototype first

Showing a Persian date is easy: `Intl.DateTimeFormat` does it with `calendar: 'persian'`. Showing a Persian _calendar_ is harder. Persian months don't line up with Gregorian ones (1 Farvardin 1405 was March 21, 2026), so the real work is the month model. When does a month start, how long is it, and how many months are in this year? Hebrew leap years have 13 months, and so does every Ethiopic and Coptic year.

`Temporal` answers all of that, but when we started, it shipped in Chrome, Edge, and Firefox, and not in Safari or Node 24. Astryx had never asked apps to load a polyfill; our browser support policy lists "polyfilling every missing browser feature" as a non-goal. We also didn't want to end up reimplementing Temporal.

So the first prototype used only `Intl`. You can't ask `Intl` when a Persian month starts, but you can ask which day of the Persian month any date is. Step back that many days, minus one, and you're on the first of the month; walk forward until the day number resets, and you've found the end. It used no tables and no per-calendar math, in about 1.4 KB gzipped.

Then we checked it the boring way: every day from 1900 through 2100, in all 16 calendars, against `temporal-polyfill` and, where it supports the calendar, `@internationalized/date`. That's just over 1.17 million dates, with zero mismatches. Against native `Temporal` in Chromium and Firefox it was also zero, except for a few dates in the Chinese and Dangi calendars (more on those under caveats).

## Size wasn't the problem

The `Intl`-only engine was clever, and that was the worry. Bundle size was never the concern. The complexity of getting it right and the cost of maintaining it were, and a clever engine is exactly what nobody wants to debug two years from now. So we swapped it for `Temporal`, where each calendar operation is a single call, and made the polyfill optional instead of required:

- Gregorian apps pay nothing.
- Buddhist, Minguo, and Japanese share Gregorian months, so they work everywhere without `Temporal`.
- The rest use the runtime's `Temporal`. Where it's missing, the app loads the full build of `temporal-polyfill`. Without either one, those calendars show Gregorian dates and warn once in development.

```ts
// temporal-setup.ts: import before your app renders, on the server and in the browser
if (!('Temporal' in globalThis)) {
  await import('temporal-polyfill/full/global');
}
```

The comment in that snippet is a lesson from the prototype. If you render on the server, the server needs `Temporal` too. Otherwise the server renders Gregorian dates, the browser renders Persian ones, and hydration fails. Node 26 ships `Temporal`, which will make this easier over time.

## Typing dates in any calendar

An early plan treated typing dates in other calendars as optional. It isn't: showing a Persian calendar and then making people type a Gregorian date is half a feature.

This is the one place we wrote real logic of our own. `Temporal` only parses ISO strings, and `Intl` formats dates but can't read them back. So DateInput and DateTimeInput share one parser for every calendar, Gregorian included, built from what `Intl` itself writes for each locale and calendar: month names, era names, digits, and field order. `Temporal` then checks the result and rejects a date the calendar doesn't have, instead of quietly adjusting it. An early version read back every day from 1900 through 2100 across 23 locale and calendar pairs, in four formats, with zero failures.

The edge cases were the interesting part, and for each one we checked what other libraries do before deciding:

- A Hebrew leap year has Adar I and Adar II. Plain "Adar" means Adar II, as it does in ICU, hebcal, and Temporal's month codes.
- Someone who types 2026 into a Buddhist calendar field gets the year 2026 BE, about 543 years ago. Every library reads typed years literally, so we do too, and the app's `min` and `max` catch the mistake.
- Any decimal digits work, so ۱۴۰۵/۸/۲۱ (1405/8/21) reads fine. Traditional numerals, such as Hebrew letters, don't; only a handful of parsers try.

## The native picker can't help

On phones we'd normally hand date picking to the browser's native control, but `<input type="date">` is Gregorian by specification. What its picker shows depends on the device: iOS Safari follows the phone's calendar setting, and Chrome on Android is always Gregorian. Requests for calendar support in the HTML spec go back to 2011 and 2012, and they were closed as WONTFIX and LATER. So when an app picks a calendar other than Gregorian, Astryx uses its own picker (a popover with a mouse, a bottom sheet on a touch screen), even if the app asked for `presentation="native"`. A date shown in the wrong calendar reads as the wrong date.

## The small things that took the longest

The Ethiopic and Coptic calendars end every year with a 13th month of five or six days. In Calendar's fixed six-row grid, that's a row or two of the month and the rest filled with its neighbors. We kept the fixed grid so the layout doesn't jump between months, and `hasVariableRowCount` lets you opt out.

For Japanese eras, the touch picker seemed to need an era wheel. iOS's native picker doesn't have one: it shows two wheels, year and month, and labels each year with the era of the selected date. 2019 with July shows 令和元年 (Reiwa 1), and 2019 with January shows 平成31年 (Heisei 31). We copied that.

Calendar names can be sensitive, so in docs and UI we use the names from Unicode's CLDR, the same ones `Intl.DisplayNames` returns, rather than choosing our own.

## How it came together

The issue was opened on a Friday, and calendar support shipped in 0.7.9 the following Thursday. As with the internationalization work, AI agents did a lot of the legwork. Several surveyed libraries and platforms in parallel, others built prototypes and tried to break them, and they ran the brute-force checks (every day for two centuries, in 16 calendars, across three engines) that nobody would run by hand. The decisions that needed a person stayed with people: the scope, the Gregorian default, and how a date picker should behave on a phone.

## Caveats

- **Safari needs the polyfill** until it ships `Temporal`. Without it, calendars other than Gregorian, Buddhist, Minguo, and Japanese show Gregorian dates.
- **Chinese and Dangi months can differ by a day between runtimes.** Their months start on new moons, and runtimes compute those from different astronomical data. Between 1900 and 2100, native `Temporal` and the older `Intl` data in Node 24 disagree on nine Chinese and four Dangi month starts, such as the first month of the 2027 Chinese calendar year (February 6 versus February 7). Safari uses the same kind of data, so expect the same there. A polyfill doesn't fix it, because drop-in polyfills read that same older data. Within one browser everything agrees; the [guide](/docs/calendars#lunisolar-calendars) covers a server and a browser on different runtimes.
- **Dates before 1900 are best effort.** Typed entry and eras are tested from 1900 through 2100, and we'll go further when someone needs it.

## What's next

Letting a locale's `-u-ca-` keyword select the calendar is planned for 0.8.0. Early feedback on typed entry ([#10366](https://github.com/meta/astryx/issues/10366), [#10367](https://github.com/meta/astryx/issues/10367)) is already making error messages plainer ("Enter a real date") and letting apps word their own.

If one of these calendars is the one you live by and something looks off, please [open an issue](https://github.com/meta/astryx/issues); that's how this whole thing started. The [calendars guide](/docs/calendars) covers setup, including the polyfill and server rendering.
