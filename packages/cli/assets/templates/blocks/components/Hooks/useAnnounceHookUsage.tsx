// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, useState} from 'react';
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

function filterProducts(query: string): string[] {
  const needle = query.trim().toLowerCase();
  return PRODUCTS.filter(product => product.toLowerCase().includes(needle));
}

export default function UseAnnounceHookUsage() {
  const announce = useAnnounce({hasReplace: true});
  const [query, setQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matches = filterProducts(query);
  const count = matches.length;

  const handleChange = (value: string) => {
    setQuery(value);
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value === '') {
      return;
    }
    const nextCount = filterProducts(value).length;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      announce(
        nextCount === 0
          ? 'No results'
          : `${nextCount} ${nextCount === 1 ? 'result' : 'results'}`,
      );
    }, ANNOUNCE_DELAY_MS);
  };

  // A count still pending at unmount would be spoken for a filter that is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <TextInput
          label="Filter products"
          value={query}
          onChange={handleChange}
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
