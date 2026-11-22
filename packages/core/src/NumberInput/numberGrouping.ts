// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file numberGrouping.ts
 * @input A focused NumberInput's draft text, its caret, and the resolved
 *   BCP 47 locale
 * @output Exports formatGroupedEditableNumber, groupEditableDraft,
 *   typedGroupIndexes, and deleteDigitAcrossGroupSeparator
 * @position Internal to NumberInput; not part of the public surface. Only
 *   `isGroupedWhileEditing` uses it, so useNumberGrouping.ts loads it with a
 *   deferred import, and a page whose NumberInput does not set the prop does
 *   not load it
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/NumberInput/numberParser.ts (locale symbols)
 * - /packages/core/src/NumberInput/useNumberGrouping.ts
 * - /packages/core/src/NumberInput/NumberInput.tsx
 * - /packages/core/src/NumberInput/numberParser.test.ts
 */

import type {Locale} from '../i18n';
import {
  formatEditableNumber,
  getLocaleNumberSymbols,
  MINUS_SIGNS,
} from './numberParser';

export interface GroupedEditableDraft {
  text: string;
  caret: number;
}

const ASCII_DIGIT = /[0-9]/;
const LEADING_SIGNS = new RegExp(`^[+${MINUS_SIGNS}]+`);

function isAsciiDigit(character: string): boolean {
  return ASCII_DIGIT.test(character);
}

function countDigits(text: string): number {
  let count = 0;
  for (const character of text) {
    if (isAsciiDigit(character)) {
      count++;
    }
  }
  return count;
}

function indexAfterDigits(text: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (isAsciiDigit(text[i])) {
      seen++;
      if (seen === digitCount) {
        return i + 1;
      }
    }
  }
  return text.length;
}

function insertGroupSeparators(
  digits: string,
  group: string,
  primaryGroupSize: number,
  secondaryGroupSize: number,
  minimumGroupingDigits: number,
): string {
  if (
    group === '' ||
    digits.length < primaryGroupSize + minimumGroupingDigits
  ) {
    return digits;
  }
  const chunks = [digits.slice(-primaryGroupSize)];
  let rest = digits.slice(0, -primaryGroupSize);
  while (rest.length > secondaryGroupSize) {
    chunks.unshift(rest.slice(-secondaryGroupSize));
    rest = rest.slice(0, -secondaryGroupSize);
  }
  if (rest.length > 0) {
    chunks.unshift(rest);
  }
  return chunks.join(group);
}

function extractDigits(text: string, group: string): string {
  if (group === '') {
    return text.replace(/\D/g, '');
  }
  let digits = '';
  let i = 0;
  while (i < text.length) {
    if (isAsciiDigit(text[i])) {
      digits += text[i];
      i++;
      continue;
    }
    if (text.startsWith(group, i)) {
      i += group.length;
      continue;
    }
    break;
  }
  return digits;
}

/**
 * A grouping separator belongs this many digits from the right of the
 * integer: the primary size, then every secondary size after that. Same
 * offsets `insertGroupSeparators` writes, and the same sizes `readUnder`
 * requires of a well-formed group.
 */
function isGroupSeparatorOffset(
  digitsFromRight: number,
  primaryGroupSize: number,
  secondaryGroupSize: number,
): boolean {
  if (digitsFromRight < primaryGroupSize || secondaryGroupSize <= 0) {
    return false;
  }
  return (digitsFromRight - primaryGroupSize) % secondaryGroupSize === 0;
}

/**
 * True when at least one group character in `run` sits on a grouping
 * boundary for `totalDigits`. A separator off those boundaries is a
 * decimal or a malformed group, not a thousands mark.
 */
function hasSeparatorAtGroupingOffset(
  run: string,
  group: string,
  totalDigits: number,
  primaryGroupSize: number,
  secondaryGroupSize: number,
): boolean {
  if (group === '' || totalDigits <= primaryGroupSize) {
    return false;
  }
  let digitsSeen = 0;
  let i = 0;
  while (i < run.length) {
    if (isAsciiDigit(run[i])) {
      digitsSeen++;
      i++;
      continue;
    }
    if (run.startsWith(group, i)) {
      const fromRight = totalDigits - digitsSeen;
      if (
        digitsSeen > 0 &&
        fromRight > 0 &&
        isGroupSeparatorOffset(fromRight, primaryGroupSize, secondaryGroupSize)
      ) {
        return true;
      }
      i += group.length;
      continue;
    }
    break;
  }
  return false;
}

/** The sign-free run of digits and group characters at the start of `text`. */
function findIntegerRun(
  text: string,
  group: string,
): {runStart: number; runEnd: number} {
  const signMatch = LEADING_SIGNS.exec(text);
  const runStart = signMatch?.[0].length ?? 0;
  let runEnd = runStart;
  while (runEnd < text.length) {
    if (isAsciiDigit(text[runEnd])) {
      runEnd++;
      continue;
    }
    if (text.startsWith(group, runEnd)) {
      runEnd += group.length;
      continue;
    }
    break;
  }
  return {runStart, runEnd};
}

/** The lengths of the prefix and suffix an edit left unchanged. */
function editBounds(
  previous: string,
  next: string,
): {prefix: number; suffix: number} {
  const maxPrefix = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) {
    prefix++;
  }
  const maxSuffix = Math.min(previous.length, next.length) - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {prefix, suffix};
}

/** The text an edit inserted between the unchanged prefix and suffix. */
function insertedByEdit(previous: string, next: string): string {
  const {prefix, suffix} = editBounds(previous, next);
  return next.slice(prefix, next.length - suffix);
}

/**
 * True when the edit from `previous` to `next` only inserted digits, only
 * deleted text, or replaced a selection with digits.
 */
function isDigitOrDeletionEdit(previous: string, next: string): boolean {
  return /^[0-9]*$/.test(insertedByEdit(previous, next));
}

/**
 * True when the previous draft's integer run carried no group character or
 * exactly the grouping this field writes, so every separator in it was ours.
 */
function hasOnlyFieldGrouping(
  text: string,
  group: string,
  primaryGroupSize: number,
  secondaryGroupSize: number,
  minimumGroupingDigits: number,
): boolean {
  const {runStart, runEnd} = findIntegerRun(text, group);
  const run = text.slice(runStart, runEnd);
  if (!run.includes(group)) {
    return true;
  }
  return (
    run ===
    insertGroupSeparators(
      extractDigits(run, group),
      group,
      primaryGroupSize,
      secondaryGroupSize,
      minimumGroupingDigits,
    )
  );
}

/**
 * The indexes in `text` of the group characters in its integer run that the
 * person typed. An edit that inserts a group character adds its index, the
 * typed ones from `previousText` (`previousTypedGroups`) move with the
 * unchanged text around the edit, and one the edit deleted drops out. Without
 * them, a typed en-US `1,234` or de-DE `3.141` looks like the field's own
 * grouping, and a typed group character the person deleted again would leave
 * the field's own separators looking typed.
 */
export function typedGroupIndexes(
  text: string,
  locale?: Locale,
  previousText?: string,
  previousTypedGroups: ReadonlyArray<number> = [],
): number[] {
  const {group, hasGrouping} = getLocaleNumberSymbols(locale);
  if (!hasGrouping || group === '' || previousText === undefined) {
    return [];
  }
  const {prefix, suffix} = editBounds(previousText, text);
  const shift = text.length - previousText.length;
  const indexes: number[] = [];
  for (const index of previousTypedGroups) {
    if (index + group.length <= prefix) {
      indexes.push(index);
    } else if (index >= previousText.length - suffix) {
      indexes.push(index + shift);
    }
  }
  for (let i = prefix; i < text.length - suffix; i++) {
    if (text.startsWith(group, i)) {
      indexes.push(i);
      i += group.length - 1;
    }
  }
  const {runStart, runEnd} = findIntegerRun(text, group);
  return indexes
    .filter(
      index =>
        index >= runStart &&
        index + group.length <= runEnd &&
        text.startsWith(group, index),
    )
    .sort((x, y) => x - y);
}

/**
 * Group separators belong only in the integer run. A sign, a decimal mark, or
 * any other character stays where the person typed it. A group character that
 * is not on a grouping boundary stays too: it may be a decimal (de-DE `1.5`)
 * or a malformed group (en-US `1,23`).
 *
 * With `previousText`, an edit that only inserted digits or deleted text from
 * a draft whose separators were all the field's own regroups even though it
 * shifted those separators off their boundaries (en-US `1,500` then `0` is
 * `15,000`, Backspace at the end of `1,500,000` is `150,000`).
 *
 * With `previousTypedGroups` (see `typedGroupIndexes`), a draft that still
 * holds a group character the person typed stays as typed, even once three
 * digits follow it (en-US `1,234` then `5` stays `1,2345`).
 */
export function groupEditableDraft(
  text: string,
  caret: number,
  locale?: Locale,
  previousText?: string,
  previousTypedGroups: ReadonlyArray<number> = [],
): GroupedEditableDraft {
  const clampedCaret = Math.max(0, Math.min(caret, text.length));
  const {
    group,
    primaryGroupSize,
    secondaryGroupSize,
    minimumGroupingDigits,
    hasGrouping,
  } = getLocaleNumberSymbols(locale);
  if (!hasGrouping || group === '') {
    return {text, caret: clampedCaret};
  }

  const {runStart, runEnd} = findIntegerRun(text, group);
  const run = text.slice(runStart, runEnd);
  const digits = extractDigits(run, group);
  if (digits === '') {
    return {text, caret: clampedCaret};
  }

  // A group character the person just typed may be a decimal (vi-VN / de-DE
  // `1.500` then `.5`) or a typo (en-US `1,500` then `,5`). Never fold it into
  // the digits: leave the text as typed so the parser decides.
  if (
    previousText !== undefined &&
    insertedByEdit(previousText, text).includes(group)
  ) {
    return {text, caret: clampedCaret};
  }

  // A group character typed earlier is still in the run. Once three digits
  // follow it, it sits on a grouping boundary and looks like the field's own,
  // so only the carried indexes tell them apart.
  if (
    typedGroupIndexes(text, locale, previousText, previousTypedGroups).length >
    0
  ) {
    return {text, caret: clampedCaret};
  }

  const isDigitOrDeletion =
    previousText !== undefined && isDigitOrDeletionEdit(previousText, text);
  const previousIsFieldGrouping =
    previousText !== undefined &&
    hasOnlyFieldGrouping(
      previousText,
      group,
      primaryGroupSize,
      secondaryGroupSize,
      minimumGroupingDigits,
    );

  // A digit or deletion edit to a draft that holds a group character the
  // person typed (vi-VN `1.500.5`, then Backspace) stays as typed too, so a
  // typed decimal is never folded into the digits a keystroke later.
  if (isDigitOrDeletion && !previousIsFieldGrouping) {
    return {text, caret: clampedCaret};
  }

  const isEditOfFieldGrouping = isDigitOrDeletion && previousIsFieldGrouping;

  // Otherwise strip group characters only when at least one of them is
  // already in a valid grouping position, and leave the typed text alone so
  // a decimal (de-DE / vi-VN `1.5`) or a malformed group (en-US `1,23`) is
  // not folded into the digits.
  if (
    !isEditOfFieldGrouping &&
    run.includes(group) &&
    !hasSeparatorAtGroupingOffset(
      run,
      group,
      digits.length,
      primaryGroupSize,
      secondaryGroupSize,
    )
  ) {
    return {text, caret: clampedCaret};
  }

  const groupedRun = insertGroupSeparators(
    digits,
    group,
    primaryGroupSize,
    secondaryGroupSize,
    minimumGroupingDigits,
  );
  const nextText = text.slice(0, runStart) + groupedRun + text.slice(runEnd);
  if (clampedCaret <= runStart) {
    return {text: nextText, caret: clampedCaret};
  }
  if (clampedCaret >= runEnd) {
    return {
      text: nextText,
      caret: runStart + groupedRun.length + (clampedCaret - runEnd),
    };
  }
  const digitsBefore = countDigits(text.slice(runStart, clampedCaret));
  return {
    text: nextText,
    caret: runStart + indexAfterDigits(groupedRun, digitsBefore),
  };
}

/**
 * The focused text when grouping stays on. Scientific notation has no groups
 * to insert, so it stays as `formatEditableNumber`.
 */
export function formatGroupedEditableNumber(
  value: number,
  locale?: Locale,
): string {
  if (!Number.isFinite(value)) {
    return formatEditableNumber(value, locale);
  }
  const raw = Object.is(value, -0) ? '0' : String(value);
  if (/[eE]/.test(raw)) {
    return formatEditableNumber(value, locale);
  }
  const {decimal, hasGrouping} = getLocaleNumberSymbols(locale);
  if (!hasGrouping) {
    return formatEditableNumber(value, locale);
  }
  const localized = decimal === '.' ? raw : raw.replace('.', decimal);
  return groupEditableDraft(localized, localized.length, locale).text;
}

function digitIndexBeforeGroup(
  text: string,
  separatorStart: number,
  group: string,
): number {
  let i = separatorStart;
  while (i > 0) {
    if (i >= group.length && text.startsWith(group, i - group.length)) {
      i -= group.length;
      continue;
    }
    if (isAsciiDigit(text[i - 1])) {
      return i - 1;
    }
    return -1;
  }
  return -1;
}

function digitIndexAfterGroup(
  text: string,
  separatorStart: number,
  group: string,
): number {
  let i = separatorStart + group.length;
  while (i < text.length) {
    if (text.startsWith(group, i)) {
      i += group.length;
      continue;
    }
    if (isAsciiDigit(text[i])) {
      return i;
    }
    return -1;
  }
  return -1;
}

/**
 * Backspace after a separator, or Delete before one, would remove only the
 * separator. Regrouping puts it back at once. So delete the digit beyond it.
 *
 * Only when the integer run carries exactly the field's own grouping. A group
 * character the person typed as a decimal (de-DE / vi-VN `1.5`) or a malformed
 * group (en-US `1,23`) is left to the browser, which deletes just that
 * character.
 */
export function deleteDigitAcrossGroupSeparator(
  text: string,
  caret: number,
  key: 'Backspace' | 'Delete',
  locale?: Locale,
): GroupedEditableDraft | null {
  const {
    group,
    hasGrouping,
    primaryGroupSize,
    secondaryGroupSize,
    minimumGroupingDigits,
  } = getLocaleNumberSymbols(locale);
  if (!hasGrouping || group === '' || caret < 0 || caret > text.length) {
    return null;
  }
  if (
    !hasOnlyFieldGrouping(
      text,
      group,
      primaryGroupSize,
      secondaryGroupSize,
      minimumGroupingDigits,
    )
  ) {
    return null;
  }
  let digitIndex: number;
  let nextCaret: number;
  if (key === 'Backspace') {
    const separatorStart = caret - group.length;
    if (separatorStart < 0 || !text.startsWith(group, separatorStart)) {
      return null;
    }
    digitIndex = digitIndexBeforeGroup(text, separatorStart, group);
    nextCaret = digitIndex;
  } else {
    if (!text.startsWith(group, caret)) {
      return null;
    }
    digitIndex = digitIndexAfterGroup(text, caret, group);
    nextCaret = caret;
  }
  if (digitIndex < 0) {
    return null;
  }
  const nextText = text.slice(0, digitIndex) + text.slice(digitIndex + 1);
  return groupEditableDraft(nextText, nextCaret, locale, text);
}
