---
title: 'Astryx v0.1.3: better tables, keyboard navigation, and accessibility'
description: 'Plugin-contributed context menus on Table, full WAI-ARIA keyboard patterns, InputGroup composition, and more — plus one easy breaking change.'
date: '2026-07-04'
type: 'update'
authors:
  - 'team'
tags:
  - 'Release'
  - 'Accessibility'
  - 'Components'
---

Astryx v0.1.3 is out. This release is a big step forward for accessibility, keyboard navigation, and data tables. Install it with:

```bash
npm i @astryxdesign/core@0.1.3
```

All packages ship together at the same version, so bump every `@astryxdesign/*` package to `0.1.3` to match.

## Highlights

### Right-click context menus on Table

Tables now support plugin-contributed context menus. Right-click a column header or a row to get real actions — like sort ascending, sort descending, and clear sort — instead of the browser's default menu. Plugins add their own actions through the existing cell transforms, and the table concatenates them across every enabled plugin, so you can extend the menu with no core changes.

### Keyboard navigation

`TabList`, `TreeList`, `Toolbar`, `SegmentedControl`, and menus now follow the WAI-ARIA APG patterns: a single tab stop, arrow-key navigation, Home/End, typeahead, and roving focus. New building blocks — `useListFocus`, `useGridFocus`, `useTypeahead`, `useKeyboardHint`, and `useAnnounce` — let you build accessible composite widgets of your own, and a new `VisuallyHidden` primitive makes it easy to add screen-reader-only context.

### Compose inputs in an InputGroup

`Selector`, `MultiSelector`, `DateInput`, `TimeInput`, and `Typeahead` can now sit inside `InputGroup` with shared labels, descriptions, and connected borders.

### Explain disabled controls

Add `disabledMessage` to choice, picker, and text-entry inputs to show a tooltip telling users _why_ a control is disabled — while keeping it focusable so the explanation is reachable by keyboard.

### Layout ergonomics

`Stack`, `Grid`, and `Center` gain padding, sizing, and scroll props, so common frame layouts no longer need inline `style={{}}`.

### Popover dismissal control

New `hasLightDismiss` and `hasEscapeDismiss` props let you build explicit-dismiss surfaces like onboarding coachmarks. Layer animations now respect `prefers-reduced-motion`.

### More

A new **Kanban Board** template, plus a **blog RSS feed and plaintext (`.txt`) posts**.

## One breaking change (easy)

`hasAutoFocus` was removed from `DropdownMenu`, `ContextMenu`, and `MoreMenu`. Menus now always focus their first item on open — the correct APG behavior. No migration needed; just delete the prop if you were passing it.

## Thank you

Huge thanks to everyone who contributed this release: [@AKnassa](https://github.com/AKnassa), [@arham766](https://github.com/arham766), [@athz](https://github.com/athz), [@cixzhang](https://github.com/cixzhang), [@durvesh1992](https://github.com/durvesh1992), [@ejhammond](https://github.com/ejhammond), [@ernestt](https://github.com/ernestt), [@harshavardhan194](https://github.com/harshavardhan194), [@humbertovirtudes](https://github.com/humbertovirtudes), [@IFAKA](https://github.com/IFAKA), [@imdreamrunner](https://github.com/imdreamrunner), [@josephfarina](https://github.com/josephfarina), [@kentonquatman](https://github.com/kentonquatman), [@mohitWeb-lab](https://github.com/mohitWeb-lab), [@pollychen-lab](https://github.com/pollychen-lab), and [@thedjpetersen](https://github.com/thedjpetersen).

Also thank you to [@aarongarciah](https://github.com/aarongarciah) for feedback on accessibility, and to [@aurorascharff](https://github.com/aurorascharff), who drove the work to optimize the docsite on the latest Next.js features.

The full changelog is on the [v0.1.3 release page](https://github.com/meta/astryx/releases/tag/v0.1.3).
