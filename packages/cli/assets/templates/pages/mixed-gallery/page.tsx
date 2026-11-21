// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {CSSProperties} from 'react';
import {VStack, Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';

// ─── Styles ────────────────────────────────────────────────────────────────
// The masonry needs a responsive column count AND a hero that spans 2 columns
// on desktop but goes full-width on mobile. Grid forces grid-template-columns
// inline, so a responsive span can't be expressed through its props — this is a
// @container grid (the sanctioned Astryx pattern for container-responsive layout).
// The container query lives in a plain <style> tag below so it needs NO CSS
// compiler. Image fill + radius are custom because Astryx has no image
// primitive (#2582).

// Named inline-size container on the page column so the grid responds to the
// available content width (works inside the sandbox's resizable preview).
const containerStyle: CSSProperties = {
  containerType: 'inline-size',
  containerName: 'gallery',
};
// Fills the AspectRatio box. No objectFit prop on AspectRatio (#2582).
const imgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};
// Rounds the image corners. No radius prop on AspectRatio (#2582).
const clipStyle: CSSProperties = {
  borderRadius: 'var(--radius-element)',
};

// 3 columns on desktop, dropping straight to 1 column below 720px (no 2-col
// middle state). minmax(0, 1fr) (not 1fr) so tracks split evenly and ignore the
// images' intrinsic min-width. The hero spans 2 columns on desktop, then fills
// the row once it's single-column — and switches from 3:1 to 3:2 with a plain
// aspect-ratio override. AspectRatio's ratio is a class-level declaration in
// @layer astryx-base, and this <style> tag is unlayered, so the override wins
// regardless of specificity — every stacked tile is uniform without rendering
// the hero twice.
const GALLERY_CSS = `
.mixed-gallery-grid {
  display: grid;
  gap: var(--spacing-3);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.mixed-gallery-hero {
  grid-column: span 2;
}
@container gallery (max-width: 720px) {
  .mixed-gallery-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .mixed-gallery-hero {
    grid-column: 1 / -1;
    aspect-ratio: 3 / 2;
  }
}
`;

// ─── Gallery Data ───────────────────────────────────────────────────────────

interface GalleryImage {
  src: string;
  title: string;
}

// All landscape photos so the uniform 3:2 / 3:1 tiles crop cleanly.
const IMAGES: GalleryImage[] = [
  {
    src: '/template-assets/illustrative-horizontal-1.png',
    title: 'Going places',
  },
  {
    src: '/template-assets/light-home-horizontal-1.png',
    title: 'Making memories',
  },
  {
    src: '/template-assets/light-lifestyle-horizontal-1.png',
    title: 'Being free',
  },
  {
    src: '/template-assets/light-working-horizontal-2.png',
    title: 'Getting it done',
  },
  {
    src: '/template-assets/light-scene-horizontal-1.png',
    title: 'Finding calm',
  },
];

// ─── Gallery Card ─────────────────────────────────────────────────────────
// AspectRatio gives every cell a definite, self-contained height from its
// ratio, so images can't overflow their grid cell (no row-track guesswork).

function GalleryCard({
  image,
  ratio,
  className,
}: {
  image: GalleryImage;
  ratio: number;
  className?: string;
}) {
  return (
    <AspectRatio ratio={ratio} className={className} style={clipStyle}>
      <img src={image.src} alt={image.title} style={imgStyle} />
    </AspectRatio>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function MixedGalleryTemplate() {
  return (
    <Layout
      height="fill"
      contentWidth={1400}
      content={
        <LayoutContent role="main" padding={6}>
          <style>{GALLERY_CSS}</style>
          <VStack gap={6} style={containerStyle}>
            {/* Header */}
            <VStack gap={2} hAlign="center">
              <Heading level={1} justify="center">
                Make every day a little more delightful, one detail at a time.
              </Heading>
              <Text type="body" justify="center">
                We believe the smallest details are the ones that matter most.
                That&apos;s what turns an ordinary day into something worth
                remembering.
              </Text>
            </VStack>

            {/* Featured layout — a wide hero next to a single tile, above a row
                of three. Every tile is 3:2 except the hero, which is 3:1 so that
                (being 2 columns wide) it matches the row height exactly. All
                rows are therefore the same height. Responsive via @container:
                3 columns → 1 column at ≤720px, where the hero drops to 3:2 so
                the stacked tiles are uniform. */}
            <div className="mixed-gallery-grid">
              {/* Hero — spans 2 columns; 3:1 keeps it level with the sidebar.
                  Stacked, the unlayered aspect-ratio override switches it to
                  3:2 (see GALLERY_CSS) — one element, no duplicate hero
                  markup. */}
              <GalleryCard
                image={IMAGES[0]}
                ratio={3 / 1}
                className="mixed-gallery-hero"
              />

              {/* Sidebar — same height as the hero */}
              <GalleryCard image={IMAGES[2]} ratio={3 / 2} />

              {/* Bottom row — three equal tiles */}
              <GalleryCard image={IMAGES[3]} ratio={3 / 2} />
              <GalleryCard image={IMAGES[4]} ratio={3 / 2} />
              <GalleryCard image={IMAGES[1]} ratio={3 / 2} />
            </div>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
