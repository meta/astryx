// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from TopNav component files
 * @output Exports TopNav and companion components
 * @position Entry point for TopNav module
 *
 * SYNC: When modified, update /packages/core/src/TopNav/TopNav.doc.mjs
 */

export {TopNav} from './TopNav';
export type {TopNavProps} from './TopNav';

export {TopNavHeading} from './TopNavHeading';
export type {TopNavHeadingProps} from './TopNavHeading';

export {TopNavItem} from './TopNavItem';
export type {TopNavItemProps} from './TopNavItem';

export {TopNavMenu} from './TopNavMenu';
export type {TopNavMenuProps, TopNavMenuItemData} from './TopNavMenu';

export {TopNavMegaMenu} from './TopNavMegaMenu';
export type {TopNavMegaMenuProps} from './TopNavMegaMenu';

export {TopNavMegaMenuItem} from './TopNavMegaMenuItem';
export type {TopNavMegaMenuItemProps} from './TopNavMegaMenuItem';

export {TopNavMegaMenuFeaturedCard} from './TopNavMegaMenuFeaturedCard';
export type {TopNavMegaMenuFeaturedCardProps} from './TopNavMegaMenuFeaturedCard';

export {TopNavRenderContext, useTopNavRenderMode} from './TopNavRenderContext';
export type {TopNavRenderMode} from './TopNavRenderContext';
