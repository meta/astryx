// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Token} from '@astryxdesign/core/Token';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  StarIcon,
  TagIcon,
  UserIcon,
  ShieldIcon,
} from '@astryxdesign/template-icons';

export default function TokenIcon() {
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Icons identify the token category
      </Text>
      <Stack direction="horizontal" gap={2} wrap="wrap">
        <Token
          label="Sarah Chen"
          color="blue"
          icon={<Icon icon={UserIcon} size="sm" color="inherit" />}
        />
        <Token
          label="Featured"
          color="yellow"
          icon={<Icon icon={StarIcon} size="sm" color="inherit" />}
        />
        <Token
          label="Design"
          color="purple"
          icon={<Icon icon={TagIcon} size="sm" color="inherit" />}
        />
        <Token
          label="Verified"
          color="green"
          icon={<Icon icon={ShieldIcon} size="sm" color="inherit" />}
        />
      </Stack>
    </Stack>
  );
}
