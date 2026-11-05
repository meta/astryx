// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {useImageMode} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {MediaTheme} from '@astryxdesign/core/theme';

const NIGHT_PHOTO = '/template-assets/moody-scene-horizontal-1.png';
const BEACH_PHOTO = '/template-assets/light-scene-horizontal-1.png';

const CAPTION_REGION = {x: 0, y: 0, width: 1, height: 0.3};

export default function UseImageModeHookUsage() {
  const [isBeach, setIsBeach] = useState(false);
  const src = isBeach ? BEACH_PHOTO : NIGHT_PHOTO;
  const mode = useImageMode(src, {
    region: CAPTION_REGION,
    threshold: 0.4,
    fallback: 'dark',
  });

  return (
    <VStack gap={3}>
      <AspectRatio
        ratio={3 / 2}
        style={{
          width: 360,
          maxWidth: '100%',
          borderRadius: 'var(--radius-container)',
        }}>
        <img
          src={src}
          alt={isBeach ? 'A beach under a pale sky' : 'Snowy peaks at night'}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
        <div style={{position: 'absolute', inset: '0 0 auto', padding: 16}}>
          <MediaTheme mode={mode ?? 'off'}>
            <VStack gap={1}>
              <Text type="body" weight="bold">
                {isBeach ? 'Afternoon at the beach' : 'Night in the mountains'}
              </Text>
              <Text type="supporting">Sky behind the caption: {mode}</Text>
            </VStack>
          </MediaTheme>
        </div>
      </AspectRatio>
      <Switch label="Beach photo" value={isBeach} onChange={setIsBeach} />
    </VStack>
  );
}
