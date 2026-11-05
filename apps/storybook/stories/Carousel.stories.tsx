// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Carousel} from '@astryxdesign/core/Carousel';
import type {CarouselHandle} from '@astryxdesign/core/Carousel';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {
  colorVars,
  spacingVars,
  typographyVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  pageWrapper: {
    backgroundColor: colorVars['--color-background-body'],
    padding: spacingVars['--spacing-6'],
    fontFamily: typographyVars['--font-family-body'],
  },
  constrainedWidth: {
    maxWidth: 400,
  },
  narrowWidth: {
    maxWidth: 240,
  },
  card: {
    width: 160,
    flexShrink: 0,
  },
  cardInner: {
    padding: spacingVars['--spacing-3'],
  },
  cardTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
  },
  cardDesc: {
    margin: 0,
    fontSize: 12,
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
  },
  colorSwatch: {
    width: 80,
    height: 80,
    borderRadius: radiusVars['--radius-element'],
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    color: colorVars['--color-text-secondary'],
    marginBottom: spacingVars['--spacing-2'],
    fontFamily: typographyVars['--font-family-body'],
  },
});

const IMAGES = [
  {id: 1, src: 'https://picsum.photos/id/1042/200/200', label: 'dark.jpg'},
  {id: 2, src: 'https://picsum.photos/id/1043/200/200', label: 'light.jpg'},
  {id: 3, src: 'https://picsum.photos/id/1044/200/200', label: 'warm.jpg'},
  {id: 4, src: 'https://picsum.photos/id/1047/200/200', label: 'mixed.jpg'},
  {id: 5, src: 'https://picsum.photos/id/1050/200/200', label: 'nature.jpg'},
  {id: 6, src: 'https://picsum.photos/id/1055/200/200', label: 'city.jpg'},
  {id: 7, src: 'https://picsum.photos/id/1060/200/200', label: 'ocean.jpg'},
  {id: 8, src: 'https://picsum.photos/id/1069/200/200', label: 'forest.jpg'},
];

const meta: Meta<typeof Carousel> = {
  title: 'Core/Carousel',
  component: Carousel,
  tags: ['autodocs'],
  argTypes: {
    gap: {
      control: {type: 'select'},
      options: [0, 0.5, 1, 1.5, 2, 3, 4],
      description: 'Gap between items',
    },
    hasButtons: {
      control: 'boolean',
      description: 'Show navigation buttons when the content can scroll',
    },
    padding: {
      control: {type: 'select'},
      options: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10],
      description: 'Inline padding inside the scroll container',
    },
    hasEdgeFade: {
      control: 'boolean',
      description: 'Show gradient edge-fade mask on overflow',
    },
    hasLoop: {
      control: 'boolean',
      description: 'Wrap-around scrolling (next at end → start)',
    },
    hasSnap: {
      control: 'boolean',
      description: 'Enable scroll-snap',
    },
  },
  decorators: [
    Story => (
      <div {...stylex.props(styles.pageWrapper)}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Carousel>;

export const Default: Story = {
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>Scroll or hover for arrows →</p>
      <Carousel gap={1} aria-label="Photo thumbnails">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const WithRemove: Story = {
  name: 'Thumbnails with Remove',
  render: function WithRemoveStory() {
    const [items, setItems] = useState(IMAGES);
    return (
      <div {...stylex.props(styles.constrainedWidth)}>
        <p {...stylex.props(styles.label)}>{items.length} attachments</p>
        <Carousel gap={1} aria-label="Attached files">
          {items.map(img => (
            <Thumbnail
              key={img.id}
              src={img.src}
              alt={img.label}
              label={img.label}
              onRemove={() =>
                setItems(prev => prev.filter(i => i.id !== img.id))
              }
            />
          ))}
        </Carousel>
        {items.length === 0 && (
          <p {...stylex.props(styles.label)}>
            All removed. <button onClick={() => setItems(IMAGES)}>Reset</button>
          </p>
        )}
      </div>
    );
  },
};

export const FewItems: Story = {
  name: 'Few Items (No Overflow)',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>No overflow — no fade, no buttons</p>
      <Carousel gap={1} aria-label="Small gallery">
        {IMAGES.slice(0, 3).map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const Cards: Story = {
  name: 'Card Content',
  render: () => {
    const cards = [
      {id: 1, title: 'Design System', desc: 'Component library'},
      {id: 2, title: 'Documentation', desc: 'API reference'},
      {id: 3, title: 'Storybook', desc: 'Visual testing'},
      {id: 4, title: 'Theme Config', desc: 'Token overrides'},
      {id: 5, title: 'CLI Tools', desc: 'Code generation'},
      {id: 6, title: 'Accessibility', desc: 'ARIA patterns'},
    ];
    return (
      <div style={{maxWidth: 500}}>
        <p {...stylex.props(styles.label)}>Cards in a carousel</p>
        <Carousel gap={2} hasSnap aria-label="Feature cards">
          {cards.map(card => (
            <Card key={card.id} xstyle={styles.card}>
              <div {...stylex.props(styles.cardInner)}>
                <p {...stylex.props(styles.cardTitle)}>{card.title}</p>
                <p {...stylex.props(styles.cardDesc)}>{card.desc}</p>
              </div>
            </Card>
          ))}
        </Carousel>
      </div>
    );
  },
};

export const NoButtons: Story = {
  name: 'Without Buttons',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>Scroll only — no arrow buttons</p>
      <Carousel gap={1} hasButtons={false} aria-label="Scroll-only gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const WithSnap: Story = {
  name: 'Scroll Snap',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>Snaps to items on scroll</p>
      <Carousel gap={2} hasSnap aria-label="Snapping gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const LargeGap: Story = {
  name: 'Large Gap',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>gap=4 (16px)</p>
      <Carousel gap={4} aria-label="Spaced gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const ColorSwatches: Story = {
  name: 'Custom Content (Swatches)',
  render: () => {
    const colors = [
      '#e74c3c',
      '#e67e22',
      '#f1c40f',
      '#2ecc71',
      '#1abc9c',
      '#3498db',
      '#9b59b6',
      '#34495e',
      '#e84393',
      '#00cec9',
      '#6c5ce7',
      '#fdcb6e',
    ];
    return (
      <div style={{maxWidth: 360}}>
        <p {...stylex.props(styles.label)}>Any content works as children</p>
        <Carousel gap={1.5} aria-label="Color swatches">
          {colors.map(color => (
            <div
              key={color}
              {...stylex.props(styles.colorSwatch)}
              style={{backgroundColor: color}}
              title={color}
            />
          ))}
        </Carousel>
      </div>
    );
  },
};

export const Loop: Story = {
  name: 'Loop (Wrap-Around)',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>
        Next at the end wraps to the start — buttons stay active at both edges
      </p>
      <Carousel gap={1} hasLoop hasSnap aria-label="Looping gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const ImperativeControl: Story = {
  name: 'Imperative Control (handleRef)',
  render: function ImperativeControlStory() {
    const carouselRef = useRef<CarouselHandle>(null);
    return (
      <div {...stylex.props(styles.constrainedWidth)}>
        <p {...stylex.props(styles.label)}>
          External buttons driving the carousel through handleRef
        </p>
        <Carousel
          handleRef={carouselRef}
          gap={1}
          hasSnap
          hasButtons={false}
          aria-label="Externally controlled gallery">
          {IMAGES.map(img => (
            <Thumbnail
              key={img.id}
              src={img.src}
              alt={img.label}
              label={img.label}
            />
          ))}
        </Carousel>
        <div style={{display: 'flex', gap: 8, marginTop: 12}}>
          <Button
            label="Previous"
            variant="secondary"
            size="sm"
            onClick={() => carouselRef.current?.scrollPrev()}
          />
          <Button
            label="Next"
            variant="secondary"
            size="sm"
            onClick={() => carouselRef.current?.scrollNext()}
          />
          <Button
            label="Jump to first"
            variant="ghost"
            size="sm"
            onClick={() => carouselRef.current?.scrollTo(0)}
          />
        </div>
      </div>
    );
  },
};

export const WithPadding: Story = {
  name: 'Inline Padding',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>
        padding=3 puts the gutter inside the scroll area, and scroll-padding
        keeps snap points on the content edge
      </p>
      <Carousel gap={1} padding={3} hasSnap aria-label="Padded gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const NarrowContainer: Story = {
  name: 'Narrow Container',
  render: () => (
    <div {...stylex.props(styles.narrowWidth)}>
      <p {...stylex.props(styles.label)}>240px container</p>
      <Carousel gap={1} aria-label="Narrow gallery">
        {IMAGES.map(img => (
          <Thumbnail
            key={img.id}
            src={img.src}
            alt={img.label}
            label={img.label}
          />
        ))}
      </Carousel>
    </div>
  ),
};

export const LongTextItems: Story = {
  name: 'Long Text Items',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>
        One very long item among short ones, and a word with no break
        opportunity
      </p>
      <Carousel gap={2} aria-label="Text items">
        <Card xstyle={styles.card}>
          <div {...stylex.props(styles.cardInner)}>
            <p {...stylex.props(styles.cardDesc)}>Short</p>
          </div>
        </Card>
        <Card xstyle={styles.card}>
          <div {...stylex.props(styles.cardInner)}>
            <p {...stylex.props(styles.cardDesc)}>
              A much longer description that runs well past the width of its
              neighbours and has to wrap inside a fixed-width card without
              pushing the row out of shape.
            </p>
          </div>
        </Card>
        <Card xstyle={styles.card}>
          <div {...stylex.props(styles.cardInner)}>
            <p {...stylex.props(styles.cardDesc)}>
              Unbreakable:
              Donaudampfschiffahrtselektrizitaetenhauptbetriebswerkbauunterbeamtengesellschaft
            </p>
          </div>
        </Card>
      </Carousel>
    </div>
  ),
};

export const SingleItem: Story = {
  name: 'Single Item',
  render: () => (
    <div {...stylex.props(styles.constrainedWidth)}>
      <p {...stylex.props(styles.label)}>
        One child: no overflow, no fade, no buttons
      </p>
      <Carousel gap={1} aria-label="Single item">
        <Thumbnail
          src={IMAGES[0].src}
          alt={IMAGES[0].label}
          label={IMAGES[0].label}
        />
      </Carousel>
    </div>
  ),
};
