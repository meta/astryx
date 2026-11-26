// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A synthetic archive indexed by record number
 * @output A bounded list with exact navigation to distant records
 * @position Lab InfinityList showcase
 */
import {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {InfinityList, type InfinityListHandle} from '@astryxdesign/lab';

const COUNT = 1_000_000_000;
const getItemLabel = (index: number) => `Record ${index + 1}`;

export default function InfinityListShowcase() {
  const list = useRef<InfinityListHandle>(null);

  return (
    <VStack gap={3} maxWidth="100%" width={480}>
      <Text>Browse an archive of one billion records.</Text>
      <HStack gap={2}>
        <Button
          label="First"
          variant="secondary"
          onClick={() => list.current?.scrollToIndex(0)}
        />
        <Button
          label="Middle"
          variant="secondary"
          onClick={() => list.current?.scrollToIndex(COUNT / 2)}
        />
        <Button
          label="Last"
          variant="secondary"
          onClick={() => list.current?.scrollToIndex(COUNT - 1)}
        />
      </HStack>
      <InfinityList
        handleRef={list}
        label="Archive records"
        itemCount={COUNT}
        itemHeight={32}
        viewportHeight={320}
        getItemLabel={getItemLabel}
      />
    </VStack>
  );
}
