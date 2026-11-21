// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Stack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

export default function ClickableCardWithNestedButton() {
  const showToast = useToast();
  return (
    <ClickableCard label="Product" href="#" width={320}>
      <Stack direction="vertical" gap={3}>
        <Stack direction="vertical" gap={1}>
          <Heading level={4}>Wireless Headphones</Heading>
          <Text type="body" color="secondary">
            $79.99
          </Text>
        </Stack>
        <Button
          label="Add to cart"
          onClick={() =>
            showToast({
              body: 'Demo: Wireless Headphones would be added to your cart here',
            })
          }
          variant="primary"
        />
      </Stack>
    </ClickableCard>
  );
}
