// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveOperatorLabel.ts
 * @input PowerSearchOperator + translator function
 * @output Display string for the operator label
 * @position Shared label-resolution helper used at every render site that
 *   reads an operator's display text (PowerSearch.tsx, PowerSearchToken.tsx,
 *   PowerSearchEditPopover.tsx, usePowerSearchSource.ts).
 *
 * A PowerSearchOperator is a discriminated union of two variants:
 *   - `{key, value, label}`     — consumer-supplied raw text (used verbatim)
 *   - `{key, value, i18nKey}`   — catalog-driven text (looked up via t())
 *
 * Astryx's shipped default operators use the i18nKey variant; consumers
 * writing custom operators typically use the label variant.
 *
 * A custom operator may name any Astryx key in `i18nKey`, so this module
 * registers the whole English catalog rather than only the keys Core names.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/types.ts (PowerSearchOperator type)
 * - /packages/core/src/PowerSearch/index.ts (re-export)
 */

import type {TranslatorFn} from '../i18n/useTranslator';
import {registerFullEnglishFallback} from '../i18n/fullEnglishFallback';
import type {PowerSearchOperator} from './types';

registerFullEnglishFallback();

export function resolveOperatorLabel(
  operator: PowerSearchOperator,
  t: TranslatorFn,
): string {
  if ('label' in operator && operator.label !== undefined) {
    return operator.label;
  }
  return t(operator.i18nKey);
}
