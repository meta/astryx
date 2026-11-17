// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {Heading} from '@astryxdesign/core/Text';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {VStack} from '@astryxdesign/core/VStack';

const PANELS = {
  overview: 'Overview',
  activity: 'Recent activity',
  settings: 'Account settings',
} as const;
type PanelKey = keyof typeof PANELS;

export default function App() {
  const [tab, setTab] = useState<PanelKey>('overview');
  return (
    <VStack gap={4} padding={6}>
      <Heading level={1}>Ada Lovelace</Heading>
      <TabList
        role="tablist"
        value={tab}
        onChange={value => setTab(value as PanelKey)}>
        <Tab value="overview" label="Overview" panelId="panel-overview" />
        <Tab value="activity" label="Activity" panelId="panel-activity" />
        <Tab value="settings" label="Settings" panelId="panel-settings" />
      </TabList>
      <div role="tabpanel" id={`panel-${tab}`}>
        <Heading level={2}>{PANELS[tab]}</Heading>
      </div>
    </VStack>
  );
}
