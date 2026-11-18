// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from TabList component files
 * @output Exports TabList, Tab, TabMenu and their types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/TabList/TabList.doc.mjs
 */

export {TabList} from './TabList';
export type {TabListProps, TabListOverflow} from './TabList';

export {Tab} from './Tab';
export type {TabProps} from './Tab';

export {TabMenu} from './TabMenu';
export type {TabMenuProps, TabMenuOption} from './TabMenu';

export {useTabListContext} from './TabListContext';
export type {
  TabListSize,
  TabListLayout,
  TabListPattern,
} from './TabListContext';
