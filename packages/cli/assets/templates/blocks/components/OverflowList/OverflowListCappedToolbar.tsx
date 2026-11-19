// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';

const actions = ['Save', 'Edit', 'Duplicate', 'Share', 'Archive', 'Delete'];

export default function OverflowListCappedToolbar() {
  return (
    <Center width={420} maxWidth="100%">
      <Card padding={2}>
        <OverflowList
          gap={2}
          maxVisibleItems={3}
          overflowRenderer={overflowItems => (
            <DropdownMenu
              button={{
                label: `+${overflowItems.length}`,
                variant: 'ghost',
                size: 'sm',
              }}
              items={overflowItems.map(({index}) => ({
                label: actions[index],
              }))}
            />
          )}>
          {actions.map(action => (
            <Button key={action} label={action} size="sm" />
          ))}
        </OverflowList>
      </Card>
    </Center>
  );
}
