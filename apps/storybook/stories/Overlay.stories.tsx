// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import React, {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Overlay, useOverlay} from '@astryxdesign/core/Overlay';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Grid} from '@astryxdesign/core/Grid';
import {
  colorVars,
  spacingVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {SAMPLE_IMAGES} from './assets/samples/samples';

const styles = stylex.create({
  pageWrapper: {
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-6'],
  },
  image: {
    objectFit: 'cover',
    width: '100%',
    height: '100%',
    display: 'block',
  },
  dropZone: {
    minHeight: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colorVars['--color-border'],
    borderRadius: 8,
    padding: spacingVars['--spacing-4'],
  },
  dropZoneText: {
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
  },
  durationBadge: {
    paddingBlock: 2,
    paddingInline: 8,
    borderRadius: 4,
    backgroundColor: colorVars['--color-overlay'],
    fontSize: 12,
    fontWeight: 600,
  },
  imageSection: {
    position: 'relative',
  },
  metadata: {
    padding: 16,
  },
});

const SAMPLE_IMAGE = SAMPLE_IMAGES.lake800x450;
const SAMPLE_IMAGE_2 = SAMPLE_IMAGES.beach800x450;
const SAMPLE_IMAGE_3 = SAMPLE_IMAGES.city800x450;
const SAMPLE_HERO = SAMPLE_IMAGES.canyon1200x600;

const meta: Meta<typeof Overlay> = {
  title: 'Core/Overlay',
  component: Overlay,
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div {...stylex.props(styles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Overlay>;

/** Basic hover overlay on an image. */
export const HoverOnImage: Story = {
  render: () => (
    <div style={{width: 400}}>
      <Overlay
        showOn="hover"
        align="center"
        content={<Button label="Quick view" variant="ghost" />}>
        <AspectRatio ratio={16 / 9}>
          <img
            src={SAMPLE_IMAGE}
            alt="Product"
            {...stylex.props(styles.image)}
          />
        </AspectRatio>
      </Overlay>
    </div>
  ),
};

/** Always-visible bottom strip with title over a hero image. */
export const BottomStrip: Story = {
  render: () => (
    <div style={{width: 600}}>
      <Overlay
        position="bottom"
        align="start"
        content={
          <VStack gap={1}>
            <Heading level={3}>Gallery Collection</Heading>
            <Text type="supporting" color="secondary">
              24 items · Updated today
            </Text>
          </VStack>
        }>
        <AspectRatio ratio={2}>
          <img src={SAMPLE_HERO} alt="Hero" {...stylex.props(styles.image)} />
        </AspectRatio>
      </Overlay>
    </div>
  ),
};

/** Full overlay wrapping a Card. */
export const CardOverlay: Story = {
  render: () => (
    <Overlay
      showOn="hover"
      align="center"
      content={<Button label="View Details" variant="ghost" />}>
      <Card width={360}>
        <Layout
          content={
            <LayoutContent>
              <VStack gap={2}>
                <Heading level={3}>Project Alpha</Heading>
                <Text>
                  A comprehensive design system for building internal tools with
                  consistent, accessible interfaces.
                </Text>
                <Text type="supporting" color="secondary">
                  Updated 2 hours ago · 12 contributors
                </Text>
              </VStack>
            </LayoutContent>
          }
        />
      </Card>
    </Overlay>
  ),
};

/** Hover + focus — also appears on keyboard focus. */
export const HoverOrFocus: Story = {
  render: () => (
    <div style={{width: 400}}>
      <Overlay
        showOn="hover-or-focus"
        align="center"
        content={<Button label="Edit" variant="ghost" />}>
        <AspectRatio ratio={16 / 9}>
          <img
            src={SAMPLE_IMAGE_2}
            alt="Photo"
            {...stylex.props(styles.image)}
          />
        </AspectRatio>
      </Overlay>
    </div>
  ),
};

/** Light scrim for loading/upload states. */
export const LoadingOverlay: Story = {
  render: function LoadingOverlayStory() {
    const [isUploading, setIsUploading] = useState(false);
    return (
      <VStack gap={4} style={{width: 300}}>
        <Button
          label={isUploading ? 'Cancel upload' : 'Simulate upload'}
          onClick={() => setIsUploading(v => !v)}
        />
        <Overlay
          isOpen={isUploading}
          scrim="light"
          align="center"
          content={
            <VStack gap={2} hAlign="center">
              <Spinner size="md" />
              <Text weight="bold">Uploading...</Text>
            </VStack>
          }>
          <AspectRatio ratio={1}>
            <img
              src={SAMPLE_IMAGE_3}
              alt="Upload"
              {...stylex.props(styles.image)}
            />
          </AspectRatio>
        </Overlay>
      </VStack>
    );
  },
};

/** Gallery grid — each image has its own hover overlay. */
export const GalleryGrid: Story = {
  render: () => {
    const images = [
      {src: SAMPLE_IMAGES.lake400x400, title: 'Mountain Lake'},
      {src: SAMPLE_IMAGES.forest400x400, title: 'Forest Path'},
      {src: SAMPLE_IMAGES.beach400x400, title: 'Ocean Sunset'},
      {src: SAMPLE_IMAGES.city400x400, title: 'City Skyline'},
      {src: SAMPLE_IMAGES.desert400x400, title: 'Desert Dunes'},
      {src: SAMPLE_IMAGES.snow400x400, title: 'Snowy Peaks'},
    ];
    return (
      <Grid columns={3} gap={4}>
        {images.map(img => (
          <Overlay
            key={img.title}
            showOn="hover"
            position="bottom"
            align="start"
            content={<Text weight="bold">{img.title}</Text>}>
            <AspectRatio ratio={1}>
              <img
                src={img.src}
                alt={img.title}
                {...stylex.props(styles.image)}
              />
            </AspectRatio>
          </Overlay>
        ))}
      </Grid>
    );
  },
};

/** Video thumbnail with duration badge (always visible) + hover play overlay. */
export const VideoThumbnail: Story = {
  render: () => (
    <div style={{width: 400}}>
      <Overlay
        showOn="hover"
        align="center"
        content={
          <VStack gap={2} hAlign="center">
            <Text weight="bold" size="lg">
              ▶
            </Text>
            <Text weight="bold">Introduction to Astryx</Text>
          </VStack>
        }>
        <AspectRatio ratio={16 / 9}>
          <img src={SAMPLE_IMAGE} alt="Video" {...stylex.props(styles.image)} />
        </AspectRatio>
      </Overlay>
    </div>
  ),
};

/** Disconnected hover — useOverlay hook on Card. Hover Card reveals overlay on image. */
export const DisconnectedHover: Story = {
  render: function DisconnectedHoverStory() {
    const overlay = useOverlay({
      showOn: 'hover',
      position: 'bottom',
      align: 'start',
      content: <Heading level={4}>Featured Article</Heading>,
    });

    return (
      <Card
        width={360}
        ref={overlay.containerRef as React.RefObject<HTMLDivElement>}
        {...overlay.containerProps}>
        <div {...stylex.props(styles.imageSection)}>
          <AspectRatio ratio={16 / 9}>
            <img
              src={SAMPLE_IMAGE_2}
              alt="Article"
              {...stylex.props(styles.image)}
            />
          </AspectRatio>
          {overlay.element}
        </div>
        <VStack gap={1} xstyle={styles.metadata}>
          <Text type="supporting" color="secondary">
            Jan 15, 2026 · 5 min read
          </Text>
          <Text type="supporting" color="secondary">
            By Jane Author
          </Text>
        </VStack>
      </Card>
    );
  },
};

/** Drag-and-drop overlay — simulated with a toggle button. */
export const DragAndDrop: Story = {
  render: function DragAndDropStory() {
    const [isDragOver, setIsDragOver] = useState(false);
    return (
      <VStack gap={4} style={{width: 400}}>
        <Button
          label={isDragOver ? 'Simulate drag leave' : 'Simulate drag enter'}
          variant="secondary"
          onClick={() => setIsDragOver(v => !v)}
        />
        <Overlay
          isOpen={isDragOver}
          align="center"
          content={
            <VStack gap={2} hAlign="center">
              <Text size="lg">📁</Text>
              <Text weight="bold">Drop files here</Text>
            </VStack>
          }>
          <div {...stylex.props(styles.dropZone)}>
            <p {...stylex.props(styles.dropZoneText)}>
              Drop files here or click to browse
            </p>
          </div>
        </Overlay>
      </VStack>
    );
  },
};

/** No scrim — content-only overlay without a background. */
export const NoScrim: Story = {
  render: () => (
    <div style={{width: 300}}>
      <Overlay
        showOn="hover"
        scrim={false}
        align="center"
        content={<Button label="♡" variant="ghost" />}>
        <AspectRatio ratio={1}>
          <img
            src={SAMPLE_IMAGE_3}
            alt="Selected"
            {...stylex.props(styles.image)}
          />
        </AspectRatio>
      </Overlay>
    </div>
  ),
};
