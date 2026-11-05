# IME Composition Guard — Shared Base Design

> Scratch design doc for the reviewer. Not shipped. Branch:
> `nynexman4464/refactor/ime-guard-shared-base`.

## TL;DR recommendation

1. **Keep `isImeKeyEvent` as the single low-level predicate.** It is the right
   primitive. Do **not** add a `useImeSafeKeyDown` wrapper hook — see §3 for why
   it would be over-engineering and, at 2 of 7 sites, outright wrong.
2. **Relocate it from `hooks/useFocusTrap.ts` → `utils/ime.ts`** (a discoverable
   home matching the pure-predicate convention in `utils/`), with the canonical
   "why" doc comment living there and nowhere else.
3. **Re-export from `useFocusTrap.ts` (deprecated) for back-compat**, and migrate
   the 3 existing importers + 3 inline duplicators to the shared predicate.
4. Give the lint rule (separate stream) one blessed symbol to point at:
   `@astryxdesign/core/src/utils/ime#isImeKeyEvent`.

## 1. Inventory (7 sites in core, +1 different pattern in lab)

| # | Site | Guards | Handler | Detection | Event source | Notes |
|---|------|--------|---------|-----------|--------------|-------|
| 1 | `hooks/useFocusTrap.ts` | Escape (dismiss trap) | native `keydown` | `isImeKeyEvent` (canonical def lived here) | native DOM `KeyboardEvent` | Also home of the exported helper — odd place for a general util. |
| 2 | `Typeahead/BaseTypeahead.tsx` | Enter/Esc/Arrows/Home/End (candidate nav + commit) | React `onKeyDown` | `isImeKeyEvent(e.nativeEvent)` | `e.nativeEvent` | Early return before all key logic. Added via PR #4860. |
| 3 | `PowerSearch/PowerSearchEditPopover.tsx` | Enter (save), Escape (cancel) | React `onKeyDown` | `isImeKeyEvent(e.nativeEvent)` | `e.nativeEvent` | Early return before Enter/Escape branch. |
| 4 | `Dialog/Dialog.tsx` | Escape (close) | native `keydown` | `isImeKeyEvent(event)` **+** `hasActiveFocusTrapEscape()` | native DOM `KeyboardEvent` | Composite guard; also defers to layered popover. |
| 5 | `ContextMenu/ContextMenu.tsx` | Escape (dismiss) | native `keydown` (document listener) | **inline** `e.isComposing \|\| e.keyCode === 229` | native DOM `KeyboardEvent` | Duplicated predicate. |
| 6 | `Tooltip/useTooltip.tsx` | Escape (dismiss, WCAG 1.4.13) | native `keydown` (document listener) | **inline** `e.isComposing \|\| e.keyCode === 229` | native DOM `KeyboardEvent` | Duplicated predicate. |
| 7 | `Chat/ChatComposerInput.tsx` | Enter (submit) | React `onKeyDown` | **inline** `e.nativeEvent.isComposing \|\| e.nativeEvent.keyCode === 229` | `e.nativeEvent` | Duplicated predicate; only guards Enter. |
| — | `lab/CodeEditor/CodeEditor.tsx` | **onInput** (not keydown) | React `onInput` + `onCompositionStart/End` | **ref tracking** (`isComposingRef`) | n/a | DIFFERENT pattern & different concern — see §4. Left untouched. |

### Detection styles observed
- **Shared predicate** (sites 1–4): call `isImeKeyEvent(...)`.
- **Inline duplication** (sites 5–7): open-code `isComposing || keyCode === 229`.
- **Ref tracking** (CodeEditor): track `compositionstart`/`compositionend` to
  gate the *input/change* path, not a keydown command.

### SyntheticEvent vs nativeEvent
- React's `KeyboardEvent` SyntheticEvent DOES expose `isComposing`. But the
  React-handler sites (BaseTypeahead, PowerSearch, Chat) deliberately read
  `e.nativeEvent` to avoid any React normalization gap and to reach `keyCode`.
- Native-listener sites (focus-trap, Dialog, ContextMenu, Tooltip) pass the DOM
  `KeyboardEvent` directly.
- The predicate is **structurally typed** (`{isComposing?; keyCode?}`) so both
  shapes are accepted with no casting.

### Is `keyCode === 229` still load-bearing? — Yes.
`229` is the sentinel keyCode browsers report while a key event is being
processed by an IME. Some IMEs and older Safari fire the composing `keydown`
with `isComposing` **not yet** `true` but DO report `229`. Dropping the fallback
would regress those. Keep both signals until a browser-matrix audit says
otherwise. (Documented once, in `utils/ime.ts`.)

## 2. Where it should live
`utils/` already houses pure, event/data helpers (`getKey`, `mergeProps`,
`composeEventHandlers`, `inputAria`) each as `<name>.ts` + `<name>.test.ts` with
a barrel `index.ts`. `isImeKeyEvent` is a pure predicate — it belongs there, not
buried in a focus-trap hook. New file: `packages/core/src/utils/ime.ts`,
re-exported from `utils/index.ts`. `useFocusTrap.ts` keeps a deprecated
re-export so existing relative imports don't break.

## 3. Wrapper hook (`useImeSafeKeyDown`) — rejected, with reasons
A `useImeSafeKeyDown(handler)` that no-ops during composition sounds tidy but:
- **Call sites are not uniform.** 4 use native DOM listeners inside `useEffect`
  (not a React `onKeyDown` prop the hook could wrap); 3 use React handlers.
- **Wrapping is wrong at 2 sites.** `useFocusTrap` and `Dialog` combine the IME
  check with *other* conditions (`isTopEscapeHandler`, `defaultPrevented`,
  `hasActiveFocusTrapEscape()`), and must still run that surrounding logic — a
  blanket "no-op the whole handler during composition" changes behavior.
- **The predicate is already the minimal correct primitive.** An early
  `if (isImeKeyEvent(e)) return;` is explicit, greppable, and lint-targetable.
- A wrapper adds a hook, a render-identity concern, and a second thing the lint
  rule must special-case — net negative. **Recommend: predicate + lint rule.**

## 4. CodeEditor is intentionally out of scope
`lab/CodeEditor` guards `onInput` (would otherwise write partial CJK syllables
into `value`) via `compositionstart/end` ref tracking — a different concern than
"don't treat a composing keydown as a command", so the shared keydown predicate
doesn't replace it. **Flag:** its `handleKeyDown` handles Escape (arms
tab-moves-focus) and Tab *without* an IME guard, so a composing Escape/Tab could
misfire. Latent, in `lab`, and behavioral — left for a separate fix.

## 5. What this branch implements (low-risk only)
- New `utils/ime.ts` (canonical predicate + the one authoritative doc comment)
  and `utils/ime.test.ts` (two-signal coverage).
- `utils/index.ts` re-exports `isImeKeyEvent`.
- `useFocusTrap.ts`: local def removed; imports from `utils/ime`; deprecated
  re-export kept for back-compat.
- Migrated importers to the util path: `Dialog`, `BaseTypeahead`, `PowerSearch`.
- De-duplicated the 3 inline sites (`ContextMenu`, `Tooltip`, `ChatComposerInput`)
  to call `isImeKeyEvent`, deferring rationale to `utils/ime.ts`.
- **No behavioral change** — same boolean logic everywhere; pure consolidation.
