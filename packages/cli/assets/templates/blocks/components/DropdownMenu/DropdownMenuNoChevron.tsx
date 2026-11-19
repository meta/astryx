// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {MoreHorizontalIcon} from '@astryxdesign/template-icons';

export default function DropdownMenuNoChevron() {
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <VStack gap={3}>
      <DropdownMenu
        button={{
          label: 'More actions',
          icon: <Icon icon={MoreHorizontalIcon} />,
          variant: 'ghost',
          isIconOnly: true,
        }}
        hasChevron={false}
        items={[
          {label: 'Copy link', onClick: () => setLastAction('Copy link')},
          {label: 'Download', onClick: () => setLastAction('Download')},
          {label: 'Print', onClick: () => setLastAction('Print')},
          {type: 'divider'},
          {label: 'Report', onClick: () => setLastAction('Report')},
        ]}
      />
      {lastAction && (
        <Text type="supporting" color="secondary">
          Last action: {lastAction}
        </Text>
      )}
    </VStack>
  );
}
