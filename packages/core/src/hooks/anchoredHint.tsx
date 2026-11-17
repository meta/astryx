// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file anchoredHint.tsx
 * @input A context layer (Layer/useLayer.tsx) and the theme's tokens
 * @output renderAnchoredHint and anchoredHintStyles: the anchored hint layer
 *   Core's keyboard hints share. It is a small surface in the top layer,
 *   below the start of the element it is anchored to. It has the popover
 *   background, the element radius, the low shadow and supporting text. It
 *   holds a row of key glyphs and a label
 * @position Internal to Core, not exported from the package. The keyboard
 *   hint (hooks/useKeyboardHint.tsx) renders its passive hint with it. A
 *   reorderable List (List/listReorderEngine.tsx) renders the hint of its
 *   reorder mode with it, whose glyphs are buttons
 *
 * SYNC: When modified, update hooks/useKeyboardHint.tsx and
 * List/listReorderEngine.tsx.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {ContextLayerReturn} from '../Layer/useLayer';

const styles = stylex.create({
  hint: {
    // Top layer + anchor positioned
    position: 'fixed',
    inset: 'auto',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',

    // Surface
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-element'],
    boxShadow: shadowVars['--shadow-low'],
    paddingBlockStart: spacingVars['--spacing-1'],
    paddingBlockEnd: spacingVars['--spacing-1'],
    paddingInlineStart: spacingVars['--spacing-2'],
    paddingInlineEnd: spacingVars['--spacing-2'],

    // Typography
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',

    // Animation
    opacity: {
      default: 0,
      ':popover-open': 1,
    },
    transitionProperty: 'opacity, display, overlay',
    transitionDuration: '150ms',
    transitionBehavior: 'allow-discrete',
  },
  // A hint that only teaches floats above the content without taking its
  // pointer events.
  passive: {
    pointerEvents: 'none',
  },
  keys: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  label: {
    marginInlineStart: spacingVars['--spacing-1'],
  },
});

/** The hint's row of key glyphs, and the label after it. */
export const anchoredHintStyles = {
  keys: styles.keys,
  label: styles.label,
};

/**
 * Renders `content` as an anchored hint in `layer` (a context layer whose
 * `ref` holds the anchor). A passive hint lets pointer events through; an
 * interactive one (`isInteractive`) takes them, for glyphs that are buttons.
 */
export function renderAnchoredHint(
  layer: ContextLayerReturn,
  content: ReactNode,
  {isInteractive = false}: {isInteractive?: boolean} = {},
): ReactNode {
  return layer.render(content, {
    placement: 'below',
    alignment: 'start',
    xstyle: [styles.hint, !isInteractive && styles.passive],
    style: {
      marginBlockStart: spacingVars['--spacing-2'],
    },
  });
}
