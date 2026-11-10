// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file attachedTooltipModule.ts
 * @input createModuleLoader
 * @output Exports attachedTooltipModule, the on-demand loader of AttachedTooltip
 * @position Internal to Core. A component imports this loader instead of the
 *   Tooltip, so importing the component does not load the Tooltip.
 */

import {createModuleLoader} from './moduleLoader';

export const attachedTooltipModule = createModuleLoader(
  async () => import('../Tooltip/AttachedTooltip'),
);
