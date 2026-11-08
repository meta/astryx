// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabs.fixtures.ts
 * @input Uses TabsStateFacts
 * @output Plain-HTML conforming and deliberately violating Tabs fixtures, including two-tab boundary and clipped-paint mutations
 * @position Mutation proof for the reusable contract; no Astryx component code.
 */

import type {TabsStateFacts} from './tabs';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const TABS_SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface TabsFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: TabsStateFacts;
  readonly html: string;
}

function baseFacts(overrides: Partial<TabsStateFacts> = {}): TabsStateFacts {
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
  return baseFacts({
    part: 'tab',
    selected: true,
    disabled: false,
    focusable: true,
    controlsPanel: true,
    controlledPanel: 'panel-first',
    tabRelations: [],
    panelRelations: [],
    selectedTab: null,
    tabReachable: true,
    pointerSelection: false,
    pointerCancellation: true,
    ...overrides,
  });
}

function panelFacts(overrides: Partial<TabsStateFacts> = {}): TabsStateFacts {
  return baseFacts({
    part: 'tabpanel',
    selected: null,
    active: true,
    disabled: null,
    controlsPanel: false,
    controlledPanel: null,
    labelledByTab: true,
    labellingTab: 'first',
    tabRelations: [],
    panelRelations: [],
    selectedTab: null,
    tabReachable: false,
    pointerSelection: false,
    pointerCancellation: false,
    ...overrides,
  });
}

interface GroupOptions {
  readonly direction?: 'ltr' | 'rtl';
  readonly subject?:
    'tablist' | 'first-tab' | 'second-tab' | 'first-panel' | 'second-panel';
  readonly tablistRole?: string;
  readonly named?: boolean;
  readonly tabRole?: string;
  readonly firstTabLabel?: string;
  readonly firstTabAriaLabel?: string;
  readonly hideFirstTabLabel?: boolean;
  readonly firstSelected?: boolean;
  readonly secondSelected?: boolean;
  readonly secondDisabled?: boolean;
  readonly thirdDisabled?: boolean;
  readonly secondAriaDisabled?: boolean;
  readonly controls?: 'valid' | 'missing' | 'dangling' | 'wrong';
  readonly panelRole?: string;
  readonly panelLabel?: 'valid' | 'missing' | 'dangling' | 'wrong' | 'empty';
  readonly firstPanelHidden?: boolean;
  readonly firstPanelCssHidden?: boolean;
  readonly firstPanelTransparent?: boolean;
  readonly firstPanelClipped?: boolean;
  readonly secondPanelHidden?: boolean;
  readonly secondPanelCssVisible?: boolean;
  readonly duplicatePanelId?: boolean;
  readonly duplicateTabId?: boolean;
  readonly wrongEntry?: boolean;
  readonly trapTab?: boolean;
  readonly thirdTab?: boolean;
  readonly arrow?:
    | 'works'
    | 'inert'
    | 'one-way'
    | 'changes-selection'
    | 'does-not-skip'
    | 'physical-ltr'
    | 'no-wrap';
  readonly keyboard?: 'works' | 'inert' | 'one-way';
  readonly pointer?: 'works' | 'inert' | 'one-way' | 'down';
}

function groupHtml(options: GroupOptions = {}): string {
  const {
    direction = 'ltr',
    subject = 'tablist',
    tablistRole = 'tablist',
    named = true,
    tabRole = 'tab',
    firstTabLabel = 'Overview',
    firstTabAriaLabel,
    hideFirstTabLabel = false,
    firstSelected = true,
    secondSelected = false,
    secondDisabled = false,
    thirdDisabled = false,
    secondAriaDisabled = false,
    controls = 'valid',
    panelRole = 'tabpanel',
    panelLabel = 'valid',
    firstPanelHidden = !firstSelected,
    firstPanelCssHidden = false,
    firstPanelTransparent = false,
    firstPanelClipped = false,
    secondPanelHidden = !secondSelected,
    secondPanelCssVisible = false,
    duplicatePanelId = false,
    duplicateTabId = false,
    wrongEntry = false,
    trapTab = false,
    thirdTab = true,
    arrow = 'works',
    keyboard = 'works',
    pointer = 'works',
  } = options;

  const subjectAttribute = (part: GroupOptions['subject']) =>
    subject === part ? ` ${SUBJECT_ATTRIBUTE}` : '';
  const controlsAttribute =
    controls === 'valid'
      ? ' aria-controls="panel-first"'
      : controls === 'wrong'
        ? ' aria-controls="panel-second"'
        : controls === 'dangling'
          ? ' aria-controls="missing-panel"'
          : '';
  const panelLabelAttribute =
    panelLabel === 'valid' || panelLabel === 'empty'
      ? ' aria-labelledby="tab-first"'
      : panelLabel === 'wrong'
        ? ' aria-labelledby="tab-second"'
        : panelLabel === 'dangling'
          ? ' aria-labelledby="missing-tab"'
          : '';
  const firstLabel =
    panelLabel === 'empty' ? '' : hideFirstTabLabel ? '▣' : firstTabLabel;
  const firstAria =
    firstTabAriaLabel == null ? '' : ` aria-label="${firstTabAriaLabel}"`;

  return `
    ${duplicatePanelId ? '<div id="panel-first">Wrong duplicate panel</div>' : ''}
    ${duplicateTabId ? '<button id="tab-first">Wrong duplicate tab</button>' : ''}
    <button type="button">Before</button>
    <div${subjectAttribute('tablist')} data-a11y-tabs role="${tablistRole}"${named ? ' aria-label="Project views"' : ''} dir="${direction}">
      <button${subjectAttribute('first-tab')} data-a11y-related="first" data-key="first" id="tab-first" role="${tabRole}" aria-selected="${firstSelected}"${controlsAttribute}${firstAria} tabindex="${wrongEntry ? -1 : firstSelected ? 0 : -1}">${firstLabel}</button>
      <button${subjectAttribute('second-tab')} data-a11y-related="second" data-key="second" id="tab-second" role="tab" aria-selected="${secondSelected}" aria-controls="panel-second" tabindex="${wrongEntry ? 0 : secondSelected ? 0 : -1}"${secondDisabled ? ' disabled' : ''}${secondAriaDisabled ? ' aria-disabled="true"' : ''}>Activity</button>
      ${thirdTab ? '<button data-a11y-related="third" data-key="third" id="tab-third" role="tab" aria-selected="false" aria-controls="panel-third" tabindex="-1"' + (thirdDisabled ? ' disabled' : '') + '>Members</button>' : ''}
    </div>
    <div${subjectAttribute('first-panel')} data-a11y-related="panel-first" id="panel-first" role="${panelRole}"${panelLabelAttribute}${firstPanelHidden ? ' hidden' : ''}${firstPanelCssHidden ? ' style="display:none"' : firstPanelTransparent ? ' style="opacity:0"' : firstPanelClipped ? ' style="clip-path:inset(100%)"' : ''}>Overview panel</div>
    <div${subjectAttribute('second-panel')} data-a11y-related="panel-second" id="panel-second" role="tabpanel" aria-labelledby="tab-second"${secondPanelHidden ? ' hidden' : ''}${secondPanelCssVisible ? ' style="display:block !important"' : ''}>Activity panel</div>
    ${thirdTab ? '<div data-a11y-related="panel-third" id="panel-third" role="tabpanel" aria-labelledby="tab-third" hidden>Members panel</div>' : ''}
    <button type="button">After</button>
    <script>
      (() => {
        const list = document.querySelector('[data-a11y-tabs]');
        const tabs = Array.from(list.querySelectorAll('[role="tab"], [data-key]'));
        const panels = [${thirdTab ? "'first', 'second', 'third'" : "'first', 'second'"}].map(key => document.getElementById('panel-' + key));
        const select = key => {
          tabs.forEach(tab => {
            const active = tab.dataset.key === key;
            tab.setAttribute('aria-selected', String(active));
            tab.setAttribute('tabindex', active ? '0' : '-1');
          });
          panels.forEach(panel => { panel.hidden = panel.id !== 'panel-' + key; });
        };
        tabs.forEach(tab => {
          ${pointer === 'down' ? "tab.addEventListener('pointerdown', () => select(tab.dataset.key));" : ''}
          tab.addEventListener('click', () => {
            ${pointer === 'inert' ? 'return;' : ''}
            ${pointer === 'one-way' ? "if (tab.dataset.key === 'first') return;" : ''}
            select(tab.dataset.key);
          });
        });
        list.addEventListener('keydown', event => {
          ${trapTab ? "if (event.key === 'Tab') { event.preventDefault(); return; }" : ''}
          const rtl = ${arrow === 'physical-ltr' ? 'false' : "getComputedStyle(list).direction === 'rtl'"};
          const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
          const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
          if (event.key === forward || event.key === backward) {
            ${arrow === 'inert' ? 'return;' : ''}
            ${arrow === 'one-way' ? 'if (event.key === backward) return;' : ''}
            event.preventDefault();
            const current = tabs.indexOf(document.activeElement);
            const step = event.key === forward ? 1 : -1;
            const rawIndex = current + step;
            ${arrow === 'no-wrap' ? 'if (rawIndex < 0 || rawIndex >= tabs.length) return;' : ''}
            let index = (rawIndex + tabs.length) % tabs.length;
            ${arrow === 'does-not-skip' ? '' : 'while (tabs[index].disabled) index = (index + step + tabs.length) % tabs.length;'}
            tabs[index].focus();
            ${arrow === 'changes-selection' ? 'select(tabs[index].dataset.key);' : ''}
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            ${keyboard === 'inert' ? 'event.preventDefault(); return;' : ''}
            ${keyboard === 'one-way' ? "if (document.activeElement.dataset.key === 'first') { event.preventDefault(); return; }" : ''}
            event.preventDefault();
            select(document.activeElement.dataset.key);
          }
        });
      })();
    </script>
  `;
}

export const TABS_FIXTURES: readonly TabsFixture[] = [
  {
    id: 'conforming-tablist-aria-owns',
    summary: 'a tablist that semantically owns an out-of-tree tab',
    facts: baseFacts({
      tabRelations: ['first'],
      panelRelations: [],
      selectedTab: null,
      manualActivation: false,
      tabReachable: false,
      pointerSelection: false,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="tablist" aria-label="Project views" aria-owns="tab-first"></div><button data-a11y-related="first" id="tab-first" role="tab" aria-selected="true">Overview</button>`,
  },
  {
    id: 'conforming-tablist-ltr',
    summary: 'a horizontal LTR manual-activation tablist',
    facts: baseFacts(),
    html: groupHtml(),
  },
  {
    id: 'conforming-tablist-two-tabs',
    summary: 'a two-tab set that wraps both arrows at both boundaries',
    facts: baseFacts({
      tabRelations: ['first', 'second'],
      panelRelations: ['panel-first', 'panel-second'],
    }),
    html: groupHtml({thirdTab: false}),
  },
  {
    id: 'conforming-tablist-rtl',
    summary: 'a horizontal RTL manual-activation tablist',
    facts: baseFacts({direction: 'rtl'}),
    html: groupHtml({direction: 'rtl'}),
  },
  {
    id: 'conforming-tablist-disabled-skip',
    summary: 'a tablist with an unavailable middle tab',
    facts: baseFacts({disabledTabs: ['second']}),
    html: groupHtml({secondDisabled: true}),
  },
  {
    id: 'conforming-tablist-no-available-alternate',
    summary: 'a tablist whose only available tab is already selected',
    facts: baseFacts({disabledTabs: ['second', 'third']}),
    html: groupHtml({secondDisabled: true, thirdDisabled: true}),
  },
  {
    id: 'conforming-tab-selected',
    summary: 'a selected available tab with a controlled panel',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab'}),
  },
  {
    id: 'conforming-tab-unselected',
    summary: 'an unselected available tab with a controlled panel',
    facts: tabFacts({
      selected: false,
      controlledPanel: 'panel-second',
      tabReachable: false,
    }),
    html: groupHtml({subject: 'second-tab'}),
  },
  {
    id: 'conforming-tab-disabled',
    summary: 'an unavailable unselected tab',
    facts: tabFacts({
      selected: false,
      disabled: true,
      focusable: false,
      controlledPanel: 'panel-second',
      tabReachable: false,
      pointerCancellation: false,
    }),
    html: groupHtml({subject: 'second-tab', secondDisabled: true}),
  },
  {
    id: 'conforming-tab-unavailable-inert',
    summary: 'a focusable unavailable tab whose activation is inert',
    facts: tabFacts({
      selected: false,
      disabled: true,
      focusable: true,
      controlledPanel: 'panel-second',
      tabReachable: false,
      pointerCancellation: false,
    }),
    html: groupHtml({
      subject: 'second-tab',
      secondAriaDisabled: true,
      keyboard: 'inert',
      pointer: 'inert',
    }),
  },
  {
    id: 'conforming-tab-hidden-label',
    summary: 'a selected icon-only tab named programmatically',
    facts: tabFacts({visibleLabel: false}),
    html: groupHtml({
      subject: 'first-tab',
      firstTabLabel: 'Overview',
      firstTabAriaLabel: 'Overview',
      hideFirstTabLabel: true,
    }),
  },
  {
    id: 'conforming-panel-active',
    summary: 'the visible panel labelled by the selected tab',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel'}),
  },
  {
    id: 'conforming-panel-inactive',
    summary: 'an inactive hidden panel labelled by its tab',
    facts: panelFacts({active: false, labellingTab: 'second'}),
    html: groupHtml({subject: 'second-panel'}),
  },

  {
    id: 'violating-tablist-role',
    summary: 'a Tabs container exposed as a toolbar',
    facts: baseFacts(),
    html: groupHtml({tablistRole: 'toolbar'}),
  },
  {
    id: 'violating-tablist-name',
    summary: 'an unnamed tablist',
    facts: baseFacts(),
    html: groupHtml({named: false}),
  },
  {
    id: 'violating-tab-role',
    summary: 'a tab exposed as a button',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', tabRole: 'button'}),
  },
  {
    id: 'violating-tab-name',
    summary: 'a tab with no accessible name',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', firstTabLabel: ''}),
  },
  {
    id: 'violating-tab-name-mismatch',
    summary: 'a tab whose accessible name replaces its visible label',
    facts: tabFacts(),
    html: groupHtml({
      subject: 'first-tab',
      firstTabLabel: 'Overview',
      firstTabAriaLabel: 'Activity',
    }),
  },
  {
    id: 'violating-tab-selected',
    summary: 'a selected tab exposed as unselected',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', firstSelected: false}),
  },
  {
    id: 'violating-tab-disabled',
    summary: 'an unavailable tab exposed as available',
    facts: tabFacts({
      selected: false,
      disabled: true,
      tabReachable: false,
      pointerCancellation: false,
    }),
    html: groupHtml({subject: 'second-tab'}),
  },
  {
    id: 'violating-unavailable-operable',
    summary: 'a tab exposed as unavailable that still activates',
    facts: tabFacts({
      selected: false,
      disabled: true,
      controlledPanel: 'panel-second',
      tabReachable: false,
      pointerCancellation: false,
    }),
    html: groupHtml({subject: 'second-tab', secondAriaDisabled: true}),
  },
  {
    id: 'violating-controls-missing',
    summary: 'a tab with no panel relationship',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', controls: 'missing'}),
  },
  {
    id: 'violating-controls-dangling',
    summary: 'a tab whose aria-controls target does not exist',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', controls: 'dangling'}),
  },
  {
    id: 'violating-controls-wrong-existing',
    summary: 'a tab whose aria-controls names another tab’s existing panel',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', controls: 'wrong'}),
  },
  {
    id: 'violating-controls-duplicate-id',
    summary: 'aria-controls resolves to a duplicate instead of the bound panel',
    facts: tabFacts(),
    html: groupHtml({subject: 'first-tab', duplicatePanelId: true}),
  },
  {
    id: 'violating-tab-outside-tablist',
    summary: 'a declared tab rendered outside the tablist',
    facts: baseFacts(),
    html: `<button type="button">Before</button><div ${SUBJECT_ATTRIBUTE} role="tablist" aria-label="Project views"><button data-a11y-related="second" id="tab-second" role="tab" aria-selected="false" aria-controls="panel-second" tabindex="-1">Activity</button><button data-a11y-related="third" id="tab-third" role="tab" aria-selected="false" aria-controls="panel-third" tabindex="-1">Members</button></div><button data-a11y-related="first" id="tab-first" role="tab" aria-selected="true" aria-controls="panel-first" tabindex="0">Overview</button><div data-a11y-related="panel-first" id="panel-first" role="tabpanel" aria-labelledby="tab-first">Overview panel</div><div data-a11y-related="panel-second" id="panel-second" role="tabpanel" aria-labelledby="tab-second" hidden>Activity panel</div><div data-a11y-related="panel-third" id="panel-third" role="tabpanel" aria-labelledby="tab-third" hidden>Members panel</div><button type="button">After</button>`,
  },
  {
    id: 'violating-tab-semantically-detached',
    summary: 'a DOM child tab hidden from the accessibility tree',
    facts: baseFacts({
      tabRelations: ['first'],
      panelRelations: [],
      selectedTab: null,
      manualActivation: false,
      tabReachable: false,
      pointerSelection: false,
    }),
    html: `<div ${SUBJECT_ATTRIBUTE} role="tablist" aria-label="Project views"><button data-a11y-related="first" id="tab-first" role="tab" aria-selected="true" aria-hidden="true">Overview</button></div>`,
  },
  {
    id: 'violating-panel-role',
    summary: 'a tabpanel exposed as a region',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', panelRole: 'region'}),
  },
  {
    id: 'violating-panel-labelledby-missing',
    summary: 'a tabpanel with no reverse label relationship',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', panelLabel: 'missing'}),
  },
  {
    id: 'violating-panel-labelledby-dangling',
    summary: 'a tabpanel whose label target does not exist',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', panelLabel: 'dangling'}),
  },
  {
    id: 'violating-panel-labelledby-wrong-existing',
    summary: 'a tabpanel labelled by another tab',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', panelLabel: 'wrong'}),
  },
  {
    id: 'violating-panel-labelledby-duplicate-id',
    summary: 'aria-labelledby resolves to a duplicate instead of the bound tab',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', duplicateTabId: true}),
  },
  {
    id: 'violating-panel-name',
    summary: 'a tabpanel whose referenced tab has no name',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', panelLabel: 'empty'}),
  },
  {
    id: 'violating-panel-active-hidden',
    summary: 'an active tabpanel hidden by rendered CSS',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', firstPanelCssHidden: true}),
  },
  {
    id: 'violating-panel-active-clipped',
    summary: 'an active positive-size tabpanel fully clipped from paint',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', firstPanelClipped: true}),
  },
  {
    id: 'violating-panel-active-transparent',
    summary: 'an active tabpanel rendered fully transparent',
    facts: panelFacts(),
    html: groupHtml({subject: 'first-panel', firstPanelTransparent: true}),
  },
  {
    id: 'violating-panel-inactive-visible',
    summary: 'an inactive tabpanel that remains visible',
    facts: panelFacts({active: false, labellingTab: 'second'}),
    html: groupHtml({subject: 'second-panel', secondPanelHidden: false}),
  },
  {
    id: 'violating-selection-active-css-hidden',
    summary: 'the selected panel is hidden by CSS during selection',
    facts: baseFacts(),
    html: groupHtml({firstPanelCssHidden: true}),
  },
  {
    id: 'violating-selection-active-clipped',
    summary: 'the selected positive-size panel is fully clipped from paint',
    facts: baseFacts(),
    html: groupHtml({firstPanelClipped: true}),
  },
  {
    id: 'violating-selection-active-transparent',
    summary: 'the selected panel is fully transparent during selection',
    facts: baseFacts(),
    html: groupHtml({firstPanelTransparent: true}),
  },
  {
    id: 'violating-selection-inactive-css-visible',
    summary: 'an unselected panel overrides hidden and remains visible',
    facts: baseFacts(),
    html: groupHtml({secondPanelCssVisible: true}),
  },
  {
    id: 'violating-selection-two',
    summary: 'a tablist exposing two selected tabs',
    facts: baseFacts(),
    html: groupHtml({secondSelected: true}),
  },
  {
    id: 'violating-entry-wrong',
    summary: 'a tablist entered at an unselected tab',
    facts: baseFacts(),
    html: groupHtml({wrongEntry: true}),
  },
  {
    id: 'violating-tab-trap',
    summary: 'a tablist that traps Tab',
    facts: baseFacts(),
    html: groupHtml({trapTab: true}),
  },
  {
    id: 'violating-arrow-inert',
    summary: 'a tablist whose arrows move no focus',
    facts: baseFacts(),
    html: groupHtml({arrow: 'inert'}),
  },
  {
    id: 'violating-arrow-one-way',
    summary: 'a tablist that moves forward but not back',
    facts: baseFacts(),
    html: groupHtml({arrow: 'one-way'}),
  },
  {
    id: 'violating-two-tab-arrow-no-wrap',
    summary:
      'a two-tab set whose arrows move only inward and stop at both outward boundaries',
    facts: baseFacts({
      tabRelations: ['first', 'second'],
      panelRelations: ['panel-first', 'panel-second'],
    }),
    html: groupHtml({arrow: 'no-wrap', thirdTab: false}),
  },
  {
    id: 'violating-arrow-no-wrap',
    summary: 'a tablist whose arrows stop at the ends instead of wrapping',
    facts: baseFacts(),
    html: groupHtml({arrow: 'no-wrap'}),
  },
  {
    id: 'violating-rtl-arrow-no-wrap',
    summary: 'an RTL tablist whose arrows stop at the ends instead of wrapping',
    facts: baseFacts({direction: 'rtl'}),
    html: groupHtml({direction: 'rtl', arrow: 'no-wrap'}),
  },
  {
    id: 'violating-rtl-physical-arrows',
    summary: 'an RTL tablist that keeps LTR physical arrow direction',
    facts: baseFacts({direction: 'rtl'}),
    html: groupHtml({direction: 'rtl', arrow: 'physical-ltr'}),
  },
  {
    id: 'violating-arrow-does-not-skip',
    summary: 'a tablist whose arrow stalls on a disabled tab',
    facts: baseFacts({disabledTabs: ['second']}),
    html: groupHtml({secondDisabled: true, arrow: 'does-not-skip'}),
  },
  {
    id: 'violating-arrow-changes-selection',
    summary: 'manual arrow focus also changes selection',
    facts: baseFacts(),
    html: groupHtml({arrow: 'changes-selection'}),
  },
  {
    id: 'violating-keyboard-inert',
    summary: 'a manual tablist whose focused tab ignores Enter',
    facts: baseFacts(),
    html: groupHtml({keyboard: 'inert'}),
  },
  {
    id: 'violating-keyboard-one-way',
    summary: 'activation selects an alternate but cannot restore the original',
    facts: baseFacts(),
    html: groupHtml({keyboard: 'one-way'}),
  },
  {
    id: 'violating-pointer-inert',
    summary: 'an alternate tab ignores pointer activation',
    facts: baseFacts(),
    html: groupHtml({pointer: 'inert'}),
  },
  {
    id: 'violating-pointer-one-way',
    summary: 'a pointer selects an alternate but cannot restore the original',
    facts: baseFacts(),
    html: groupHtml({pointer: 'one-way'}),
  },
  {
    id: 'violating-pointer-down',
    summary: 'a tab selects on pointer down before release',
    facts: tabFacts({selected: false}),
    html: groupHtml({subject: 'second-tab', pointer: 'down'}),
  },
];

export const CONFORMING_TABS_FIXTURES = TABS_FIXTURES.filter(fixture =>
  fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const TABS_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'tabs.tablist.role-exposed': ['violating-tablist-role'],
  'tabs.tablist.name-exposed': ['violating-tablist-name'],
  'tabs.tab.role-exposed': ['violating-tab-role'],
  'tabs.tab.name-exposed': ['violating-tab-name'],
  'tabs.tab.name-matches-visible-label': ['violating-tab-name-mismatch'],
  'tabs.tab.selected-state-exposed': ['violating-tab-selected'],
  'tabs.tab.availability-exposed': ['violating-tab-disabled'],
  'tabs.tab.unavailable-pointer-inert': ['violating-unavailable-operable'],
  'tabs.tab.unavailable-enter-inert': ['violating-unavailable-operable'],
  'tabs.tab.unavailable-space-inert': ['violating-unavailable-operable'],
  'tabs.relationship.controls-resolves': [
    'violating-controls-missing',
    'violating-controls-dangling',
    'violating-controls-wrong-existing',
    'violating-controls-duplicate-id',
  ],
  'tabs.tablist.contains-tabs': [
    'violating-tab-outside-tablist',
    'violating-tab-semantically-detached',
  ],
  'tabs.tabpanel.role-exposed': ['violating-panel-role'],
  'tabs.relationship.panel-labelledby-resolves': [
    'violating-panel-labelledby-missing',
    'violating-panel-labelledby-dangling',
    'violating-panel-labelledby-wrong-existing',
    'violating-panel-labelledby-duplicate-id',
  ],
  'tabs.tabpanel.name-exposed': ['violating-panel-name'],
  'tabs.tabpanel.active-state-matches': [
    'violating-panel-active-hidden',
    'violating-panel-active-clipped',
    'violating-panel-active-transparent',
    'violating-panel-inactive-visible',
  ],
  'tabs.selection.exposed': [
    'violating-selection-two',
    'violating-selection-active-css-hidden',
    'violating-selection-active-clipped',
    'violating-selection-active-transparent',
    'violating-selection-inactive-css-visible',
  ],
  'tabs.focus.entry-and-exit': ['violating-entry-wrong', 'violating-tab-trap'],
  'tabs.focus.arrow-round-trip': [
    'violating-arrow-inert',
    'violating-arrow-one-way',
  ],
  'tabs.focus.wraps-ends': [
    'violating-two-tab-arrow-no-wrap',
    'violating-arrow-no-wrap',
    'violating-rtl-arrow-no-wrap',
  ],
  'tabs.focus.rtl-arrow-round-trip': ['violating-rtl-physical-arrows'],
  'tabs.focus.skips-unavailable': ['violating-arrow-does-not-skip'],
  'tabs.selection.manual-arrows-preserve-state': [
    'violating-arrow-changes-selection',
  ],
  'tabs.selection.enter-round-trip': [
    'violating-keyboard-inert',
    'violating-keyboard-one-way',
  ],
  'tabs.selection.space-round-trip': [
    'violating-keyboard-inert',
    'violating-keyboard-one-way',
  ],
  'tabs.selection.pointer-round-trip': [
    'violating-pointer-inert',
    'violating-pointer-one-way',
  ],
  'tabs.tab.survives-aborted-press': ['violating-pointer-down'],
};

const EXPECTED_MUTATION_FAILURES: Readonly<Record<string, string>> = {
  'tabs.tablist.role-exposed:violating-tablist-role':
    'the browser reports this container as "toolbar", not as a tablist',
  'tabs.tablist.name-exposed:violating-tablist-name':
    'the browser computes no accessible name for this tablist',
  'tabs.tab.role-exposed:violating-tab-role':
    'the browser reports this item as "button", not as a tab',
  'tabs.tab.name-exposed:violating-tab-name':
    'the browser computes no accessible name for this tab',
  'tabs.tab.name-matches-visible-label:violating-tab-name-mismatch':
    'the visible label reads "Overview" but the browser computes the accessible name as "Activity"',
  'tabs.tab.selected-state-exposed:violating-tab-selected':
    'the binding declares this tab selected, but the browser reports it unselected',
  'tabs.tab.availability-exposed:violating-tab-disabled':
    'the binding declares this tab unavailable, but the browser reports it available',
  'tabs.tab.unavailable-pointer-inert:violating-unavailable-operable':
    'the tab is reported unavailable, but clicking it selected it',
  'tabs.tab.unavailable-enter-inert:violating-unavailable-operable':
    'the tab is reported unavailable, but Enter selected it',
  'tabs.tab.unavailable-space-inert:violating-unavailable-operable':
    'the tab is reported unavailable, but Space selected it',
  'tabs.relationship.controls-resolves:violating-controls-missing':
    'this tab declares a controlled panel, but it has no aria-controls relationship',
  'tabs.relationship.controls-resolves:violating-controls-dangling':
    'aria-controls points at "missing-panel", which resolves to nothing',
  'tabs.relationship.controls-resolves:violating-controls-wrong-existing':
    'aria-controls identifies "panel-second" instead of the binding’s associated panel "panel-first"',
  'tabs.relationship.controls-resolves:violating-controls-duplicate-id':
    'aria-controls resolves to a different element than the binding’s associated panel "panel-first"',
  'tabs.tablist.contains-tabs:violating-tab-outside-tablist':
    'the binding’s "first" tab is not contained by the tablist',
  'tabs.tablist.contains-tabs:violating-tab-semantically-detached':
    'the binding’s "first" tab is not contained by the tablist',
  'tabs.tabpanel.role-exposed:violating-panel-role':
    'the browser reports this panel as "region", not as a tabpanel',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-missing':
    'this tabpanel declares a tab label, but it has no aria-labelledby relationship',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-dangling':
    'aria-labelledby points at "missing-tab", which resolves to nothing',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-wrong-existing':
    'aria-labelledby identifies "tab-second" instead of the binding’s associated tab "tab-first"',
  'tabs.relationship.panel-labelledby-resolves:violating-panel-labelledby-duplicate-id':
    'aria-labelledby resolves to a different element than the binding’s associated tab "tab-first"',
  'tabs.tabpanel.name-exposed:violating-panel-name':
    'the browser computes no accessible name for this tabpanel',
  'tabs.tabpanel.active-state-matches:violating-panel-active-hidden':
    'the binding declares this tabpanel active, but the browser reports it hidden',
  'tabs.tabpanel.active-state-matches:violating-panel-active-clipped':
    'the binding declares this tabpanel active, but the browser reports it hidden',
  'tabs.tabpanel.active-state-matches:violating-panel-active-transparent':
    'the binding declares this tabpanel active, but the browser reports it hidden',
  'tabs.tabpanel.active-state-matches:violating-panel-inactive-visible':
    'the binding declares this tabpanel inactive, but the browser reports it visible',
  'tabs.selection.exposed:violating-selection-two':
    'expected exactly "first" selected, but the browser exposes "first", "second"',
  'tabs.selection.exposed:violating-selection-active-css-hidden':
    'the "panel-first" panel is hidden while "first" is selected',
  'tabs.selection.exposed:violating-selection-active-clipped':
    'the "panel-first" panel is hidden while "first" is selected',
  'tabs.selection.exposed:violating-selection-active-transparent':
    'the "panel-first" panel is hidden while "first" is selected',
  'tabs.selection.exposed:violating-selection-inactive-css-visible':
    'the "panel-second" panel is visible while "second" is unselected',
  'tabs.focus.entry-and-exit:violating-entry-wrong':
    'Tab entered the tablist somewhere other than its selected tab "first"',
  'tabs.focus.entry-and-exit:violating-tab-trap':
    'Tab did not leave the tablist',
  'tabs.focus.arrow-round-trip:violating-arrow-inert':
    'pressing ArrowRight from "first" did not focus the next available tab "second"',
  'tabs.focus.arrow-round-trip:violating-arrow-one-way':
    'pressing ArrowRight moved to "second", but pressing ArrowLeft did not restore focus to "first"',
  'tabs.focus.wraps-ends:violating-two-tab-arrow-no-wrap':
    'pressing ArrowLeft outward from "first" did not wrap focus to "second"',
  'tabs.focus.wraps-ends:violating-arrow-no-wrap':
    'neither ArrowLeft nor ArrowRight wrapped focus from the first tab "first" to the last tab "third"',
  'tabs.focus.wraps-ends:violating-rtl-arrow-no-wrap':
    'neither ArrowLeft nor ArrowRight wrapped focus from the first tab "first" to the last tab "third"',
  'tabs.focus.rtl-arrow-round-trip:violating-rtl-physical-arrows':
    'pressing ArrowLeft from "first" did not focus the next available tab "second"',
  'tabs.focus.skips-unavailable:violating-arrow-does-not-skip':
    'pressing ArrowRight from "first" did not focus the next available tab "third"',
  'tabs.selection.manual-arrows-preserve-state:violating-arrow-changes-selection':
    'expected exactly "first" selected, but the browser exposes "second"',
  'tabs.selection.enter-round-trip:violating-keyboard-inert':
    'expected exactly "second" selected, but the browser exposes "first"',
  'tabs.selection.enter-round-trip:violating-keyboard-one-way':
    'expected exactly "first" selected, but the browser exposes "second"',
  'tabs.selection.space-round-trip:violating-keyboard-inert':
    'expected exactly "second" selected, but the browser exposes "first"',
  'tabs.selection.space-round-trip:violating-keyboard-one-way':
    'expected exactly "first" selected, but the browser exposes "second"',
  'tabs.selection.pointer-round-trip:violating-pointer-inert':
    'expected exactly "second" selected, but the browser exposes "first"',
  'tabs.selection.pointer-round-trip:violating-pointer-one-way':
    'expected exactly "first" selected, but the browser exposes "second"',
  'tabs.tab.survives-aborted-press:violating-pointer-down':
    'pressing the tab and releasing away from it still changed the selected state',
};

export function expectedTabsMutationFailure(
  expectation: string,
  fixture: string,
): string {
  const failure = EXPECTED_MUTATION_FAILURES[`${expectation}:${fixture}`];
  if (failure == null) {
    throw new Error(
      `no expected Tabs mutation failure for ${expectation}:${fixture}`,
    );
  }
  return failure;
}

export function tabsFixture(id: string): TabsFixture {
  const fixture = TABS_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Tabs fixture "${id}"`);
  }
  return fixture;
}
