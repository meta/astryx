// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textEntryTraits.ts
 * @input The keyboard-trait props a text field accepts
 * @output Exports the trait prop types (TextEntryTraitProps and its value
 *   unions) and textEntryTraitAttributes, which maps them onto the native
 *   attributes of the editable element
 * @position Shared by TextInput and TextArea: the one place that says how a
 *   field tells a touch keyboard what it holds
 *
 * A touch keyboard reads these traits from the focused element: which keys it
 * shows (`inputmode`), what its Return key says (`enterkeyhint`), whether it
 * capitalizes (`autocapitalize`) and corrects (`autocorrect`) as you type, and
 * whether misspellings are underlined (`spellcheck`). On iOS Safari each
 * attribute becomes the matching UIKit text-input trait (`keyboardType`,
 * `returnKeyType`, `autocapitalizationType`, `autocorrectionType`,
 * `spellCheckingType`).
 *
 * An absent prop renders no attribute, so the browser keeps its own default:
 * on iOS a field capitalizes sentences and corrects words, except password,
 * email and url fields, which do neither.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TextInput/TextInput.tsx and TextInput.doc.mjs
 * - /packages/core/src/TextArea/TextArea.tsx and TextArea.doc.mjs
 * - /packages/core/src/Field/index.ts (type exports)
 */

/**
 * What the Return key of a touch keyboard says. iOS gives `done`, `go`,
 * `next`, `search` and `send` their own key (a glyph on iOS 26: a checkmark,
 * an arrow, a chevron, a magnifier, an up arrow); `enter` and `previous` keep
 * the plain Return key. Chrome on Android (Gboard) gives every value its own
 * key; with no hint, a single-line field's key reads Next while another field
 * follows and Go on the last one, a multi-line field's keeps Return, and a
 * `type="url"` field shows Next instead of `go` while another field follows.
 */
export type TextEntryEnterKeyHint =
  'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';

/**
 * Which touch keyboard a field asks for. iOS shows the phone pad for `tel`,
 * the number pad for `numeric`, the decimal pad for `decimal`, the URL and
 * email keyboards for `url` and `email`, the web-search keyboard (a period
 * key and a Go key, whatever `enterKeyHint` says) for `search`, and no
 * keyboard for `none`.
 */
export type TextEntryInputMode =
  'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';

/** When a touch keyboard capitalizes as you type. */
export type TextEntryAutoCapitalize =
  'none' | 'sentences' | 'words' | 'characters';

/**
 * Keyboard traits of a text field. Every prop is optional and renders nothing
 * when absent, leaving the browser's default.
 */
// A prop mixin for text fields, not a component props type.
// eslint-disable-next-line @astryx/require-base-props, @astryx/require-ref-prop
export interface TextEntryTraitProps {
  /**
   * What the Return key of a touch keyboard says (the native `enterkeyhint`).
   * It only labels the key: what Enter does stays with the field's own
   * handlers.
   */
  enterKeyHint?: TextEntryEnterKeyHint;
  /**
   * Which touch keyboard the field asks for (the native `inputmode`),
   * without changing what the field accepts.
   */
  inputMode?: TextEntryInputMode;
  /**
   * When a touch keyboard capitalizes as you type (the native
   * `autocapitalize`).
   */
  autoCapitalize?: TextEntryAutoCapitalize;
  /**
   * Whether a touch keyboard corrects words as you type (the native
   * `autocorrect`).
   */
  hasAutoCorrect?: boolean;
}

/** The native attributes the traits render as. */
export interface TextEntryTraitAttributes {
  enterKeyHint?: TextEntryEnterKeyHint;
  inputMode?: TextEntryInputMode;
  autoCapitalize?: TextEntryAutoCapitalize;
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
