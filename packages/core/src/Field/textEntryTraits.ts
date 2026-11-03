// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textEntryTraits.ts
 * @input The keyboard-trait props a text field accepts
 * @output EnterKeyHint, InputMode and AutoCapitalize (the package entry exports
 *   these), TextEntryTraitProps and textEntryTraitAttributes
 * @position Shared by TextInput, TextArea and the search inputs: the one place
 *   that says how a field tells a touch keyboard what it holds
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TextInput/TextInput.tsx and TextInput.doc.mjs
 * - /packages/core/src/TextArea/TextArea.tsx and TextArea.doc.mjs
 * - /packages/core/src/Typeahead/BaseTypeahead.tsx, Field/PanelSearchInput.tsx
 *   and CommandPalette/CommandPaletteInput.tsx (the search inputs)
 * - /packages/core/src/Field/index.ts (type exports)
 */

/**
 * What the Return key of a touch keyboard says. iOS gives `done`, `go`,
 * `next`, `search` and `send` their own key (a glyph on iOS 26: a checkmark,
 * an arrow, a chevron, a magnifier, an up arrow); `enter` and `previous` keep
 * the plain Return key. Chrome on Android (Gboard) gives every value its own
 * key; with no hint, a single-line field's key reads Next while another field
 * follows and a multi-line field's keeps Return, and a `type="url"` field
 * shows Next instead of `go` while another field follows.
 */
export type EnterKeyHint =
  'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';

/**
 * Which touch keyboard a field asks for, by the HTML standard's `inputmode`
 * values. `numeric` brings up the number pad, and on iOS `search` brings up
 * the web-search keyboard (a period key and a Go key, whatever
 * `enterKeyHint` says).
 */
export type InputMode =
  'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';

/**
 * When a touch keyboard capitalizes as you type: `off` and `none` never,
 * `on` and `sentences` at the start of each sentence (the HTML standard names
 * each of these two states twice), `words` at the start of each word, and
 * `characters` every letter.
 */
export type AutoCapitalize =
  'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';

/**
 * Keyboard traits of a text field: a prop mixin for TextInput and TextArea,
 * not a component's props. A touch keyboard reads these traits from the
 * focused element. An absent prop renders no attribute, so the browser keeps
 * its own default (on iOS a field capitalizes sentences, except a URL field).
 */
export interface TextEntryTraitProps {
  /**
   * What the Return key of a touch keyboard says (the native `enterkeyhint`).
   * It only labels the key: what Enter does stays with the field's own
   * handlers.
   */
  enterKeyHint?: EnterKeyHint;
  /**
   * Which touch keyboard the field asks for (the native `inputmode`),
   * without changing what the field accepts.
   */
  inputMode?: InputMode;
  /**
   * When a touch keyboard capitalizes as you type (the native
   * `autocapitalize`).
   */
  autoCapitalize?: AutoCapitalize;
  /**
   * Whether a touch keyboard corrects words as you type (the native
   * `autocorrect`).
   */
  hasAutoCorrect?: boolean;
}

/** The native attributes the traits render as. */
export interface TextEntryTraitAttributes {
  enterKeyHint?: EnterKeyHint;
  inputMode?: InputMode;
  autoCapitalize?: AutoCapitalize;
  autoCorrect?: 'on' | 'off';
}

/**
 * Maps keyboard-trait props onto the native attributes for the editable
 * element. Absent props produce no attribute.
 *
 * @example
 * ```
 * <input {...textEntryTraitAttributes({enterKeyHint: 'search', hasAutoCorrect: false})} />
 * ```
 */
export function textEntryTraitAttributes({
  enterKeyHint,
  inputMode,
  autoCapitalize,
  hasAutoCorrect,
}: TextEntryTraitProps): TextEntryTraitAttributes {
  const attributes: TextEntryTraitAttributes = {};
  if (enterKeyHint != null) {
    attributes.enterKeyHint = enterKeyHint;
  }
  if (inputMode != null) {
    attributes.inputMode = inputMode;
  }
  if (autoCapitalize != null) {
    attributes.autoCapitalize = autoCapitalize;
  }
  if (hasAutoCorrect != null) {
    attributes.autoCorrect = hasAutoCorrect ? 'on' : 'off';
  }
  return attributes;
}
