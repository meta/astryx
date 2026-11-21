// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  VerifiedIcon,
  AlertIcon,
  BlockIcon,
} from '@astryxdesign/template-icons/24/solid';
import {useIcon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';

const statusIconTheme = defineTheme({
  name: 'status-icons-docs',
  icons: {
    success: <VerifiedIcon width="1em" height="1em" />,
    warning: <AlertIcon width="1em" height="1em" />,
    error: <BlockIcon width="1em" height="1em" />,
  },
});

function StatusRow() {
  const success = useIcon('success');
  const warning = useIcon('warning');
  const error = useIcon('error');

  return (
    <HStack gap={4}>
      <HStack gap={1} vAlign="center">
        {success}
        <Text type="body">Passed</Text>
      </HStack>
      <HStack gap={1} vAlign="center">
        {warning}
        <Text type="body">Flaky</Text>
      </HStack>
      <HStack gap={1} vAlign="center">
        {error}
        <Text type="body">Failed</Text>
      </HStack>
    </HStack>
  );
}

export default function UseIconHookUsage() {
  const {mode} = useTheme();

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          Current theme
        </Text>
        <StatusRow />
      </VStack>
      <Theme theme={statusIconTheme} mode={mode}>
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            Theme with its own status icons
          </Text>
          <StatusRow />
        </VStack>
      </Theme>
    </VStack>
  );
}
