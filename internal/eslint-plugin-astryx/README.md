# @astryx/eslint-plugin

ESLint plugin for Astryx design system token enforcement.

## Philosophy: Two-Tier Linting

This plugin implements a two-tier linting strategy:

| Mode            | Audience  | Behavior            | Trigger                             |
| --------------- | --------- | ------------------- | ----------------------------------- |
| **Recommended** | Humans    | Warnings only       | Default (local dev)                 |
| **Strict**      | Agents/CI | Errors (fail build) | `CI=true` or `ASTRYX_STRICT_LINT=1` |

### Why Two Tiers?

- **Agents** should follow strict rules perfectly; they have no excuse for violations
- **Humans** need flexibility during development; warnings inform without blocking

## Rules

### `@astryx/no-raw-intl-locale`

`InternationalizationProvider` is the sole user-facing locale source. This
rule forbids three independent things, anywhere in the lint scope:

1. **Raw `Intl` access** — constructing a locale-sensitive `Intl` formatter,
   calling `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`/
   `toLocaleUpperCase`/`toLocaleLowerCase`/`localeCompare` **directly**, or
   referencing the global `Intl` object at all outside an approved file —
   regardless of whether a call has a locale argument, and regardless of
   whether that argument is a literal, a variable, or `navigator.language`.
   An explicit locale expression does **not** satisfy this rule by itself;
   only going through the approved locale-aware boundary does. Beyond the
   direct-call shape, the rule also flags aliasing (`const DTF =
Intl.DateTimeFormat`), destructuring (`const {DateTimeFormat} = Intl`),
   and indexing with a computed key (`Intl[key]`) — each of these constructs
   a formatter without ever appearing as the call the direct-call check
   watches for, so the reference itself is what gets reported.
2. **`navigator.language`/`navigator.languages` as a locale source** — in
   _any_ position, not only as an argument to an `Intl`/locale-method call.
   `recognition.lang = lang ?? navigator.language` is flagged even though no
   `Intl` API is involved.
3. **Date-helper calls without a locale** — calls to `plainDateFormat`,
   `formatSharedDate`, `parseDateInput`, and `isLocaleDayFirst` imported from
   the Astryx helper modules must pass their locale argument. The rule follows
   named imports, aliases, and namespace imports without matching unrelated
   local functions that happen to use the same name.

Shipped component code should read the locale through the public
provider-aware utilities instead — `useLocale()`/`useCollator()` (exported
from `@astryxdesign/core/i18n`) — or use an existing formatting helper such as
`plainDateFormat`/`formatInstant`/`formatFilterValue`. Date-helper callers pass
`useLocale()` explicitly so the value always traces back to the provider.

**Raw `Intl` is controlled by two closed file lists in the rule source:**

- `APPROVED_IMPLEMENTATION_FILES` contains the pure formatter/parser
  implementations. Direct Intl calls there still require a syntactically
  explicit locale; `Intl.NumberFormat(undefined)`, an omitted locale, and
  locale methods without their locale argument are errors. Aliasing or
  destructuring Intl is also rejected.
- `APPROVED_TEST_ORACLE_FILES` contains named tests that deliberately construct
  independent Intl expectations so assertions are not circular.
- `DATE_HELPER_DEFAULT_TEST_FILES` contains only the two helper suites that
  verify the backward-compatible default locale. This exemption applies only
  to the helper-call locale requirement, not to raw Intl or navigator access.

Approved implementations:

- `packages/core/src/utils/plainDate.ts`, `.../utils/dateParser.ts` — date
  formatting/parsing core
- `packages/core/src/Timestamp/formatInstant.ts`,
  `.../Timestamp/formatRelativeTime.ts`, `.../Timestamp/tooltipEntries.ts` —
  Timestamp absolute/relative formatting and its non-display time-zone validity
  probe
- `packages/core/src/PowerSearch/formatFilterValue.ts`
- `packages/core/src/NumberInput/numberParser.ts` — reads typed and pasted
  numbers under the field's locale
- `packages/core/src/i18n/useCollator.ts`
- `packages/charts/src/formatters.ts`

Named test oracles:

- `packages/charts/src/formatters.test.ts`
- `packages/core/src/Calendar/Calendar.test.tsx`
- `packages/core/src/NumberInput/NumberInput.test.tsx`
- `packages/core/src/NumberInput/numberParser.test.ts`
- `packages/core/src/NumberInput/numberParser.docblock.test.ts`
- `packages/core/src/Table/plugins/tree/useTableTreeState.test.tsx`
- `packages/core/src/Timestamp/tooltipEntries.test.ts`
- `packages/core/src/PowerSearch/formatFilterValue.test.ts`
- `packages/core/src/Timestamp/Timestamp.test.tsx`

Named helper-default test files:

- `packages/core/src/utils/plainDate.test.ts`
- `packages/core/src/utils/dateParser.test.ts`

These lists are the **only** exception mechanism. There is no rule option or
`eslint.config.js` override that widens them. A new entry requires a rule-source
change and a focused rule test. `navigator.language`/`navigator.languages`
remains rejected unconditionally, implementation or test oracle.

`Intl.Locale` is never flagged, in any form — a bare reference, an alias, a
call — it inspects a tag rather than formatting display output. `Intl.Segmenter`
is exempt everywhere (infra or not) for exactly two shapes: a direct call
with grapheme segmentation (including its standards-defined default
granularity — grapheme boundaries do not vary meaningfully by locale, which
is also why `packages/core/src/utils/characters.ts` and
`packages/core/src/hooks/useStreamingText.ts` call it with none), and the
`typeof Intl.Segmenter === 'function'` feature-detection idiom those same two
files pair it with (which constructs nothing). Word, sentence, and otherwise
unknown segmentation options are genuinely locale-sensitive and follow the
same policy as every other formatter — and, like every other formatter,
_aliasing_ `Intl.Segmenter` instead of calling it directly is **not** exempt
outside an approved file: the exemption is a call shape, not a reference, so
`const Seg = Intl.Segmenter; new Seg(undefined, {granularity: 'grapheme'})`
is still flagged even though the eventual call is grapheme-only.

**Known limitations (syntax-only, by design):**

- The rule does not trace an alias back to its origin: `const lang =
navigator.language; new Intl.DateTimeFormat(lang)` flags the
  `navigator.language` read but not the later `Intl` call as
  navigator-sourced (it still gets the generic raw-Intl message, since it's
  outside an approved file).
- The locale-sensitive prototype methods are matched on **method name
  alone**, with no knowledge of the receiver's type. A custom class that
  happens to define its own same-named method for unrelated,
  non-locale-sensitive behavior would still be flagged — a false positive
  a syntax-only rule cannot rule out. This has not surfaced in the current
  codebase.
- A **computed method name held in a variable** — `date[computedMethodName]()`
  — cannot be resolved to `'toLocaleString'` (or any other name) without
  value-flow analysis, so it is **not** caught. `Intl[key]` closes the
  equivalent gap only for the `Intl` object itself (a single, nameable
  global reference); it cannot generalize to an arbitrary method name on an
  arbitrary receiver.

A locally shadowed `Intl` or `navigator` (a parameter, an import, a local
factory) is not the platform global and is not flagged as one — a shadowed
`Intl` skips every Intl-specific check entirely (including its own aliasing),
and a shadowed `navigator` is not treated as the browser global (so
`navigator.language` through it is not flagged as `navigatorLocale` — a call
built on a shadowed-Intl-but-real-navigator combination still gets
`navigatorLocale` for the real navigator read, independent of the Intl
shadow). There is no autofix: choosing the right locale source is an API
decision.

The repository enables the rule as an error for shipped source and tests in
`core`, `charts`, `richtext`, and `vega`. It intentionally does not cover
`lab`, applications, scripts, or stories. Lab must meet this requirement when
a component graduates to a shipped package.

**Bad:**

```ts
new Intl.DateTimeFormat().format(date);
new Intl.DateTimeFormat(locale).format(date); // an explicit locale alone isn't enough
new Intl.DateTimeFormat(navigator.language).format(date);
value.toLocaleString(locale);
left.localeCompare(right, locale);
const DTF = Intl.DateTimeFormat; // aliasing bypasses the direct-call check too
const {DateTimeFormat} = Intl; // ...and so does destructuring
```

**Good:**

```tsx
// Component code: read the provider locale through the public hook.
import {useLocale, useCollator} from '@astryxdesign/core/i18n';

function Example() {
  const locale = useLocale();
  return <span>{plainDateFormat(date, DATE_FORMAT_LONG, locale)}</span>;
}

// String comparison: useCollator(), not a raw Intl.Collator/localeCompare.
function useSortedNames(names: string[]) {
  const collator = useCollator({numeric: true});
  return useMemo(
    () => [...names].sort((a, b) => collator.compare(a, b)),
    [names, collator],
  );
}
```

### `@astryx/no-core-internal-import`

Reports imports of Core's internal subpaths (`@astryxdesign/core/internal` and
`@astryxdesign/core/internal/*`), which are reserved for Astryx's own packages
and sit outside the compatibility promise (`spec:AST-017` FR21), and of Core's
internal, gesture, motion and touch-support source (`@astryxdesign/core/gestures`,
`@astryxdesign/core/motion` and their subpaths, or any path into
`core/src/{internal,gestures,motion,touch-support}`), which a package outside Core and Lab reaches only through public entries
(`architecture:react-component-runtime` INV13). It checks `import`,
`export … from`, `import()`, `require()` and `typeof import()`, a dynamic
import or require named by a string or a template literal with no expressions. The repo config
turns it on for every linted file outside `packages/core` and `packages/lab`
(the global ignores still leave some scripts unlinted), so only Core and Lab
may import them.

An internal subpath is one file, `packages/core/src/internal/<name>.ts`, whose
header says it is reserved for Astryx's own packages, undocumented, and outside
the compatibility promise. It gets its own explicit entry in Core's
`package.json` `exports` (`"./internal/<name>": {source, types, default}`, never
a wildcard), listed with the file-module subpaths in `scripts/sync-exports.js`
(`FILE_MODULE_SUBPATH_EXPORTS`).

It is a custom rule, not a `no-restricted-imports` block: flat config overrides
a same-named rule per file, so a repo-wide block would undo the layer blocks
that already use `no-restricted-imports`.

### `@astryx/no-hardcoded-styles`

Detects hardcoded CSS values in `stylex.create()` that should use Astryx tokens:

| Property                     | Should Use                          |
| ---------------------------- | ----------------------------------- |
| `fontSize`                   | `textSizeVars['--text-*']`          |
| `fontWeight`                 | `fontWeightVars['--font-weight-*']` |
| `color`, `backgroundColor`   | `colorVars['--color-*']`            |
| `padding*`, `margin*`, `gap` | `spacingVars['--spacing-*']`        |
| `borderRadius`               | `radiusVars['--radius-*']`          |

**Bad:**

```tsx
const styles = stylex.create({
  text: {
    fontSize: '14px', // ❌ Hardcoded
    fontWeight: 600, // ❌ Hardcoded
    color: '#FF0000', // ❌ Hardcoded
  },
});
```

**Good:**

```tsx
const styles = stylex.create({
  text: {
    fontSize: textSizeVars['--font-size-base'], // ✅ Token
    fontWeight: fontWeightVars['--font-weight-semibold'], // ✅ Token
    color: colorVars['--color-error'], // ✅ Token
  },
});
```

Colour is only half-covered here: this rule reads the property name, so it sees
a literal on `color`/`backgroundColor`/`borderColor` inside `stylex.create()`
and nothing else. `@astryx/no-raw-color` covers the rest.

### `@astryx/no-style-only-wrapper`

Flags a `<div>`/`<span>` that exists only to style a single Astryx component.
Every component extends `BaseProps`, so it takes `xstyle` — the wrapper adds a
DOM node that takes the component out of its parent's flex/grid child
relationship (this is what knocked the pagination carets off-center in #4752).

**Bad:**

```tsx
<span {...stylex.props(rtlStyles.mirror)}>
  <Icon icon="chevronsLeft" /> {/* ❌ wrapper exists only to carry a style */}
</span>
```

**Good:**

```tsx
<Icon icon="chevronsLeft" xstyle={rtlStyles.mirror} /> {/* ✅ */}
```

The rule only fires when dropping the wrapper preserves behavior, so it stays
quiet on wrappers that do real work:

| Wrapper                                                               | Reported? |
| --------------------------------------------------------------------- | --------- |
| Only style attributes (`stylex.props`, `className`)                   | ✅ yes    |
| `role`, `aria-*`, `data-*`, `ref`, a handler, `{...rest}`             | ❌ no     |
| More than one child, or a non-Astryx / host child                     | ❌ no     |
| Styles include `display`, flex/grid container props, `gap`, `padding` | ❌ no     |
| Child renders no root element (`Tooltip`, providers)                  | ❌ no     |

Style objects imported from another module are read from that module, so
`import {rtlStyles} from '../utils'` is classified as accurately as a local
`stylex.create()` (see `stylex-style-source.js`).

**Options:** `wrapperElements`, `componentSources`, `allowComponents`,
`allowFiles`.

**Suggestion (not auto-fix):** for the unambiguous shape — a lone
`{...stylex.props(…)}` over a child with no `xstyle` — the rule offers a
rewrite that moves the styles onto the child. Removing a node can shift layout,
so it is never applied by `--fix`.

### `@astryx/no-unstable-merged-refs`

Flags two unstable ref-composition patterns:

1. `mergeRefs(...)` used by a JSX `ref` prop, whether the call appears inline
   or is first assigned to a local variable. Calling the utility during render
   creates a new callback ref every time, so React detaches and reattaches the
   element on unrelated rerenders.
2. An inline callback passed to `useMergedRefs(...)`. The changing input makes
   the hook recreate its callback on every render, defeating the hook.

Use `useMergedRefs(...)` with stable ref inputs instead.

```tsx
// Bad
<div ref={mergeRefs(forwardedRef, internalRef)} />;
const mergedRef = mergeRefs(forwardedRef, internalRef);
<div ref={mergedRef} />;
useMergedRefs(forwardedRef, node => setNode(node));

// Good — the hook itself may be called inline when Hooks ordering is valid
<div ref={useMergedRefs(forwardedRef, internalRef)} />;

// Also good
const ref = useMergedRefs(forwardedRef, internalRef);
<div ref={ref} />;
```

The rule is an error in both tiers because core contains no render-time
`mergeRefs(...)` JSX ref callsites.

### `@astryx/require-letter-spacing`

Recommends adding `letterSpacing` when `fontSize` is defined (common design pattern for badges, labels).

**Strict mode only.** Helps catch missing letter-spacing in compact text elements.

### `@astryx/require-baseprops-passthrough`

Ensures a component actually forwards the styling props it accepts via `BaseProps`:
`xstyle`, `className`, and `style`. A component's props may promise consumers these
escape hatches, but the implementation can silently drop them:

- **Unused** — a styling prop is destructured but never referenced, so the override is dropped.
- **Not forwarded** — a styling prop the type promises is never destructured and never reaches
  the root element.

Forwarding paths differ by what each prop _is_:

- `className` and `style` are real DOM attributes, so they survive a `{...rest}` spread onto
  the root element (native or composed) — that counts as forwarding them.
- `xstyle` is a StyleX style object, **not** a DOM attribute. It cannot ride a `{...rest}`
  spread onto a native element (it renders inert); the only valid un-destructured path is a
  rest spread onto a composed Astryx component, which re-accepts `xstyle` via its own `BaseProps`.

Fix by threading each prop into the root `mergeProps(...)` / `stylex.props(...)` call, or
forwarding to a composed component.

Scoped to public components (those with a `.displayName`). Opt out by omitting the prop from
the type, e.g. `Omit<BaseProps, 'className' | 'style'>` (as `VisuallyHidden` does),
or mark an intentionally-unused binding with a leading underscore (`className: _className`).

Currently `warn` in both tiers because known violations remain on main. Promote it
deliberately only once the repository is clean.

## Usage

### Local Development (Human Mode)

```bash
pnpm lint
# ESLint running in RECOMMENDED (human) mode
# Shows warnings but doesn't fail
```

### CI / Agent Mode

```bash
pnpm lint:strict
# or
ASTRYX_STRICT_LINT=1 pnpm lint
# or (automatic in GitHub Actions)
CI=true pnpm lint

# ESLint running in STRICT (agent/CI) mode
# Errors cause build failure
```

## Testing the Plugin

A test file with intentional violations is provided:

```bash
# Human mode - shows warnings
pnpm lint packages/core/src/Badge/Badge.test-violations.tsx

# Strict mode - shows errors
pnpm lint:strict packages/core/src/Badge/Badge.test-violations.tsx
```

Expected output in strict mode:

```
  12:15  error  Use textSizeVars token instead of hardcoded fontSize  @astryx/no-hardcoded-styles
  17:16  error  Use fontWeightVars token instead of hardcoded fontWeight  @astryx/no-hardcoded-styles
  22:12  error  Use colorVars token instead of hardcoded color  @astryx/no-hardcoded-styles
  ...
```

## Configuration

The plugin is configured in `eslint.config.js`:

```js
import astryxPlugin from "./internal/eslint-plugin-astryx/index.js";

const isStrictMode = process.env.ASTRYX_STRICT_LINT === '1' || process.env.CI === 'true';
const astryxConfig = isStrictMode ? astryxPlugin.configs.strict : astryxPlugin.configs.recommended;

// Applied to core package files
{
  files: ["packages/core/src/**/*.{ts,tsx}"],
  ...astryxConfig,
}
```

## Ignoring Specific Properties

If a property legitimately needs a hardcoded value:

```js
// In eslint.config.js
{
  files: ["packages/core/src/**/*.{ts,tsx}"],
  plugins: { '@astryx': astryxPlugin },
  rules: {
    '@astryx/no-hardcoded-styles': ['warn', {
      ignore: ['lineHeight']  // Allow hardcoded lineHeight
    }],
  },
}
```

### `@astryx/presentational-component`

Enforces that presentational components remain server-component compatible by preventing:

1. **Remembering things**: `useState`, `useReducer`, `useTransition`
2. **Watching things**: `useEffect`, `useLayoutEffect`, `useRef`, `ResizeObserver`, etc.
3. **Coordinating children**: `createContext`

Allowed hooks: `useId`, `useMemo`, `useCallback`, `useContext` (read-only).

**Applies to these components:**

- AspectRatio, Badge, Card, Center, Divider, EmptyState, Field, FormLayout
- Grid, Layout, Link, NavIcon, ProgressBar, Section, Skeleton, Stack, StatusDot, Token

**Bad:**

```tsx
// In Badge.tsx
import {useState} from 'react';
export function Badge() {
  const [x, setX] = useState(0); // ❌ Presentational components must not remember things
  return <span>{x}</span>;
}
```

**Good:**

```tsx
// In Badge.tsx
import {useId, useContext} from 'react';
export function Badge({label}) {
  const id = useId(); // ✅ useId is RSC-compatible
  const theme = useContext(ThemeContext); // ✅ Reading context is fine
  return <span id={id}>{label}</span>;
}
```

**What to do when you need state/effects:**

- Move the behavior to a wrapper component (e.g. `TextTruncation` wraps `Text`)
- Make state controlled via props (consumer owns the state)
- If the component legitimately needs client behavior, remove it from the presentational list

See: https://github.com/facebook/astryx/issues/493

### `@astryx/no-nullish-jsx-guard`

Flags a bare nullish check (`!= null`, `!== null`, `!== undefined`) used as a JSX render guard for a value that is then rendered as a child. `!= null` only rejects `null`/`undefined`, but React also renders nothing for `false`, `true`, and `''` — all of which pass a `!= null` guard and leak an empty wrapper element into the DOM. Use `isRenderable(value)` from `@astryxdesign/core/utils` instead (it also excludes boolean and empty-string values; `0` stays renderable).

**Scope (deliberately conservative):** only flags when both (1) the guard renders JSX and (2) the guarded value is rendered as a JSX _child_ of that branch. A value used only as a prop (`{user != null && <Profile user={user} />}`) is **not** flagged, since it is a data object, not a rendered slot.

**Bad:**

```tsx
{
  sideNav != null && <aside>{sideNav}</aside>;
}
{
  label != null ? <span>{label}</span> : null;
}
```

**Good:**

```tsx
import {isRenderable} from '@astryxdesign/core/utils';

{
  isRenderable(sideNav) && <aside>{sideNav}</aside>;
}
{
  isRenderable(label) ? <span>{label}</span> : null;
}
```

Ships as a **warning in both tiers** while core migrates its existing call sites; promote to `error` in strict mode once migrated. Provides an ESLint suggestion that rewrites the comparison to `isRenderable(value)` (add the import manually).

See: https://github.com/facebook/astryx/issues/2538

### `@astryx/focus-outline-keyboard-only`

Flags a focus outline written against `:focus` or `:focus-within` inside `stylex.create()`. A focus outline is a **keyboard** affordance; both of those selectors also match a plain mouse click, so the ring gets shown to pointer users too — most easily missed on the paths where focus is restored programmatically (an overlay that returns focus to its trigger after a click-to-dismiss puts the ring back up with no keyboard involved).

Use `:focus-visible`, or `:has(:focus-visible)` when the ring is drawn on a wrapper around the focusable element. A text input still matches `:focus-visible` when clicked, so nothing is lost.

**Bad:**

````ts
const styles = stylex.create({
  base: {
    outline: {
      default: 'none',
      ':focus': `2px solid ${colorVars['--color-accent']}`,
    },
  },
  wrapper: {
    ':focus-within': {outline: `2px solid ${colorVars['--color-accent']}`},
  },
});```

**Good:**

```ts
import {focusOutlineStyles} from '../utils/focusOutline.stylex';

// Preferred — the shared ring: .focusVisible on the focusable element,
// .focusWithin (`:has(:focus-visible)`) on a wrapper around it.
stylex.props(focusOutlineStyles.focusVisible);
````

**Scope:** `outline` and its longhands only, and only where the ring is drawn — suppressing one on a broader selector (`outline: {':focus': 'none'}`) is legitimate and is not flagged. A field's `:focus-within` border and inset box-shadow (`Field/inputStyles.stylex.ts`) are a different treatment — "you are typing here" — and are deliberately not policed by this rule.

Ships as an **error in both tiers**: core is clean, and this keeps it that way.

### `@astryx/focus-outline-shared`

Flags a focus ring written out inside `stylex.create()` instead of taken from the shared utility. There is one ring in the system and it is themeable through the `--focus-outline-*` tokens; a component that spells out its own gets those values by accident and drifts the moment either side moves — which is what happened before this rule existed (offsets wandered between 1px, 2px and 3px, and one ring was a border-width thick).

**Bad:**

```ts
const styles = stylex.create({
  base: {
    outline: {
      default: 'none',
      ':focus-visible': `2px solid ${colorVars['--color-accent']}`,
    },
  },
});
```

**Good:**

```ts
import {focusOutlineStyles} from '../utils/focusOutline.stylex';

stylex.props(focusOutlineStyles.focusVisible, styles.base);
```

**Scope:** only what the ring LOOKS like — the `outline` shorthand, `outlineWidth`, `outlineStyle` — under a literal `:focus-visible` condition. Not flagged: `outlineOffset` (where the ring sits is a local constraint — inset into a tight grid, or held clear of a field border — and such a component still follows the theme's width, style and color), `outlineColor` (re-coloring per variant is the documented override), and a computed condition key such as `stylex.when.ancestor(':has(:focus-visible)', scope)`, which a shared style cannot express because a scope marker cannot be shared between components.

Ships as an **error in both tiers**: core and lab are clean, and this keeps them that way.

### `@astryx/no-hover-on-disabled`

Flags a `:hover` condition inside `stylex.create()` that can still match a disabled element. Browsers suppress a disabled control's **events**, not its **hover styling**, so a hover treatment written for the enabled element is painted under the pointer anyway — the control says "press me" while refusing to be pressed.

StyleX will not take it away for you. A `disabled` style setting `backgroundImage: 'none'` overrides the **default** condition only; the variant's `:hover` class survives the merge and wins the moment the pointer arrives. Button shipped that in every variant, and both halves read as correct in review.

**Bad:**

```ts
const styles = stylex.create({
  item: {backgroundColor: {default: 'transparent', ':hover': OVERLAY}},
});
```

**Good:**

```ts
const styles = stylex.create({
  item: {
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': OVERLAY,
    },
  },
});
```

`:where()` contributes no specificity, so the guarded selector weighs exactly what `:hover` weighed and every existing override still wins the way it used to.

**Scope:** `:hover` on the styled element itself. A key that hovers something else — `:is(th:hover *)`, `stylex.when.ancestor(':hover')` — styles a descendant when an **ancestor** is hovered, which is a different question (a row may legitimately highlight around a disabled control) and is left alone. The rule is deliberately unconditional rather than scoped to components that have a disabled state: on an element that can never be disabled the guard is a no-op, and asking the question per component is what leaves the gaps.

**Pseudo-elements:** `:hover::after` and `:hover::before` are reported but never autofixed. StyleX 0.19.0 drops the pseudo-element's weight from the ranking of any key that also carries a `:not()` guard (priority 8330 becomes 3240), so the guarded rule loses to a plain `::after` rule and the hover treatment silently never paints. No spelling of the guard inside such a key avoids it, and an already guarded pseudo-element key is reported too. The fix is outside the selector: keep the disabled case out in JS (apply the class only when the control is enabled) and silence that one key with an `eslint-disable` comment that says so.

Autofixable for every other key, and mirrored at runtime by `.github/scripts/disabled-hover-audit.js`, which forces `:hover` on every disabled element in every story in Chromium and fails on any painted difference.

Ships as an **error in both tiers**: core and lab are clean, and this keeps them that way.

### `@astryx/no-classname-clobber`

Flags two things on one JSX element that each set `className`. React applies attributes left to right and does not merge them, so the later writer wins outright and everything the earlier one carried is gone.

There are two ways to write it twice. The first is a literal `className=` or `style=` attribute beside a `{...stylex.props()}` spread. The second is **two spreads that each carry a className** — and that one hides, because every helper here returns a `{className, style}` object: `stylex.props()`, `themeProps()`, `focusOutlineProps.*()`, and `mergeProps()` when it merges any of those.

Breadcrumbs shipped the second shape. Both halves read as correct in review, and `mergeProps` on the first line reads as if the merging is handled:

**Bad:**

```tsx
<button
  {...mergeProps(themeProps('breadcrumb-item-menu-trigger'), {
    ...popover.triggerProps,
  })}
  {...stylex.props(itemStyles.link, itemStyles.buttonReset)}
/>
```

**Good:**

```tsx
<button
  {...popover.triggerProps}
  {...mergeProps(
    themeProps('breadcrumb-item-menu-trigger'),
    stylex.props(itemStyles.link, itemStyles.buttonReset),
  )}
/>
```

The second spread replaced the className the first built, so `astryx-breadcrumb-item-menu-trigger` — documented, registered, part of the public theming surface — rendered on no element at all, and a theme targeting it silently did nothing. Nothing else caught it: `themingTargets.test.ts` asserts documented targets are a **subset** of what source registers, so a target that renders on zero elements passes.

**Scope:** two or more spreads on one opening element whose expressions are statically recognizable className producers. A spread of anything else — `{...rest}`, `{...popover.triggerProps}`, an unknown call — is not a producer and does not count, so one producer beside any number of those is fine. `mergeProps()` is the sanctioned merge and concatenates class names, so anything already inside a single `mergeProps()` call is correct however many producers it takes; it only becomes a problem beside a **second** spread that produces a className of its own. A producer reached through a conditional (`{...(cond ? stylex.props(a) : {})}`) is out of scope: no call site writes one, and reading through the branches invites guesses the rule cannot verify.

Ships as a **warning in both tiers** for now. The spread check has exactly one violation in the repo, in `BreadcrumbItem.tsx`, whose fix is open in [#5332](https://github.com/facebook/astryx/pull/5332); both tiers go back to `error` when that lands.

### `@astryx/disabled-cursor`

Flags a `cursor` inside `stylex.create()` that does not give way to `default` on a disabled element. The cursor is the only affordance a pointer user gets **before** they commit to a click: `cursor: pointer` on a disabled control promises a click it will not honour, and `disabled`/`[aria-disabled]` do not change what the element's own declaration paints.

A component's separate `disabled` style object is not the answer either — it only helps where the author remembered to write one, on the element the author had in mind: the inner input, not the label wrapping it; the trigger, not the icon inside it.

**Bad:**

```ts
const styles = stylex.create({
  trigger: {cursor: 'pointer'},
});
```

**Good:**

```ts
const styles = stylex.create({
  trigger: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});
```

The guarded condition outranks the default in StyleX's own ordering, so it wins the moment the element is disabled; on an element that can never be disabled it is a no-op.

**Why `default` and not `not-allowed`.** A disabled control sealed behind `pointer-events: none` is never hit-tested, so it shows whatever its ancestor shows and no declaration on it can change that — 75 of the 635 disabled elements in the story set are sealed that way. One cursor everywhere beats a stronger one only half the library can paint, the disabled state already carries its own visual treatment, and this matches the internal XDS convention.

**Scope:** every `cursor` a component writes, whatever the value — `default` itself is the only exemption. That breadth is not tidiness: StyleX merges `props()` one **property** at a time, so a later style setting `cursor` at all replaces the earlier declaration's conditions along with its value. SegmentedControlItem shipped exactly that — a guarded `cursor: pointer` on the base and a flat `cursor` in its `disabled` style applied after it, which threw the guard away. A computed value (`interactive ? 'grab' : undefined`) is left alone because the rule cannot know what it resolves to.

Autofixable, and mirrored at runtime by `.github/scripts/disabled-cursor-audit.js`, which hit-tests every disabled element in every story in Chromium and fails on any other cursor. That sweep is what covers the two cases the lint rule cannot see: a computed value, and a disabled element whose cursor comes from somewhere other than its own declaration.

Ships as an **error in both tiers**: core and lab are clean, and this keeps them that way.

### `@astryx/no-unguarded-ime-keydown`

Flags an `onKeyDown` handler on an **editable surface** that branches on a
"command" key (Enter/Escape/arrows/Page/Home/End, or a legacy `keyCode`/`which`)
**without an IME composition guard**.

For CJK (Korean/Japanese/Chinese) input, the browser fires `keydown` with
`isComposing === true` (or the legacy `keyCode === 229`) **before**
`compositionend` writes the pending syllable. A handler that reads
`e.key === 'Enter'` (or `'Escape'`, an arrow…) to accept a suggestion, select an
option, submit, or close then misfires on the keystroke that was only meant to
**commit the composition**. Early-return on `isImeKeyEvent(e.nativeEvent)` (from
`@astryxdesign/core/utils/ime` — it returns
`event.isComposing === true || event.keyCode === 229`) before handling command
keys.

**Scope (deliberately conservative — a noisy rule gets disabled):** only flags
when all of (1) the element is an editable surface — a `<textarea>`, an
`<input>` whose `type` can host text composition (not checkbox/number/date/…), a
`contentEditable` element, `role="textbox"`/`"searchbox"`/`"combobox"`, or a
known Astryx text-input component (`TextInput`, `Typeahead`, `BaseTypeahead`,
…) — and **not** a `<button>`/`<a>`/`role="button"` (IME can't compose on a
button, even one with `role="combobox"`); (2) its handler (inline, or a same-file
identifier resolving to a function/`useCallback`) branches on a command key; and
(3) a source-text scan of the handler finds **no** `isImeKeyEvent(`,
`.isComposing`, or `229`.

**Bad:**

```tsx
<TextInput
  onKeyDown={e => {
    if (e.key === 'Enter') onSelect(); // ❌ fires on a composing Enter
  }}
/>
```

**Good:**

```tsx
import {isImeKeyEvent} from '@astryxdesign/core/utils/ime';

<TextInput
  onKeyDown={e => {
    if (isImeKeyEvent(e.nativeEvent)) return; // ✅ let the IME commit first
    if (e.key === 'Enter') onSelect();
  }}
/>;
```

Ships as an **error in both tiers**: the editable surfaces that violated it —
Selector, MultiSelector, DateInput, TimeInput, DateTimeInput, and Typeahead's
edit-mode Escape — are fixed in the commit below this one, so core is clean and
this keeps it that way.

**Known limitations (intentional false-negatives):** guard/command-key detection
is a lenient text scan (any `isImeKeyEvent(`/`.isComposing`/`229` anywhere in the
handler counts as guarded; a `e.key === ENTER_KEY` variable comparison is not
detected). Handler indirection is resolved only one hop within the same file — an
imported handler is treated as unknown and not flagged. A `role`/`type`/
`contentEditable` spread via `{...props}` is not seen.

See: https://github.com/facebook/astryx/issues/4892

### `@astryx/require-table-section`

Flags a `TableRow` (or a raw `tr`) written as a **direct child of a table** —
`Table`, `BaseTable`, or a raw `table` — instead of inside a section:
`TableHeader` / `TableBody` / `TableFooter`, or a raw `thead` / `tbody` /
`tfoot`.

`<table>`'s content model does not admit `<tr>`. The HTML parser applies
implied-`<tbody>` insertion, so when a server-rendered page is parsed the
browser silently wraps the rows in a `<tbody>` the author never wrote. React's
client render does not — `appendChild` puts the `<tr>` exactly where the tree
says. The two trees then disagree and the render hydration-mismatches. React
says so up front:

```
In HTML, <tr> cannot be a child of <table>. Add a <tbody>, <thead> or <tfoot>
to your code to match the DOM tree generated by the browser.
```

Client-only it is still wrong: nothing reparents the rows, so the table ends up
with `<tr>` children and no `<tbody>` at all, and any CSS or query aimed at
`tbody` silently misses.

`Table`'s data-driven mode (`data={...}`) renders its own `TableBody` and is
unaffected. Children mode passes children straight to the `<table>`, which is
the right API — it is what makes the section components composable — but it
makes the section the caller's job, and nothing said so: the `children` prop
doc described the pre-`#2098` contract, and `TableRow`'s own `@example` showed
a row directly inside `<Table>`. A shipped page template was written from that
documentation.

**Bad:**

```tsx
<Table columns={columns}>
  <colgroup>…</colgroup>
  {rows.map(r => (
    <TableRow key={r.id}>…</TableRow>
  ))}
</Table>
```

**Good:**

```tsx
<Table columns={columns}>
  <colgroup>…</colgroup>
  <TableBody>
    {rows.map(r => (
      <TableRow key={r.id}>…</TableRow>
    ))}
  </TableBody>
</Table>
```

`<colgroup>`, `<col>`, and `<caption>` are legal direct children of a table and
are not touched.

**Scope:** repo-wide (`**/*.{ts,tsx}`), not core-only. The shape reached a
shipped CLI page template, which consumers copy into their own apps as a page,
and the `@eslint-react` DOM rules are scoped to `packages/core/src`. This is the
`<table>` counterpart of `no-raw-paragraph`: both guard an HTML content model
that browsers repair on parse and React does not.

Ships as an **error in both tiers**: the repo is clean after the fixes in the
commit below this one, and this keeps it that way.

**How the walk decides.** The check is lexical. It walks up from the row through
the wrappers that are transparent in the DOM — fragments, expression containers,
`&&`/ternary guards, `if`/`switch`/`try` inside a callback, array literals and
JSX spread children — and reports only when the first real element it reaches is
the table.

Calls are the subtle part, and the transparency there is **position-aware**, not
a node-type lookup. The walk steps out of a callback only for `.map()` and
`.flatMap()`, whose result is spliced into the JSX position the call occupies,
and it follows a chain chained off that result (`rows.map(...).filter(Boolean)`).
It does **not** step out of a call whose argument is the row itself: a row handed
to a function is data, not placement, and the callee routinely puts it somewhere
valid. `wrapInBody(<TableRow/>)` and
`React.createElement('tbody', null, <TableRow/>)` are silent for that reason —
flagging them told authors to wrap code that was already correct.

Element names resolve on their last segment, so `Astryx.TableRow` is a row and
`Rx.Fragment` is a fragment. There is no import resolution, deliberately: the
rule already trusts a bare `Table`, and resolving the segment applies that same
trade consistently.

**Known limitations (intentional false-negatives):** a row that has left its
lexical position — assigned to a variable, returned from a named helper, passed
as a prop, or handed to a function as an argument — could land anywhere, so the
rule stays silent rather than guessing. The same goes for an aliased import
(`<DataTable>`), a sequence expression, and an awaited wrapper such as
`await Promise.all(rows.map(...))`. Each of those is pinned as a valid fixture in
the tests, so a change in that behaviour has to be deliberate. A deliberate
unwrapped row (the contract test in `Table.test.tsx`) opts out with an
`eslint-disable-next-line` and a reason.

See: https://github.com/facebook/astryx/issues/5277

### `@astryx/no-light-dark-outside-theme`

Flags the CSS `light-dark()` function written in component source.

`light-dark(a, b)` picks a value from the resolved `color-scheme`. In a
component that hardcodes both halves of the choice at the one place a theme
cannot reach: a theme can retint every token a component consumes, but it
cannot reach inside a literal.

That is why the same defect keeps coming back. A dark-mode contrast failure
patched with a component-level `light-dark()` fixes exactly the scheme the
author was looking at; the element still fails on the light side in every theme
whose palette lands differently, and no theme can do anything about it. A token
pair fixed once in the theme layer reaches both schemes in every theme.

**Bad** — the component decides, and only for the scheme it was written for:

```ts
const SHADOW_TINT = 'light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.32))';
```

**Good** — the theme decides, and every theme gets to:

```ts
const SHADOW_TINT = colorVars['--color-shadow'];
```

If no token fits, add the `[light, dark]` pair in the theme layer, where
`defineTheme` generates the `light-dark()` for every theme at once.

**Scope:** `packages/core/src/**` (error) and `packages/lab/src/**` (warn).
Core is clean. Lab has one violation — `LogStream`'s `levelWarn`/`levelError`,
a WCAG contrast fix written per scheme — and moving it to the theme layer means
choosing which contrast-tuned status-text token those levels should read; until
that is decided lab warns rather than blocks.

**Exemptions**, kept in the rule source rather than only in `eslint.config.js`
so they are testable and a config edit cannot quietly turn the theme layer into
a violation:

| Location                                                           | Reported? |
| ------------------------------------------------------------------ | --------- |
| Component source under `packages/core/src`, `packages/lab/src`     | ✅ yes    |
| A `theme/` or `themes/` directory (`defineTheme`, `tokens.stylex`) | ❌ no     |
| `*.test.*`, `*.spec.*`, `*.stories.*`, `*.doc.*`, `__tests__/`     | ❌ no     |
| A comment (the rule reads literals, never comments)                | ❌ no     |
| A `.css` file (ESLint never parses one)                            | ❌ no     |
| `'light-dark('` with no closing parenthesis (a parser's prefix)    | ❌ no     |

That last one is the interesting case: a resolver detecting a token it has to
parse writes the opening text only (`raw.startsWith('light-dark(')` in
`getChartColors`), never a complete call, so requiring a balanced closing
parenthesis separates authoring a value from recognising one. Nesting counts,
so `light-dark(color-mix(…), …)` closes on its own parenthesis. Template
literals are checked across their quasis with interpolations replaced by a
placeholder, so an expression carrying a stray parenthesis cannot skew the
balance. Matching is case-insensitive, like CSS.

**Known limitation (intentional false-negative):** the sibling mechanisms are
not covered — a `@media (prefers-color-scheme: …)` block or a
`:is([data-theme='dark'] *)` selector hardcodes the same decision and this rule
says nothing about either. `light-dark()` is where the pattern actually shows up
in this repo; the others can be added if they start to.

See: https://github.com/facebook/astryx/pull/5321

### `@astryx/no-raw-color`

Flags a raw colour value — hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`,
`oklab()`, `oklch()`, `color()` — anywhere in component source.

A theme can retint every token a component reads. It cannot reach inside a
literal. So a colour written into a component is the colour every theme gets,
including a consumer's own, and the only way to change it is to edit the
component.

**Bad** — this grey is the same grey in all seven themes:

```ts
const TINT = '#6b7280';
boxShadow: `0 1px 2px rgba(0, 0, 0, 0.12)`;
```

**Good** — the theme decides:

```ts
const TINT = colorVars['--color-text-secondary'];
boxShadow: shadowVars['--shadow-sm'];
```

If no token fits, the value belongs in the theme layer, where `defineTheme`
gives every theme a way to override it.

#### Why this is not `@astryx/no-hardcoded-styles`

That rule is keyed on the **property name** and only reads values sitting
directly inside `stylex.create()`, against an anchored pattern. It covers
`color`, `backgroundColor` and `borderColor`, and nothing else. This one walks
the literal text instead, so the hiding place stops mattering — these are all
shapes it catches and the older rule does not:

| shape                                             | example                                                 |
| ------------------------------------------------- | ------------------------------------------------------- |
| an argument to another CSS function               | `'light-dark(#fff, #000)'`, `color-mix(…, #1c1c1e 20%)` |
| behind a `const`, one hop from the style object   | `const TINT = '#00000020'`                              |
| inside a template literal, `boxShadow` especially | `` `0 1px 2px rgba(0,0,0,.12)` ``                       |
| a `var()` fallback                                | `'var(--color-text-disabled, #999)'`                    |
| a JSX attribute                                   | `<circle fill="#fff" />`                                |
| any other colour property                         | `outlineColor`, `fill`, `stroke`, `caretColor`          |
| `hsl()` and the modern notations                  | `'oklch(0.7 0.1 200)'`                                  |

The two rules are complementary and both stay on: `no-hardcoded-styles` also
covers spacing, radius and type, which this one says nothing about.

#### What it stays quiet about

The rule is colour-shaped, so it structurally cannot reach the sanctioned
non-token values — `0`, `none`, `transparent`, `inherit`, `currentColor` — or
layout values like `width: '100%'` and a dropdown's `maxHeight: '300px'`. Beyond
that:

| Location or shape                                                         | Reported? |
| ------------------------------------------------------------------------- | --------- |
| Component source under `packages/{core,lab,charts,richtext,vega}/src`     | ✅ yes    |
| A `theme/` or `themes/` directory (`tokens.stylex`, `defineTheme`)        | ❌ no     |
| `*.test.*`, `*.spec.*`, `*.stories.*`, `*.doc.*`, `__tests__/`            | ❌ no     |
| A comment (the rule reads literals, never comments)                       | ❌ no     |
| A colour assembled from values passed in — `rgba(${r}, ${g}, ${b}, ${a})` | ❌ no     |
| Every channel from a token — `rgb(var(--r) var(--g) var(--b))`            | ❌ no     |
| `'rgb('` with no closing parenthesis (a parser's prefix)                  | ❌ no     |
| `mask`/`maskImage` and friends — the colour resolves through alpha        | ❌ no     |

Two of those are worth the detail. A **colour function only counts when its
arguments carry a literal digit** — that separates authoring a colour from
building one out of channels handed in, which is how `utils/color.ts` serializes
and `getChartColors` parses. One literal channel is enough, so
`hsl(var(--accent-hue), 80%, 50%)` is still a colour this file chose. And a
**mask** is the one place a colour is not paint: `mask-image` resolves a
gradient through its alpha channel, so `rgba(0, 0, 0, 0.3)` in one of its stops
is a 30% opacity stop and the black is discarded — `backgroundImage`, which
paints the same gradient, is not exempt.

Path exemptions live in the rule source rather than only in `eslint.config.js`,
so they are testable and a config edit cannot quietly turn the theme layer into
a violation. That layer has ~200 colour literals and defining them is its job.

#### On `eslint-disable`

**A disable suppresses this rule, deliberately.** The only mechanism that would
close the door is `noInlineConfig`, and it **cannot be scoped to one rule** —
verified: under `linterOptions: {noInlineConfig: true}`, a file disabling both
`@astryx/no-raw-color` and `no-unused-vars` reports both again. It _is_ scopable
by `files` glob, so the choice on offer is never "harden this rule" but "void
every inline disable in this directory", which takes the sanctioned ones with it
— the deliberately unwrapped row `require-table-section` documents, and the
`no-nullish-jsx-guard` migration sites.

So the escape hatch stays open and stays _visible_. A disable on this rule means
someone knowingly wrote a raw colour: it is greppable
(`git grep no-raw-color -- packages`), it is permanent in the diff, and it is a
review signal rather than a resolution. A rule with no escape hatch gets evaded
by moving the literal somewhere the rule cannot see, which is worse — that is
invisible. The reviewer still owes the finding.

The hatch also covers the rule's one known over-reach: a hex-shaped fragment in a
string that is not a colour (`'#abc'` as a fragment identifier). There are none
in the repo today.

**Known limitations (intentional false-negatives).** Each was probed rather than
assumed, and none has an instance in the repo except the last:

- **Named CSS colours** (`red`, `rebeccapurple`). A bare word is
  indistinguishable from any other string and the false-positive cost is far
  higher than the rate at which they appear here.
- **A colour assembled at runtime from parts** (`'#' + hex`), which would mean
  evaluating expressions rather than reading literals.
- **A percent-encoded colour inside a data URI** —
  `url("data:image/svg+xml,%3Csvg fill=%22%23ff0000%22/%3E")`. Decoding URIs to
  look for colours is a different rule.
- **A `.css` file**, which ESLint never parses. There is one live instance:
  `packages/core/src/reset.css:291` reads
  `var(--color-text-secondary, light-dark(#4E606F, #AAAFB5))` — the same
  defensive-fallback shape as the `Sankey` hits, and it rides with them.

Everything else the rule reaches, and a probe confirms it: a `const`, an object
property, an array element, an enum member, a computed key, a template
`boxShadow` in modern space-separated syntax, and an inline `style={{}}` — which
sits at the very top of the cascade, where a theme has no answer at all.

**Scope:** `warn` in `packages/{core,lab,charts,richtext,vega}/src`. There are 23
violations on `main` — 20 in lab (`LogStream`'s console palette, `Sankey`'s
`var()` fallbacks), 2 in core, 1 in charts.

**Not in scope, deliberately:** `packages/cli/assets/templates/**`, which the
CLI scaffolds into a consumer's app. The rule finds **194** there (102 in
`blocks`, 92 in `pages`) if pointed at it. A raw colour in a template a consumer
copies is a real finding — the rubric calls a literal _presented as the
recommended way to style a component_ a docs-quality problem — but many of those
194 are showcase content demonstrating a colour on purpose, so turning it on
there is a triage decision of its own rather than a consequence of this rule
existing. Each wants a token decision rather
than a mechanical substitution, so they are tracked separately; promote a
package to `error` once it reaches zero, the same path
`no-physical-properties` took.
