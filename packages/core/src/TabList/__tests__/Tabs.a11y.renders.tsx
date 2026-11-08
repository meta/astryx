// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tabs.a11y.renders.tsx
 * @input Uses TabList, Tab, React state, and the checked Tabs state inventory
 * @output Consumer-realistic explicit Tabs render functions shared by jsdom and Storybook
 * @position Binding fixture layer; navigation, callbacks, styling, and TabMenu stay local.
 */

import {useState, type ReactElement} from 'react';
import {Tab, TabList} from '../index';
import type {TabsStateId} from './Tabs.a11y.states';

function TabsFixture({
  direction = 'ltr',
  disabledActivity = false,
  hiddenSelectedLabel = false,
}: {
  direction?: 'ltr' | 'rtl';
  disabledActivity?: boolean;
  hiddenSelectedLabel?: boolean;
}) {
  const [value, setValue] = useState('overview');
  const panels = {
    overview: 'Everything at a glance.',
    activity: 'What happened recently.',
    members: 'Who has access.',
  } as const;

  return (
    <div dir={direction}>
      <button type="button">Before tabs</button>
      <TabList
        value={value}
        onChange={setValue}
        role="tablist"
        aria-label="Project views">
        <Tab
          value="overview"
          label="Overview"
          id="tabs-a11y-tab-overview"
          panelId="tabs-a11y-panel-overview"
          isLabelHidden={hiddenSelectedLabel}
          icon={
            hiddenSelectedLabel ? <span aria-hidden="true">▣</span> : undefined
          }
        />
        <Tab
          value="activity"
          label="Activity"
          id="tabs-a11y-tab-activity"
          panelId="tabs-a11y-panel-activity"
          aria-disabled={disabledActivity || undefined}
        />
        <Tab
          value="members"
          label="Members"
          id="tabs-a11y-tab-members"
          panelId="tabs-a11y-panel-members"
        />
      </TabList>
      {Object.entries(panels).map(([key, content]) => (
        <div
          key={key}
          id={`tabs-a11y-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`tabs-a11y-tab-${key}`}
          tabIndex={0}
          hidden={value !== key}>
          {content}
        </div>
      ))}
      <button type="button">After tabs</button>
    </div>
  );
}

export type TabsStateRender = () => ReactElement;

export const TABS_STATE_RENDERS: Record<TabsStateId, TabsStateRender> = {
  'tab-list-selected-ltr': () => <TabsFixture />,
  'tab-list-selected-rtl': () => <TabsFixture direction="rtl" />,
  'tab-list-disabled-skip': () => <TabsFixture disabledActivity />,
  'tab-selected-visible-label': () => <TabsFixture />,
  'tab-unselected-visible-label': () => <TabsFixture />,
  'tab-disabled-unselected': () => <TabsFixture disabledActivity />,
  'tab-selected-hidden-label': () => <TabsFixture hiddenSelectedLabel />,
  'tabpanel-active': () => <TabsFixture />,
  'tabpanel-inactive': () => <TabsFixture />,
};
