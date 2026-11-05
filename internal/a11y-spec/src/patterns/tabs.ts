// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabs.ts
 * @input Uses the accessibility contract vocabulary
 * @output TABS_PATTERN and TabsStateFacts, including direction-neutral outward-boundary wrap proof
 * @position Reusable accessibility contract for explicit horizontal ARIA Tabs compositions.
 *
 * This contract covers only a caller-selected `role="tablist"` composition.
 * Navigation-mode TabList, TabMenu, vertical tabs, automatic activation, and
 * invalid-value policy are separate owners or unresolved decisions.
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
  type WebStandardRequirement,
} from '../contract';
import type {Key} from '../harness';
import {saysInOrder, spokenWords} from '../spoken';

const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';
const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/';

function wcag(
  id: string,
  name: string,
  level: 'A' | 'AA',
  slug: string,
): WcagCriterion {
  return {
    standard: 'wcag',
    id,
    name,
    level,
    url: `${UNDERSTANDING}/${slug}.html`,
  };
}

const WCAG_1_3_1 = wcag(
  '1.3.1',
  'Info and Relationships',
  'A',
  'info-and-relationships',
);
const WCAG_2_1_1 = wcag('2.1.1', 'Keyboard', 'A', 'keyboard');
const WCAG_2_1_2 = wcag('2.1.2', 'No Keyboard Trap', 'A', 'no-keyboard-trap');
const WCAG_2_4_3 = wcag('2.4.3', 'Focus Order', 'A', 'focus-order');
const WCAG_2_5_2 = wcag(
  '2.5.2',
  'Pointer Cancellation',
  'A',
  'pointer-cancellation',
);
const WCAG_2_5_3 = wcag('2.5.3', 'Label in Name', 'A', 'label-in-name');
const WCAG_2_4_6 = wcag(
  '2.4.6',
  'Headings and Labels',
  'AA',
  'headings-and-labels',
);
const WCAG_4_1_2 = wcag('4.1.2', 'Name, Role, Value', 'A', 'name-role-value');

function apg(requirement: string, fragment: string): ApgRequirement {
  return {
    standard: 'apg',
    pattern: 'tabs',
    requirement,
    url: `${APG_URL}${fragment}`,
  };
}

const APG_TABLIST_ROLE = apg(
  'An element with role tablist serves as the container for the set of tabs.',
  '#wai-ariaroles,states,andproperties',
);
const APG_TAB_ROLE = apg(
  'Each element that serves as a tab has role tab and is contained in the element with role tablist.',
  '#wai-ariaroles,states,andproperties',
);
const APG_TABPANEL_ROLE = apg(
  'Each element that contains the content panel for a tab has role tabpanel.',
  '#wai-ariaroles,states,andproperties',
);
const APG_SELECTED = apg(
  'The active tab element has aria-selected set to true and all other tab elements have it set to false.',
  '#wai-ariaroles,states,andproperties',
);
const APG_CONTROLS = apg(
  'Each tab element has aria-controls referring to its associated tabpanel element.',
  '#wai-ariaroles,states,andproperties',
);
const APG_LABELLEDBY = apg(
  'Each tabpanel has aria-labelledby referring to its associated tab element.',
  '#wai-ariaroles,states,andproperties',
);
const APG_TAB_ENTRY = apg(
  'When focus moves into the tab list, places focus on the active tab element.',
  '#keyboardinteraction',
);
const APG_ARROWS = apg(
  'Left Arrow moves focus to the previous tab and Right Arrow moves focus to the next tab, with wrapping at the ends.',
  '#keyboardinteraction',
);
const APG_MANUAL_ACTIVATION = apg(
  'For a tab list with manual activation, Space or Enter activates the focused tab.',
  '#keyboardinteraction',
);
const APG_PANEL_VISIBILITY = apg(
  'When a tabbed interface is initialized, one tab panel is displayed and its associated tab is styled to indicate that it is active.',
  '',
);
const ARIA_DISABLED: WebStandardRequirement = {
  standard: 'web-standard',
  specification: 'WAI-ARIA 1.2',
  requirement:
    'The aria-disabled state indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.',
  url: 'https://www.w3.org/TR/wai-aria-1.2/#aria-disabled',
};

export interface TabsStateFacts {
  readonly part: 'tablist' | 'tab' | 'tabpanel';
  readonly selected: boolean | null;
  readonly active: boolean | null;
  readonly disabled: boolean | null;
  readonly focusable: boolean | null;
  readonly visibleLabel: boolean;
  readonly controlsPanel: boolean;
  readonly controlledPanel: string | null;
  readonly labelledByTab: boolean;
  readonly labellingTab: string | null;
  readonly tabRelations: readonly string[];
  readonly panelRelations: readonly string[];
  readonly disabledTabs: readonly string[];
  readonly selectedTab: string | null;
  readonly direction: 'ltr' | 'rtl';
  readonly manualActivation: boolean;
  readonly tabReachable: boolean;
  readonly pointerSelection: boolean;
  readonly pointerCancellation: boolean;
}

function arrowKeys(
  direction: TabsStateFacts['direction'],
): readonly [Key, Key] {
  return direction === 'rtl'
    ? ['ArrowLeft', 'ArrowRight']
    : ['ArrowRight', 'ArrowLeft'];
}

async function selectedRelations(
  harness: Parameters<
    PatternContract<TabsStateFacts>['expectations'][number]['run']
  >[0]['harness'],
  relations: readonly string[],
): Promise<string[]> {
  const selected: string[] = [];
  for (const relation of relations) {
    if (
      (await (await harness.related(relation)).computed()).selected === true
    ) {
      selected.push(relation);
    }
  }
  return selected;
}

async function assertSelection(
  harness: Parameters<
    PatternContract<TabsStateFacts>['expectations'][number]['run']
  >[0]['harness'],
  facts: TabsStateFacts,
  expected: string,
): Promise<void> {
  const selected = await selectedRelations(harness, facts.tabRelations);
  if (selected.length !== 1 || selected[0] !== expected) {
    throw new Error(
      `expected exactly "${expected}" selected, but the browser exposes ${selected.length === 0 ? 'no selected tab' : selected.map(name => `"${name}"`).join(', ')}`,
    );
  }
  for (let index = 0; index < facts.panelRelations.length; index += 1) {
    const panelName = facts.panelRelations[index];
    const tabName = facts.tabRelations[index];
    if (panelName == null || tabName == null) {
      throw new Error(
        'the binding supplies mismatched tab and panel relations',
      );
    }
    const panel = await harness.related(panelName);
    const visible = await panel.isVisible();
    if (visible !== (tabName === expected)) {
      throw new Error(
        `the "${panelName}" panel is ${visible ? 'visible' : 'hidden'} while "${tabName}" is ${tabName === expected ? 'selected' : 'unselected'}`,
      );
    }
  }
}

async function assertArrowRoundTrip(
  harness: Parameters<
    PatternContract<TabsStateFacts>['expectations'][number]['run']
  >[0]['harness'],
  facts: TabsStateFacts,
  skipUnavailable: boolean,
): Promise<void> {
  const originalName = facts.selectedTab;
  if (originalName == null) {
    throw new Error('arrow expectation ran without an active tab');
  }
  const originalIndex = facts.tabRelations.indexOf(originalName);
  let nextName: string | undefined;
  for (let offset = 1; offset <= facts.tabRelations.length; offset += 1) {
    const candidate =
      facts.tabRelations[(originalIndex + offset) % facts.tabRelations.length];
    if (
      candidate != null &&
      (!skipUnavailable || !facts.disabledTabs.includes(candidate))
    ) {
      nextName = candidate;
      break;
    }
  }
  if (nextName == null) {
    throw new Error('arrow expectation found no available alternate tab');
  }
  const [forward, backward] = arrowKeys(facts.direction);
  const original = await harness.related(originalName);
  const next = await harness.related(nextName);
  await original.focus();
  await harness.press(forward);
  if (!(await next.isFocused())) {
    throw new Error(
      `pressing ${forward} from "${originalName}" did not focus the next available tab "${nextName}"`,
    );
  }
  await harness.press(backward);
  if (!(await original.isFocused())) {
    throw new Error(
      `pressing ${forward} moved to "${nextName}", but pressing ${backward} did not restore focus to "${originalName}"`,
    );
  }
}

async function assertEndWrap(
  harness: Parameters<
    PatternContract<TabsStateFacts>['expectations'][number]['run']
  >[0]['harness'],
  facts: TabsStateFacts,
): Promise<void> {
  const firstName = facts.tabRelations[0];
  const lastName = facts.tabRelations.at(-1);
  if (firstName == null || lastName == null || firstName === lastName) {
    throw new Error('wrap expectation needs distinct first and last tabs');
  }
  const first = await harness.related(firstName);
  const last = await harness.related(lastName);
  if (facts.tabRelations.length === 2) {
    for (const key of ['ArrowLeft', 'ArrowRight'] as const) {
      await first.focus();
      await harness.press(key);
      if (!(await last.isFocused())) {
        throw new Error(
          `pressing ${key} outward from "${firstName}" did not wrap focus to "${lastName}"`,
        );
      }
      await harness.press(key);
      if (!(await first.isFocused())) {
        throw new Error(
          `pressing ${key} outward from "${lastName}" did not wrap focus to "${firstName}"`,
        );
      }
    }
    return;
  }
  const attempts: ReadonlyArray<readonly [Key, Key]> = [
    ['ArrowLeft', 'ArrowRight'],
    ['ArrowRight', 'ArrowLeft'],
  ];
  for (const [outbound, inbound] of attempts) {
    await first.focus();
    await harness.press(outbound);
    if (!(await last.isFocused())) {
      continue;
    }
    await harness.press(inbound);
    if (!(await first.isFocused())) {
      throw new Error(
        `pressing ${outbound} wrapped to "${lastName}", but pressing ${inbound} did not restore focus to "${firstName}"`,
      );
    }
    return;
  }
  throw new Error(
    `neither ArrowLeft nor ArrowRight wrapped focus from the first tab "${firstName}" to the last tab "${lastName}"`,
  );
}

async function assertSelectionKeyRoundTrip(
  harness: Parameters<
    PatternContract<TabsStateFacts>['expectations'][number]['run']
  >[0]['harness'],
  facts: TabsStateFacts,
  key: 'Enter' | 'Space',
): Promise<void> {
  const originalName = facts.selectedTab;
  if (originalName == null) {
    throw new Error(`${key} expectation ran without an active tab`);
  }
  const alternateName = facts.tabRelations.find(
    name => name !== originalName && !facts.disabledTabs.includes(name),
  );
  if (alternateName == null) {
    throw new Error(`${key} expectation found no available alternate tab`);
  }
  await (await harness.related(alternateName)).focus();
  await harness.press(key);
  await assertSelection(harness, facts, alternateName);
  await (await harness.related(originalName)).focus();
  await harness.press(key);
  await assertSelection(harness, facts, originalName);
}

export const TABS_PATTERN: PatternContract<TabsStateFacts> =
  definePattern<TabsStateFacts>({
    pattern: 'tabs',
    url: APG_URL,
    scope:
      'An explicit horizontal tablist, its tabs, and caller-authored tabpanels expose their roles, selected state, relationships, and manual keyboard interaction.',
    expectations: [
      {
        id: 'tabs.tablist.role-exposed',
        outcome:
          'The browser exposes the tablist role, so the tabs are presented as one related widget.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_TABLIST_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates the tablist container',
          test: facts => facts.part === 'tablist',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'tablist') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this tablist'
                : `the browser reports this container as "${role}", not as a tablist`,
            );
          }
        },
      },
      {
        id: 'tabs.tablist.name-exposed',
        outcome:
          'The tablist has an accessible name, so the user knows what set of views it controls.',
        sources: [WCAG_2_4_6, WCAG_4_1_2],
        covers: ['2.4.6-headings-and-labels', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates the tablist container',
          test: facts => facts.part === 'tablist',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this tablist',
            );
          }
        },
      },
      {
        id: 'tabs.tab.role-exposed',
        outcome:
          'The browser exposes each tab as a tab, so the user knows it selects a panel rather than navigating away.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_TAB_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one tab',
          test: facts => facts.part === 'tab',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'tab') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this tab'
                : `the browser reports this item as "${role}", not as a tab`,
            );
          }
        },
      },
      {
        id: 'tabs.tab.name-exposed',
        outcome:
          'Each tab has an accessible name, so the user can identify the panel before selecting it.',
        sources: [WCAG_2_4_6, WCAG_4_1_2],
        covers: ['2.4.6-headings-and-labels', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one tab',
          test: facts => facts.part === 'tab',
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this tab',
            );
          }
        },
      },
      {
        id: 'tabs.tab.name-matches-visible-label',
        outcome:
          'The accessible name contains the visible label, so a speech-input user can say the tab they can read.',
        sources: [WCAG_2_5_3],
        covers: ['2.5.3-label-in-name'],
        appliesWhen: {
          condition: 'the binding designates one tab',
          test: facts => facts.part === 'tab',
        },
        evidenceLayer: 'accessibility-tree',
        alsoNeeds: ['real-browser'],
        enforcement: 'required',
        run: async ({subject, notApplicable}) => {
          const visible = await subject.visibleLabelText();
          if (visible == null) {
            return notApplicable(
              'this tab renders no label a person can read, so there are no visible words for speech input',
            );
          }
          const {name} = await subject.computed();
          if (!saysInOrder(spokenWords(name), spokenWords(visible))) {
            throw new Error(
              `the visible label reads "${visible}" but the browser computes the accessible name as "${name}"`,
            );
          }
        },
      },
      {
        id: 'tabs.tab.selected-state-exposed',
        outcome:
          'The browser exposes whether the tab is selected, and that state matches the binding.',
        sources: [WCAG_4_1_2, APG_SELECTED],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates one tab with a selected state',
          test: facts => facts.part === 'tab' && facts.selected != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const selected = (await subject.computed()).selected;
          if (selected !== facts.selected) {
            throw new Error(
              selected == null
                ? 'the browser exposes no selected state for this tab'
                : `the binding declares this tab ${facts.selected ? 'selected' : 'unselected'}, but the browser reports it ${selected ? 'selected' : 'unselected'}`,
            );
          }
        },
      },
      {
        id: 'tabs.tab.availability-exposed',
        outcome:
          'The browser exposes whether a tab is available, without presenting an unavailable tab as actionable.',
        sources: [WCAG_4_1_2],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates one tab with an availability state',
          test: facts => facts.part === 'tab' && facts.disabled != null,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const disabled = (await subject.computed()).disabled;
          if (disabled !== facts.disabled) {
            throw new Error(
              `the binding declares this tab ${facts.disabled ? 'unavailable' : 'available'}, but the browser reports it ${disabled ? 'unavailable' : 'available'}`,
            );
          }
        },
      },
      {
        id: 'tabs.tab.unavailable-pointer-inert',
        outcome:
          'A tab reported as unavailable does not select its panel when clicked.',
        sources: [WCAG_4_1_2, ARIA_DISABLED],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a tab exposed as unavailable',
          test: facts =>
            facts.part === 'tab' &&
            facts.disabled === true &&
            facts.focusable === true,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).selected;
          await harness.click(subject, {ignoreAvailability: true});
          const after = (await subject.computed()).selected;
          if (after !== before) {
            throw new Error(
              'the tab is reported unavailable, but clicking it selected it',
            );
          }
        },
      },
      {
        id: 'tabs.tab.unavailable-enter-inert',
        outcome:
          'A focusable tab reported as unavailable does not select its panel from Enter.',
        sources: [WCAG_4_1_2, ARIA_DISABLED],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a focusable tab exposed as unavailable',
          test: facts =>
            facts.part === 'tab' &&
            facts.disabled === true &&
            facts.focusable === true,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).selected;
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the binding declares this unavailable tab focusable, but the browser could not focus it',
            );
          }
          await harness.press('Enter');
          if ((await subject.computed()).selected !== before) {
            throw new Error(
              'the tab is reported unavailable, but Enter selected it',
            );
          }
        },
      },
      {
        id: 'tabs.tab.unavailable-space-inert',
        outcome:
          'A focusable tab reported as unavailable does not select its panel from Space.',
        sources: [WCAG_4_1_2, ARIA_DISABLED],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a focusable tab exposed as unavailable',
          test: facts =>
            facts.part === 'tab' &&
            facts.disabled === true &&
            facts.focusable === true,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).selected;
          await subject.focus();
          if (!(await subject.isFocused())) {
            throw new Error(
              'the binding declares this unavailable tab focusable, but the browser could not focus it',
            );
          }
          await harness.press('Space');
          if ((await subject.computed()).selected !== before) {
            throw new Error(
              'the tab is reported unavailable, but Space selected it',
            );
          }
        },
      },
      {
        id: 'tabs.relationship.controls-resolves',
        outcome:
          'A tab that declares a controlled panel points to an element that exists, so the relationship is not silently broken.',
        sources: [WCAG_1_3_1, APG_CONTROLS],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding designates a tab with a controlled panel',
          test: facts => facts.part === 'tab' && facts.controlsPanel,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const attribute = await subject.attribute('aria-controls');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'this tab declares a controlled panel, but it has no aria-controls relationship',
            );
          }
          const targets = await subject.idReferences('aria-controls');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-controls points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing`,
            );
          }
          if (facts.controlledPanel == null) {
            throw new Error(
              'the binding declares a controlled panel but names no panel relation',
            );
          }
          const expectedPanel = await harness.related(facts.controlledPanel);
          const expectedId = await expectedPanel.attribute('id');
          if (expectedId == null) {
            throw new Error(
              'the binding’s associated panel has no id for aria-controls',
            );
          }
          if (
            !(await harness.references(subject, 'aria-controls', expectedPanel))
          ) {
            throw new Error(
              ids.includes(expectedId)
                ? `aria-controls resolves to a different element than the binding’s associated panel "${expectedId}"`
                : `aria-controls identifies ${ids.map(id => `"${id}"`).join(', ')} instead of the binding’s associated panel "${expectedId}"`,
            );
          }
        },
      },
      {
        id: 'tabs.tablist.contains-tabs',
        outcome:
          'Every tab in the binding belongs to the tablist, so the widget does not expose an orphan tab as part of the set.',
        sources: [WCAG_1_3_1, APG_TAB_ROLE],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding designates a tablist and all of its tabs',
          test: facts =>
            facts.part === 'tablist' && facts.tabRelations.length > 0,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          for (const relation of facts.tabRelations) {
            if (
              !(await harness.containsSemantically(
                subject,
                await harness.related(relation),
              ))
            ) {
              throw new Error(
                `the binding’s "${relation}" tab is not contained by the tablist`,
              );
            }
          }
        },
      },
      {
        id: 'tabs.tabpanel.role-exposed',
        outcome:
          'The browser exposes panel content as a tabpanel, so its relationship to the selected tab is available programmatically.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_TABPANEL_ROLE],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a tabpanel',
          test: facts => facts.part === 'tabpanel' && facts.active !== false,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'tabpanel') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this tabpanel'
                : `the browser reports this panel as "${role}", not as a tabpanel`,
            );
          }
        },
      },
      {
        id: 'tabs.relationship.panel-labelledby-resolves',
        outcome:
          'A tabpanel points back to the tab that labels it, so the panel has a stable programmatic identity.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_LABELLEDBY],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a tabpanel labelled by its tab',
          test: facts => facts.part === 'tabpanel' && facts.labelledByTab,
        },
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          const attribute = await subject.attribute('aria-labelledby');
          const ids = (attribute ?? '').split(/\s+/).filter(Boolean);
          if (ids.length === 0) {
            throw new Error(
              'this tabpanel declares a tab label, but it has no aria-labelledby relationship',
            );
          }
          const targets = await subject.idReferences('aria-labelledby');
          const dangling = ids.filter((_, index) => targets[index] == null);
          if (dangling.length > 0) {
            throw new Error(
              `aria-labelledby points at ${dangling.map(id => `"${id}"`).join(', ')}, which ${dangling.length === 1 ? 'resolves' : 'resolve'} to nothing`,
            );
          }
          if (facts.labellingTab == null) {
            throw new Error(
              'the binding declares a tab label but names no tab relation',
            );
          }
          const expectedTab = await harness.related(facts.labellingTab);
          const expectedId = await expectedTab.attribute('id');
          if (expectedId == null) {
            throw new Error(
              'the binding’s associated tab has no id for aria-labelledby',
            );
          }
          if (
            !(await harness.references(subject, 'aria-labelledby', expectedTab))
          ) {
            throw new Error(
              ids.includes(expectedId)
                ? `aria-labelledby resolves to a different element than the binding’s associated tab "${expectedId}"`
                : `aria-labelledby identifies ${ids.map(id => `"${id}"`).join(', ')} instead of the binding’s associated tab "${expectedId}"`,
            );
          }
        },
      },
      {
        id: 'tabs.tabpanel.name-exposed',
        outcome:
          'The browser exposes the tabpanel name derived from its tab, so the user can identify the active view.',
        sources: [WCAG_4_1_2, APG_LABELLEDBY],
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates an active tabpanel labelled by its tab',
          test: facts =>
            facts.part === 'tabpanel' &&
            facts.active !== false &&
            facts.labelledByTab,
        },
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          if ((await subject.computed()).name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this tabpanel',
            );
          }
        },
      },
      {
        id: 'tabs.tabpanel.active-state-matches',
        outcome:
          'The selected tab panel is visible and an unselected tab panel is hidden, so the rendered view matches the exposed selection.',
        sources: [WCAG_1_3_1, APG_PANEL_VISIBILITY],
        covers: ['1.3.1-info-and-relationships'],
        appliesWhen: {
          condition: 'the binding designates an active or inactive tabpanel',
          test: facts => facts.part === 'tabpanel' && facts.active != null,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({subject, facts}) => {
          const visible = await subject.isVisible();
          if (visible !== facts.active) {
            throw new Error(
              `the binding declares this tabpanel ${facts.active ? 'active' : 'inactive'}, but the browser reports it ${visible ? 'visible' : 'hidden'}`,
            );
          }
        },
      },
      {
        id: 'tabs.selection.exposed',
        outcome:
          'Exactly the binding’s active tab is selected, and the corresponding panel is the one shown.',
        sources: [WCAG_1_3_1, WCAG_4_1_2, APG_SELECTED, APG_PANEL_VISIBILITY],
        covers: ['1.3.1-info-and-relationships', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a valid tablist with one active tab',
          test: facts => facts.part === 'tablist' && facts.selectedTab != null,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree', 'dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          if (facts.selectedTab == null) {
            throw new Error('selection expectation ran without an active tab');
          }
          await assertSelection(harness, facts, facts.selectedTab);
        },
      },
      {
        id: 'tabs.focus.entry-and-exit',
        outcome:
          'Tab enters the tablist at its selected tab and Tab again leaves the widget.',
        sources: [WCAG_2_1_1, WCAG_2_1_2, WCAG_2_4_3, APG_TAB_ENTRY],
        covers: [
          '2.1.1-keyboard',
          '2.1.2-no-keyboard-trap',
          '2.4.3-focus-order',
        ],
        appliesWhen: {
          condition: 'the binding designates a tab-reachable valid tablist',
          test: facts =>
            facts.part === 'tablist' &&
            facts.tabReachable &&
            facts.selectedTab != null,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, subject, facts}) => {
          await harness.resetFocus();
          for (
            let step = 0;
            step < 10 && !(await subject.containsFocus());
            step += 1
          ) {
            await harness.press('Tab');
          }
          if (!(await subject.containsFocus())) {
            throw new Error('10 presses of Tab never entered the tablist');
          }
          const selected = facts.selectedTab;
          if (
            selected == null ||
            !(await (await harness.related(selected)).isFocused())
          ) {
            throw new Error(
              `Tab entered the tablist somewhere other than its selected tab "${selected}"`,
            );
          }
          await harness.press('Tab');
          if (await subject.containsFocus()) {
            throw new Error('Tab did not leave the tablist');
          }
        },
      },
      {
        id: 'tabs.focus.arrow-round-trip',
        outcome:
          'Right Arrow moves focus to the next tab and Left Arrow restores the previous tab in the adopted horizontal APG order.',
        sources: [WCAG_2_1_1, APG_ARROWS],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding designates an LTR horizontal tablist with no unavailable tabs',
          test: facts =>
            facts.part === 'tablist' &&
            facts.direction === 'ltr' &&
            facts.disabledTabs.length === 0 &&
            facts.tabRelations.length > 1,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, facts}) => {
          await assertArrowRoundTrip(harness, facts, false);
        },
      },
      {
        id: 'tabs.focus.wraps-ends',
        outcome:
          'Arrow navigation wraps between the first and last tabs without imposing a direction-specific key policy.',
        sources: [WCAG_2_1_1, APG_ARROWS],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding designates a horizontal tablist with no unavailable tabs',
          test: facts =>
            facts.part === 'tablist' &&
            facts.disabledTabs.length === 0 &&
            facts.tabRelations.length > 1,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({harness, facts}) => {
          await assertEndWrap(harness, facts);
        },
      },
      {
        id: 'tabs.focus.rtl-arrow-round-trip',
        outcome:
          'This binding reverses horizontal arrow direction in RTL and returns focus without losing the logical order.',
        sources: [APG_ARROWS],
        wcagOutcome:
          'Every tab remains keyboard reachable in the direction the component documents for right-to-left content.',
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding designates an RTL horizontal tablist with no unavailable tabs',
          test: facts =>
            facts.part === 'tablist' &&
            facts.direction === 'rtl' &&
            facts.disabledTabs.length === 0 &&
            facts.tabRelations.length > 1,
        },
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause:
          'The APG names previous and next but does not require reversing physical Left and Right in RTL, and no current Astryx Tabs record adopts that policy as a shared gate.',
        run: async ({harness, facts}) => {
          await assertArrowRoundTrip(harness, facts, false);
        },
      },
      {
        id: 'tabs.focus.skips-unavailable',
        outcome:
          'This binding’s arrow movement skips an unavailable tab and reaches the next available tab.',
        sources: [APG_ARROWS],
        wcagOutcome:
          'Available tabs remain keyboard reachable when the tab set also contains an unavailable item.',
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition:
            'the binding designates a horizontal tablist with an unavailable tab and a distinct available destination',
          test: facts =>
            facts.part === 'tablist' &&
            facts.disabledTabs.length > 0 &&
            facts.selectedTab != null &&
            facts.tabRelations.some(
              name =>
                name !== facts.selectedTab &&
                !facts.disabledTabs.includes(name),
            ),
        },
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause:
          'The APG Tabs pattern does not define disabled-tab navigation, and no current Astryx Tabs record adopts skipping as a shared gate.',
        run: async ({harness, facts}) => {
          await assertArrowRoundTrip(harness, facts, true);
        },
      },
      {
        id: 'tabs.selection.manual-arrows-preserve-state',
        outcome:
          'In the binding’s manual-activation mode, arrowing away and back moves focus without changing the selected panel.',
        sources: [APG_MANUAL_ACTIVATION],
        wcagOutcome:
          'Keyboard operation remains predictable and the programmatically exposed selection stays synchronized with the rendered panel.',
        covers: ['apg-interaction', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates a horizontal manual-activation tablist',
          test: facts =>
            facts.part === 'tablist' &&
            facts.manualActivation &&
            facts.selectedTab != null &&
            facts.tabRelations.some(
              name =>
                name !== facts.selectedTab &&
                !facts.disabledTabs.includes(name),
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree', 'dom'],
        enforcement: 'advisory',
        advisoryBecause:
          'The APG allows either manual or automatic activation, and no current Astryx component record chooses one as the shared Tabs gate. This records the binding’s shipped manual behavior without deciding that policy.',
        run: async ({harness, facts}) => {
          const originalName = facts.selectedTab;
          if (originalName == null) {
            throw new Error(
              'manual-arrow expectation ran without an active tab',
            );
          }
          const originalIndex = facts.tabRelations.indexOf(originalName);
          const nextName = facts.tabRelations.find(
            (name, index) =>
              index !== originalIndex && !facts.disabledTabs.includes(name),
          );
          if (nextName == null) {
            throw new Error(
              'manual-arrow expectation found no available alternate tab',
            );
          }
          const [forward, backward] = arrowKeys(facts.direction);
          await (await harness.related(originalName)).focus();
          await harness.press(forward);
          await assertSelection(harness, facts, originalName);
          await harness.press(backward);
          await assertSelection(harness, facts, originalName);
        },
      },
      {
        id: 'tabs.selection.enter-round-trip',
        outcome:
          'In manual mode, Enter activates the focused alternate tab and restores the original tab and panel when pressed there.',
        sources: [WCAG_2_1_1, APG_MANUAL_ACTIVATION],
        covers: ['2.1.1-keyboard', 'apg-interaction', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates an operable manual-activation tablist',
          test: facts =>
            facts.part === 'tablist' &&
            facts.manualActivation &&
            facts.selectedTab != null &&
            facts.tabRelations.some(
              name =>
                name !== facts.selectedTab &&
                !facts.disabledTabs.includes(name),
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree', 'dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          await assertSelectionKeyRoundTrip(harness, facts, 'Enter');
        },
      },
      {
        id: 'tabs.selection.space-round-trip',
        outcome:
          'In manual mode, Space activates the focused alternate tab and restores the original tab and panel when pressed there.',
        sources: [WCAG_2_1_1, APG_MANUAL_ACTIVATION],
        covers: ['2.1.1-keyboard', 'apg-interaction', '4.1.2-name-role-value'],
        appliesWhen: {
          condition:
            'the binding designates an operable manual-activation tablist',
          test: facts =>
            facts.part === 'tablist' &&
            facts.manualActivation &&
            facts.selectedTab != null &&
            facts.tabRelations.some(
              name =>
                name !== facts.selectedTab &&
                !facts.disabledTabs.includes(name),
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree', 'dom'],
        enforcement: 'required',
        run: async ({harness, facts}) => {
          await assertSelectionKeyRoundTrip(harness, facts, 'Space');
        },
      },
      {
        id: 'tabs.selection.pointer-round-trip',
        outcome:
          'A pointer selects an alternate tab and can restore the original tab and panel.',
        sources: [APG_SELECTED],
        wcagOutcome:
          'The selected state exposed under WCAG 4.1.2 stays synchronized with the panel changed by pointer input.',
        covers: ['4.1.2-name-role-value'],
        appliesWhen: {
          condition: 'the binding designates a pointer-operable valid tablist',
          test: facts =>
            facts.part === 'tablist' &&
            facts.pointerSelection &&
            facts.selectedTab != null &&
            facts.tabRelations.some(
              name =>
                name !== facts.selectedTab &&
                !facts.disabledTabs.includes(name),
            ),
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree', 'dom'],
        enforcement: 'advisory',
        advisoryBecause:
          'APG defines the selected-state invariant but does not independently make pointer activation a Tabs keyboard requirement, and no current Astryx Tabs record adopts pointer selection as a shared gate.',
        run: async ({harness, facts}) => {
          const originalName = facts.selectedTab;
          if (originalName == null) {
            throw new Error('pointer expectation ran without an active tab');
          }
          const alternateName = facts.tabRelations.find(
            name => name !== originalName && !facts.disabledTabs.includes(name),
          );
          if (alternateName == null) {
            throw new Error(
              'pointer expectation found no available alternate tab',
            );
          }
          await harness.click(await harness.related(alternateName));
          await assertSelection(harness, facts, alternateName);
          await harness.click(await harness.related(originalName));
          await assertSelection(harness, facts, originalName);
        },
      },
      {
        id: 'tabs.tab.survives-aborted-press',
        outcome:
          'A press released away from an available tab leaves its selected state unchanged.',
        sources: [WCAG_2_5_2],
        covers: ['2.5.2-pointer-cancellation'],
        appliesWhen: {
          condition: 'the binding designates an available pointer-operated tab',
          test: facts => facts.part === 'tab' && facts.pointerCancellation,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['accessibility-tree'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const before = (await subject.computed()).selected;
          await harness.abortedPress(subject);
          const after = (await subject.computed()).selected;
          if (after !== before) {
            throw new Error(
              'pressing the tab and releasing away from it still changed the selected state',
            );
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component and caller content',
        verifiedBy: 'component icon tests and the repository axe audit',
        reason:
          'The contract observes tab and panel semantics; each binding owns decorative or informative graphics inside those parts.',
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'component DOM tests for surrounding structure and page-level review beyond the bound tab and panel relations',
        reason:
          'This contract covers tablist, tab, and tabpanel roles plus their direct authored relationships; surrounding page structure stays with its composition owner.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the composing page',
        verifiedBy: 'page-level DOM-order review',
        reason:
          'The reading sequence around the tabbed interface depends on the page that composes it.',
      },
      '1.3.5-identify-input-purpose': {
        owner: 'the composing form and caller content',
        verifiedBy: 'form integration review',
        reason:
          'Tabs select views and do not collect personal data identified by autocomplete tokens.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository visual gate and component review',
        reason:
          'Whether selection is conveyed by color alone is a rendered-pixel fact.',
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason: 'Text contrast depends on resolved rendered colors.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit and visual gate',
        reason:
          'Tab indicators, boundaries, and focus indicators require rendered-color measurement.',
      },
      '2.1.1-keyboard': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'component-local tests for Home, End, and any controls composed around the tablist',
        reason:
          'This contract covers Tab entry and exit, horizontal arrow movement, and manual Enter/Space activation. Optional shortcuts and adjacent controls remain local.',
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the composing page',
        verifiedBy: 'page-level sequential-focus review',
        reason:
          'This contract proves Tab leaves the tablist; the larger page focus sequence remains outside it.',
        coversRemainderOnly: true,
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'A tabbed component does not own the document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the composing page',
        verifiedBy: 'page-level review before and after the tabbed interface',
        reason:
          'This contract proves the entry target and one-stop exit; the surrounding sequence remains page-owned.',
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'family:navigation-destinations and caller content',
        verifiedBy: 'navigation-mode Tab tests and link-content review',
        reason:
          'This contract excludes navigation-mode tabs; an ARIA tab selects a panel rather than acting as a link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'caller content and component review',
        verifiedBy: 'content review of tablist and tab labels',
        reason:
          'This contract proves names exist; whether their words describe the views is a content judgement.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner:
          'architecture:interaction-modality, the binding component, and theme',
        verifiedBy: 'component focus-ring tests and the repository visual gate',
        reason: 'A visible focus indicator is a painted result.',
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the composing page or overlay',
        verifiedBy: 'real-browser layout and overlay review',
        reason:
          'Whether a focused tab is obscured depends on surrounding authored content.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the binding component and caller-composed interactive content',
        verifiedBy: 'component pointer suites outside the bound tab target',
        reason:
          'This contract proves cancellation on the tab itself; enlarged or nested targets stay with their owners.',
        coversRemainderOnly: true,
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component and caller content',
        verifiedBy: 'component label tests and content review',
        reason:
          'This contract compares a bound tab name with its rendered label; adjacent caller text remains outside that relation.',
        coversRemainderOnly: true,
      },
      '2.5.8-target-size': {
        owner: 'the binding component and composing page',
        verifiedBy:
          'real-browser geometry measurement with neighbouring-target spacing',
        reason:
          'Target-size applicability depends on rendered geometry and neighbouring targets.',
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason:
          'A component rendered in isolation does not own document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller',
        verifiedBy:
          'integration review of any context change caused by the selection callback',
        reason:
          'The contract keeps selection and panels coherent inside the composition; wider navigation or context changes are caller-owned.',
      },
      '3.2.4-consistent-identification': {
        owner: 'the design system and composing application',
        verifiedBy: 'cross-component and cross-page review',
        reason:
          'Consistency is a comparison across usages, not a property one isolated binding can establish.',
      },
      '3.3.1-error-identification': {
        owner: 'the composing page',
        verifiedBy: 'page-level validation and status-message tests',
        reason: 'The Tabs pattern defines no validation-error state.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'caller content',
        verifiedBy: 'content review for any instructions around the views',
        reason:
          'Tabs are not form inputs that require data-entry instructions; their accessible names are covered separately.',
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component and contracts for composed controls',
        verifiedBy:
          'component-specific tests for public states not owned by Tabs semantics',
        reason:
          'This contract covers tablist/tab/tabpanel role, name, selection, availability, and relationships; other component states stay local.',
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner: 'the composing page and AST-009 for any announcement claim',
        verifiedBy:
          'status-message contracts plus real-AT evidence when the claim is spoken output',
        reason:
          'Changing panels is not itself a status-message contract, and this pattern makes no announcement claim.',
      },
      'apg-interaction': {
        owner:
          'the binding component and a future current Tabs component record',
        verifiedBy:
          'component-local Home/End tests and owner review for vertical or automatic activation',
        reason:
          'This contract covers horizontal arrows and manual Enter/Space activation. Home/End remain local; vertical and automatic activation are unresolved and excluded.',
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy: 'component forced-colors suites and manual review',
        reason: 'Forced-colors output is a paint result.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy: 'component transition tests and the visual gate',
        reason:
          'Motion is a rendered result and is not intrinsic to Tabs semantics.',
      },
      'at-facing-strings': {
        owner: 'the binding component',
        verifiedBy: 'the repository i18n catalog check',
        reason:
          'Translation is a source-level concern that rendered semantics alone cannot distinguish.',
      },
    },
  });
