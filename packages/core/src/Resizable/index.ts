// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from useResizable and ResizeHandle
 * @output Re-exports all public Resizable API
 * @position Package entry point for Resizable
 */

export {percent} from './utils';
export {useResizable} from './useResizable';
export type {ResizablePercentSize, ResizableSize} from './utils';
export type {
  ResizableRegion,
  ResizableRegionConfig,
  ResizableProps,
  ResizableConfig,
  UseResizableSingleConfig,
  UseResizableMultiConfig,
} from './useResizable';

export {ResizeHandle} from './ResizeHandle';
export type {ResizeHandleProps} from './ResizeHandle';
