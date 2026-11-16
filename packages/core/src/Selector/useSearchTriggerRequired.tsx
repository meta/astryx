// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSearchTriggerRequired.tsx
 * @input A select trigger's search, read-only, required and labelling state
 * @output The trigger's aria-required value, the id of its hidden "Required"
 *   description when it needs one, and that description's element
 * @position Internal required-state rule shared by Selector and MultiSelector
 */

import {useId, type ReactNode} from 'react';
import {VisuallyHidden} from '../VisuallyHidden/VisuallyHidden';

export interface SearchTriggerRequiredOptions {
  hasSearch: boolean;
  isReadOnly: boolean;
  isRequired: boolean;
  /** Whether the Field label shows its visible required marker. */
  isLabelRequiredMarkerShown: boolean;
  /** Whether the trigger sits in an InputGroup, which names it instead. */
  isInInputGroup: boolean;
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  /** The localized "Required" text. */
  requiredLabel: string;
}

export interface SearchTriggerRequired {
  ariaRequired: 'true' | undefined;
  /** Add to the trigger's aria-describedby when it is defined. */
  requiredDescriptionId: string | undefined;
  /** Render next to the trigger. */
  requiredDescription: ReactNode;
}

/**
 * With search, the editable trigger is a role-less button, where
 * aria-required is not allowed. The closed trigger then states the required
 * state in its name, through the Field label's visible marker, or else in a
 * hidden description. The search combobox carries aria-required while open.
 */
export function useSearchTriggerRequired({
  hasSearch,
  isReadOnly,
  isRequired,
  isLabelRequiredMarkerShown,
  isInInputGroup,
  ariaLabel,
  ariaLabelledBy,
  requiredLabel,
}: SearchTriggerRequiredOptions): SearchTriggerRequired {
  const descriptionId = useId();
  const isSearchTrigger = hasSearch && !isReadOnly;
  const isLabelRequiredInName =
    isLabelRequiredMarkerShown &&
    !isInInputGroup &&
    (ariaLabel == null || ariaLabelledBy != null);
  const hasRequiredDescription =
    isSearchTrigger && isRequired && !isLabelRequiredInName;
  return {
    ariaRequired: isRequired && !isSearchTrigger ? 'true' : undefined,
    requiredDescriptionId: hasRequiredDescription ? descriptionId : undefined,
    requiredDescription: hasRequiredDescription ? (
      <VisuallyHidden id={descriptionId}>{requiredLabel}</VisuallyHidden>
    ) : null,
  };
}
