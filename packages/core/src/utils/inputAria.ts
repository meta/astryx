// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAria.ts
 * @input Receives input label/description IDs and optional InputGroup context
 * @output Exports getInputARIA and joinAriaIDs for consistent input ARIA composition
 * @position Internal utility; used by inputs that compose labels/descriptions
 */

import type {InputStatusType} from '../Field/types';

export interface InputARIAInputGroup {
  /** ID of the visible InputGroup label. */
  labelID: string;
  /** Space-separated IDs for InputGroup description/status text. */
  describedByIDs?: string;
  /** Status type the InputGroup owns, when it has one. */
  statusType?: InputStatusType;
}

export interface InputARIA {
  /** Value for aria-labelledby on the input. */
  ariaLabelledBy?: string;
  /** Value for aria-describedby on the input. */
  ariaDescribedBy?: string;
  /** Whether the input presents as invalid: its own error or the group's. */
  isInvalid: boolean;
}

type AriaID = string | null | undefined | false;

export function joinAriaIDs(...values: AriaID[]): string | undefined {
  const ids = values
    .flatMap(value =>
      typeof value === 'string' ? value.trim().split(/\s+/) : [],
    )
    .filter(Boolean);

  if (ids.length === 0) {
    return undefined;
  }

  return Array.from(new Set(ids)).join(' ');
}

/**
 * Builds ARIA label/description wiring for an input and resolves its invalid
 * state.
 *
 * Standalone inputs keep their normal native label association. Grouped inputs
 * are named by the visible InputGroup label plus their own input label, and
 * inherit group description/status text in addition to input-local text.
 *
 * `statusType` is the input's own status type, resolved as the caller sees it.
 * The returned `isInvalid` marks the input invalid for an error of its own or
 * of the surrounding InputGroup; warning, success, and no status never do,
 * matching each input's own error-only mapping. Caller-passed `aria-invalid`
 * values are not handled here: components that forward one keep their own
 * precedence.
 */
export function getInputARIA(
  labelID: string,
  describedByIDs: AriaID[] = [],
  inputGroup?: InputARIAInputGroup | null,
  statusType?: InputStatusType,
): InputARIA {
  return {
    ariaLabelledBy: inputGroup
      ? joinAriaIDs(inputGroup.labelID, labelID)
      : undefined,
    ariaDescribedBy: joinAriaIDs(inputGroup?.describedByIDs, ...describedByIDs),
    isInvalid: statusType === 'error' || inputGroup?.statusType === 'error',
  };
}
