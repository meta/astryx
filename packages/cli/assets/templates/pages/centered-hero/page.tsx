// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {CSSProperties} from 'react';
import {VStack, HStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Section} from '@astryxdesign/core/Section';
import {rtlStyles} from '@astryxdesign/core/utils';
import {ArrowRightIcon} from '@heroicons/react/20/solid';

const IMAGE_URL = '/template-assets/light-scene-horizontal-1.png';

const heroImage: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};
const heroFrame: CSSProperties = {
  maxWidth: 1200,
  marginInline: 'auto',
  borderRadius: 'var(--radius-page)',
};

export default function CenteredHero() {
  return (
    <Layout
      content={
        <LayoutContent padding={6}>
          <VStack gap={10}>
            <VStack gap={6} hAlign="center">
              <VStack gap={3} hAlign="center">
                <Heading
                  level={1}
                  type="display-2"
                  justify="center"
                  textWrap="balance">
                  Little joys, everywhere you go
                </Heading>
                <Text
                  type="body"
                  color="secondary"
                  justify="center"
                  textWrap="balance">
                  Sometimes all it takes is one small thing to turn your whole
                  day around.
                </Text>
              </VStack>
              <HStack gap={3}>
                <Button
                  label="Get started"
                  variant="primary"
                  href="#"
                  endContent={
                    <Icon
                      icon={ArrowRightIcon}
                      size="sm"
                      color="inherit"
                      xstyle={rtlStyles.mirror}
                    />
                  }
                />
                <Button label="Learn more" variant="secondary" href="#" />
              </HStack>
            </VStack>
            <Section variant="transparent" padding={0}>
              <AspectRatio ratio={16 / 9} style={heroFrame}>
                <img
                  style={heroImage}
                  src={IMAGE_URL}
                  alt="A bright, colorful lifestyle scene"
                />
              </AspectRatio>
            </Section>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
