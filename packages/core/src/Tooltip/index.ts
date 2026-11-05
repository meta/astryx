// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Tooltip component and hook
 * @output Exports all Tooltip module public API
 * @position Entry point for Tooltip module
 *
 * SYNC: When adding new Tooltip files, update exports here
 */

// Tooltip hook
export {useTooltip} from './useTooltip';
export type {
  TooltipFocusTrigger,
  TooltipTouchTrigger,
  TooltipOptions,
  TooltipReturn,
} from './useTooltip';

// Tooltip component
export {Tooltip} from './Tooltip';
export type {TooltipProps} from './Tooltip';
