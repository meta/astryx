// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type CSSProperties} from 'react';
import {VStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import {Section} from '@astryxdesign/core/Section';
import {TabList, Tab} from '@astryxdesign/core/TabList';

// ─── Styles ─────────────────────────────────────────────────────────────────

const outer: CSSProperties = {
  maxWidth: 1200,
  width: '100%',
  paddingInline: 'var(--spacing-6)',
  paddingBlock: 'var(--spacing-8)',
};
const imageWrapper: CSSProperties = {
  position: 'relative',
  aspectRatio: '3/2',
  borderRadius: 'var(--radius-container)',
  overflow: 'clip',
};
const textCenter: CSSProperties = {
  textAlign: 'center',
};
const imgFill: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

// ─── Gallery Data ───────────────────────────────────────────────────────────

type Category = 'all' | 'lifestyle' | 'scene' | 'home';

interface GalleryImage {
  src: string;
  alt: string;
  category: Category;
}

const GALLERY_IMAGES: GalleryImage[] = [
  {
    src: '/template-assets/moody-scene-horizontal-1.png',
    alt: 'Moody scene landscape',
    category: 'scene',
  },
  {
    src: '/template-assets/moody-lifestyle-vertical-1.png',
    alt: 'Moody lifestyle portrait',
    category: 'lifestyle',
  },
  {
    src: '/template-assets/moody-home-vertical-1.png',
    alt: 'Moody home interior',
    category: 'home',
  },
  {
    src: '/template-assets/moody-scene-horizontal-2.png',
    alt: 'Moody scene vista',
    category: 'scene',
  },
  {
    src: '/template-assets/moody-lifestyle-vertical-2.png',
    alt: 'Moody lifestyle scene',
    category: 'lifestyle',
  },
  {
    src: '/template-assets/moody-lifestyle-horizontal-1.png',
    alt: 'Moody lifestyle horizontal',
    category: 'lifestyle',
  },
  {
    src: '/template-assets/moody-scene-vertical-1.png',
    alt: 'Moody scene vertical',
    category: 'scene',
  },
  {
    src: '/template-assets/moody-home-vertical-2.png',
    alt: 'Moody home vertical',
    category: 'home',
  },
  {
    src: '/template-assets/moody-home-horizontal-1.png',
    alt: 'Moody home horizontal',
    category: 'home',
  },
  {
    src: '/template-assets/moody-scene-vertical-2.png',
    alt: 'Moody scene vertical',
    category: 'scene',
  },
];

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClassicGalleryTemplate() {
  const [filter, setFilter] = useState<Category>('all');

  const filteredImages =
    filter === 'all'
      ? GALLERY_IMAGES
      : GALLERY_IMAGES.filter(img => img.category === filter);

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent role="main" padding={0}>
          <Center axis="horizontal">
            <VStack gap={8} style={outer}>
              {/* Header */}
              <Center axis="horizontal">
                <Section variant="transparent" maxWidth={680} padding={0}>
                  <VStack gap={4} hAlign="center" style={textCenter}>
                    <VStack gap={2} hAlign="center">
                      <Heading level={1}>
                        Make every day a little more delightful, one detail at a
                        time.
                      </Heading>
                      <Text type="body" color="secondary">
                        We believe the smallest details are the ones that matter
                        most. A little color, a thoughtful touch, a moment that
                        catches your eye and makes you pause; that&apos;s what
                        turns an ordinary day into something worth remembering.
                      </Text>
                    </VStack>

                    <TabList
                      value={filter}
                      onChange={v => setFilter(v as Category)}>
                      <Tab value="all" label="All" />
                      <Tab value="lifestyle" label="Lifestyle" />
                      <Tab value="scene" label="Scenery" />
                      <Tab value="home" label="Home" />
                    </TabList>
                  </VStack>
                </Section>
              </Center>

              {/* Gallery Grid */}
              <Grid columns={{minWidth: 260, repeat: 'fit'}} gap={4}>
                {filteredImages.map((image, i) => (
                  <div key={i} style={imageWrapper}>
                    <img src={image.src} alt={image.alt} style={imgFill} />
                  </div>
                ))}
              </Grid>
            </VStack>
          </Center>
        </LayoutContent>
      }
    />
  );
}
