// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack, HStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Grid} from '@astryxdesign/core/Grid';
import {Divider} from '@astryxdesign/core/Divider';

// Image fill is a plain inline style so it renders without any CSS compiler
// (works in the playground preview's runtime TS compile too).
const imageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
};

const imageClip = {
  borderRadius: 'var(--radius-element)',
};

// ─── Image Data ─────────────────────────────────────────────────────────────

const IMAGES = [
  {
    src: '/template-assets/colorful-lifestyle-vertical-3.png',
    alt: 'Colorful lifestyle scene',
  },
  {
    src: '/template-assets/colorful-lifestyle-horizontal-1.png',
    alt: 'Colorful lifestyle horizontal',
  },
  {
    src: '/template-assets/colorful-lifestyle-vertical-1.png',
    alt: 'Colorful lifestyle vertical',
  },
  {
    src: '/template-assets/colorful-home-vertical-2.png',
    alt: 'Colorful home interior',
  },
  {
    src: '/template-assets/colorful-home-vertical-3.png',
    alt: 'Colorful home scene',
  },
  {
    src: '/template-assets/colorful-home-vertical-1.png',
    alt: 'Colorful home vertical',
  },
  {
    src: '/template-assets/colorful-lifestyle-horizontal-2.png',
    alt: 'Colorful lifestyle wide',
  },
  {
    src: '/template-assets/colorful-lifestyle-vertical-2.png',
    alt: 'Colorful lifestyle detail',
  },
  {
    src: '/template-assets/colorful-lifestyle-vertical-4.png',
    alt: 'Colorful lifestyle portrait',
  },
];

// ─── Stat Block ─────────────────────────────────────────────────────────────

function StatBlock({value, label}: {value: string; label: string}) {
  return (
    <VStack gap={0}>
      <Text type="large" weight="bold">
        {value}
      </Text>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </VStack>
  );
}

// ─── Image Grid ─────────────────────────────────────────────────────────────

function ImageGrid() {
  return (
    <Grid columns={3} gap={3}>
      {IMAGES.map(img => (
        <AspectRatio key={img.src} ratio={1} style={imageClip}>
          <img src={img.src} alt={img.alt} style={imageStyle} />
        </AspectRatio>
      ))}
    </Grid>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SideGalleryTemplate() {
  return (
    <Layout
      height="fill"
      contentWidth={1400}
      content={
        <LayoutContent padding={6}>
          <Grid columns={{minWidth: 360, repeat: 'fit'}} gap={8} align="center">
            {/* Left side: Text + CTA */}
            <VStack gap={6} vAlign="center">
              <VStack gap={3}>
                <Text type="supporting" color="secondary" weight="semibold">
                  COLORFUL
                </Text>
                <Heading level={1}>
                  Make every day a little more delightful, one small detail at a
                  time.
                </Heading>
                <Text type="body" color="secondary">
                  The smallest details are the ones that matter most. A little
                  color that catches your eye and makes you pause; that&apos;s
                  what turns an ordinary day into something worth remembering.
                </Text>
              </VStack>

              <HStack gap={3} vAlign="center">
                <Button label="Explore" variant="primary" />
              </HStack>

              <VStack gap={4}>
                <Divider />
                <HStack gap={6}>
                  <StatBlock value="12k+" label="Photos" />
                  <StatBlock value="350+" label="Projects" />
                  <StatBlock value="8yrs" label="Experience" />
                </HStack>
              </VStack>
            </VStack>

            {/* Right side: Image Grid */}
            <ImageGrid />
          </Grid>
        </LayoutContent>
      }
    />
  );
}
