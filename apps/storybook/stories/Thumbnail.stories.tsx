// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';

const meta: Meta<typeof Thumbnail> = {
  title: 'Core/Thumbnail',
  component: Thumbnail,
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: 'Image source URL',
    },
    alt: {
      control: 'text',
      description: 'Alt text for the image',
    },
    label: {
      control: 'text',
      description: 'Label below the thumbnail',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the thumbnail is disabled',
    },
    showRemoveOn: {
      control: 'inline-radio',
      options: ['always', 'hover'],
      description: 'When the remove button is visible',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Thumbnail>;

// Deterministic picsum images by ID
const DARK_IMAGE = 'https://picsum.photos/id/1042/200/200'; // dark interior
const LIGHT_IMAGE = 'https://picsum.photos/id/1043/200/200'; // bright snow/sky
const WARM_IMAGE = 'https://picsum.photos/id/1044/200/200'; // warm tones
const MIXED_IMAGE = 'https://picsum.photos/id/1047/200/200'; // mixed tones

export const Default: Story = {
  args: {
    src: LIGHT_IMAGE,
    alt: 'Sample image',
  },
};

export const WithLabel: Story = {
  args: {
    src: WARM_IMAGE,
    alt: 'Vacation photo',
    label: 'vacation.jpg',
  },
};

export const WithRemove: Story = {
  render: () => {
    const [visible, setVisible] = useState(true);
    if (!visible) {
      return (
        <p style={{color: 'var(--color-text-secondary)', fontSize: 12}}>
          Removed. <button onClick={() => setVisible(true)}>Undo</button>
        </p>
      );
    }
    return (
      <Thumbnail
        src={LIGHT_IMAGE}
        alt="Removable thumbnail"
        label="photo.png"
        showRemoveOn="always"
        onRemove={() => setVisible(false)}
      />
    );
  },
};

export const RemoveOnHover: Story = {
  name: 'Remove on hover',
  render: () => {
    const initial = [
      {id: 1, src: LIGHT_IMAGE, label: 'light.jpg', alt: 'Light image'},
      {id: 2, src: WARM_IMAGE, label: 'warm.jpg', alt: 'Warm tones'},
      {id: 3, src: MIXED_IMAGE, label: 'mixed.jpg', alt: 'Mixed tones'},
    ];
    const [items, setItems] = useState(initial);
    return (
      <div>
        <p style={{fontSize: 12, color: '#888', marginBottom: 8}}>
          Remove button is hidden until you hover the thumbnail (or focus it
          with the keyboard).
        </p>
        <div style={{display: 'flex', gap: 8, alignItems: 'flex-start'}}>
          {items.map(item => (
            <Thumbnail
              key={item.id}
              src={item.src}
              alt={item.alt}
              label={item.label}
              showRemoveOn="hover"
              onRemove={() =>
                setItems(prev => prev.filter(i => i.id !== item.id))
              }
            />
          ))}
          {items.length === 0 && (
            <p style={{color: '#888', fontSize: 12}}>
              All removed.{' '}
              <button onClick={() => setItems(initial)}>Reset</button>
            </p>
          )}
        </div>
      </div>
    );
  },
};

export const WithCaption: Story = {
  render: () => {
    const [visible, setVisible] = useState(true);
    if (!visible) {
      return (
        <p style={{color: 'var(--color-text-secondary)', fontSize: 12}}>
          Removed. <button onClick={() => setVisible(true)}>Undo</button>
        </p>
      );
    }
    return (
      <Thumbnail
        src={WARM_IMAGE}
        alt="Photo with metadata"
        label="screenshot.png"
        showRemoveOn="always"
        onRemove={() => setVisible(false)}
      />
    );
  },
};

export const Clickable: Story = {
  args: {
    src: MIXED_IMAGE,
    alt: 'Clickable thumbnail',
    onClick: () => alert('Clicked!'),
    label: 'preview.jpg',
  },
};

export const Loading: Story = {
  name: 'Loading (no preview)',
  args: {
    isLoading: true,
    label: 'uploading.jpg',
  },
};

export const Uploading: Story = {
  name: 'Uploading (with preview)',
  args: {
    src: WARM_IMAGE,
    alt: 'Uploading preview',
    isLoading: true,
    label: 'vacation.jpg',
  },
};

export const Placeholder: Story = {
  name: 'No Image (Placeholder)',
  render: () => {
    const [visible, setVisible] = useState(true);
    if (!visible) {
      return (
        <p style={{color: 'var(--color-text-secondary)', fontSize: 12}}>
          Removed. <button onClick={() => setVisible(true)}>Undo</button>
        </p>
      );
    }
    return (
      <Thumbnail
        label="report.pdf"
        showRemoveOn="always"
        onRemove={() => setVisible(false)}
      />
    );
  },
};

export const Disabled: Story = {
  args: {
    src: LIGHT_IMAGE,
    alt: 'Disabled thumbnail',
    label: 'locked.jpg',
    onRemove: () => {},
    isDisabled: true,
  },
};

export const MediaModeTest: Story = {
  name: 'Media Mode (dark vs light images)',
  render: function MediaModeStory() {
    const images = [
      {src: DARK_IMAGE, label: 'dark.jpg', alt: 'Dark image'},
      {src: LIGHT_IMAGE, label: 'light.jpg', alt: 'Light image'},
      {src: MIXED_IMAGE, label: 'mixed.jpg', alt: 'Mixed tones'},
      {src: WARM_IMAGE, label: 'warm.jpg', alt: 'Warm tones'},
    ];
    const [items, setItems] = useState(images);
    return (
      <div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginBottom: 8,
          }}>
          Remove buttons should adapt: light icon on dark images, dark icon on
          light images.
        </p>
        <div style={{display: 'flex', gap: 8, alignItems: 'flex-start'}}>
          {items.map(item => (
            <Thumbnail
              key={item.label}
              src={item.src}
              alt={item.alt}
              label={item.label}
              showRemoveOn="always"
              onRemove={() =>
                setItems(prev => prev.filter(i => i.label !== item.label))
              }
            />
          ))}
          {items.length === 0 && (
            <p style={{color: 'var(--color-text-secondary)', fontSize: 12}}>
              All removed.{' '}
              <button onClick={() => setItems(images)}>Reset</button>
            </p>
          )}
        </div>
      </div>
    );
  },
};

export const Gallery: Story = {
  render: function GalleryStory() {
    const initial = [
      {id: 1, src: DARK_IMAGE, label: 'dark.jpg'},
      {id: 2, src: LIGHT_IMAGE, label: 'light.jpg'},
      {id: 4, src: WARM_IMAGE, label: 'warm.jpg'},
    ];
    const [items, setItems] = useState(initial);
    return (
      <div style={{display: 'flex', gap: 8, alignItems: 'flex-start'}}>
        {items.map(item => (
          <Thumbnail
            key={item.id}
            src={item.src}
            alt={item.label}
            label={item.label}
            showRemoveOn="always"
            onRemove={() =>
              setItems(prev => prev.filter(i => i.id !== item.id))
            }
          />
        ))}
        {items.length === 0 && (
          <p style={{color: 'var(--color-text-secondary)', fontSize: 12}}>
            All removed.{' '}
            <button onClick={() => setItems(initial)}>Reset</button>
          </p>
        )}
      </div>
    );
  },
};
