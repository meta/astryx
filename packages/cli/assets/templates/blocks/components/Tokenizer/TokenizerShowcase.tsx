// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';

const tags: SearchableItem[] = [
  {id: '1', label: 'Design'},
  {id: '2', label: 'Engineering'},
  {id: '3', label: 'Marketing'},
  {id: '4', label: 'Product'},
  {id: '5', label: 'Research'},
  {id: '6', label: 'Sales'},
];

const source: SearchSource = {
  search: (query: string) =>
    tags.filter(tag => tag.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => tags,
};

export default function TokenizerShowcase() {
  const [value, setValue] = useState<SearchableItem[]>([tags[0], tags[1]]);
  return (
    <div style={{display: 'grid', gridTemplateColumns: 'minmax(0, 400px)'}}>
      <Tokenizer
        label="Tags"
        placeholder="Search..."
        searchSource={source}
        value={value}
        onChange={setValue}
      />
    </div>
  );
}
