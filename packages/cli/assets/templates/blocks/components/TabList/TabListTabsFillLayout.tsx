// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TabList, Tab} from '@astryxdesign/core/TabList';

export default function TabListTabsFillLayout() {
  const [value, setValue] = useState('home');
  return (
    <div style={{width: 500, maxWidth: '100%'}}>
      <TabList value={value} onChange={setValue} layout="fill" hasDivider>
        <Tab value="home" label="Home" />
        <Tab value="projects" label="Projects" />
        <Tab value="settings" label="Settings" />
      </TabList>
    </div>
  );
}
