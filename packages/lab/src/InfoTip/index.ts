// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfoTip deprecated re-export
 * @input `@astryxdesign/core/InfoTip`
 * @output Exports InfoTip, InfoTipProps, InfoTipSize, each deprecated
 * @position Lab entry kept for one release after InfoTip moved to Core
 *   (component:InfoTip FR4); consumed by packages/lab/src/index.ts
 */

import {
  InfoTip as CoreInfoTip,
  type InfoTipProps as CoreInfoTipProps,
  type InfoTipSize as CoreInfoTipSize,
} from '@astryxdesign/core/InfoTip';

/**
 * @deprecated InfoTip moved to Core: import it from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export const InfoTip = CoreInfoTip;

/**
 * @deprecated Import `InfoTipProps` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type InfoTipProps = CoreInfoTipProps;

/**
 * @deprecated Import `InfoTipSize` from `@astryxdesign/core`. This Lab export
 * is removed in the next release.
 */
export type InfoTipSize = CoreInfoTipSize;
