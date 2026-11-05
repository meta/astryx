// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tabs.a11y.states.ts
 * @input Uses TabsStateFacts from @astryxdesign/a11y-spec
 * @output The AST-021 binding inventory for explicit TabList Tabs parts and states
 * @position Data-only inventory shared by jsdom, Storybook, and Chromium bindings.
 */

import type {TabsStateFacts} from '@astryxdesign/a11y-spec';

export type TabsBinding = 'TabList' | 'Tab' | 'TabsComposition';

export interface TabsRelation {
  readonly selector: string;
}

export interface TabsBindingState {
  readonly id: string;
  readonly binding: TabsBinding;
  readonly summary: string;
  readonly facts: TabsStateFacts;
  readonly subject:
    | {readonly role: 'tablist' | 'tab'; readonly name: string}
    | {readonly selector: string};
  readonly relations?: Readonly<Record<string, TabsRelation>>;
  readonly storyId: string;
}

export type TabsBindingRow = (typeof TABS_BINDING_STATES)[number];
export type TabsStateId = (typeof TABS_BINDING_STATES)[number]['id'];

const RELATIONS = {
  first: {selector: '[role="tab"][data-tab-value="overview"]'},
  second: {selector: '[role="tab"][data-tab-value="activity"]'},
  third: {selector: '[role="tab"][data-tab-value="members"]'},
  panel: {selector: '#tabs-a11y-panel-activity[role="tabpanel"]'},
  tab: {selector: '#tabs-a11y-tab-overview[role="tab"]'},
  'panel-first': {selector: '#tabs-a11y-panel-overview[role="tabpanel"]'},
  'panel-second': {selector: '#tabs-a11y-panel-activity[role="tabpanel"]'},
  'panel-third': {selector: '#tabs-a11y-panel-members[role="tabpanel"]'},
} as const;

function tablistFacts(overrides: Partial<TabsStateFacts> = {}): TabsStateFacts {
  return {
    part: 'tablist',
    selected: null,
    active: null,
    disabled: null,
    focusable: null,
    visibleLabel: true,
    controlsPanel: false,
    controlledPanel: null,
    labelledByTab: false,
    labellingTab: null,
    tabRelations: ['first', 'second', 'third'],
    panelRelations: ['panel-first', 'panel-second', 'panel-third'],
    disabledTabs: [],
    selectedTab: 'first',
    direction: 'ltr',
    manualActivation: true,
    tabReachable: true,
    pointerSelection: true,
    pointerCancellation: false,
    ...overrides,
  };
}

function tabFacts(overrides: Partial<TabsStateFacts> = {}): TabsStateFacts {
  return tablistFacts({
    part: 'tab',
    selected: true,
    disabled: false,
    focusable: true,
    controlsPanel: true,
    controlledPanel: 'panel',
    tabRelations: [],
    panelRelations: [],
    selectedTab: null,
    pointerSelection: false,
    pointerCancellation: true,
    ...overrides,
  });
}

function panelFacts(overrides: Partial<TabsStateFacts> = {}): TabsStateFacts {
  return tablistFacts({
    part: 'tabpanel',
    selected: null,
    active: true,
    disabled: null,
    focusable: null,
    controlsPanel: false,
    controlledPanel: null,
    labelledByTab: true,
    labellingTab: 'tab',
    tabRelations: [],
    panelRelations: [],
    selectedTab: null,
    tabReachable: false,
    pointerSelection: false,
    pointerCancellation: false,
    ...overrides,
  });
}

const story = (id: string) => `a11y-tabs-pattern--${id}`;

export const TABS_BINDING_STATES = [
  {
    id: 'tab-list-selected-ltr',
    binding: 'TabList',
    summary: 'an explicit horizontal LTR tablist with manual activation',
    facts: tablistFacts(),
    subject: {role: 'tablist', name: 'Project views'},
    relations: RELATIONS,
    storyId: story('tab-list-selected-ltr'),
  },
  {
    id: 'tab-list-selected-rtl',
    binding: 'TabList',
    summary: 'an explicit horizontal RTL tablist with logical arrow movement',
    facts: tablistFacts({direction: 'rtl'}),
    subject: {role: 'tablist', name: 'Project views'},
    relations: RELATIONS,
    storyId: story('tab-list-selected-rtl'),
  },
  {
    id: 'tab-list-disabled-skip',
    binding: 'TabList',
    summary: 'a tablist whose unavailable middle tab is skipped by arrows',
    facts: tablistFacts({disabledTabs: ['second']}),
    subject: {role: 'tablist', name: 'Project views'},
    relations: RELATIONS,
    storyId: story('tab-list-disabled-skip'),
  },
  {
    id: 'tab-selected-visible-label',
    binding: 'Tab',
    summary: 'the selected available tab with a visible label',
    facts: tabFacts(),
    subject: {role: 'tab', name: 'Overview'},
    relations: {
      panel: {selector: '#tabs-a11y-panel-overview[role="tabpanel"]'},
    },
    storyId: story('tab-selected-visible-label'),
  },
  {
    id: 'tab-unselected-visible-label',
    binding: 'Tab',
    summary: 'an available unselected tab with a visible label',
    facts: tabFacts({selected: false, tabReachable: false}),
    subject: {role: 'tab', name: 'Activity'},
    relations: {panel: RELATIONS.panel},
    storyId: story('tab-unselected-visible-label'),
  },
  {
    id: 'tab-disabled-unselected',
    binding: 'Tab',
    summary: 'an unavailable unselected tab outside the roving order',
    facts: tabFacts({
      selected: false,
      disabled: true,
      tabReachable: false,
      pointerCancellation: false,
    }),
    subject: {role: 'tab', name: 'Activity'},
    relations: {panel: RELATIONS.panel},
    storyId: story('tab-disabled-unselected'),
  },
  {
    id: 'tab-selected-hidden-label',
    binding: 'Tab',
    summary: 'a selected icon-only tab named programmatically',
    facts: tabFacts({visibleLabel: false}),
    subject: {role: 'tab', name: 'Overview'},
    relations: {
      panel: {selector: '#tabs-a11y-panel-overview[role="tabpanel"]'},
    },
    storyId: story('tab-selected-hidden-label'),
  },
  {
    id: 'tabpanel-active',
    binding: 'TabsComposition',
    summary: 'the visible panel labelled by the selected tab',
    facts: panelFacts(),
    subject: {selector: '#tabs-a11y-panel-overview[role="tabpanel"]'},
    relations: {tab: RELATIONS.tab},
    storyId: story('tabpanel-active'),
  },
  {
    id: 'tabpanel-inactive',
    binding: 'TabsComposition',
    summary: 'an inactive hidden panel labelled by its tab',
    facts: panelFacts({active: false}),
    subject: {selector: '#tabs-a11y-panel-activity[role="tabpanel"]'},
    relations: {
      tab: {selector: '#tabs-a11y-tab-activity[role="tab"]'},
    },
    storyId: story('tabpanel-inactive'),
  },
] as const satisfies ReadonlyArray<TabsBindingState>;

export const TABS_EXCLUSIONS = [
  {
    owner: 'TabList and Tab without role="tablist"',
    classification: 'out-of-scope',
    reason:
      'The default navigation pattern remains a nav landmark with aria-current and belongs to navigation semantics, not the ARIA Tabs contract.',
  },
  {
    owner: 'TabMenu trigger, popup, and options',
    classification: 'out-of-scope',
    reason:
      'TabMenu is a menu-button, menu, and radio-menu composition and is invalid as a child of an explicit tablist.',
  },
  {
    owner: 'The table-filter page template’s narrow-view Tabs composition',
    classification: 'out-of-scope',
    reason:
      'The public template currently points every tab at one shared panel and labels that panel independently. Its page-owned composition mismatch is recorded separately rather than changing a template inside this pattern-migration pull request.',
  },
  {
    owner: 'Home and End shortcuts',
    classification: 'preserved',
    reason:
      'The component keeps its local coverage; these APG-optional shortcuts are not promoted into the shared contract.',
  },
  {
    owner: 'Vertical Tabs and automatic activation',
    classification: 'needs-human',
    reason:
      'Neither mode is currently exposed by TabList, and adopting either changes public behavior and interaction policy.',
  },
  {
    owner: 'A public TabPanel primitive or generated relationship ids',
    classification: 'needs-human',
    reason:
      'The current API leaves panel elements and ids with the caller; introducing a primitive or ownership change is public API design.',
  },
  {
    owner: 'No-selection, multi-selection, or selected-disabled policy',
    classification: 'needs-human',
    reason:
      'The current controlled API can be given invalid values, but no current record defines the supported recovery policy.',
  },
] as const;
