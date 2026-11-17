---
title: 'Astryx now speaks multiple languages!'
description: "How internationalization and RTL came to Astryx: surveying the modern i18n landscape and using automation to catch RTL bugs a linter can't see."
date: '2026-08-11'
type: 'engineering'
draft: false
authors:
  - 'nynexman4464'
tags:
  - 'i18n'
  - 'AI'
  - 'Design systems'
relatedDocs:
  - title: 'Internationalization'
    href: '/docs/internationalization'
  - title: 'How Astryx works'
    href: '/blog/how-astryx-works'
---

Astryx grew out of Meta's internal design system, and that heritage shows up in internationalization. Most internal tools shipped in English to an English-speaking workforce, so translation and right-to-left support were rarely priorities. Components carried hardcoded English strings and left-to-right assumptions because, internally, nobody was asking for anything else.

Open-sourcing changed the audience. The trigger came from the community after release: a developer shipping an Arabic and Kurdish app filed a proposal pointing out that several components hardcoded user-facing and assistive strings in English with no way to override them. Table sort labels, pagination controls, Calendar month names. Their app was blocked, and the workaround was to fork the components to change a few words. They offered a fix, but we wanted to make sure we sat down and had a more comprehensive look.

I'd spent a good chunk of my career on localization before this, so when the work came up I offered to take it. The rough edges were familiar to me: strings length changing between translations, assumptions about how to pluralize, and concatenated strings making translation difficult to languages with different word order. Right to left languages in particular can be a challenge, breaking layout assumptions. It's been a number of years since I've had to think about these problems, so I leaned on AI assistants to resurvey the modern i18n landscape – what the standards look like now, what the popular React libraries settled on – before committing to a design.

## Why we didn't just adopt an i18n framework

The obvious move was to wire in an established runtime such as `react-intl`, Lingui, or i18next. This would have been cheapest to build, but it means that now Astryx carries even more dependency baggage. A hard dependency on one runtime would add bundle weight and collide with teams that already standardized on something else, leaving them to run two systems side by side or replace their own.

So we separated format from framework. We adopted ICU MessageFormat – the modern string format for i18n – with `intl-messageformat` as the formatter (behind a small adapter). A consumer already running `react-intl` or a compatible stack can hand Astryx their strings instead. That kept the surface tiny: one provider carrying a locale, one hook to read translations, and English defaults baked in. Components render with no setup at all, and adoption stays incremental.

We started [an RFC](https://github.com/meta/astryx/issues/3641) with some initial constraints and distilled them down as we iterated.  For example: we considered shipping each locale as a separate package, or even having per component string sets to allow code splitting.  After analysis we found that the amount of strings to ship ( approx. 2KB compressed ) didn't warrant the complexity and settled on a single en.json in core.  Other initial "requirements" were also removed or simplified as we found we just didn't need them.

## Plurals are now a solved problem

Plurals are deceptively easy to get wrong, because English lets you cheat. Often apps will use a label like `1 item(s)`, or code that tacks on an "s" whenever count is other than 1. It works well enough until it comes time to translate, because english plural forms aren't universal. Arabic has six. Russian and Polish have four. Japanese has one. The `one`/`other` assumption simply doesn't scale.

The good news (and this wasn't true not long ago) is that the platform handles this now. ICU MessageFormat lets a string declare its plural cases, and `Intl.PluralRules` (a widely-supported browser API backed by CLDR data) knows which form each number takes in each locale. So instead of hand-rolling pluralization and getting it wrong, a string just names its cases and lets the runtime pick:

```text
Go back {step, number} {step, plural, one {page} other {pages}}
```

![A results-count string rendered in Russian at counts 1, 2, and 5. The naive version, using only English one/other rules, shows the same wrong ending ("результаты") for every count. The correct version, using Russian's one/few/many/other CLDR categories, shows three different endings: результат, результата, результатов.](/blog/internationalizing-astryx/russian-plurals.png)

There's a bonus to expressing plurals this way: because the cases are declared as data rather than baked into prose, a translation that's missing a form — or that quietly kept only the English ones — isn't just wrong, it's _detectable_. That mattered a lot once we started translating in bulk.

## Right-to-left, and the bugs that hide from your linter

Translating everything into Arabic still leaves a broken UI if the layout stays left-to-right. Most RTL support is mechanical: use CSS logical properties such as `margin-inline-start` instead of `margin-left`, set `dir="rtl"`, and let the browser mirror the layout. A lint rule can enforce that, and ours does.

The bugs that actually escape are compositional. The example that pushed us to build dedicated tooling was this:

```css
inset-inline-start: 0;
transform: translateX(-50%);
```

Each line is valid on its own. A linter sees a logical inset and approves. But together they anchor an element to the logical start edge and then shift it with a physical transform that does not flip in RTL. Under `dir="rtl"`, the element lands on the wrong side by its own width. There is no bad token to grep for. The bug lives in the interaction.

Icons fail the same way. You can mirror a chevron by swapping the glyph in JS or by flipping it in CSS. Either approach is fine. Do both on the same element and they cancel, so the arrow points the wrong way. Again, both decisions look reasonable in isolation.

![Astryx Calendar showing a selected date range under RTL, before and after the fix. Before, the range highlight is a square-cornered rectangle because its physical corner-radius properties don't flip. After, it's a smoothly rounded pill whose caps sit on the correct reading-direction edges.](/blog/internationalizing-astryx/calendar-rtl-before-after.png)

Static analysis is weak against this class of problem because every property can be individually correct. So we built an [RTL audit that renders every component story in both directions and compares geometry](https://github.com/meta/astryx/pull/4517). For each absolutely positioned element it measures center-X relative to the parent in LTR, renders again in RTL, and checks that the element mirrored to the opposite side within tolerance. Elements that should have flipped but did not show up immediately. So did double-flipped icons that stayed put when they should have moved.

The hard part was reducing false positives across roughly 1,300 positioned elements. Full-width strips have no meaningful left or right side. Elements that are already centered mirror to themselves. A naive geometry check flags both as failures. We iterated on those cases, adding guards for degenerate parents, full-span elements, and already-centered children until the audit was quiet except for real regressions. It now runs in CI and catches directional bugs that a linter cannot see.

That is the lesson worth keeping: the RTL bugs that reach production are rarely a stray `left` – they are valid pieces that break in combination, so the reliable check is rendered geometry, not static rules.

## Seeding 29 languages

With the machinery in place, we had about 250 strings and a [Crowdin](https://crowdin.com/project/astryx) project with 29 empty languages. In the past this is where you'd wait — translations trickle in as contributors volunteer their languages. LLMs let us jumpstart it instead: generate a solid first pass for all 29 now, and let the community refine from there.

This is where a deliberate format choice paid off. We picked a catalog format that carries a `description` alongside every string — a note on where and how it's used — precisely because we expected the added context to produce better translations. The Dialog close button, for instance, notes that "Close" means dismiss the dialog, not nearby. That context was meant for human translators, and it turns out an AI translator leans on it just as heavily: both get the string _and_ the intent, rather than a bare word to guess at.

Then we played two models against each other. One generated; a deterministic validator ran every candidate through the same ICU parser Astryx uses at runtime, rejecting dropped placeholders or missing plural categories outright. But the validator only judges structure, so a second, different model reviewed the output for meaning, register, and idiom — and caught things rules can't, like button labels translated as nouns where the language needs an imperative ("closing" instead of "close"). Hebrew showed the pattern most clearly; fixing it surfaced more of the same.

The result was all 29 languages seeded and rendering today. To be clear, we still expect a fluent human to beat the machine — so these are a starting point, not a verdict, and corrections and contributions are very welcome.

![The demo todo app running in Arabic, fully right-to-left: navigation on the right, a populated list of Arabic todos, controls and component internals localized.](/blog/internationalizing-astryx/todo-arabic.png)

## What's still open

Astryx is not "finished" with i18n. A few problems are still real. PowerSearch still assembles some phrases from consumer-supplied pieces, which limits how grammatical those phrases can be in every language. Our pseudo-locale does not yet inflate string length aggressively enough to flush out all narrow-layout failures. And on the platform side, server-rendered translation and the adapter for reusing a consumer's existing runtime are both still active design work. We also are hunting down a new class of errors with truncation and IME incompatibility.  A big thanks to our community which is helping us find and track down these issues.

Astryx now speaks 29 languages and reads in both directions. Set your locale, set your `dir`, and it works (see our [internationalization guide](https://astryx.atmeta.com/docs/internationalization) for more info). If you speak one of those languages and see a translation that could be better, [the Crowdin project](https://crowdin.com/project/astryx) is open.
