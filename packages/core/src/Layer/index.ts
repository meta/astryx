// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Layer hooks and components
 * @output Exports all Layer module public API
 * @position Entry point for Layer module
 *
 * SYNC: When adding new Layer files, update exports here
 *
 * NOTE: Popover, HoverCard, and Tooltip have been moved to their own
 * top-level directories. They are re-exported here for backward compatibility.
 * New code should import from @astryxdesign/core/Popover, @astryxdesign/core/HoverCard,
 * or @astryxdesign/core/Tooltip directly.
 */

// Core layer hook (remains in Layer)
export {useLayer} from './useLayer';
export type {
  LayerAlignment,
  LayerPlacement,
  ContextRenderProps,
  FixedRenderProps,
  ContextLayerOptions,
  FixedLayerOptions,
  ContextLayerReturn,
  FixedLayerReturn,
} from './useLayer';

// Layer dismissal stack — one Escape owner for every overlay family
export {useLayerDismissal} from './useLayerDismissal';
export type {
  LayerEscapeBehavior,
  UseLayerDismissalOptions,
  UseLayerDismissalReturn,
} from './useLayerDismissal';
export {LayerDepthProvider} from './LayerDepthContext';

// Shared touch behavior for the hover layers
export {useTouchTrigger, isActionTrigger} from './useTouchTrigger';
export type {
  LayerTouchTrigger,
  UseTouchTriggerOptions,
  UseTouchTriggerReturn,
} from './useTouchTrigger';

// Layer provider
export {LayerProvider} from './LayerProvider';
export type {LayerProviderProps} from './LayerProvider';
export {LayerContext, useLayerContext} from './LayerContext';
export type {
  LayerContextValue,
  LayerInset,
  LayerToastConfig,
} from './LayerContext';

// Shared entry animation styles for layer-based components
export {layerAnimations} from './layerAnimations.stylex';

// Re-export Popover from new location (backward compat)
export {usePopover, Popover} from '../Popover';
export type {
  UsePopoverOptions,
  UsePopoverReturn,
  PopoverProps,
} from '../Popover';

// Re-export HoverCard from new location (backward compat)
export {useHoverCard, HoverCard} from '../HoverCard';
export type {
  HoverCardFocusTrigger,
  HoverCardTouchTrigger,
  HoverCardOptions,
  HoverCardReturn,
  HoverCardProps,
} from '../HoverCard';

// Re-export Tooltip from new location (backward compat)
export {useTooltip, Tooltip} from '../Tooltip';
export type {
  TooltipFocusTrigger,
  TooltipTouchTrigger,
  TooltipOptions,
  TooltipReturn,
  TooltipProps,
} from '../Tooltip';
