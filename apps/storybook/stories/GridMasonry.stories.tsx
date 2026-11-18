// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Section} from '@astryxdesign/core/Section';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Stack';
import {MediaTheme} from '@astryxdesign/core/theme';
import {
  colorVars,
  spacingVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {SAMPLE_IMAGES} from './assets/samples/samples';

const meta: Meta = {
  title: 'Core/GridMasonry',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = stylex.create({
  card: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'clip',
    borderRadius: radiusVars['--radius-element'],
  },
  img: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: spacingVars['--spacing-5'],
    opacity: {
      default: 0,
      ':hover': 1,
    },
    transition: 'opacity 0.2s ease',
  },
  overlayAlwaysOn: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: spacingVars['--spacing-5'],
  },
  tag: {
    position: 'absolute',
    top: spacingVars['--spacing-3'],
    left: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-accent-muted'],
    color: colorVars['--color-on-accent'],
    padding: `${spacingVars['--spacing-0-5']} ${spacingVars['--spacing-2']}`,
    borderRadius: radiusVars['--radius-element'],
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
});

// ─── Gallery Data ───────────────────────────────────────────────────────────

interface GalleryImage {
  src: string;
  title: string;
  category: string;
}

const IMAGES: GalleryImage[] = [
  {
    src: SAMPLE_IMAGES.canyon600x800,
    title: 'Going places',
    category: 'Travel',
  },
  {
    src: SAMPLE_IMAGES.beach600x400,
    title: 'Making memories',
    category: 'Home',
  },
  {
    src: SAMPLE_IMAGES.city600x600,
    title: 'Seeing things',
    category: 'Lifestyle',
  },
  {
    src: SAMPLE_IMAGES.forest600x900,
    title: 'Sharing ideas',
    category: 'Lifestyle',
  },
  {
    src: SAMPLE_IMAGES.meadow600x700,
    title: 'Being free',
    category: 'Nature',
  },
];

// ─── Gallery Card ───────────────────────────────────────────────────────────

function GalleryCard({
  image,
  showOverlay = false,
}: {
  image: GalleryImage;
  showOverlay?: boolean;
}) {
  return (
    <div {...stylex.props(styles.card)}>
      <img src={image.src} alt={image.title} {...stylex.props(styles.img)} />
      <span {...stylex.props(styles.tag)}>{image.category}</span>
      <div
        {...stylex.props(
          showOverlay ? styles.overlayAlwaysOn : styles.overlay,
        )}>
        <MediaTheme mode="dark">
          <VStack gap={1}>
            <Text type="label">{image.title}</Text>
          </VStack>
        </MediaTheme>
      </div>
    </div>
  );
}

// ─── Stories ────────────────────────────────────────────────────────────────

/**
 * A Pinterest-style masonry gallery using Grid with row spans.
 *
 * The key technique: define explicit row tracks with `gridTemplateRows`,
 * then use `GridSpan` with different `rows` values to create items of
 * varying heights. This produces the characteristic staggered masonry layout
 * without any JavaScript height calculation.
 */
export const MasonryGallery: Story = {
  render: () => (
    <Section variant="muted" padding={6}>
      <VStack gap={5}>
        <VStack gap={2}>
          <Heading level={2}>Mixed Gallery</Heading>
          <Text type="body">
            A masonry-style gallery using CSS Grid row spans. Each item spans a
            different number of rows to create a staggered, Pinterest-like
            layout.
          </Text>
        </VStack>

        <Grid columns={3} rowHeight={80} gap={3}>
          {/* Column 1: 4 + 2 = 6 rows */}
          <GridSpan rows={4}>
            <GalleryCard image={IMAGES[0]} />
          </GridSpan>
          <GridSpan rows={2}>
            <GalleryCard image={IMAGES[1]} />
          </GridSpan>

          {/* Column 2: 2 + 4 = 6 rows */}
          <GridSpan rows={2}>
            <GalleryCard image={IMAGES[2]} />
          </GridSpan>
          <GridSpan rows={4}>
            <GalleryCard image={IMAGES[3]} />
          </GridSpan>

          {/* Column 3: 3 + 3 = 6 rows */}
          <GridSpan rows={3}>
            <GalleryCard image={IMAGES[4]} />
          </GridSpan>
          <GridSpan rows={3}>
            <GalleryCard image={IMAGES[0]} />
          </GridSpan>
        </Grid>
      </VStack>
    </Section>
  ),
};

/**
 * A denser masonry layout with a 4-column grid and smaller row tracks.
 * Uses `rowHeight={60}` for unlimited content.
 */
export const DenseMasonry: Story = {
  render: () => {
    return (
      <Section variant="muted" padding={6}>
        <VStack gap={5}>
          <VStack gap={2}>
            <Heading level={2}>Dense Masonry</Heading>
            <Text type="body">
              A 4-column layout with <code>rowHeight={60}</code>. Each item gets
              a different row span for natural visual rhythm.
            </Text>
          </VStack>

          <Grid columns={4} rowHeight={60} gap={3}>
            <GridSpan rows={4}>
              <GalleryCard image={IMAGES[2]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[0]} showOverlay />
            </GridSpan>
            <GridSpan rows={5}>
              <GalleryCard image={IMAGES[3]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[4]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[1]} showOverlay />
            </GridSpan>
            <GridSpan rows={4}>
              <GalleryCard image={IMAGES[4]} showOverlay />
            </GridSpan>
            <GridSpan rows={2}>
              <GalleryCard image={IMAGES[0]} showOverlay />
            </GridSpan>
            <GridSpan rows={4}>
              <GalleryCard image={IMAGES[2]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[3]} showOverlay />
            </GridSpan>
            <GridSpan rows={5}>
              <GalleryCard image={IMAGES[1]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[4]} showOverlay />
            </GridSpan>
            <GridSpan rows={4}>
              <GalleryCard image={IMAGES[0]} showOverlay />
            </GridSpan>
          </Grid>
        </VStack>
      </Section>
    );
  },
};

/**
 * A featured masonry layout combining column and row spans.
 * The hero image spans 2 columns and 4 rows, with smaller items
 * arranged around it.
 */
export const FeaturedMasonry: Story = {
  render: () => {
    return (
      <Section variant="muted" padding={6}>
        <VStack gap={5}>
          <VStack gap={2}>
            <Heading level={2}>Featured Masonry</Heading>
            <Text type="body">
              Combines column spans and row spans for a featured hero layout.
              The primary image spans 2 columns × 5 rows.
            </Text>
          </VStack>

          <Grid columns={3} rowHeight={70} gap={3}>
            {/* Hero — 2 cols × 5 rows */}
            <GridSpan columns={2} rows={5}>
              <GalleryCard image={IMAGES[2]} showOverlay />
            </GridSpan>

            {/* Sidebar items */}
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[0]} showOverlay />
            </GridSpan>
            <GridSpan rows={2}>
              <GalleryCard image={IMAGES[1]} showOverlay />
            </GridSpan>

            {/* Bottom row */}
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[3]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[4]} showOverlay />
            </GridSpan>
            <GridSpan rows={3}>
              <GalleryCard image={IMAGES[1]} showOverlay />
            </GridSpan>
          </Grid>
        </VStack>
      </Section>
    );
  },
};
