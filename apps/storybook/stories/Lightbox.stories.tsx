// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lightbox.stories.tsx
 * @input Lightbox, TextInput, Slider, and React state
 * @output Lightbox examples including editable controls in a mixed gallery
 * @position Core Lightbox stories for manual interaction checks
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Lightbox, useLightbox} from '@astryxdesign/core/Lightbox';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Slider} from '@astryxdesign/core/Slider';

const meta: Meta<typeof Lightbox> = {
  title: 'Core/Lightbox',
  component: Lightbox,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Lightbox>;

const SAMPLE_IMAGE = 'https://picsum.photos/id/10/1200/800';
const GALLERY_MEDIA = [
  {
    src: 'https://picsum.photos/id/10/1200/800',
    alt: 'Forest path',
    caption: 'A winding path through the forest',
  },
  {src: 'https://picsum.photos/id/15/1200/800', alt: 'Mountain lake'},
  {
    src: 'https://picsum.photos/id/20/1200/800',
    alt: 'Beach sunset',
    caption: 'Golden hour at the beach',
  },
  {src: 'https://picsum.photos/id/25/1200/800', alt: 'City skyline'},
];

export const Default: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open lightbox</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            src: SAMPLE_IMAGE,
            alt: 'Forest path',
            caption: 'A winding path through the forest',
          }}
        />
      </>
    );
  },
};

export const Gallery: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [index, setIndex] = useState(0);
    return (
      <>
        <div style={{display: 'flex', gap: '8px'}}>
          {GALLERY_MEDIA.map((item, i) => (
            <img
              key={item.src}
              src={item.src}
              alt={item.alt}
              style={{
                width: 120,
                height: 80,
                objectFit: 'cover',
                cursor: 'pointer',
                borderRadius: 4,
              }}
              onClick={() => {
                setIndex(i);
                setIsOpen(true);
              }}
            />
          ))}
        </div>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={GALLERY_MEDIA}
          index={index}
          onIndexChange={setIndex}
        />
      </>
    );
  },
};

export const WithZoom: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open with zoom</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{src: SAMPLE_IMAGE, alt: 'Forest path'}}
          hasZoom
        />
      </>
    );
  },
};

export const WithCaption: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open with caption</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            src: SAMPLE_IMAGE,
            alt: 'Forest path',
            caption:
              'A beautiful forest path winding through tall trees on a misty morning',
          }}
        />
      </>
    );
  },
};

export const Video: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open video</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
            alt: 'Flower blooming',
            type: 'video',
            caption: 'A flower blooming in time-lapse',
          }}
        />
      </>
    );
  },
};

export const CustomContent: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open custom content</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            type: 'custom',
            label: 'Dashboard template preview',
            content: (
              <div
                style={{
                  width: 'min(80vw, 960px)',
                  height: 'min(70vh, 600px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#ffffff',
                  color: '#111827',
                  borderRadius: 12,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                  fontSize: 24,
                }}>
                Live React preview goes here
              </div>
            ),
            caption: 'A rich React subtree hosted inside the lightbox',
          }}
        />
      </>
    );
  },
};

export const MixedGallery: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const [title, setTitle] = useState('Editable preview');
    const [volume, setVolume] = useState(50);
    const items = [
      {src: 'https://picsum.photos/id/10/1200/800', alt: 'Forest path'},
      {
        type: 'custom' as const,
        label: 'Interactive card',
        content: (
          <div
            style={{
              width: 'min(70vw, 720px)',
              padding: 32,
              background: '#ffffff',
              color: '#111827',
              borderRadius: 12,
              textAlign: 'center',
            }}>
            <h2 style={{marginTop: 0}}>Custom slide</h2>
            <p>Use arrow keys in these controls without changing slides.</p>
            <TextInput
              label="Preview title"
              value={title}
              onChange={setTitle}
            />
            <Slider label="Volume" value={volume} onChange={setVolume} />
            <button onClick={() => alert('Interactive!')}>Click me</button>
          </div>
        ),
        caption: 'A custom slide between images',
      },
      {src: 'https://picsum.photos/id/20/1200/800', alt: 'Beach sunset'},
    ];
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open mixed gallery</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={items}
          index={index}
          onIndexChange={setIndex}
        />
      </>
    );
  },
};

export const WithHook: Story = {
  render: () => {
    const lightbox = useLightbox({media: GALLERY_MEDIA});
    return (
      <>
        <div style={{display: 'flex', gap: '8px'}}>
          {GALLERY_MEDIA.map((item, i) => (
            <img
              key={item.src}
              src={item.src}
              alt={item.alt}
              style={{
                width: 120,
                height: 80,
                objectFit: 'cover',
                cursor: 'pointer',
                borderRadius: 4,
              }}
              {...lightbox.getTriggerProps(i)}
            />
          ))}
        </div>
        {lightbox.element}
      </>
    );
  },
};
