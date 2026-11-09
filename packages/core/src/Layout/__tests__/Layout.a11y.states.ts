// Copyright (c) Meta Platforms, Inc. and affiliates.

/** AST-021 state inventory for the Layout regions landmark binding. */

import type {LandmarkStateFacts} from '@astryxdesign/a11y-spec';

export interface LayoutLandmarkA11yState {
  readonly id:
    | 'header-banner'
    | 'content-main'
    | 'footer-contentinfo'
    | 'start-end-navigation-rtl'
    | 'nested-panel-region';
  readonly region:
    'LayoutHeader' | 'LayoutContent' | 'LayoutFooter' | 'LayoutPanel';
  readonly summary: string;
  readonly facts: LandmarkStateFacts;
  readonly storyId: string;
}

export type LayoutLandmarkA11yRow =
  (typeof LAYOUT_LANDMARK_A11Y_STATES)[number];

const story = (id: string) => `a11y-landmark-pattern--${id}`;

export const LAYOUT_LANDMARK_A11Y_STATES = [
  {
    id: 'header-banner',
    region: 'LayoutHeader',
    summary: 'a header region with a caller-supplied banner role and label',
    facts: {role: 'banner', label: 'Product', sameRolePeers: 0},
    storyId: story('header-banner'),
  },
  {
    id: 'content-main',
    region: 'LayoutContent',
    summary: 'a content region with a caller-supplied main role and label',
    facts: {role: 'main', label: 'Project overview', sameRolePeers: 0},
    storyId: story('content-main'),
  },
  {
    id: 'footer-contentinfo',
    region: 'LayoutFooter',
    summary:
      'a footer region with a caller-supplied contentinfo role and label',
    facts: {role: 'contentinfo', label: 'Legal and support', sameRolePeers: 0},
    storyId: story('footer-contentinfo'),
  },
  {
    id: 'start-end-navigation-rtl',
    region: 'LayoutPanel',
    summary:
      'start and end panels that both declare navigation, told apart by label under RTL',
    facts: {role: 'navigation', label: 'Project sections', sameRolePeers: 1},
    storyId: story('start-end-navigation-rtl'),
  },
  {
    id: 'nested-panel-region',
    region: 'LayoutPanel',
    summary:
      'a labelled region panel in a bounded Layout nested inside a main content region',
    facts: {role: 'region', label: 'Filters', sameRolePeers: 0},
    storyId: story('nested-panel-region'),
  },
] as const satisfies ReadonlyArray<LayoutLandmarkA11yState>;

export const LAYOUT_LANDMARK_A11Y_EXCLUSIONS = [
  {
    owner: 'family:layout-regions FR8 and LayoutSlots tests',
    reason:
      'A region with no caller-supplied role exposes no landmark; that no-inference rule is Layout-specific behavior, not a shared landmark outcome, so unlabelled and role-less states are not bound here.',
  },
  {
    owner: 'LayoutSlots API tests',
    reason:
      'Each region’s role and label props reaching its element are public-prop assertions under AST-021 FR5 and stay local.',
  },
  {
    owner: 'The composing page and AppShell',
    reason:
      'One main landmark per page, top-level banner and contentinfo, all content inside landmarks, the skip link, and app-wide navigation are page-shell outcomes an isolated Layout cannot satisfy.',
  },
  {
    owner: 'Layout visual, RTL, and container-padding evidence',
    reason:
      'Slot geometry, divider ownership, inset distribution, scrolling, content width, and mirrored placement require their existing component and rendered checks.',
  },
  {
    owner: 'AST-009',
    reason:
      'This binding claims DOM and browser accessibility-tree exposure, not landmark navigation, speech, braille, or virtual-cursor behavior.',
  },
] as const;
