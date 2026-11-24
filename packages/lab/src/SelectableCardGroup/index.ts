// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectableCardGroup deprecated re-export
 * @input `@astryxdesign/core/SelectableCardGroup`
 * @output Exports SelectableCardGroup and SelectableCardGroupProps, each
 *   deprecated
 * @position Lab entry kept for one release after SelectableCardGroup moved to
 *   Core; consumed by packages/lab/src/index.ts
 */

import {
  SelectableCardGroup as CoreSelectableCardGroup,
  type SelectableCardGroupProps as CoreSelectableCardGroupProps,
} from '@astryxdesign/core/SelectableCardGroup';

/**
 * @deprecated SelectableCardGroup moved to Core: import it from
 * `@astryxdesign/core`. This Lab export is removed in the next release.
 */
export const SelectableCardGroup = CoreSelectableCardGroup;

/**
 * @deprecated Import `SelectableCardGroupProps` from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export type SelectableCardGroupProps = CoreSelectableCardGroupProps;
