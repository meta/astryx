// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {createPortal} from 'react-dom';
import type {Meta, StoryObj} from '@storybook/react';
import {Lightbox, useLightbox} from '@astryxdesign/core/Lightbox';
import {SAMPLE_IMAGES} from './assets/samples/samples';

const meta: Meta<typeof Lightbox> = {
  title: 'Core/Lightbox',
  component: Lightbox,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Lightbox>;

const SAMPLE_IMAGE = SAMPLE_IMAGES.forest1200x800;
const GALLERY_MEDIA = [
  {
    src: SAMPLE_IMAGES.forest1200x800,
    alt: 'Forest path',
    caption: 'A winding path through the forest',
  },
  {src: SAMPLE_IMAGES.lake1200x800, alt: 'Mountain lake'},
  {
    src: SAMPLE_IMAGES.beach1200x800,
    alt: 'Beach sunset',
    caption: 'Golden hour at the beach',
  },
  {src: SAMPLE_IMAGES.city1200x800, alt: 'City skyline'},
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
 * A gallery whose long caption is a paragraph element, as a caller may pass
 * one, for the caption's line measures with a block inside its text.
 */
export const GalleryWithParagraphCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: {
    media: [
      {
        ...GALLERY_MEDIA[0],
        caption: (
          <p>
            A winding path through the forest, past the old mill and down to the
            river, where the trail turns back toward the village. In autumn the
            beeches along it turn copper, and on a clear morning you can see the
            church spire from the bridge before the path climbs the last hill
            home.
          </p>
        ),
      },
      GALLERY_MEDIA[1],
    ],
  },
  render: GalleryWithCaptions.render,
};

/**
 * The paragraph caption, centred, as a caller may set it.
 */
export const GalleryWithCenteredParagraphCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: {
    media: [
      {
        ...GALLERY_MEDIA[0],
        caption: (
          <p style={{textAlign: 'center'}}>
            A winding path through the forest, past the old mill and down to the
            river, where the trail turns back toward the village. In autumn the
            beeches along it turn copper, and on a clear morning you can see the
            church spire from the bridge before the path climbs the last hill
            home.
          </p>
        ),
      },
      GALLERY_MEDIA[1],
    ],
  },
  render: GalleryWithCaptions.render,
};

const CAPTION_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='8' cy='8' r='8' fill='white'/%3E%3C/svg%3E";

/**
 * The long caption ending in an inline image, as a caller may end one with an
 * icon.
 */
export const GalleryWithImageCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: {
    media: [
      {
        ...GALLERY_MEDIA[0],
        caption: (
          <>
            A winding path through the forest, past the old mill and down to the
            river, where the trail turns back toward the village. In autumn the
            beeches along it turn copper, and on a clear morning you can see the
            church spire from the bridge before the path climbs the last hill
            home.{' '}
            <img
              src={CAPTION_ICON}
              alt=""
              width={16}
              height={16}
              style={{display: 'inline'}}
            />
          </>
        ),
      },
      GALLERY_MEDIA[1],
    ],
  },
  render: GalleryWithCaptions.render,
};

/**
 * The long caption ending in a plain image, which the reset makes a block.
 */
export const GalleryWithBlockImageCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: {
    media: [
      {
        ...GALLERY_MEDIA[0],
        caption: (
          <>
            A winding path through the forest, past the old mill and down to the
            river, where the trail turns back toward the village. In autumn the
            beeches along it turn copper, and on a clear morning you can see the
            church spire from the bridge before the path climbs the last hill
            home. <img src={CAPTION_ICON} alt="" width={16} height={16} />
          </>
        ),
      },
      GALLERY_MEDIA[1],
    ],
  },
  render: GalleryWithCaptions.render,
};

// The long caption up to its last word, for the fixtures that wrap that word.
const LONG_CAPTION_HEAD =
  'A winding path through the forest, past the old mill and down to the river, where the trail turns back toward the village. In autumn the beeches along it turn copper, and on a clear morning you can see the church spire from the bridge before the path climbs the last hill';

/** The gallery's args, with `caption` as its first, long caption. */
function longCaptionArgs(caption: ReactNode): Story['args'] {
  return {media: [{...GALLERY_MEDIA[0], caption}, GALLERY_MEDIA[1]]};
}

/**
 * The long caption ending in an inline element with end padding and an end
 * border, which take room on the last line.
 */
export const GalleryWithPaddedEndCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      {LONG_CAPTION_HEAD}{' '}
      <span
        style={{
          paddingInlineEnd: 12,
          borderInlineEnd: '12px solid transparent',
        }}>
        home.
      </span>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The long caption ending in an inline element with an end margin, which
 * takes room on the last line.
 */
export const GalleryWithMarginEndCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      {LONG_CAPTION_HEAD} <span style={{marginInlineEnd: 24}}>home.</span>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The long caption ending in an inline element with generated content before
 * and after it, as a link with an icon has.
 */
export const GalleryWithGeneratedContentCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      <style>
        {
          '.lightbox-caption-fixture-icons::before, .lightbox-caption-fixture-icons::after { content: ""; display: inline-block; inline-size: 12px; block-size: 1em; }'
        }
      </style>
      {LONG_CAPTION_HEAD}{' '}
      <span className="lightbox-caption-fixture-icons">home.</span>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The long caption ending in visually hidden text, laid out out of flow as a
 * screen-reader-only utility class lays it out.
 */
export const GalleryWithVisuallyHiddenCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      {LONG_CAPTION_HEAD} home.
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}>
        {' '}
        Opens the photo in a new tab.
      </span>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The paragraph caption with a generated glyph after its text, from the
 * paragraph's own `::after`.
 */
export const GalleryWithParagraphGlyphCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      <style>
        {'.lightbox-caption-fixture-glyph::after { content: " \\2197"; }'}
      </style>
      <p className="lightbox-caption-fixture-glyph">
        {LONG_CAPTION_HEAD} home.
      </p>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The paragraph caption with generated words after its text, from the
 * paragraph's own `::after`.
 */
export const GalleryWithParagraphWordsCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      <style>
        {'.lightbox-caption-fixture-words::after { content: " (see map)"; }'}
      </style>
      <p className="lightbox-caption-fixture-words">
        {LONG_CAPTION_HEAD} home.
      </p>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The long caption ending in an inline-block element, which lays out as one
 * box.
 */
export const GalleryWithInlineBlockCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <>
      {LONG_CAPTION_HEAD}{' '}
      <span style={{display: 'inline-block', paddingInline: 6}}>home.</span>
    </>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The paragraph caption with start padding, which narrows its lines.
 */
export const GalleryWithPaddedParagraphCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <p style={{paddingInlineStart: 64}}>{LONG_CAPTION_HEAD} home.</p>,
  ),
  render: GalleryWithCaptions.render,
};

/**
 * The paragraph caption, aligned to its end, as a caller may set it, ending in
 * end padding and an end border.
 */
export const GalleryWithEndAlignedParagraphCaptionFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: longCaptionArgs(
    <p style={{textAlign: 'end'}}>
      {LONG_CAPTION_HEAD}{' '}
      <span
        style={{
          paddingInlineEnd: 12,
          borderInlineEnd: '12px solid transparent',
        }}>
        home.
      </span>
    </p>,
  ),
  render: GalleryWithCaptions.render,
};

const FRAME_DOCUMENT = '<!doctype html><html><head></head><body></body></html>';

/** Copy the page's style sheets into the frame, as an app does. */
function adoptPageStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    if (
      sheet.href != null &&
      new URL(sheet.href).origin !== window.location.origin
    ) {
      continue;
    }
    const style = target.createElement('style');
    style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join(
      '\n',
    );
    target.head.append(style);
  }
}

function CaptionGallery({
  media,
}: Pick<ComponentProps<typeof Lightbox>, 'media'>) {
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
}

/**
 * The gallery with captions in a same-origin iframe that fills the page, so its
 * elements come from a second document, as in a Picture-in-Picture window.
 */
export const GalleryWithCaptionsInFrameFixture: Story = {
  tags: ['!autodocs', 'no-visual'],
  args: GalleryWithCaptions.args,
  render: function GalleryInFrame({media}) {
    const [body, setBody] = useState<HTMLElement | null>(null);
    const handleLoad = useCallback(
      (event: SyntheticEvent<HTMLIFrameElement>) => {
        const frameDocument = event.currentTarget.contentDocument;
        if (frameDocument != null) {
          adoptPageStyles(frameDocument);
          setBody(frameDocument.body);
        }
      },
      [],
    );
    return (
      <>
        <iframe
          title="Second document"
          srcDoc={FRAME_DOCUMENT}
          onLoad={handleLoad}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
        {body != null && createPortal(<CaptionGallery media={media} />, body)}
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
