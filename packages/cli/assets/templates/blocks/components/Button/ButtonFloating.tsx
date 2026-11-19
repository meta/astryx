// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {AddIcon} from '@astryxdesign/template-icons';

const VARIANTS = [
  {variant: 'primary' as const, label: 'Primary'},
  {variant: 'secondary' as const, label: 'Secondary'},
  {variant: 'ghost' as const, label: 'Ghost'},
  {variant: 'destructive' as const, label: 'Destructive'},
];

export default function ButtonFloating() {
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Floating action buttons — raised above content with `elevation="med"`
      </Text>
      <Stack direction="horizontal" gap={3} vAlign="center">
        {VARIANTS.map(({variant, label}) => (
          <Button
            key={variant}
            label={label}
            variant={variant}
            icon={<Icon icon={AddIcon} />}
            elevation="med"
          />
        ))}
      </Stack>
    </Stack>
  );
}
