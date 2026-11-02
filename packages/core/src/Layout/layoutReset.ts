// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutReset.ts
 * @input The layout custom properties Layout, its regions, Section and the
 *   container styles publish to their descendants.
 * @output `layoutReset`: one StyleX style that stops every one of them at an
 *   element, so what renders inside lays out as it does at a page root.
 * @position Layout owns the reset (`component:Layout` FR8). A layout root
 *   applies it, as AppShell does at its root (`component:AppShell` FR18).
 *   Internal: no package entry exports it. `layoutReset.test.tsx` fails when
 *   Layout writes a custom property this reset does not cover.
 *
 * SYNC: the docsite's example root mirrors this list
 * (apps/docsite/src/components/component-detail/ExampleBlock.tsx), under a
 * parity test.
 */

import * as stylex from '@stylexjs/stylex';

export const layoutReset = stylex.create({
  root: {
    // Subtracted by descendants: nothing outside is left to escape.
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
    // Added by descendants: each reader falls back to its own default.
    '--layout-padding-outer-x': 'initial',
    '--layout-padding-outer-y': 'initial',
    '--layout-padding-own-outer-x': 'initial',
    '--layout-padding-own-outer-y': 'initial',
    '--layout-padding-inner-x': 'initial',
    '--layout-padding-inner-y': 'initial',
    '--layout-content-width': 'initial',
    '--layout-alignment-width': 'initial',
    '--_layout-flush-block-start': 'initial',
    '--_layout-flush-block-end': 'initial',
    '--_section-padding-propagated': 'initial',
    '--container-max-height': 'initial',
  },
});
