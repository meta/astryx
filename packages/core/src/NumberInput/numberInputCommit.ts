// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file numberInputCommit.ts
 * @input A NumberInput draft and the field's validation constraints
 * @output A single commit, clear, or revert decision for the whole draft, and
 *   the rejection of a draft that cannot commit
 * @position Shared internal draft validation and commit policy for NumberInput and its live consumers
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/NumberInput/NumberInput.tsx
 * - /packages/core/src/NumberInput/numberInputCommit.test.ts
 * - /packages/core/src/Table/plugins/filtering/useTableFiltering.tsx
 * - /packages/core/src/PowerSearch/PowerSearchValueEditor.tsx
 */

import type {Locale} from '../i18n';
import {parseLocaleNumber} from './numberParser';

interface NumberInputValidationOptions {
  min?: number | null;
  max?: number | null;
  isIntegerOnly?: boolean;
  locale?: Locale;
}

/**
 * Why a draft cannot commit: text that is not a number, a fraction in an
 * integer-only field, or any number while no number fits the range.
 */
export type NumberInputRejection =
  {kind: 'unreadable'} | {kind: 'fractional' | 'outOfRange'; value: number};

export type NumberInputCommitDecision =
  | {type: 'commit'; value: number; didClamp: boolean}
  | {type: 'clear'}
  | {type: 'revert'};

function parseNumericInput(
  input: string,
  options: Pick<NumberInputValidationOptions, 'isIntegerOnly' | 'locale'>,
): number | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }

  const value = parseLocaleNumber(trimmed, options.locale);
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  if (options.isIntegerOnly && !Number.isInteger(value)) {
    return null;
  }
  return value;
}

export function parseNumberInput(
  input: string,
  options: NumberInputValidationOptions,
): number | null {
  const value = parseNumericInput(input, options);
  if (value === null) {
    return null;
  }
  if (options.min != null && value < options.min) {
    return null;
  }
  if (options.max != null && value > options.max) {
    return null;
  }
  return value;
}

/** The range a commit clamps to, with integer-only bounds rounded inward. */
function resolveCommitRange(options: NumberInputValidationOptions): {
  min: number | null;
  max: number | null;
} {
  const min =
    options.min == null
      ? null
      : options.isIntegerOnly
        ? Math.ceil(options.min)
        : options.min;
  const max =
    options.max == null
      ? null
      : options.isIntegerOnly
        ? Math.floor(options.max)
        : options.max;
  return {min, max};
}

/**
 * The rejection of a draft that cannot commit, or null for a draft that can,
 * an empty draft included. A number outside an ordinary range clamps, so it
 * is not a rejection.
 */
export function getNumberInputRejection(
  input: string,
  options: NumberInputValidationOptions,
): NumberInputRejection | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  const value = parseLocaleNumber(trimmed, options.locale);
  if (value == null || !Number.isFinite(value)) {
    return {kind: 'unreadable'};
  }
  if (options.isIntegerOnly && !Number.isInteger(value)) {
    return {kind: 'fractional', value};
  }
  const {min, max} = resolveCommitRange(options);
  if (min != null && max != null && min > max) {
    return {kind: 'outOfRange', value};
  }
  return null;
}

export function resolveNumberInputCommit(
  input: string,
  options: NumberInputValidationOptions & {hasClear: boolean},
): NumberInputCommitDecision {
  if (input.trim() === '') {
    return options.hasClear ? {type: 'clear'} : {type: 'revert'};
  }

  const value = parseNumericInput(input, options);
  if (value === null) {
    return {type: 'revert'};
  }

  const {min, max} = resolveCommitRange(options);
  if (min != null && max != null && min > max) {
    return {type: 'revert'};
  }

  const committedValue =
    min != null && value < min ? min : max != null && value > max ? max : value;
  return {
    type: 'commit',
    value: committedValue,
    didClamp: committedValue !== value,
  };
}
