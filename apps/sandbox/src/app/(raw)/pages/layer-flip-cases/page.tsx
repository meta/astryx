// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A bare page with a Popover, a DropdownMenu and a Tooltip. Each one
 *   sits against the viewport edge on the side it asks for, so it flips
 * @position A raw page, with no sandbox chrome, for checking how a flipped
 *   layer enters. The page scrolls with the document, as an app's page does.
 */

import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const MENU_ITEMS = [{label: 'Edit'}, {label: 'Duplicate'}, {label: 'Delete'}];

export default function LayerFlipCasesPage() {
  return (
    <VStack minHeight="100dvh" justify="between" padding={2} gap={4}>
      <HStack gap={3} align="center">
        <Popover
          placement="above"
          label="Settings"
          width={280}
          content={<Text>This Popover asked for the top.</Text>}>
          <Button label="Popover">Popover</Button>
        </Popover>
        <Text>Popover: asks for the top, where there is no room.</Text>
      </HStack>
      <HStack gap={3} align="center" justify="end">
        <Text>Tooltip: asks for the right, where there is no room.</Text>
        <Tooltip placement="end" content="This Tooltip asked for the right">
          <Button label="Tooltip">Tooltip</Button>
        </Tooltip>
      </HStack>
      <HStack gap={3} align="center">
        <DropdownMenu button={{label: 'DropdownMenu'}} items={MENU_ITEMS} />
        <Text>DropdownMenu: asks for the bottom, where there is no room.</Text>
      </HStack>
    </VStack>
  );
}
