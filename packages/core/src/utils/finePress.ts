// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file finePress.ts
 * @input The primary-click rule (utils/primaryClick.ts)
 * @output registerFinePress, which installs that rule into the shared press
 *   controller (utils/pressFeedback.ts)
 * @position CheckboxInput and RadioListItem call registerFinePress as they
 *   load, and CheckboxListItem loads it with CheckboxInput. They mark the
 *   fine-pointer surfaces (pressFinePointer.stylex.ts). A page without them,
 *   such as a Carousel's, bundles none of the rule's code.
 */

import {installFinePress} from './pressFeedback';
import {isPrimaryClick} from './primaryClick';

/**
 * Installs the primary-click rule into the shared press controller. A
 * component that marks a fine-pointer surface calls it as its module loads.
 */
export function registerFinePress(): void {
  installFinePress(isPrimaryClick);
}
