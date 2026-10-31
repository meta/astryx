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
  {id: '6', label: 'Frank Miller'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

export default function TokenizerOverflow() {
  const [inlineValue, setInlineValue] = useState<SearchableItem[]>(users);
  const [layerValue, setLayerValue] = useState<SearchableItem[]>(users);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
      <Stack direction="vertical" gap={4}>
        <Stack direction="vertical" gap={1}>
          <Text type="supporting" color="secondary">
            Inline overflow — content shifts down on expand
          </Text>
          <Tokenizer
            label="Inline Overflow"
            placeholder="Add more..."
            searchSource={userSource}
            value={inlineValue}
            onChange={items => setInlineValue(items)}
            tokenOverflowBehavior="unfocusedInline"
          />
        </Stack>
        <Stack direction="vertical" gap={1}>
          <Text type="supporting" color="secondary">
            Layer overflow — expands as overlay, no layout shift
          </Text>
          <Tokenizer
            label="Layer Overflow"
            placeholder="Add more..."
            searchSource={userSource}
            value={layerValue}
            onChange={items => setLayerValue(items)}
            tokenOverflowBehavior="unfocusedLayer"
          />
        </Stack>
      </Stack>
    </div>
  );
}
