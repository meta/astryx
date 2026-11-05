// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PageFrame.tsx
 * @input Section metadata
 * @output The heading block every lab page opens with
 * @position Motion Lab shared UI
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Section} from '@astryxdesign/core/Section';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const sx = stylex.create({
  intro: {maxWidth: '78ch'},
});

export function LabPage({
  title,
  intro,
  decides,
  badges,
  children,
}: {
  title: string;
  intro: string;
  decides?: string;
  badges?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Section padding={6} width="100%">
      <VStack gap={5}>
        <VStack gap={2} {...stylex.props(sx.intro)}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={1}>{title}</Heading>
            {badges}
          </HStack>
          <Text color="secondary">{intro}</Text>
          {decides != null && (
            <Text type="supporting" color="secondary">
              <strong>Decide here: </strong>
              {decides}
            </Text>
          )}
        </VStack>
        {children}
      </VStack>
    </Section>
  );
}
