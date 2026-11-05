// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from the forked TabList component files
 * @output Exports TabList, Tab, TabMenu and their types
 * @position Motion Lab fork of core's TabList, carrying ONE proposed change.
 *   Entry point for the lab's "after" pane.
 *
 * ===========================================================================
 * WHAT THIS IS
 * ===========================================================================
 *
 * `astryx swizzle TabList` against core, plus a single behavioural change, so
 * the Motion Lab can mount the SAME component twice — core's, and
 * core's-plus-the-proposal — and the visible difference between the two panes
 * IS the diff. The previous "after" pane was hand-built HTML, which could
 * demonstrate a motion but could not demonstrate that the motion was
 * achievable in the component, at what cost, or without breaking anything
 * else. This can.
 *
 * THE PROPOSAL. In core each `Tab` renders its own absolutely-positioned
 * indicator and they transition `opacity, background-color`, so selection
 * cross-fades: nothing travels, and the eye has to re-find the selection.
 * Here the strip owns ONE indicator, positioned over the selected tab and
 * moved with `transform` — it travels, and the eye follows it. Each Tab
 * suppresses the indicator it draws for itself (kept in the tree, hidden) so
 * the two do not stack.
 *
 * Opt-in via `hasTravellingIndicator` on TabList (default false). With the
 * flag off this fork renders exactly what core renders, which is what makes
 * the comparison a diff and not two different components.
 *
 * Every proposed line in these files is marked `PROPOSED`. Search for it to
 * read the change on its own:
 *   - TabListContext.ts — `hasTravellingIndicator` on `TabListContextValue`
 *   - Tab.tsx           — `indicatorSuppressed`, applied from the context flag
 *   - TabList.tsx       — the prop, the styles, and the measuring effect
 *
 * ===========================================================================
 * SWIZZLE BUG — report upstream
 * ===========================================================================
 *
 * The swizzler rewrites core's relative imports to package specifiers, but it
 * does that for internals the package does not export, so a freshly swizzled
 * TabList does not typecheck. Two here, both repointed at package source with
 * a relative path (see the `SWIZZLE BUG` comments at each import):
 *
 *   - `isRtlElement`        rewritten to '@astryxdesign/core/hooks'
 *                           real file: packages/core/src/hooks/isRtlElement.ts
 *                           used by TabList.tsx (RTL scroll direction)
 *   - `MENU_ITEM_SELECTOR`  rewritten to '@astryxdesign/core/DropdownMenu'
 *                           real file: packages/core/src/DropdownMenu/menuItemRoles.ts
 *                           used by TabMenu.tsx (roving focus in the overflow menu)
 *
 * Either the swizzler should not rewrite an import the package cannot serve,
 * or these two should join the public surface. Every other named import from
 * those same modules resolves fine, so the fix is per-symbol, not per-module.
 */

// The lab mounts both: TabList carries the proposal's prop, Tab is what
// suppresses its own indicator when the strip takes over.
export {TabList} from './TabList';
export type {TabListProps, TabListOverflow} from './TabList';

export {Tab} from './Tab';
export type {TabProps} from './Tab';

export {TabMenu} from './TabMenu';
export type {TabMenuProps, TabMenuOption} from './TabMenu';

export {useTabListContext} from './TabListContext';
export type {
  TabListContextValue,
  TabListSize,
  TabListLayout,
  TabListPattern,
} from './TabListContext';
