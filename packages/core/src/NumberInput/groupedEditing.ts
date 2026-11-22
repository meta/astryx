// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file groupedEditing.ts
 * @input A focused NumberInput's draft, its handlers and caller props, and
 *   the resolved BCP 47 locale
 * @output Exports createGroupedEditing. It binds the parser and digit
 *   helpers the eager side passes, and returns `format`
 *   (formatGroupedEditableNumber) and `inputProps` (the input's change,
 *   keydown and composition handlers while `isGroupedWhileEditing` is on)
 * @position Internal to NumberInput; not part of the public surface.
 *   useNumberGrouping.ts loads it with a deferred import, so a page whose
 *   NumberInput does not set `isGroupedWhileEditing` carries none of it
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/NumberInput/numberGrouping.ts
 * - /packages/core/src/NumberInput/useNumberGrouping.ts
 * - /packages/core/src/NumberInput/NumberInput.tsx
 */

import type {
  ChangeEvent,
  CompositionEvent,
  CompositionEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
} from 'react';
import {flushSync} from 'react-dom';
import type {Locale} from '../i18n';
import type {toAsciiDigits as ToAsciiDigits} from '../utils/unicodeDigits';
import {
  createNumberGrouping,
  type NumberGroupingParser,
} from './numberGrouping';

/**
 * The eager helpers grouped editing reads. useNumberGrouping.ts passes them
 * in, so this deferred chunk shares no module with the first load.
 */
export interface GroupedEditingDeps extends NumberGroupingParser {
  toAsciiDigits: typeof ToAsciiDigits;
}

// utils/ime.ts's isImeKeyEvent, restated: importing it would move that module
// into a chunk of its own on the first load of every NumberInput page.
function isImeKeyEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** What NumberInput hands groupedInputProps on each render, in this order. */
export interface GroupedEditingField {
  locale: Locale;
  /** The person's draft, or null while the field shows its own text. */
  draft: string | null;
  /** The text the input shows. */
  displayValue: string;
  /** Keeps `text` as the draft. */
  commitDraftText: (text: string) => void;
  /** The field's own keydown handling, for keys grouping leaves alone. */
  handleKeyDown: KeyboardEventHandler<HTMLInputElement>;
  /** The caller's `onKeyDown`. */
  onKeyDown: KeyboardEventHandler<HTMLInputElement> | undefined;
  /** The caller's input props, with handlers withheld while disabled. */
  props: {
    onCompositionStart?: CompositionEventHandler<HTMLInputElement>;
    onCompositionEnd?: CompositionEventHandler<HTMLInputElement>;
  };
}

/** One field's grouped-editing state, kept across its events. */
interface GroupedEditingState {
  isComposing: boolean;
  // The text when a composition started. Regrouping at compositionend reads
  // it to tell the field's own separators, which a composed digit shifted,
  // from ones the person typed.
  compositionStartText: string | undefined;
  compositionStartTypedGroups: ReadonlyArray<number>;
  // The draft text that holds group characters the person typed, with their
  // indexes, or null. Keyed by text so a draft the field rewrote (commit,
  // stepping) drops them.
  typedGroupDraft: {text: string; indexes: ReadonlyArray<number>} | null;
}

// Each field's state, keyed by its input element.
const states = new WeakMap<HTMLInputElement, GroupedEditingState>();

function getState(input: HTMLInputElement): GroupedEditingState {
  let state = states.get(input);
  if (state === undefined) {
    state = {
      isComposing: false,
      compositionStartText: undefined,
      compositionStartTypedGroups: [],
      typedGroupDraft: null,
    };
    states.set(input, state);
  }
  return state;
}

/**
 * Grouped editing, bound to the eager helpers. They arrive as positional
 * arguments because a minifier shortens those, but not property names.
 */
export function createGroupedEditing(
  formatEditableNumber: GroupedEditingDeps['formatEditableNumber'],
  getLocaleNumberSymbols: GroupedEditingDeps['getLocaleNumberSymbols'],
  MINUS_SIGNS: string,
  toAsciiDigits: GroupedEditingDeps['toAsciiDigits'],
) {
  const {
    deleteDigitAcrossGroupSeparator,
    formatGroupedEditableNumber,
    groupEditableDraft,
    typedGroupIndexes,
  } = createNumberGrouping({
    formatEditableNumber,
    getLocaleNumberSymbols,
    MINUS_SIGNS,
  });

  /**
   * The input's handlers while `isGroupedWhileEditing` is on. NumberInput
   * spreads them over its own, and they run the caller's.
   */
  // Positional, so the eager caller's minified code names no properties.
  function groupedInputProps(
    locale: GroupedEditingField['locale'],
    draft: GroupedEditingField['draft'],
    displayValue: GroupedEditingField['displayValue'],
    commitDraftText: GroupedEditingField['commitDraftText'],
    handleKeyDown: GroupedEditingField['handleKeyDown'],
    onKeyDown: GroupedEditingField['onKeyDown'],
    props: GroupedEditingField['props'],
  ) {
    // The indexes of the group characters the person typed when `text` is the
    // current draft, so regrouping leaves them as typed.
    const getTypedGroups = (
      input: HTMLInputElement,
      text: string,
    ): ReadonlyArray<number> => {
      const {typedGroupDraft} = getState(input);
      return draft !== null && text === draft && typedGroupDraft?.text === text
        ? typedGroupDraft.indexes
        : [];
    };

    // Regroups the input's text and keeps the caret before the same digits.
    const applyGroupedDraft = (
      input: HTMLInputElement,
      previousText?: string,
      previousTypedGroups: ReadonlyArray<number> = [],
    ) => {
      const caret = input.selectionStart ?? input.value.length;
      // A keystroke or an IME can insert full-width or other script digits.
      // Regrouping reads ASCII digits, so fold them first, as the parser does
      // at commit.
      const text = toAsciiDigits(input.value) ?? input.value;
      const foldedCaret =
        text === input.value
          ? caret
          : (toAsciiDigits(input.value.slice(0, caret))?.length ?? caret);
      const next = groupEditableDraft(
        text,
        foldedCaret,
        locale,
        previousText,
        previousTypedGroups,
      );
      // A draft that holds typed group characters stays as typed, so their
      // indexes still match `next.text`.
      const indexes = typedGroupIndexes(
        text,
        locale,
        previousText,
        previousTypedGroups,
      );
      getState(input).typedGroupDraft =
        indexes.length > 0 ? {text: next.text, indexes} : null;
      if (next.text !== input.value) {
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the grouped text must be in the input before this event restores the caret
        flushSync(() => {
          commitDraftText(next.text);
        });
        input.setSelectionRange(next.caret, next.caret);
      } else {
        commitDraftText(next.text);
      }
    };

    return {
      // Keep the whole text edit as a draft until an explicit commit boundary.
      onChange(e: ChangeEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        // NumberInput makes a disabled or read-only input `readOnly`.
        if (input.readOnly) {
          return;
        }
        if (
          getState(input).isComposing ||
          (e.nativeEvent instanceof InputEvent && e.nativeEvent.isComposing)
        ) {
          commitDraftText(input.value);
          return;
        }
        // The previous draft shows which separators the field wrote. An edit
        // can move them off their grouping boundaries.
        applyGroupedDraft(
          input,
          displayValue,
          getTypedGroups(input, displayValue),
        );
      },

      // Backspace or Delete next to a field-written separator deletes the
      // digit beyond it. Every other key is the field's own.
      onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        const start = input.selectionStart;
        const result =
          !input.readOnly &&
          !isImeKeyEvent(e.nativeEvent) &&
          !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) &&
          (e.key === 'Backspace' || e.key === 'Delete') &&
          start != null &&
          start === input.selectionEnd &&
          // A typed group character is the person's own, so the browser
          // deletes just that character.
          getTypedGroups(input, input.value).length === 0
            ? deleteDigitAcrossGroupSeparator(input.value, start, e.key, locale)
            : null;
        if (result == null) {
          handleKeyDown(e);
          return;
        }
        onKeyDown?.(e);
        if (e.defaultPrevented) {
          return;
        }
        e.preventDefault();
        getState(input).typedGroupDraft = null;
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the regrouped draft must be in the input before this keydown restores the caret
        flushSync(() => {
          commitDraftText(result.text);
        });
        input.setSelectionRange(result.caret, result.caret);
      },

      // Composition is left alone until it ends.
      onCompositionStart(e: CompositionEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        const state = getState(input);
        state.isComposing = true;
        state.compositionStartText = input.value;
        state.compositionStartTypedGroups = getTypedGroups(input, input.value);
        props.onCompositionStart?.(e);
      },

      onCompositionEnd(e: CompositionEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        const state = getState(input);
        state.isComposing = false;
        const previousText = state.compositionStartText;
        const previousTypedGroups = state.compositionStartTypedGroups;
        state.compositionStartText = undefined;
        state.compositionStartTypedGroups = [];
        props.onCompositionEnd?.(e);
        if (!input.readOnly) {
          applyGroupedDraft(input, previousText, previousTypedGroups);
        }
      },
    };
  }

  // Short keys: the eager caller's minified code keeps property names.
  return {format: formatGroupedEditableNumber, inputProps: groupedInputProps};
}
