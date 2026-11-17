// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {PlusIcon} from '@heroicons/react/24/outline';

const VARIANTS = [
  {variant: 'primary' as const, label: 'Primary'},
  {variant: 'secondary' as const, label: 'Secondary'},
  {variant: 'ghost' as const, label: 'Ghost'},
  {variant: 'destructive' as const, label: 'Destructive'},
];

export default function IconButtonFloating() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        FABs are usually icon-only — raise one with `elevation="high"`
      </Text>
      <Stack direction="horizontal" gap={3} vAlign="center">
        {VARIANTS.map(({variant, label}) => (
          <IconButton
            key={variant}
            label={label}
            variant={variant}
            icon={<Icon icon={PlusIcon} />}
            elevation="high"
            onClick={() =>
              showToast({
                body: `Demo: the ${label.toLowerCase()} action would run here`,
              })
            }
          />
        ))}
      </Stack>
    </Stack>
  );
}
