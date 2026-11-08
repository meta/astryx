// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file eagerShowcases.ts
 *
 * The showcases for the gallery tiles above the fold, imported statically.
 *
 * @input  nothing — hand-authored
 * @output eagerShowcases, keyed by component name
 * @position read by ShowcaseThumbnail; every other tile loads its showcase
 *   lazily through the generated showcaseRegistry
 *
 * A static import is the whole point: these land in the /components page
 * chunk, so Next server-renders them into the prerendered HTML and a visitor
 * sees a real preview at first paint instead of after hydration plus a chunk
 * fetch. A dynamic import — however it is spelled — cannot do that.
 *
 * 12 covers everything in the viewport up to a 2560x1440 display (measured:
 * 6 tiles in view at 1440x900, 9 at 1920x1080, 10 at 2560x1440) and lands on
 * a category boundary — all of Action, plus the first two of Chat. Their
 * sources total ~9 KB of TSX. Adding to the list is cheap but not free:
 * every entry pulls the components it uses into the initial page chunk.
 *
 * These have to be the tiles the gallery renders FIRST, which follows from
 * the category order in src/app/(docs)/components/page.tsx. Reorder that and
 * this list has to move with it — the `galleryEagerShowcases` tests fail
 * when the two disagree, and name the list they expect.
 */

import type {ComponentType} from 'react';

import ButtonShowcase from '../generated/showcases/ButtonShowcase';
import ButtonGroupShowcase from '../generated/showcases/ButtonGroupShowcase';
import DropdownMenuShowcase from '../generated/showcases/DropdownMenuShowcase';
import IconButtonShowcase from '../generated/showcases/IconButtonShowcase';
import LinkShowcase from '../generated/showcases/LinkShowcase';
import MoreMenuShowcase from '../generated/showcases/MoreMenuShowcase';
import SegmentedControlShowcase from '../generated/showcases/SegmentedControlShowcase';
import ToggleButtonShowcase from '../generated/showcases/ToggleButtonShowcase';
import ToggleButtonGroupShowcase from '../generated/showcases/ToggleButtonGroupShowcase';
import ToolbarThreeSlot from '../generated/showcases/ToolbarThreeSlot';
import ChatComposerShowcase from '../generated/showcases/ChatComposerShowcase';
import ChatLayoutShowcase from '../generated/showcases/ChatLayoutShowcase';

export const eagerShowcases: Record<string, ComponentType> = {
  Button: ButtonShowcase,
  ButtonGroup: ButtonGroupShowcase,
  DropdownMenu: DropdownMenuShowcase,
  IconButton: IconButtonShowcase,
  Link: LinkShowcase,
  MoreMenu: MoreMenuShowcase,
  SegmentedControl: SegmentedControlShowcase,
  ToggleButton: ToggleButtonShowcase,
  ToggleButtonGroup: ToggleButtonGroupShowcase,
  Toolbar: ToolbarThreeSlot,
  ChatComposer: ChatComposerShowcase,
  ChatLayout: ChatLayoutShowcase,
};
