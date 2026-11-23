// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DiffViewer deprecated re-export
 * @input `@astryxdesign/core/DiffViewer`
 * @output Exports DiffViewer, parseUnifiedDiff, createDiffFile, and their
 *   types, each deprecated
 * @position Lab entry kept for one release after DiffViewer moved to Core;
 *   consumed by packages/lab/src/index.ts
 */

import {
  DiffViewer as CoreDiffViewer,
  createDiffFile as coreCreateDiffFile,
  parseUnifiedDiff as coreParseUnifiedDiff,
  type CreateDiffFileOptions as CoreCreateDiffFileOptions,
  type DiffViewerChangeIndicator as CoreDiffViewerChangeIndicator,
  type DiffViewerFile as CoreDiffViewerFile,
  type DiffViewerFileStatus as CoreDiffViewerFileStatus,
  type DiffViewerHunk as CoreDiffViewerHunk,
  type DiffViewerInlineHighlight as CoreDiffViewerInlineHighlight,
  type DiffViewerLine as CoreDiffViewerLine,
  type DiffViewerLineKind as CoreDiffViewerLineKind,
  type DiffViewerLineRef as CoreDiffViewerLineRef,
  type DiffViewerProps as CoreDiffViewerProps,
  type DiffViewerSide as CoreDiffViewerSide,
  type DiffViewerViewMode as CoreDiffViewerViewMode,
} from '@astryxdesign/core/DiffViewer';

/**
 * @deprecated DiffViewer moved to Core: import it from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export const DiffViewer = CoreDiffViewer;

/**
 * @deprecated Import `parseUnifiedDiff` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export const parseUnifiedDiff = coreParseUnifiedDiff;

/**
 * @deprecated Import `createDiffFile` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export const createDiffFile = coreCreateDiffFile;

/**
 * @deprecated Import `DiffViewerProps` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerProps = CoreDiffViewerProps;

/**
 * @deprecated Import `DiffViewerViewMode` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerViewMode = CoreDiffViewerViewMode;

/**
 * @deprecated Import `DiffViewerChangeIndicator` from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export type DiffViewerChangeIndicator = CoreDiffViewerChangeIndicator;

/**
 * @deprecated Import `DiffViewerInlineHighlight` from `@astryxdesign/core`.
 * This Lab export is removed in the next release.
 */
export type DiffViewerInlineHighlight = CoreDiffViewerInlineHighlight;

/**
 * @deprecated Import `CreateDiffFileOptions` from `@astryxdesign/core`. This
 * Lab export is removed in the next release.
 */
export type CreateDiffFileOptions = CoreCreateDiffFileOptions;

/**
 * @deprecated Import `DiffViewerFile` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerFile = CoreDiffViewerFile;

/**
 * @deprecated Import `DiffViewerFileStatus` from `@astryxdesign/core`. This
 * Lab export is removed in the next release.
 */
export type DiffViewerFileStatus = CoreDiffViewerFileStatus;

/**
 * @deprecated Import `DiffViewerHunk` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerHunk = CoreDiffViewerHunk;

/**
 * @deprecated Import `DiffViewerLine` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerLine = CoreDiffViewerLine;

/**
 * @deprecated Import `DiffViewerLineKind` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerLineKind = CoreDiffViewerLineKind;

/**
 * @deprecated Import `DiffViewerLineRef` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerLineRef = CoreDiffViewerLineRef;

/**
 * @deprecated Import `DiffViewerSide` from `@astryxdesign/core`. This Lab
 * export is removed in the next release.
 */
export type DiffViewerSide = CoreDiffViewerSide;
