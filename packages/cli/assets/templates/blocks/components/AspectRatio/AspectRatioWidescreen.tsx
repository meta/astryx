// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Center} from '@astryxdesign/core/Center';

export default function AspectRatioWidescreen() {
  return (
    <Center width={600} maxWidth="100%">
      <AspectRatio ratio={16 / 9} fit="cover">
        <img
          src="/template-assets/light-scene-horizontal-1.png"
          alt="16:9 widescreen"
        />
      </AspectRatio>
    </Center>
  );
}
