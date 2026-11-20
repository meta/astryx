// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function BannerCollapsibleContent() {
  const showToast = useToast();
  return (
    <Banner
      status="warning"
      title="Configuration changes detected"
      description="Review the changes before they take effect."
      endContent={
        <Button
          label="Review"
          variant="secondary"
          size="sm"
          onClick={() =>
            showToast({
              body: 'Demo: the changed settings would open for review here',
            })
          }
        />
      }
      isDismissable
      collapsible={{defaultIsOpen: true}}>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Changed settings:
        </Text>
        <List density="compact">
          <ListItem label="Authentication method updated" />
          <ListItem label="Rate limits modified" />
        </List>
      </Stack>
    </Banner>
  );
}
