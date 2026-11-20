// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {MediaTheme} from '@astryxdesign/core/theme';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

const LANDSCAPE_IMAGE_URL = '/template-assets/light-scene-horizontal-1.png';

export default function MediaThemeImageOverlay() {
  const showToast = useToast();
  return (
    <AspectRatio
      ratio={16 / 9}
      style={{
        width: 360,
        maxWidth: '100%',
        borderRadius: 'var(--radius-container)',
      }}>
      <img
        src={LANDSCAPE_IMAGE_URL}
        alt="Landscape"
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <Section
        variant="transparent"
        padding={4}
        style={{
          position: 'absolute',
          insetInline: 0,
          insetBlockEnd: 0,
          background:
            'linear-gradient(180deg, transparent, rgba(10,19,23,0.78))',
        }}>
        <MediaTheme mode="dark">
          <Stack direction="vertical" gap={2}>
            <Text type="body" weight="bold">
              Product launch livestream
            </Text>
            <Text type="supporting" color="secondary">
              MediaTheme keeps overlay text and controls readable without
              hard-coded color overrides.
            </Text>
            <Stack direction="horizontal" gap={2} wrap="wrap">
              <Button
                label="Watch"
                size="sm"
                onClick={() =>
                  showToast({body: 'Demo: the video would play here'})
                }
              />
              <Button
                label="Details"
                variant="secondary"
                size="sm"
                onClick={() =>
                  showToast({body: 'Demo: the details would open here'})
                }
              />
            </Stack>
          </Stack>
        </MediaTheme>
      </Section>
    </AspectRatio>
  );
}
