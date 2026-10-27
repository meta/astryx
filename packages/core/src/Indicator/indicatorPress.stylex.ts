// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file indicatorPress.stylex.ts
 * @input StyleX and the pressed overlay token
 * @output indicatorPressOwnerStyles: what an element that owns a press
 *   (a CheckboxInput's control, a CheckboxList or RadioList row) declares for
 *   the layer over its selection mark
 * @position Shared by CheckboxInput, CheckboxListItem and RadioListItem; the
 *   layers that read it are theirs
 *
 * The layer over a checkbox box or a radio circle answers the press of the
 * element that owns it, and only that one. Each owner declares the press's
 * image and release on itself: none at rest, and the pressed token at full
 * strength (with, while the press fades, the release) only inside its own
 * press arms, for every pointer: the press controller marks a mouse's and a
 * pen's press as it does a finger's (`spec:AST-094` FR11's fine-pointer
 * profile, FR43). A layer reads its nearest owner's
 * values, so a mark inside another owner's content (a list in a row's
 * content, a checkbox in a radio row) answers its own owner, never the outer
 * one (`architecture:component-style-authoring` INV4).
 *
 * The arms key on `:is([data-astryx-press=…])` rather than a bare attribute
 * selector: on a custom property, StyleX's layered build places a bare
 * attribute condition in a lower cascade layer than the property's default,
 * where it never wins.
 */

import * as stylex from '@stylexjs/stylex';

import {colorVars} from '../theme/tokens.stylex';

/** The pressed token as an image layer, at full strength. */
const pressedImage = `linear-gradient(${colorVars['--color-overlay-pressed']}, ${colorVars['--color-overlay-pressed']})`;

/** Opacity 1 → 0: the layer over the mark leaves while its owner's press fades. */
const indicatorPressRelease = stylex.keyframes({
  from: {opacity: 1},
  to: {opacity: 0},
});

export const indicatorPressOwnerStyles = stylex.create({
  owner: {
    '--_indicator-press-image': {
      default: 'none',
      ':is([data-astryx-press="on"])': pressedImage,
      ':is([data-astryx-press="fading"])': pressedImage,
    },
    '--_indicator-press-release': {
      default: 'none',
      ':is([data-astryx-press="fading"])': indicatorPressRelease,
    },
  },
});
