---
title: 'Astryx v0.6.0: themes that respond, components that adapt'
description: 'Responsive theme rules, a Selector that can choose the right surface, Neutral’s visual makeover, six new templates, and a specification-backed path toward v1.'
date: '2026-09-10'
type: 'update'
authors:
  - 'team'
tags:
  - 'Release'
  - 'Theming'
  - 'Components'
  - 'Accessibility'
---

Astryx v0.6.0 brings responsive theme rules, adaptable selection, and a more intentional Neutral palette to product builders.

Record the version you use today, update every stable Astryx package in your project to `0.6.0`, then run the new CLI’s upgrade:

```bash
OLD_VERSION=0.5.4 # replace with the Core version your project uses today
npm i @astryxdesign/core@0.6.0 @astryxdesign/cli@0.6.0 @astryxdesign/theme-neutral@0.6.0
npx @astryxdesign/cli upgrade --from "$OLD_VERSION" --apply
```

The example includes Neutral; update any other stable Astryx themes your project uses in the same install step.

## Themes respond in CSS

A theme can now adapt tokens, component styles, typography, color, radius, and motion to named viewport widths, pointer precision, contrast preference, and reduced-motion preference.

```ts
defineTheme({
  name: 'acme',
  adaptations: {
    widthBreakpoints: {sm: 640, md: 768, lg: 1024},
    rules: [
      {
        when: {width: {below: 'md'}, pointer: 'coarse'},
        value: {
          tokens: {'--size-element-md': '44px'},
          components: {
            button: {base: {fontWeight: 'var(--font-weight-bold)'}},
          },
        },
      },
      {
        when: {motion: 'reduce'},
        value: {tokens: {'--duration-medium': '0ms'}},
      },
    ],
  },
});
```

A theme can respond to more than one condition at once—for example, a small screen with a touch pointer. When rules overlap, the later rule takes priority. Because the result is CSS, the browser adapts immediately without waiting for a JavaScript layout loop.

![The same review card rendered from one Astryx theme at two widths. The wide treatment uses a blue accent, compact controls, and tighter corners. The compact treatment uses the theme’s narrow-width rule: magenta accent, larger controls, bolder buttons, and rounder corners.](/blog/astryx-v0-6-0/responsive-theme.png)

`AppShell` uses the same theme-owned width map for its named mobile-navigation breakpoints, including the new `xl` and `2xl` values. A theme family can also define local tokens without turning every theme-specific concept into a permanent Core token.

## Selector adapts its presentation

Responsive design is not only spacing. On a compact surface, the same choice can work better as a modal bottom sheet with touch-sized rows; on a wider surface, it can remain an anchored popover. `Selector` and `MultiSelector` ship that `presentation="adaptive"` behavior in v0.6.0 while preserving the same options and selected values.

They also gain announced empty states and `isReadOnly`, so selected values can remain focusable and form-submittable without exposing editing controls.

![A compact project form where opening the Owning team Selector animates its adaptive bottom sheet into view, then dismisses it. The Reviewers MultiSelector remains visible in the same product context.](/blog/astryx-v0-6-0/adaptive-inputs.webp)

## Six new starting points

Astryx 0.6 adds five wizard templates and a work-item detail page. Each one solves a distinct product shape:

- [Checkout Wizard](/templates/checkout-wizard) — a stepped checkout with a live order summary.
- [Form Wizard](/templates/form-wizard) — a full-page flow that gives each step the full content width.
- [Dialog Wizard](/templates/form-wizard-dialog) — a short guided flow that keeps the underlying page in context.
- [Inline Wizard](/templates/form-wizard-inline) — an accordion flow where completed steps collapse around the active one.
- [Vertical Wizard](/templates/form-wizard-vertical) — a long-form flow with persistent progress and contextual guidance.
- [Work Item Detail](/templates/work-item-detail) — a tracked-item view with subtasks, properties, attachments, and activity.

Each template can be previewed or opened in the Playground from its linked page, or added with `astryx template <name>`.

## Neutral’s visual makeover

Neutral has been rebuilt around a reproducible, theme-owned OKLCH palette. Semantic, syntax, and categorical colors now reference named palette stops, so the palette source, generated colors, runtime theme, and CLI template stay reviewable together.

The visible changes are deliberate: light-mode foregrounds use darker stops; dark chromatic ramps have calmer low tones; destructive buttons use palette-backed red interaction colors; dark status surfaces are more solid; and info banners use a quieter blue tint. Semantic status fills now share Neutral-owned local tokens across badges, status dots, Stepper indicators, and progress bars.

![The identical release-readiness pattern rendered before and after the Neutral update in the current color mode. It compares info, success, warning, and error treatments across a banner, badges, status dots, progress bars, checkboxes, and primary, secondary, and destructive actions.](/blog/astryx-v0-6-0/neutral-makeover.png)

For theme authors, 0.6 also adds an authoring-time OKLCH palette generator with terminal and HTML previews, typed output, custom stops, deterministic generation records, and overwrite protection.

## A specification-backed path to v1

Behind the visible release, we are writing durable specifications for components and shared systems as Astryx moves toward v1 hardening. These records define what a component owns: its public API, behavior, accessibility requirements, anatomy, theme targets, state representation, and allowed variation.

Where an approved record is marked current, it gives contributors and maintainers one source of truth for the behavior it owns; draft or still-open decisions continue to require human review. Current records also give agents something concrete to verify: they can compare an implementation with an accepted contract, catch drift in tests or docs, and distinguish a bug fix from a new system-level decision.

The practical goal is consistency and speed: fewer contradictory treatments across components, clearer review feedback, and faster responses to community contributions because routine correctness can be checked against decisions that are already settled. Humans still own new design and API direction; agents help keep the implementation aligned once that direction is recorded.

## Migrate to 0.6.0

Use the install-then-upgrade order shown above. Installing `0.6.0` first matters: the CLI derives its target from the installed Core version, so running the upgrade while Core is still on `0.5.x` reports that the project is already current and skips the v0.6 migrations.

The codemod handles the common focus-hook, IME import, Resizable, and Astryx selector migrations. The main CSS change is that visual props and states now use reflected `data-*` attributes instead of bare classes:

```css
.astryx-button.primary
/* becomes */
.astryx-button:is(.primary, [data-variant='primary'])
```

After it runs, review these cases:

- unqualified or custom selectors, plus selectors stored in JavaScript or TypeScript;
- dynamic focus-hook and Resizable configuration objects, spreads, and computed properties;
- non-standard imports of `isImeKeyEvent`, which now comes from `@astryxdesign/core/utils`;
- custom Stepper integrations: `minimumStepWidth` is a pixel number, `registerStep` takes `{getIsDisabled}`, and compact-layout internals are no longer public;
- custom theme tooling that reads generated selectors; and
- prebuilt custom themes, which must be rebuilt and deployed with Core 0.6.0.

At an `AppShell` mobile breakpoint, the exact boundary now renders the wider layout; mobile mode applies only below it. Theme authors should also expect invalid adaptation values and reachable token cycles to fail before CSS is emitted.

## Also in this release

- Rich labels and descriptions on CheckboxListItem and RadioListItem now produce the correct accessible name and description.
- TextInput and TextArea forward `autoComplete`.
- Popover focus and same-gesture reopen protection now apply through every opening path.
- Hover-highlighted option lists no longer auto-scroll repeatedly under a stationary pointer.
- Carousel’s edge fades mirror under RTL.
- CLI integrations can add managed agent guidance, and `doctor integration` checks their structure and collisions.
- Debug records now populate `resultCount`, `emptyResult`, `resultKind`, and `directMatch` across the command tree under `schemaVersion: 3`.
- `withAstryx()` refuses a Turbopack configuration instead of completing an unstyled build.

## Thank you

Thanks to the contributors behind the changes covered here: [@AKnassa](https://github.com/AKnassa), [@Astro-Han](https://github.com/Astro-Han), [@bhamodi](https://github.com/bhamodi), [@cixzhang](https://github.com/cixzhang), [@ernestt](https://github.com/ernestt), [@faga295](https://github.com/faga295), [@freddymeta](https://github.com/freddymeta), [@Geervan](https://github.com/Geervan), [@gonzoblasco](https://github.com/gonzoblasco), [@harjothkhara](https://github.com/harjothkhara), [@Hashim1999164](https://github.com/Hashim1999164), [@HelloOjasMutreja](https://github.com/HelloOjasMutreja), [@imdreamrunner](https://github.com/imdreamrunner), [@jiunshinn](https://github.com/jiunshinn), [@joaodotwork](https://github.com/joaodotwork), [@josephfarina](https://github.com/josephfarina), [@kentonquatman](https://github.com/kentonquatman), [@Kyujenius](https://github.com/Kyujenius), [@Lee-Dongwook](https://github.com/Lee-Dongwook), [@lexs](https://github.com/lexs), [@ManoharPaturi](https://github.com/ManoharPaturi), [@mattandryc](https://github.com/mattandryc), [@ngolin](https://github.com/ngolin), [@nynexman4464](https://github.com/nynexman4464), [@PRIEYAN](https://github.com/PRIEYAN), [@rubyycheung](https://github.com/rubyycheung), [@trakshan-mishra](https://github.com/trakshan-mishra), and [@yyq1025](https://github.com/yyq1025).

Read the complete package-by-package notes on the [Astryx v0.6.0 release page](https://github.com/meta/astryx/releases/tag/v0.6.0).
