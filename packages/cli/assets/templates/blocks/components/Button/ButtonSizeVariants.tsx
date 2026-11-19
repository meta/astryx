// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

const SIZES = [
  {size: 'sm' as const, label: 'Small'},
  {size: 'md' as const, label: 'Medium'},
  {size: 'lg' as const, label: 'Large'},
];

export default function ButtonSizeVariants() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4}>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Primary
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          {SIZES.map(({size, label}) => (
            <Button
              key={size}
              label={label}
              variant="primary"
              size={size}
              onClick={() =>
                showToast({
                  body: `Demo: the ${label.toLowerCase()} button’s action would run here`,
                })
              }
            />
          ))}
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={1}>
        <Text type="supporting" color="secondary">
          Secondary
        </Text>
        <Stack direction="horizontal" gap={3} vAlign="center">
          {SIZES.map(({size, label}) => (
            <Button
              key={size}
              label={label}
              variant="secondary"
              size={size}
              onClick={() =>
                showToast({
                  body: `Demo: the ${label.toLowerCase()} button’s action would run here`,
                })
              }
            />
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}
