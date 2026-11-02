// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutReset.ts
 * @input The layout custom properties Layout, its regions, Section and the
 *   container styles publish to their descendants.
 * @output `layoutReset`: the StyleX styles that stop every one of them at an
 *   element, so what renders inside lays out as it does at a page root.
 * @position Layout owns the reset (`component:Layout` FR8). A layout root
 *   applies it, as AppShell does at its root (`component:AppShell` FR18).
 *   Internal: no package entry exports it. `layoutReset.test.tsx` fails when
 *   Layout writes a custom property this reset does not cover.
 *
 * SYNC: the docsite's example root composes `overlayPaddingReset` and
 * mirrors the rest of this list (apps/docsite/src/components/component-detail/
 * ExampleBlock.tsx); apps/docsite/src/__tests__/example-layout-root.test.ts
 * fails when they differ.
 */

import * as stylex from '@stylexjs/stylex';
import {overlayPaddingReset} from './padding.stylex';

const resetBeyondOverlays = stylex.create({
  root: {
    // Added by descendants, beyond what an overlay root resets: each reader
    // falls back to its own default.
    '--layout-content-width': 'initial',
    '--layout-alignment-width': 'initial',
    '--_layout-flush-block-start': 'initial',
    '--_layout-flush-block-end': 'initial',
    '--container-max-height': 'initial',
  },
});

/**
 * The full layout reset, for `stylex.props(...)`: `overlayPaddingReset` (the
 * published container padding to `0px`; Layout insets and Section padding
 * propagation to `initial`) plus the Layout widths, flush values and height
 * cap. The shared declarations keep one owner, so a fix to either reaches
 * every root that applies them.
 */
export const layoutReset = [
  overlayPaddingReset.reset,
  resetBeyondOverlays.root,
] as const;
