// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file __tests__/textOnTint.ts
 * @input A rendered part.
 * @output Whether the part, or an element inside it, reads the secondary
 *   text Core measures on the accent tint.
 * @position Test helper for the parts that paint the tint (theme-compilation
 *   INV22). StyleX emits one atomic class per declaration, so an element has
 *   the probe's class exactly when it sets the same declaration.
 */

import * as stylex from '@stylexjs/stylex';
import {selectedTintTextVars} from '../theme/selectedTintText.stylex';

const probe = stylex.create({
  token: {
    '--color-text-secondary':
      selectedTintTextVars['--_selected-text-secondary'],
  },
  color: {color: selectedTintTextVars['--_selected-text-secondary']},
});

// Debug class names name their source file; only the atoms matter.
const atoms = (className: string | undefined) =>
  (className ?? '')
    .split(' ')
    .filter(name => name !== '' && !name.includes('__'));

const CLASSES = {
  token: atoms(stylex.props(probe.token).className),
  color: atoms(stylex.props(probe.color).className),
};

/**
 * Whether `root` or an element inside it reads the text on the tint: as its
 * secondary text token (`token`) or as its own color (`color`).
 */
export function readsTextOnTint(
  root: Element,
  as: 'token' | 'color' = 'token',
): boolean {
  const classes = CLASSES[as];
  return [root, ...root.querySelectorAll('*')].some(element =>
    classes.every(name => element.classList.contains(name)),
  );
}
