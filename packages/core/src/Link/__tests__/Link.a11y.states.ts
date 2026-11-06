// Copyright (c) Meta Platforms, Inc. and affiliates.

/** AST-021 state inventory for the Link binding of the shared Link contract. */

import type {LinkStateFacts} from '@astryxdesign/a11y-spec';

export interface LinkA11yState {
  readonly id:
    | 'text-native'
    | 'icon-labelled'
    | 'current-page'
    | 'external-new-tab'
    | 'provider-router'
    | 'as-router';
  readonly summary: string;
  readonly facts: LinkStateFacts;
  readonly storyId: string;
}

export type LinkA11yRow = (typeof LINK_A11Y_STATES)[number];

const story = (id: string) => `a11y-link-pattern--${id}`;

/**
 * Every destination is a same-document fragment, so following a link keeps the
 * story mounted. The router component records its own navigations; the browser
 * records native ones.
 */
export const LINK_A11Y_DESTINATION = '#link-destination';

export const LINK_A11Y_STATES = [
  {
    id: 'text-native',
    summary: 'a native anchor named by its visible text',
    facts: {name: 'Documentation', current: null},
    storyId: story('text-native'),
  },
  {
    id: 'icon-labelled',
    summary: 'an icon-only link named by its label prop',
    facts: {name: 'Close dialog', current: null},
    storyId: story('icon-labelled'),
  },
  {
    id: 'current-page',
    summary: 'a link the caller marks as the current page',
    facts: {name: 'Overview', current: 'page'},
    storyId: story('current-page'),
  },
  {
    id: 'external-new-tab',
    summary:
      'an external link whose name carries the new-tab notice and which opens a new tab',
    facts: {name: 'GitHub (opens in new tab)', current: null},
    storyId: story('external-new-tab'),
  },
  {
    id: 'provider-router',
    summary:
      'a link rendered by a router component supplied through LinkProvider',
    facts: {name: 'Projects', current: null},
    storyId: story('provider-router'),
  },
  {
    id: 'as-router',
    summary: 'a link rendered by a router component supplied through `as`',
    facts: {name: 'Settings', current: null},
    storyId: story('as-router'),
  },
] as const satisfies ReadonlyArray<LinkA11yState>;

export const LINK_A11Y_EXCLUSIONS = [
  {
    owner: 'Link component tests and family:navigation-destinations FR7',
    reason:
      'A disabled Link renders a focusable, href-less anchor with an explicit link role and aria-disabled, so it cannot navigate. That disabled semantics is member-owned, so disabled states are not bound to this available-link contract.',
  },
  {
    owner: 'Link component tests (button rendering)',
    reason:
      'A Link without href renders a button for an action; the button contract, not this one, owns that role.',
  },
  {
    owner: 'family:navigation-destinations and its verification map',
    reason:
      'Which destinations are accepted or blocked, and how rejected destinations render, is navigation safety rather than an accessibility outcome.',
  },
  {
    owner:
      'BreadcrumbItem, SideNavItem, TopNavItem, Citation, and ClickableCard',
    reason:
      'Links inside navigation aggregates and enlarged surfaces bind separately; this first binding covers the Link component and both custom-router seams.',
  },
  {
    owner: 'Link visual and Tooltip evidence',
    reason:
      'Underline, hover color, focus ring paint, truncation, and tooltip presentation require rendered and component checks.',
  },
  {
    owner: 'AST-009',
    reason:
      'This binding claims DOM, accessibility-tree, and real-browser behavior, not spoken wording, virtual-cursor, or assistive-technology activation.',
  },
] as const;
