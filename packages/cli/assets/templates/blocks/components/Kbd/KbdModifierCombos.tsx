// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Kbd} from '@astryxdesign/core/Kbd';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

export default function KbdModifierCombos() {
  return (
    <VStack gap={3}>
      <HStack gap={4}>
        <Kbd keys="mod+k" />
        <Kbd keys="shift+enter" />
        <Kbd keys="ctrl+c" />
        <Kbd keys="alt+tab" />
      </HStack>
      <HStack gap={4}>
        <Kbd keys="mod+shift+z" />
        <Kbd keys="ctrl+alt+delete" />
        <Kbd keys="mod+shift+p" />
      </HStack>
      <HStack gap={4}>
        <Text type="body">Special keys and aliases:</Text>
        <Kbd keys="escape" />
        <Kbd keys="esc" />
        <Kbd keys="enter" />
        <Kbd keys="return" />
        <Kbd keys="backspace" />
        <Kbd keys="tab" />
        <Kbd keys="space" />
      </HStack>
    </VStack>
  );
}
