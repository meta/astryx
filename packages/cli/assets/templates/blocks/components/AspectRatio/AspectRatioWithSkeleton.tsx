// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Center} from '@astryxdesign/core/Center';

export default function AspectRatioWithSkeleton() {
  return (
    <Center width={600} maxWidth="100%">
      <AspectRatio ratio={16 / 9}>
        <Skeleton width="100%" height="100%" />
      </AspectRatio>
    </Center>
  );
}
