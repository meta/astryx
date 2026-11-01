// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from createResizable, useResizable and ResizeHandle
 * @output Re-exports all public Resizable API
 * @position Package entry point for Resizable
 */

export {percent} from './utils';
export {createResizable} from './createResizable';
export type {
  CreateResizableOptions,
  ResizableController,
} from './createResizable';
export {useResizable} from './useResizable';
export type {ResizablePercentSize, ResizableSize} from './utils';
export type {
  ResizableRegion,
  ResizableRegionConfig,
  ResizableProps,
  ResizableConfig,
  UseResizableSingleConfig,
  UseResizableMultiConfig,
  UseResizableResult,
} from './useResizable';

export {ResizeHandle} from './ResizeHandle';
export type {ResizeHandleProps} from './ResizeHandle';
