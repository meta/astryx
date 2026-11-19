// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports SideNav components and types
 * @output Exports SideNav, SideNavHeading, SideNavItem, SideNavSection
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/SideNav/SideNav.doc.mjs
 */

export {SideNav} from './SideNav';
export type {SideNavProps} from './SideNav';

export {SideNavHeading} from './SideNavHeading';
export type {SideNavHeadingProps} from './SideNavHeading';

export {SideNavItem} from './SideNavItem';
export type {SideNavItemProps} from './SideNavItem';

export {SideNavSection} from './SideNavSection';
export type {SideNavSectionProps} from './SideNavSection';

export {SideNavCollapseButton} from './SideNavCollapseButton';
export type {SideNavCollapseButtonProps} from './SideNavCollapseButton';

export {useSideNavCollapse} from './SideNavCollapseContext';
export type {
  SideNavCollapseState,
  SideNavCollapsibleConfig,
  SideNavControlledCollapsible,
  SideNavImperativeCollapseHandle,
} from './SideNavCollapseContext';

export {
  SideNavRenderContext,
  useSideNavRenderMode,
} from './SideNavRenderContext';
export type {SideNavRenderMode} from './SideNavRenderContext';
