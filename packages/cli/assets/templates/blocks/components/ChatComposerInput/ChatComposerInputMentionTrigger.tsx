// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  ChatComposer,
  ChatComposerInput,
  type ChatComposerTrigger,
} from '@astryxdesign/core/Chat';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {TypeaheadItem} from '@astryxdesign/core/Typeahead';
import type {SearchableItem} from '@astryxdesign/core/Typeahead';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const USERS: SearchableItem<{role: string}>[] = [
  {id: 'cindy', label: 'Cindy Zhang', auxiliaryData: {role: 'Design Systems'}},
  {id: 'alex', label: 'Alex Johnson', auxiliaryData: {role: 'Frontend'}},
  {id: 'sam', label: 'Sam Rivera', auxiliaryData: {role: 'Backend'}},
  {id: 'jordan', label: 'Jordan Lee', auxiliaryData: {role: 'Product'}},
];

const userSource = createStaticSource(USERS);

export default function ChatComposerInputMentionTrigger() {
  const [value, setValue] = useState('');

  const mentionTrigger: ChatComposerTrigger = {
    character: '@',
    searchSource: userSource,
    deserialize: serialized => {
      const user = USERS.find(user => `@${user.id}` === serialized);
      return user
        ? {value: serialized, label: user.label, variant: 'blue'}
        : null;
    },
    renderItem: item => (
      <TypeaheadItem
        item={item}
        description={(item.auxiliaryData as {role: string})?.role}
      />
    ),
    onSelect: item => ({
      value: `@${item.id}`,
      label: item.label,
      variant: 'blue' as const,
    }),
  };

  return (
    <Stack direction="vertical" gap={3} width={450} maxWidth="100%">
      <ChatComposer
        onSubmit={() => setValue('')}
        input={
          <ChatComposerInput
            value={value}
            onChange={setValue}
            triggers={[mentionTrigger]}
            placeholder="Type @ to mention someone..."
          />
        }
      />
      <Text type="supporting" color="secondary">
        Value: {JSON.stringify(value)}
      </Text>
    </Stack>
  );
}
