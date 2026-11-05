// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAria.ts
 * @input Receives input label/description IDs and optional InputGroup context
 * @output Exports getInputARIA and joinAriaIDs for consistent input ARIA composition
 * @position Internal utility; used by inputs that compose labels/descriptions
 */

export interface InputARIAInputGroup {
  /** ID of the visible InputGroup label. */
  labelID: string;
  /** Space-separated IDs for InputGroup description/status text. */
  describedByIDs?: string;
}

export interface InputARIA {
  /** Value for aria-labelledby on the input. */
  ariaLabelledBy?: string;
  /** Value for aria-describedby on the input. */
  ariaDescribedBy?: string;
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
 * Builds ARIA label/description wiring for an input.
 *
 * Standalone inputs keep their normal native label association. Grouped inputs
 * are named by the visible InputGroup label plus their own input label, and
 * inherit group description/status text in addition to input-local text.
 */
export function getInputARIA(
  labelID: string,
  describedByIDs: AriaID[] = [],
  inputGroup?: InputARIAInputGroup | null,
): InputARIA {
  return {
    ariaLabelledBy: inputGroup
      ? joinAriaIDs(inputGroup.labelID, labelID)
      : undefined,
    ariaDescribedBy: joinAriaIDs(inputGroup?.describedByIDs, ...describedByIDs),
  };
}
