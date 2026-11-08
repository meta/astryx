// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {useListFocus, useTypeahead} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const COUNTRIES = [
  'Belgium',
  'Brazil',
  'Bulgaria',
  'Canada',
  'Chile',
  'Denmark',
  'Éire',
  'Finland',
];

export default function UseTypeaheadHookUsage() {
  const [country, setCountry] = useState<string | null>(null);
  const {listRef, handleKeyDown, handleFocus, focusItem, getItems} =
    useListFocus({itemSelector: 'button', hasRovingTabIndex: true});
  const typeahead = useTypeahead({
    getItemLabels: () => getItems().map(item => item.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getItems().findIndex(item => item === document.activeElement),
  });

  return (
    <VStack gap={3} hAlign="start">
      <VStack
        ref={listRef}
        role="group"
        aria-label="Country"
        hAlign="start"
        onFocus={handleFocus}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            typeahead.reset();
          }
        }}
        onKeyDown={event => {
          if (typeahead.onKeyDown(event)) {
            event.preventDefault();
          } else {
            handleKeyDown(event);
          }
        }}>
        {COUNTRIES.map(name => (
          <Button
            key={name}
            label={name}
            variant="ghost"
            aria-pressed={country === name}
            onClick={() => setCountry(name)}
          />
        ))}
      </VStack>
      <Text type="supporting">Selected: {country ?? 'none'}</Text>
    </VStack>
  );
}
