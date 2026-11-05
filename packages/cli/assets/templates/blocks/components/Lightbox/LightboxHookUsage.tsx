// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useLightbox} from '@astryxdesign/core/Lightbox';
import {Grid} from '@astryxdesign/core/Grid';

const PHOTOS = [
  {
    src: '/template-assets/Neutral-Backpack.png',
    alt: 'Backpack',
    caption: 'Backpack on a neutral background',
  },
  {
    src: '/template-assets/Neutral-Blanket.png',
    alt: 'Blanket',
    caption: 'Cozy blanket on a neutral background',
  },
  {
    src: '/template-assets/Neutral-Headphones.png',
    alt: 'Headphones',
    caption: 'Wireless headphones on a neutral background',
  },
  {
    src: '/template-assets/Neutral-Tumbler.png',
    alt: 'Tumbler',
    caption: 'Stainless tumbler on a neutral background',
  },
  {
    src: '/template-assets/Neutral-Wallet.png',
    alt: 'Wallet',
    caption: 'Leather wallet on a neutral background',
  },
  {
    src: '/template-assets/Neutral-Watch.png',
    alt: 'Watch',
    caption: 'Wristwatch on a neutral background',
  },
];

export default function LightboxHookUsage() {
  const lightbox = useLightbox({media: PHOTOS});

  return (
    <>
      <Grid columns={3} gap={2} width={304}>
        {PHOTOS.map((photo, i) => (
          <img
            key={photo.alt}
            src={photo.src}
            alt={photo.alt}
            width={96}
            height={96}
            style={{objectFit: 'cover'}}
            {...lightbox.getTriggerProps(i)}
          />
        ))}
      </Grid>
      {lightbox.element}
    </>
  );
}
