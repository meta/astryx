// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {
  colorVars,
  spacingVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {SAMPLE_IMAGES} from './assets/samples/samples';

const GALLERY_IMAGES = [
  SAMPLE_IMAGES.forest400x300,
  SAMPLE_IMAGES.lake400x300,
  SAMPLE_IMAGES.beach400x300,
  SAMPLE_IMAGES.city400x300,
  SAMPLE_IMAGES.desert400x300,
  SAMPLE_IMAGES.snow400x300,
];

const styles = stylex.create({
  container: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
    maxWidth: 600,
  },
  wideContainer: {
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
    maxWidth: 1000,
  },
  storyWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-6'],
  },
  sectionLabel: {
    marginBlockEnd: spacingVars['--spacing-2'],
  },
  // Sizing comes from fit="cover" on AspectRatio; only the radius is
  // story-specific.
  image: {
    borderRadius: radiusVars['--radius-element'],
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colorVars['--color-background-body'],
    borderRadius: radiusVars['--radius-element'],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridItem: {
    overflow: 'hidden',
  },
  smallContainer: {
    maxWidth: 300,
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  narrowContainer: {
    maxWidth: 240,
    padding: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  // Sizing from the height rather than the container: release the width so
  // the ratio drives it. A height constraint on its own clamps the box and
  // the rendered ratio stops matching `ratio`.
  heightDriven: {
    height: 120,
    width: 'auto',
  },
  emptyChild: {
    width: '100%',
    height: '100%',
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
  },
});

const meta: Meta<typeof AspectRatio> = {
  title: 'Core/AspectRatio',
  component: AspectRatio,
  tags: ['autodocs'],
  argTypes: {
    ratio: {
      control: 'number',
      description: 'The aspect ratio as width/height (e.g., 16/9 = 1.777...)',
    },
    shape: {
      control: 'select',
      options: ['rectangle', 'ellipse'],
      description:
        'Container shape. Both respect the ratio; "ellipse" clips to an oval (circle at 1:1).',
    },
    fit: {
      control: 'select',
      options: [undefined, 'cover', 'contain', 'center'],
      description:
        'How the child is sized inside the ratio box; omitted leaves the child unstyled.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AspectRatio>;

// Placeholder image URLs
const PLACEHOLDER_IMAGE = SAMPLE_IMAGES.lake800x600;
const PLACEHOLDER_SQUARE = SAMPLE_IMAGES.snow400x400;

export const Default: Story = {
  args: {
    ratio: 16 / 9,
    fit: 'cover',
  },
  render: args => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        16:9 Aspect Ratio (Default)
      </Text>
      <AspectRatio {...args}>
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_IMAGE}
          alt="16:9 placeholder"
        />
      </AspectRatio>
    </div>
  ),
};

export const Widescreen16x9: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        16:9 - Standard widescreen (YouTube, TV)
      </Text>
      <AspectRatio ratio={16 / 9} fit="cover">
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_IMAGE}
          alt="16:9 widescreen"
        />
      </AspectRatio>
    </div>
  ),
};

export const Classic4x3: Story = {
  render: () => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        4:3 - Classic TV and photography
      </Text>
      <AspectRatio ratio={4 / 3} fit="cover">
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_IMAGE}
          alt="4:3 classic"
        />
      </AspectRatio>
    </div>
  ),
};

export const Square1x1: Story = {
  render: () => (
    <div {...stylex.props(styles.smallContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        1:1 - Square (Instagram, avatars)
      </Text>
      <AspectRatio ratio={1} fit="cover">
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_SQUARE}
          alt="1:1 square"
        />
      </AspectRatio>
    </div>
  ),
};

export const Ultrawide21x9: Story = {
  render: () => (
    <div {...stylex.props(styles.wideContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        21:9 - Ultrawide cinematic
      </Text>
      <AspectRatio ratio={21 / 9}>
        <div {...stylex.props(styles.placeholder)}>
          <Text type="label">Ultrawide 21:9</Text>
        </div>
      </AspectRatio>
    </div>
  ),
};

export const EllipseCircle: Story = {
  args: {
    ratio: 1,
    shape: 'ellipse',
    fit: 'cover',
  },
  render: args => (
    <div {...stylex.props(styles.smallContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Ellipse at 1:1 — a circle (avatars, profile images)
      </Text>
      <AspectRatio {...args}>
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_SQUARE}
          alt="Circular media"
        />
      </AspectRatio>
    </div>
  ),
};

export const EllipseOval: Story = {
  args: {
    ratio: 16 / 9,
    shape: 'ellipse',
    fit: 'cover',
  },
  render: args => (
    <div {...stylex.props(styles.container)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Ellipse at 16:9 — an oval (respects the ratio)
      </Text>
      <AspectRatio {...args}>
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_IMAGE}
          alt="Oval media"
        />
      </AspectRatio>
    </div>
  ),
};

export const FitModes: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          fit="cover" — fills the box, media is cropped
        </Text>
        <AspectRatio ratio={16 / 9} fit="cover">
          <img
            {...stylex.props(styles.image)}
            src={PLACEHOLDER_SQUARE}
            alt="Cropped to fill"
          />
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          fit="contain" — fills the box, media is letterboxed
        </Text>
        <AspectRatio ratio={16 / 9} fit="contain">
          <img
            {...stylex.props(styles.image)}
            src={PLACEHOLDER_SQUARE}
            alt="Letterboxed to stay visible"
          />
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          fit="center" — natural size, centered
        </Text>
        <AspectRatio ratio={16 / 9} fit="center">
          <img
            {...stylex.props(styles.image)}
            src={SAMPLE_IMAGES.beach200x120}
            alt="Natural size, centered"
          />
        </AspectRatio>
      </div>
    </div>
  ),
};

export const WithPlaceholderSkeleton: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          16:9 with loading skeleton
        </Text>
        <AspectRatio ratio={16 / 9}>
          <Skeleton width="100%" height="100%" />
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.smallContainer)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          1:1 with loading skeleton
        </Text>
        <AspectRatio ratio={1}>
          <Skeleton width="100%" height="100%" />
        </AspectRatio>
      </div>
    </div>
  ),
};

export const ResponsiveGrid: Story = {
  render: () => (
    <div {...stylex.props(styles.wideContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Responsive grid of aspect ratio boxes
      </Text>
      <Grid columns={{minWidth: 200}} gap={4}>
        {[
          {ratio: 16 / 9, label: '16:9'},
          {ratio: 4 / 3, label: '4:3'},
          {ratio: 1, label: '1:1'},
          {ratio: 3 / 2, label: '3:2'},
          {ratio: 21 / 9, label: '21:9'},
          {ratio: 2 / 3, label: '2:3 Portrait'},
        ].map(({ratio, label}) => (
          <div key={label} {...stylex.props(styles.gridItem)}>
            <AspectRatio ratio={ratio}>
              <div {...stylex.props(styles.placeholder)}>
                <Text type="label">{label}</Text>
              </div>
            </AspectRatio>
          </div>
        ))}
      </Grid>
    </div>
  ),
};

export const AllRatiosComparison: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          16:9 (1.778) - Widescreen HD
        </Text>
        <AspectRatio ratio={16 / 9}>
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">16:9</Text>
          </div>
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          4:3 (1.333) - Classic TV
        </Text>
        <AspectRatio ratio={4 / 3}>
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">4:3</Text>
          </div>
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.smallContainer)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          1:1 (1.0) - Square
        </Text>
        <AspectRatio ratio={1}>
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">1:1</Text>
          </div>
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          3:2 (1.5) - Classic 35mm Film
        </Text>
        <AspectRatio ratio={3 / 2}>
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">3:2</Text>
          </div>
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.wideContainer)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          21:9 (2.333) - Ultrawide Cinematic
        </Text>
        <AspectRatio ratio={21 / 9}>
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">21:9</Text>
          </div>
        </AspectRatio>
      </div>
    </div>
  ),
};

export const ImageGallery: Story = {
  render: () => (
    <div {...stylex.props(styles.wideContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Image gallery with consistent aspect ratios
      </Text>
      <Grid columns={3} gap={4}>
        {Array.from({length: 6}, (_, i) => (
          <AspectRatio key={i} ratio={4 / 3} fit="cover">
            <img
              {...stylex.props(styles.image)}
              src={GALLERY_IMAGES[i]}
              alt={`Gallery image ${i + 1}`}
            />
          </AspectRatio>
        ))}
      </Grid>
    </div>
  ),
};

export const HeightDriven: Story = {
  render: () => (
    <div {...stylex.props(styles.wideContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        Sized from a fixed height. The box takes its width from the container by
        default, so a height constraint needs `width: auto` beside it for the
        ratio to drive the width.
      </Text>
      <HStack gap={4} vAlign="start" wrap="wrap">
        {[
          {ratio: 1, label: '1:1'},
          {ratio: 4 / 3, label: '4:3'},
          {ratio: 16 / 9, label: '16:9'},
        ].map(({ratio, label}) => (
          <AspectRatio
            key={label}
            ratio={ratio}
            fit="cover"
            xstyle={styles.heightDriven}>
            <img
              {...stylex.props(styles.image)}
              src={PLACEHOLDER_IMAGE}
              alt={`${label} at a fixed height`}
            />
          </AspectRatio>
        ))}
      </HStack>
    </div>
  ),
};

export const NarrowContainer: Story = {
  render: () => (
    <div {...stylex.props(styles.narrowContainer)}>
      <Text type="supporting" xstyle={styles.sectionLabel}>
        240px container
      </Text>
      <AspectRatio ratio={16 / 9} fit="cover">
        <img
          {...stylex.props(styles.image)}
          src={PLACEHOLDER_IMAGE}
          alt="16:9 in a narrow container"
        />
      </AspectRatio>
    </div>
  ),
};

export const EmptyAndLongContent: Story = {
  render: () => (
    <div {...stylex.props(styles.storyWrapper)}>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          Empty: no media, the box still holds its ratio
        </Text>
        <AspectRatio ratio={16 / 9}>
          <div {...stylex.props(styles.emptyChild)} />
        </AspectRatio>
      </div>
      <div {...stylex.props(styles.container)}>
        <Text type="supporting" xstyle={styles.sectionLabel}>
          Long content: the box clips rather than growing
        </Text>
        <AspectRatio ratio={16 / 9} fit="contain">
          <div {...stylex.props(styles.placeholder)}>
            <Text type="body">
              A caption long enough to run past the bottom edge of a 16:9 box,
              repeated so it cannot fit: the ratio is the contract and the
              container clips what does not fit inside it, rather than growing
              to accommodate the text and breaking the ratio it promised.
            </Text>
          </div>
        </AspectRatio>
      </div>
    </div>
  ),
};
