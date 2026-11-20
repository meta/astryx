// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Stack} from '@astryxdesign/core/Layout';
import {SearchIcon} from '@astryxdesign/template-icons';

export default function TextInputSearch() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('design systems');

  return (
    <div style={{width: 300}}>
      <Stack direction="vertical" gap={3}>
        <TextInput
          label="Search field"
          value={query}
          onChange={setQuery}
          placeholder="Search projects…"
          startIcon={SearchIcon}
          hasClear
        />
        <TextInput
          label="Search field with value"
          value={filter}
          onChange={setFilter}
          placeholder="Filter…"
          startIcon={SearchIcon}
          hasClear
        />
      </Stack>
    </div>
  );
}
