// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectorPresentation.stylex.ts
 * @input Uses field border, size and spacing tokens
 * @output Shared focus-return, trigger line-box, and trigger row styles for
 *   Selector and MultiSelector
 * @position Internal visual policy for selector presentation changes
 */

import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  sizeVars,
  spacingVars,
} from '../theme/tokens.stylex';

export const selectorPresentationStyles = stylex.create({
  pointerRestoredFocus: {
    borderColor: colorVars['--color-border-emphasized'],
    boxShadow: 'none',
    outlineWidth: '0',
    outlineStyle: 'none',
  },
});

// The trigger's line box and block padding, by size. The line box is
// `--spacing-5`, floored at the 20px clear control and 1rem icons. When that
// row would not fit inside the size token's borders, it is capped at what the
// token holds, but never below 1.5em of the trigger's own font, so label text
// too large for the token keeps room rather than being clipped. The padding is
// what is left of the token, so a one-line trigger is the token and its line
// box is centred. Ghost and grouped triggers set their own line box.
// Keep these calculations inline: a consumer's Babel preset can lower a
// module-scope helper to a function expression before StyleX evaluates this
// object, and StyleX cannot constant-evaluate that transformed helper.
export const selectorTriggerLineBoxStyles = stylex.create({
  sm: {
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-sm']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-sm']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-sm']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
  md: {
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-md']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-md']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-md']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
  lg: {
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-lg']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-lg']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-lg']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
});

// The trigger height for a picker whose content must not set it
// (MultiSelector): the size token, or the line box above and the borders when
// a larger text size makes that taller. A text field's row
// (`inputRowSizeStyles`) is not used: it measures the body text, which a
// mobile type scale makes taller than this line box, and the trigger would
// then grow past its token at the theme's text size.
export const selectorTriggerRowStyles = stylex.create({
  sm: {
    height: `max(${sizeVars['--size-element-sm']}, max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-sm']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) + 2 * ${borderVars['--border-width']})`,
  },
  md: {
    height: `max(${sizeVars['--size-element-md']}, max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-md']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) + 2 * ${borderVars['--border-width']})`,
  },
  lg: {
    height: `max(${sizeVars['--size-element-lg']}, max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-lg']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) + 2 * ${borderVars['--border-width']})`,
  },
});
