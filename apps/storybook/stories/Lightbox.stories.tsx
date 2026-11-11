// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Lightbox, useLightbox} from '@astryxdesign/core/Lightbox';

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

/**
 * The parent decides whether the viewer closes: here it asks first. When it
 * keeps the viewer open, a photo dragged down comes back.
 */
export const ConfirmClose: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open, confirm to close</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={next => {
            if (next || window.confirm('Close the photo?')) {
              setIsOpen(next);
            }
          }}
          media={{src: SAMPLE_IMAGE, alt: 'Forest path'}}
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

/** Zoom on a photo with a caption, in the caption band a gallery's pages use. */
export const ZoomWithCaption: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open zoom with caption</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            src: SAMPLE_IMAGE,
            alt: 'Forest path',
            caption: 'A winding path through the forest',
          }}
          hasZoom
        />
      </>
    );
  },
};

/**
 * A gallery a phone can page through. Drag or flick between photos, with
 * Photos' 40 pt gap. Pinch or double-tap a photo to zoom, and drag a zoomed
 * photo to its edge before the next drag pages.
 */
export const GalleryWithZoom: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [index, setIndex] = useState(0);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open gallery with zoom</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={GALLERY_MEDIA}
          index={index}
          onIndexChange={setIndex}
          hasZoom
        />
      </>
    );
  },
};

/**
 * A gallery whose captions differ in length. The first runs long, so two
 * lines cut it short and "more" shows it all. The next runs about two lines,
 * one has none, and the last is short. The photo keeps one box on every page.
 */
export const GalleryWithCaptions: Story = {
  args: {
    media: [
      {
        ...GALLERY_MEDIA[0],
        caption:
          'A winding path through the forest, past the old mill and down to the river, where the trail turns back toward the village. In autumn the beeches along it turn copper, and on a clear morning you can see the church spire from the bridge before the path climbs the last hill home.',
      },
      {
        ...GALLERY_MEDIA[1],
        caption:
          'Morning fog lifting off the lake, seen from the old stone bridge',
      },
      GALLERY_MEDIA[3],
      {...GALLERY_MEDIA[2], caption: 'Golden hour'},
    ],
  },
  render: ({media}) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>
          Open gallery with captions
        </button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={media}
          hasZoom
        />
      </>
    );
  },
};

/**
 * A controlled gallery whose parent keeps its index, paging only with its own
 * buttons, say while a change is confirmed. A swipe returns to the photo the
 * parent shows.
 */
export const GalleryKeepsIndex: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>
          Open gallery that keeps its photo
        </button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={GALLERY_MEDIA}
          index={0}
          onIndexChange={() => {}}
          hasZoom
        />
      </>
    );
  },
};

/**
 * A single photo whose caption runs long. As on a gallery's page, two lines
 * cut it short and "more" shows it all.
 */
export const SingleWithLongCaption: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>
          Open single photo with a long caption
        </button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={{
            ...GALLERY_MEDIA[0],
            caption:
              'A winding path through the forest, past the old mill and down to the river, where the trail turns back toward the village. In autumn the beeches along it turn copper, and on a clear morning you can see the church spire from the bridge before the path climbs the last hill home.',
          }}
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

/**
 * A gallery with a video between two photos. A drag on the video's frame
 * pages, and a drag that starts on its controls stays the video's.
 */
export const GalleryWithVideo: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open gallery with video</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={[
            GALLERY_MEDIA[0],
            {
              src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
              alt: 'Flower blooming',
              type: 'video',
            },
            GALLERY_MEDIA[1],
          ]}
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

/**
 * The gallery viewer, open when the page loads, so a page-level
 * accessibility check reaches the open viewer.
 */
export const OpenViewer: Story = {
  name: 'Open Viewer',
  // Kept off the docs page because the viewer opens on load.
  tags: ['!autodocs'],
  render: () => {
    const [isOpen, setIsOpen] = useState(true);
    const [index, setIndex] = useState(0);
    return (
      <>
        <button onClick={() => setIsOpen(true)}>Open viewer</button>
        <Lightbox
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          media={GALLERY_MEDIA}
          index={index}
          onIndexChange={setIndex}
          hasZoom
        />
      </>
    );
  },
};
