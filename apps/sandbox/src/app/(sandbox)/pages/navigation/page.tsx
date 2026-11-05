// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';

import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  container: {
    maxWidth: 960,
  },
  navWrapper: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
});

type Alignment = 'start' | 'center' | 'end';

/**
 * Navigation exploration page.
 *
 * Demonstrates TopNav with nav items aligned to start (left),
 * center, or end (right) using the slot-based API.
 */
export default function NavigationPage() {
  const [alignment, setAlignment] = useState<Alignment>('start');

  return (
    <div {...stylex.props(styles.container)}>
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Navigation Alignment</Heading>
          <Text type="body" color="secondary">
            Explore how nav items can be positioned left, center, or right using
            TopNav&apos;s slot-based API.
          </Text>
        </VStack>

        {/* Alignment picker */}
        <HStack gap={3} vAlign="center">
          <Text type="body" weight="bold">
            Alignment:
          </Text>
          <Button
            label="Left"
            variant={alignment === 'start' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setAlignment('start')}
          />
          <Button
            label="Center"
            variant={alignment === 'center' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setAlignment('center')}
          />
          <Button
            label="Right"
            variant={alignment === 'end' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setAlignment('end')}
          />
        </HStack>

        <Divider />

        {/* Live preview */}
        <VStack gap={3}>
          <Heading level={2}>Preview</Heading>
          <div {...stylex.props(styles.navWrapper)}>
            <NavPreview alignment={alignment} />
          </div>
        </VStack>

        <Divider />

        {/* All three side by side */}
        <VStack gap={4}>
          <Heading level={2}>All Alignments</Heading>

          <VStack gap={2}>
            <Text type="supporting" weight="bold">
              Left-aligned (startContent)
            </Text>
            <div {...stylex.props(styles.navWrapper)}>
              <NavPreview alignment="start" />
            </div>
          </VStack>

          <VStack gap={2}>
            <Text type="supporting" weight="bold">
              Center-aligned (centerContent)
            </Text>
            <div {...stylex.props(styles.navWrapper)}>
              <NavPreview alignment="center" />
            </div>
          </VStack>

          <VStack gap={2}>
            <Text type="supporting" weight="bold">
              Right-aligned (endContent)
            </Text>
            <div {...stylex.props(styles.navWrapper)}>
              <NavPreview alignment="end" />
            </div>
          </VStack>
        </VStack>
      </VStack>
    </div>
  );
}

const navItems = (
  <>
    <TopNavItem label="Home" href="#" isSelected />
    <TopNavItem label="Products" href="#" />
    <TopNavItem label="About" href="#" />
  </>
);

function NavPreview({alignment}: {alignment: Alignment}) {
  return (
    <TopNav
      label={`${alignment}-aligned navigation`}
      heading={<TopNavHeading heading="My App" />}
      startContent={alignment === 'start' ? navItems : undefined}
      centerContent={alignment === 'center' ? navItems : undefined}
      endContent={alignment === 'end' ? navItems : undefined}
    />
  );
}
