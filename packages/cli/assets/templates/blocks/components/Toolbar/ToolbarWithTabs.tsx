// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type CSSProperties} from 'react';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {useToast} from '@astryxdesign/core/Toast';
import {PlusIcon} from '@heroicons/react/24/outline';

const card: CSSProperties = {
  width: '100%',
  maxWidth: 500,
  height: '100%',
  marginTop: 200,
};

export default function ToolbarWithTabs() {
  const showToast = useToast();
  const [tab, setTab] = useState('overview');
  return (
    <Card style={card}>
      <Toolbar
        label="Section navigation"
        dividers={['bottom']}
        startContent={
          <TabList value={tab} onChange={setTab}>
            <Tab value="overview" label="Overview" />
            <Tab value="analytics" label="Analytics" />
            <Tab value="settings" label="Settings" />
          </TabList>
        }
        endContent={
          <Button
            label="New item"
            icon={<Icon icon={PlusIcon} />}
            isIconOnly
            onClick={() =>
              showToast({body: 'Demo: a new item would be created here'})
            }
          />
        }
      />
      <Section />
    </Card>
  );
}
