// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Popover component and hook
 * @output Exports all Popover module public API
 * @position Entry point for Popover module
 *
 * SYNC: When adding new Popover files, update exports here
 */

// Popover hook
export {usePopover} from './usePopover';
export type {UsePopoverOptions, UsePopoverReturn} from './usePopover';

// Popover component
export {Popover} from './Popover';
export type {
  PopoverPresentation,
  PopoverProps,
  PopoverTriggerRenderProps,
} from './Popover';
