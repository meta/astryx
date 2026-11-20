// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {RefObject} from 'react';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {useOverlay} from '@astryxdesign/core/Overlay';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function UseOverlayHookUsage() {
  const showToast = useToast();
  const overlay = useOverlay({
    showOn: 'hover',
    position: 'bottom',
    align: 'center',
    content: (
      <Button
        label="Quick view"
        variant="secondary"
        size="sm"
        onClick={() =>
          showToast({body: 'Demo: a quick view of the product would open here'})
        }
      />
    ),
  });

  return (
    <Card
      width={280}
      padding={0}
      ref={overlay.containerRef as RefObject<HTMLDivElement | null>}
      {...overlay.containerProps}>
      <div style={{position: 'relative'}}>
        <a href="#ceramic-mug">
          <AspectRatio ratio={1}>
            <img
              src="/template-assets/light-product-1.png"
              alt="Ceramic mug"
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          </AspectRatio>
        </a>
        {overlay.element}
      </div>
      <VStack gap={1} padding={3}>
        <Text type="body" weight="bold">
          Ceramic mug
        </Text>
        <Text type="supporting" color="secondary">
          $24
        </Text>
      </VStack>
    </Card>
  );
}
