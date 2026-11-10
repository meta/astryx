// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A single photo and a gallery in Lightbox, with captions long
 *   enough to end in "more"
 * @position A raw Sandbox page (/pages/lightbox-long-caption/) with no
 *   sandbox frame. The document scrolls, as a product page does.
 */

import {Grid} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {VStack} from '@astryxdesign/core/Layout';
import {useLightbox} from '@astryxdesign/core/Lightbox';
import {Text} from '@astryxdesign/core/Text';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';

const SINGLE = {
  src: '/template-assets/light-scene-horizontal-1.png',
  alt: 'Coastal shoreline with ocean waves',
  caption:
    "Low tide on the north coast, a little after seven in the morning. The water had pulled back far enough to show the sandbar, and the wet sand held the light for a few minutes before the clouds came in from the west. Gulls worked the shallows, and a lone runner kept to the hard sand near the water's edge. Further down the beach, the old pier still stands, though only its first section is open; the rest has been closed since the winter storms took out part of the deck. The town has a plan to repair it, but the work keeps slipping, so for now the far end belongs to the cormorants. If you visit, park at the north lot and walk south along the dunes. The path is sandy but easy, and it takes about twenty minutes to reach the pier. A small café at the trailhead opens at eight, and its cinnamon rolls are worth the wait. Bring a jacket: even in summer, the wind off the water is cold in the early morning, and it picks up again in the late afternoon. The best light comes in the first hour after sunrise, when the cliffs to the south turn a warm orange and the whole beach is still empty.",
};

const GALLERY = [
  {
    src: '/template-assets/Neutral-Backpack.png',
    alt: 'Backpack',
    // Two paragraphs: a caption can be any React node.
    caption: (
      <>
        A canvas backpack on a plain backdrop, shot for the spring catalog. It
        holds a 16-inch laptop in a padded sleeve, with two side pockets for
        bottles and a hidden pocket at the back for a passport.
        <br />
        <br />
        The straps are padded with a breathable mesh, and the bottom panel is
        waxed, so the bag can sit on wet ground without soaking through. It
        comes in four colors, and each one is made from recycled fabric.
      </>
    ),
  },
  {
    src: '/template-assets/building.png',
    alt: 'Modern building',
    caption:
      'A modern office building in the late afternoon. Its glass front reflects the clouds and the trees across the street, seen from the plaza where people meet at lunch.',
  },
  {
    src: '/template-assets/light-scene-horizontal-1.png',
    alt: 'Coastal shoreline with ocean waves',
    caption:
      'The same coast an hour later, after the clouds came in. The light went flat and silver, and the waves picked up as the tide turned. Two surfers paddled out past the sandbar and waited for a set that never quite came, while a dog ran back and forth along the foam line, chasing the gulls it could never catch. By nine the beach had filled with families, and the café at the trailhead had a line out the door.',
  },
  {
    src: '/template-assets/illustrative-vertical-1.png',
    alt: 'Illustrated lakeside landscape at sunset',
    caption: 'Pink clouds over a calm lake at sunset.',
  },
];

// Text before and between the sections, so the document scrolls behind the
// viewer on a phone.
const FILLER = [
  'Tap a photo to open it. A caption longer than two lines ends in "more": tap it to read the whole caption over the photo, and tap "less" to close it again.',
  'The single photo has one long paragraph, long enough to scroll when it is open on a phone. In the gallery, the first caption has two paragraphs, the second is a little over two lines, the third is long, and the last fits on one line.',
];

export default function LightboxLongCaptionPage() {
  const single = useLightbox({media: SINGLE});
  const gallery = useLightbox({media: GALLERY});

  return (
    <VStack gap={6} padding={4}>
      <Heading level={1}>Lightbox: long captions</Heading>
      {FILLER.map(text => (
        <Text key={text} type="body">
          {text}
        </Text>
      ))}
      <VStack gap={3}>
        <Heading level={2}>A single photo</Heading>
        <Thumbnail
          src={SINGLE.src}
          alt={SINGLE.alt}
          label="Low tide"
          onClick={() => single.open()}
        />
      </VStack>
      <VStack gap={3}>
        <Heading level={2}>A gallery</Heading>
        <Grid columns={2} gap={2}>
          {GALLERY.map((photo, i) => (
            <Thumbnail
              key={photo.alt + i}
              src={photo.src}
              alt={photo.alt}
              label={photo.alt}
              onClick={() => gallery.open(i)}
            />
          ))}
        </Grid>
      </VStack>
      {FILLER.map(text => (
        <Text key={`end-${text}`} type="body">
          {text}
        </Text>
      ))}
      {single.element}
      {gallery.element}
    </VStack>
  );
}
