# Independent shared mobile-sheet UI review

No blocking defect was found in the private Lab shared-owner refactor at local source commit `bfef154361a9bfd2fa13717df2ef6af178e3b43b`.

## Scope and method

Reviewed `MobileSheetConfirmation` and `useDismissSearchOnTouchDrag` plus their MobileTokenizer and MobilePowerSearch integrations. Source Storybook aliased Core and Lab directly to their source directories. This is local-source evidence, not an exact deployed-preview capture. The review made no repository edits, builds, test/lint runs, commits, pushes, or PR changes.

Desktop headless Chromium launch was unavailable in this host sandbox. The rendered checks used native Chrome in the existing Android emulator, connected to local Storybook. Screenshots here are Chrome page captures, not a new software-keyboard evidence gate.

## Confirmation results

MobileTokenizer Clear selection, MobileTokenizer Discard changes, and MobilePowerSearch Clear filters passed:

- `role=alertdialog`, accessible title/description, and the `astryx-alert-dialog` theme class are present.
- Destructive action precedes the secondary safe action vertically.
- Both actions have `data-size=lg`, render 348.1905 CSS pixels wide and 36 CSS pixels high, and fill their action stack; the vertical gap is 16 CSS pixels.
- The safe action initially has DOM focus.
- Safe cancel, scrim click, and Escape close only the confirmation and preserve selections/draft/filters.
- Clear-selection and Clear-filters cancel routes return focus to Clear all. Discard cancel routes return focus to the Tokenizer search input through its existing synchronization effect.

Screenshots: `tokenizer-clear.png`, `tokenizer-discard.png`, `powersearch-clear.png`. Full probes are in `dialog-results.json`.

## Search-drag owner results

Browser probes passed for Tokenizer results, PowerSearch field picker, and PowerSearch content picker:

- Programmatic result scroll followed by typing does not blur the search. Tokenizer was scrolled to approximately 299.81 CSS pixels, PowerSearch field picker to 15.238 CSS pixels. The content-picker story has no available overflow, so that story's attempted scroll stayed at zero; it is not evidence of a nonzero content-picker scroll.
- A 4-pixel results touch move leaves focus alone.
- A 30-pixel gesture dispatched on the search input itself leaves focus alone; the result-list owner does not receive that input-owned gesture.
- Multi-touch leaves focus alone, and touch cancellation resets tracking.
- A 16-pixel single-touch vertical results move blurs the owned search.
- The same results move does not blur an unrelated focused button.

These final handler probes dispatch DOM `TouchEvent`s atomically within the real browser, with focus/geometry assertions. They isolate the private owner from default row-click and browser-pan behavior. They are not a hardware gesture recording or new native keyboard proof. Earlier non-atomic CDP touch sequences produced default row-focus and viewport races and are not presented as passing native-gesture evidence. Full successful probe results are in `touch-results.json`.

## Source identity

- `MobileSheetConfirmation.tsx` SHA-256: `a807843f3f47772d6e6ea5be25ecd1684a2e82e1fc3f701231afa8e82f91e448`.
- `useDismissSearchOnTouchDrag.ts` SHA-256: `3118519fae481840c91bc7ee87758a09b88d2470040ed4380a1e98dae1331fae`.

The source helper hashes were unchanged when the local commit was recorded. This receipt does not extend the prior Core keyboard evidence or make broader engine/animation claims.
