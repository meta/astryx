// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {
  InternationalizationProvider,
  useCollator,
} from '@astryxdesign/core/i18n';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';

type Locale = 'en' | 'sv-SE';

const PEOPLE = ['Zoë', 'emma', 'Örjan', 'Ana', 'Émile', 'oscar', 'Åsa'];

function PeopleList() {
  const collator = useCollator();
  const sorted = [...PEOPLE].sort(collator.compare);

  return (
    <List density="compact" hasDividers>
      {sorted.map(name => (
        <ListItem key={name} label={name} />
      ))}
    </List>
  );
}

export default function UseCollatorHookUsage() {
  const [locale, setLocale] = useState<Locale>('en');

  return (
    <InternationalizationProvider locale={locale}>
      <Card width={320} padding={4}>
        <VStack gap={3}>
          <SegmentedControl
            label="Sort order"
            value={locale}
            onChange={nextLocale => setLocale(nextLocale as Locale)}
            size="sm">
            <SegmentedControlItem value="en" label="English" />
            <SegmentedControlItem value="sv-SE" label="Swedish" />
          </SegmentedControl>
          <PeopleList />
        </VStack>
      </Card>
    </InternationalizationProvider>
  );
}
