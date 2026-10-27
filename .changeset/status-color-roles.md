---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/richtext': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[feat] Status colours now have a role for each surface, and Info is a new status. For each of info, success, warning, and error: `--color-<status>` is the strong fill and `--color-on-<status>` is content on it, at 4.5:1 or more; `--color-<status>-muted` is the pale fill, with `--color-on-<status>-muted` content; and `--color-text-<status>` is readable status text on the page and cards, with `--color-icon-<status>` and `--color-border-<status>` (status icons and borders) defaulting to it. `--color-info`, `--color-on-info`, `--color-info-muted`, and the other Info roles are new and independent of the accent. Tailwind gains `bg-info`, `bg-info-muted`, `text-on-<status>`, `text-on-<status>-muted`, and `text-status-<status>` (the status text role). Introduced in [#7657](https://github.com/facebook/astryx/pull/7657).

`--color-success`, `--color-warning`, and `--color-error` and `bg-<status>` keep their meaning as the strong fills. Tailwind now projects each status by paint property: `text-`, `decoration-`, `placeholder-`, and `caret-<status>` read the status text role, and `border-`, `divide-`, `outline-`, and `ring-<status>` read the status border role, so status text and lines are readable on the page; `bg-`, `accent-`, `fill-`, `stroke-<status>`, shadow colours, and gradients keep the strong fill. for example, Core's light `text-warning` is now `#753F07` instead of `#E9AF08`, and `text-success` is `#09441F` instead of `#0D8626`. To keep the fill colour on text, use `text-[var(--color-warning)]`.

What changes on screen:

- Core's dark Error content (`--color-on-error`) is now `#0A1317` instead of white, so text on dark-mode error fills reaches 4.5:1. Core's Info Badge uses `--color-info` (`#0064E0`) instead of the accent; in dark mode the accent was `#2694FE`.
- Icon `color="info|success|warning|error"`, Stepper status glyphs, and Chat tool-call status icons use the icon roles, which are the readable text colours. For example, Core's success icon is now `#09441F` (light) instead of `#0D8626`.
- Input and FileInput status borders use the border roles. Core's light warning border is now `#753F07` instead of `#E9AF08`. Butter's light success and warning input rims are now mid-ramp stops that reach 3:1.
- Banner paints its built-in title, description, icon, and controls with the on-muted roles, and fills Info with `--color-info-muted`.
- Status fills keep a visible boundary in forced-colors mode.
- Chocolate and Matcha's `--color-on-success` and `--color-on-error` are now a dark ink instead of white, and Stone's `--color-on-success`, `--color-on-warning` and `--color-on-error` are white in light mode and near-black in dark mode instead of the status hue, so content on those fills reaches 4.5:1.
- Neutral's `--color-success`, `--color-warning`, and `--color-error` are now its status fills, the colours its Badges already showed: success `#00490B` to `#198100` (dark `#A4D6A3` to `#64AF4C`), warning `#4B3900` to `#FFCE2F` (dark `#F8D36A` to `#FFCE2F`), and error `#76000C` to `#C9303A` (dark `#FFC4BE` to `#FF705D`); `--color-info` is `#0074E2` (dark `#6D9CFE`). Its Badges, StatusDots, progress fills, and Stepper badges look the same, and its `text-<status>` utilities read its status text roles.
- Neutral drops its own status overrides and uses the standard roles: the accent variants of ProgressBar, StatusDot, and Stepper now paint Neutral's accent instead of blue, and Banner and the pale destructive Button use the standard overlays. Neutral no longer defines its proposed and undocumented local tokens; use the standard roles instead: `--astryx-theme-neutral-color-status-fill-success`, `-status-fill-warning`, and `-status-fill-error` → `--color-success`, `--color-warning`, `--color-error`; `-status-muted-accent` → `--color-info-muted`; `-on-tint-neutral` → `--color-neutral`; `-on-tint-overlay-hover`, `-on-tint-overlay-pressed`, `-destructive-overlay-hover`, and `-destructive-overlay-pressed` → `--color-overlay-hover` and `--color-overlay-pressed`. `--astryx-theme-neutral-color-status-fill-accent` keeps its value for Neutral extensions but is deprecated and no longer used by Neutral.
- Every first-party theme sets a blue `--color-info`; Chocolate and Matcha Info Badges move from the accent to that blue (Butter keeps its own Info Badge colours).

Custom themes get the content and text roles they don't set: theme generation derives `--color-on-<status>` (light or dark content, whichever contrasts more), readable status text, and on-muted content from the theme's status fills. To keep a component's previous colour, set the matching role in your theme; for example, set `--color-icon-success` to your old `--color-success` value.

@rubyycheung
