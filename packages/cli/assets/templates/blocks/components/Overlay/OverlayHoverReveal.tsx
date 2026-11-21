// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {CSSProperties} from 'react';
import {Overlay} from '@astryxdesign/core/Overlay';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

const frame: CSSProperties = {
  width: 420,
  maxWidth: '100%',
  borderRadius: 12,
  overflow: 'clip',
};

const image: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

export default function OverlayHoverReveal() {
  const showToast = useToast();
  return (
    <Overlay
      showOn="hover"
      align="center"
      content={
        <Button
          label="Quick view"
          variant="secondary"
          size="sm"
          onClick={() =>
            showToast({
              body: 'Demo: a quick view of the workspace would open here',
            })
          }
        />
      }>
      <AspectRatio ratio={16 / 9} style={frame}>
        <img
          src="/template-assets/light-working-horizontal-1.png"
          alt="Workspace preview"
          style={image}
        />
      </AspectRatio>
    </Overlay>
  );
}
