// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {usePopover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function PopoverHookUsage() {
  const showToast = useToast();
  const popover = usePopover({dialogLabel: 'Quick actions'});

  return (
    <Center height={240}>
      <Button
        label="Open actions"
        ref={popover.triggerRef}
        onClick={popover.toggle}
        {...popover.triggerProps}
      />
      {popover.render(
        <Card width={220} padding={3} variant="transparent">
          <VStack gap={2}>
            <Text type="body" weight="bold">
              Quick actions
            </Text>
            <Button
              onClick={() =>
                showToast({body: 'Demo: a new task form would open here'})
              }
              label="Create task"
              size="sm"
            />
            <Button
              onClick={() =>
                showToast({body: 'Demo: share options would open here'})
              }
              label="Share report"
              variant="secondary"
              size="sm"
            />
          </VStack>
        </Card>,
        {placement: 'below', alignment: 'center'},
      )}
    </Center>
  );
}
