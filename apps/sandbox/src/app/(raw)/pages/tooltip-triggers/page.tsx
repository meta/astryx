// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @output A bare page of tooltip triggers: truncated Text and Heading, icon
 *   buttons and buttons with tooltips, and links with tooltips in a paragraph,
 *   above rows that make the document scroll
 * @position A raw page, with no sandbox chrome, for checking tooltip triggers
 *   on a phone: a tap, a long press and a scroll that starts on a trigger.
 */

import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';

const PAGE_ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

export default function TooltipTriggersPage() {
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Tooltip triggers</Heading>
        <Text color="secondary">
          Tap, long-press and scroll from each trigger below.
        </Text>
      </VStack>
      <VStack gap={2}>
        <Heading level={2} maxLines={1}>
          A heading far too long for one line on a phone, so it is truncated
        </Heading>
        <Text maxLines={2}>
          A description far too long for two lines on a phone. It keeps going so
          that the second line ends in an ellipsis and the full text is only in
          its tooltip, which a tap shows.
        </Text>
      </VStack>
      <HStack gap={2}>
        <IconButton
          label="Search"
          icon={<Icon icon="search" />}
          variant="ghost"
          tooltip="Search the page"
        />
        <IconButton
          label="Copy"
          icon={<Icon icon="copy" />}
          variant="ghost"
          tooltip="Copy the link"
        />
        <IconButton
          label="Close"
          icon={<Icon icon="close" />}
          variant="ghost"
          tooltip="Close"
        />
        <Button label="Save" variant="primary" tooltip="Save your changes" />
      </HStack>
      <Text>
        Read the{' '}
        <Link href="#guide" tooltip="Open the setup guide">
          setup guide
        </Link>{' '}
        or the{' '}
        <Link href="#faq" tooltip="Open the frequently asked questions">
          FAQ
        </Link>{' '}
        before you start.
      </Text>
      <VStack gap={2}>
        {PAGE_ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}
