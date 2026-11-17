// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {Stack} from '@astryxdesign/core/Layout';
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

export default function TokenizerStates() {
  const [errorValue, setErrorValue] = useState<SearchableItem[]>([]);
  const [warningValue, setWarningValue] = useState<SearchableItem[]>([
    users[0],
  ]);
  const [successValue, setSuccessValue] = useState<SearchableItem[]>([
    users[1],
    users[3],
  ]);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
      <Stack direction="vertical" gap={4}>
        <Tokenizer
          label="Disabled field"
          searchSource={userSource}
          value={[users[0], users[2]]}
          onChange={() => {}}
          isDisabled
        />
        <Tokenizer
          label="Error message"
          placeholder="Search people..."
          searchSource={userSource}
          value={errorValue}
          onChange={items => setErrorValue(items)}
          isRequired
          status={{type: 'error', message: 'At least one reviewer is required'}}
        />
        <Tokenizer
          label="Warning message"
          placeholder="Search people..."
          searchSource={userSource}
          value={warningValue}
          onChange={items => setWarningValue(items)}
          status={{
            type: 'warning',
            message: 'Consider adding at least 2 approvers',
          }}
        />
        <Tokenizer
          label="Success message"
          placeholder="Search people..."
          searchSource={userSource}
          value={successValue}
          onChange={items => setSuccessValue(items)}
          status={{type: 'success', message: 'All required reviewers added'}}
        />
      </Stack>
    </div>
  );
}
