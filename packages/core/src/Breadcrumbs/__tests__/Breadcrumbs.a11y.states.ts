// Copyright (c) Meta Platforms, Inc. and affiliates.

/** AST-021 state inventory for the Breadcrumbs semantic binding. */

import type {BreadcrumbStateFacts} from '@astryxdesign/a11y-spec';

export interface BreadcrumbA11yState {
  readonly id:
    | 'explicit-current-default'
    | 'auto-current-custom-label-rtl'
    | 'no-current-opt-out';
  readonly summary: string;
  readonly facts: BreadcrumbStateFacts;
  readonly storyId: string;
}

export type BreadcrumbA11yRow = (typeof BREADCRUMB_A11Y_STATES)[number];

const story = (id: string) => `a11y-breadcrumb-pattern--${id}`;

export const BREADCRUMB_A11Y_STATES = [
  {
    id: 'explicit-current-default',
    summary: 'the default landmark with an explicitly current final page',
    facts: {
      landmarkLabel: 'Breadcrumb',
      currentPage: true,
      separatorCount: 3,
    },
    storyId: story('explicit-current-default'),
  },
  {
    id: 'auto-current-custom-label-rtl',
    summary:
      'a custom-named supporting trail whose final destination is auto-current under RTL',
    facts: {
      landmarkLabel: 'Project location',
      currentPage: true,
      separatorCount: 3,
    },
    storyId: story('auto-current-custom-label-rtl'),
  },
  {
    id: 'no-current-opt-out',
    summary: 'a trail whose items explicitly opt out of current-page state',
    facts: {
      landmarkLabel: 'Breadcrumb',
      currentPage: false,
      separatorCount: 2,
    },
    storyId: story('no-current-opt-out'),
  },
] as const satisfies ReadonlyArray<BreadcrumbA11yState>;

export const BREADCRUMB_A11Y_EXCLUSIONS = [
  {
    owner: 'Link pattern and BreadcrumbItem destination tests',
    reason:
      'Destination role, purpose, navigation, custom-router handoff, keyboard access, and pointer behavior remain with the link owner.',
  },
  {
    owner: 'Button and Menu Button patterns',
    reason:
      'Action-only and sibling-menu BreadcrumbItem branches are separate role-bearing parts with their own state and interaction contracts.',
  },
  {
    owner: 'BreadcrumbItem API tests',
    reason:
      'Explicit true, explicit false, omitted auto-current selection, conflicting prop precedence, callbacks, and rendered branch choices remain component-specific.',
  },
  {
    owner: 'Breadcrumbs visual, RTL, and theme evidence',
    reason:
      'Variant typography, separator glyph choice and mirroring, current-page emphasis, focus paint, contrast, and target geometry require their existing component and rendered checks.',
  },
  {
    owner: 'AST-009',
    reason:
      'This binding claims DOM and browser accessibility-tree exposure, not speech, braille, announcement timing, or virtual-cursor behavior.',
  },
] as const;
