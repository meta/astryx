// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {InputGroup} from '@astryxdesign/core/InputGroup';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function InputGroupSearchAction() {
  const [query, setQuery] = useState('');
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  const search = () => setSearchedFor(query.trim());

  return (
    <VStack gap={2}>
      <InputGroup
        label="Search orders"
        description="Order number, customer name, or email">
        <TextInput
          label="Query"
          isLabelHidden
          value={query}
          onChange={setQuery}
          onEnter={search}
          placeholder="Search"
        />
        <Button label="Search" variant="primary" onClick={search} />
      </InputGroup>
      <Text type="supporting" color="secondary" role="status">
        {searchedFor == null
          ? ''
          : searchedFor === ''
            ? 'Showing all orders'
            : `Showing orders that match “${searchedFor}”`}
      </Text>
    </VStack>
  );
}
