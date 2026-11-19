// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {useToast} from '@astryxdesign/core/Toast';

const steps = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5'];

export default function OverflowListCollapseFromStartList() {
  const showToast = useToast();
  return (
    <Center width={300}>
      <Card padding={2}>
        <OverflowList
          gap={2}
          collapseFrom="start"
          overflowRenderer={overflowItems => (
            <Button
              label={`+${overflowItems.length} more`}
              variant="ghost"
              size="sm"
              onClick={() =>
                showToast({
                  body: `Demo: the ${overflowItems.length} hidden ${overflowItems.length === 1 ? 'step' : 'steps'} would show here`,
                })
              }
            />
          )}>
          {steps.map(step => (
            <Button
              key={step}
              label={step}
              size="sm"
              onClick={() => showToast({body: `Demo: ${step} would open here`})}
            />
          ))}
        </OverflowList>
      </Card>
    </Center>
  );
}
