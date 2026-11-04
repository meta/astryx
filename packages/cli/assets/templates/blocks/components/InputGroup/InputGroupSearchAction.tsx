// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function InputGroupSearchAction() {
  const [query, setQuery] = useState('');

  return (
    <InputGroup
      label="Search orders"
      description="Order number, customer name, or email">
      <TextInput
        label="Query"
        isLabelHidden
        value={query}
        onChange={setQuery}
        placeholder="Search"
      />
      <Button label="Search" variant="primary" />
    </InputGroup>
  );
}
