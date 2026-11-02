// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

const PRODUCTS = [
  'Desk lamp',
  'Desk organizer',
  'Standing desk',
  'Office chair',
  'Chair mat',
  'Monitor arm',
  'Monitor stand',
  'Keyboard tray',
];

const ANNOUNCE_DELAY_MS = 500;

export default function UseAnnounceHookUsage() {
  const announce = useAnnounce({hasReplace: true});
  const [query, setQuery] = useState('');
  const matches = PRODUCTS.filter(product =>
    product.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const count = matches.length;

  useEffect(() => {
    if (query === '') {
      return;
    }
    const timer = setTimeout(() => {
      announce(
        count === 0
          ? 'No results'
          : `${count} ${count === 1 ? 'result' : 'results'}`,
      );
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [announce, count, query]);

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <TextInput
          label="Filter products"
          value={query}
          onChange={setQuery}
          hasClear
        />
        {count === 0 ? (
          <Text type="body" color="secondary">
            No results
          </Text>
        ) : (
          <List density="compact">
            {matches.map(product => (
              <ListItem key={product} label={product} />
            ))}
          </List>
        )}
      </VStack>
    </Card>
  );
}
