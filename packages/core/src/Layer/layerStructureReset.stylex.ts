// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerStructureReset.stylex.ts
 * @input Uses StyleX
 * @output Stops inherited structural custom properties at a layer's content boundary
 * @position Private Core styling; AST-038 FR7 owns the accepted contract
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Apply beside `layerTextReset`, before component and consumer styles, on the
 * layer's content boundary. Top-layer promotion does not stop DOM inheritance,
 * so a structural value an ancestor component scoped to its own descendants
 * would otherwise reach unrelated content opened from inside it.
 *
 * Name each property: a structural channel stops here only once it is known.
 * Theme tokens and writing context must keep inheriting (AST-038 FR2), so this
 * never resets by prefix.
 */
export const layerStructureReset = stylex.create({
  reset: {
    // A Stepper reads its connector gap from the nearest ancestor that sets it,
    // so a Stepper opened in a layer from one of its steps would inherit the
    // outer track's gap. `initial` hands the connector back its own 0px
    // fallback. A value set on the inner Stepper, through its `stepper` theme
    // target, or by a caller style on this layer root still applies.
    '--step-connector-gap': 'initial',
    // A container that wraps with `overflow-wrap: anywhere` passes it to the
    // Text inside it (Text and Heading FR3). Text in a layer opened from such
    // a container keeps its own `break-word`: `initial` makes the variable
    // invalid, so Text falls back.
    '--_astryx-text-overflow-wrap': 'initial',
  },
});
