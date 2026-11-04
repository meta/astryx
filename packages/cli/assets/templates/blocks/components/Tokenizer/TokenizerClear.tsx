// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';

const users: SearchableItem[] = [
  {id: '1', label: 'Alice Johnson'},
  {id: '2', label: 'Bob Smith'},
  {id: '3', label: 'Charlie Brown'},
  {id: '4', label: 'Diana Prince'},
  {id: '5', label: 'Eve Williams'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

export default function TokenizerClear() {
  const [value, setValue] = useState<SearchableItem[]>([users[0], users[1]]);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Clear-all button appears when tokens are selected
        </Text>
        <Tokenizer
          label="Team Members"
          placeholder="Search people..."
          searchSource={userSource}
          value={value}
          onChange={items => setValue(items)}
          hasClear
        />
      </Stack>
    </div>
  );
}
