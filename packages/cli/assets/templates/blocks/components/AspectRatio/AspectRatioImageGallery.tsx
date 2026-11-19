// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Center} from '@astryxdesign/core/Center';
import {Grid} from '@astryxdesign/core/Grid';

const images = [
  {id: 1, alt: 'Mountain landscape'},
  {id: 2, alt: 'Ocean sunset'},
  {id: 3, alt: 'Forest trail'},
  {id: 4, alt: 'City skyline'},
  {id: 5, alt: 'Desert dunes'},
  {id: 6, alt: 'Snowy peaks'},
];

export default function AspectRatioImageGallery() {
  // Anchor a definite width so the grid renders in shrink-to-fit contexts
  // (e.g. the docsite example preview, which wraps blocks in a
  // `min-width: fit-content` container). Without a fixed-width ancestor,
  // the `width="100%"` grid collapses to zero — AspectRatio positions its
  // child absolutely, so it has no intrinsic width to size the grid from.
  return (
    <Center width={600} maxWidth="100%">
      <Grid columns={3} gap={4} width="100%">
        {images.map(({id, alt}) => (
          <AspectRatio key={id} ratio={4 / 3} fit="cover">
            <img
              src="/template-assets/illustrative-horizontal-1.png"
              alt={alt}
              style={{borderRadius: 'var(--radius-element)'}}
            />
          </AspectRatio>
        ))}
      </Grid>
    </Center>
  );
}
