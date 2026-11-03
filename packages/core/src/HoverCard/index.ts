// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input HoverCard component and hook
 * @output Exports all HoverCard module public API
 * @position Entry point for HoverCard module
 *
 * SYNC: When adding new HoverCard files, update exports here
 */

// HoverCard hook
export {useHoverCard} from './useHoverCard';
export type {
  HoverCardFocusTrigger,
  HoverCardTriggerBehavior,
  HoverCardTouchTrigger,
  HoverCardOptions,
  HoverCardReturn,
} from './useHoverCard';

// HoverCard component
export {HoverCard} from './HoverCard';
export type {HoverCardProps} from './HoverCard';
