// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {MediaTheme} from '@astryxdesign/core/theme';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';

const SHOWCASE_IMAGE_URL = '/template-assets/light-scene-horizontal-1.png';

export default function MediaThemeShowcase() {
  const showToast = useToast();
  return (
    <Section
      variant="transparent"
      padding={4}
      style={{
        width: 360,
        maxWidth: '100%',
        minHeight: 230,
        display: 'flex',
        alignItems: 'flex-end',
        backgroundImage: `linear-gradient(180deg, rgba(10,19,23,0.05) 0%, rgba(10,19,23,0.82) 100%), url(${SHOWCASE_IMAGE_URL})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: 'var(--radius-container)',
        boxShadow: 'var(--shadow-med)',
      }}>
      <MediaTheme mode="dark">
        <Stack direction="vertical" gap={3}>
          <Stack direction="horizontal" gap={2} vAlign="center">
            <Icon icon="info" size="md" />
            <Text type="body" weight="bold">
              Media overlay
            </Text>
            <Badge label="Live" />
          </Stack>
          <Text type="supporting" color="secondary">
            Text, icons, badges, and button variants inherit legible colors on
            top of the dark image treatment.
          </Text>
          <Stack direction="horizontal" gap={2} wrap="wrap">
            <Button
              label="Primary"
              variant="primary"
              size="sm"
              onClick={() =>
                showToast({body: 'Demo: the primary action would run here'})
              }
            />
            <Button
              label="Secondary"
              variant="secondary"
              size="sm"
              onClick={() =>
                showToast({body: 'Demo: the secondary action would run here'})
              }
            />
            <Button
              label="Ghost"
              variant="ghost"
              size="sm"
              onClick={() =>
                showToast({body: 'Demo: the ghost action would run here'})
              }
            />
          </Stack>
        </Stack>
      </MediaTheme>
    </Section>
  );
}
