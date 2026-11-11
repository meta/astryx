// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file labelTooltipSuppression.ts
 * @input Uses React context
 * @output Exports LabelTooltipSuppressionContext (internal; not in the package index)
 * @position Lets a component that shows its own tooltip on a caller's control
 *   turn off that control's label tooltip, so the control never shows two.
 */

import {createSharedContext} from './sharedContext';

/**
 * True while an owner shows its own tooltip on the controls inside. Button
 * then shows no `tooltip` of its own. ComplexSelector sets it around a
 * `renderTrigger` control while its disabled reason shows.
 */
export const LabelTooltipSuppressionContext = createSharedContext(
  'LabelTooltipSuppressionContext',
  1,
  false,
);
LabelTooltipSuppressionContext.displayName = 'LabelTooltipSuppressionContext';
