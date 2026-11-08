// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports layout utilities and components
 * @output Exports Astryx layout system
 * @position Entry point for @astryxdesign/core/Layout
 *
 * SYNC: When modified, update /packages/core/src/Layout/Layout.doc.mjs
 */

// Container utility
export {container} from './container.stylex';
export type {
  ContainerComponent,
  ContainerOptions,
  SpacingToken,
} from './container.stylex';

// Overlay padding-variable reset (applied on overlay roots so the container
// padding system does not cross a fixed/top-layer boundary)
export {overlayPaddingReset} from './overlayPaddingReset.stylex';

// Edge compensation utility
export {edgeCompSlot, EDGE_COMP_ATTR} from './edgeCompensation.stylex';

// Stack utilities (re-exported from Stack module)
export {stack} from '../Stack/stack.stylex';
export type {
  StackOptions,
  StackDirection,
  StackCrossAlignment,
  StackMainAlignment,
  StackWrap,
  SpacingStep,
} from '../Stack/stack.stylex';

export {stackItem} from '../Stack/stackItem.stylex';
export type {
  StackItemOptions,
  StackItemCrossAlignSelf,
  StackItemSize,
} from '../Stack/stackItem.stylex';

// Stack components (re-exported from Stack module)
export {Stack, HStack, VStack, StackItem} from '../Stack';
export type {
  StackProps,
  StackAlignment,
  HStackProps,
  VStackProps,
  StackItemProps,
} from '../Stack';

// Container components (re-exported from their own modules)
export {Card} from '../Card';
export type {CardProps} from '../Card';

export {Section} from '../Section';
export type {SectionProps, SectionVariant} from '../Section';

export type {SizeValue} from '../utils/types';

// Layout structure components
export {Layout} from './Layout';
export type {LayoutProps, LayoutHeight} from './Layout';

export {LayoutHeader} from './LayoutHeader';
export type {LayoutHeaderProps} from './LayoutHeader';

export {LayoutFooter} from './LayoutFooter';
export type {LayoutFooterProps} from './LayoutFooter';

export {LayoutContent} from './LayoutContent';
export type {LayoutContentProps} from './LayoutContent';

export {LayoutPanel} from './LayoutPanel';
export type {LayoutPanelProps} from './LayoutPanel';

export {LayoutAreaContext} from './LayoutAreaContext';
export type {LayoutArea} from './LayoutAreaContext';

export {LayoutDividerContext} from './LayoutDividerContext';
export type {LayoutDividerContextValue} from './LayoutDividerContext';
