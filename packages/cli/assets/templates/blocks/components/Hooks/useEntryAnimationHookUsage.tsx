// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {
  useEntryAnimation,
  type EntryAnimationPreset,
} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const PRESETS: EntryAnimationPreset[] = [
  'slideDown',
  'slideUp',
  'fadeIn',
  'scaleIn',
];

const styles = stylex.create({
  notice: {
    width: '100%',
  },
});

function ValidationNotice({
  preset,
  message,
}: {
  preset: EntryAnimationPreset;
  message: string;
}) {
  const entryStyle = useEntryAnimation(preset);
  return (
    <div
      {...stylex.props(styles.notice, entryStyle)}
      data-testid="entry-notice">
      <Card padding={3}>
        <Text type="body">{message}</Text>
      </Card>
    </div>
  );
}

export default function UseEntryAnimationHookUsage() {
  const [preset, setPreset] = useState<EntryAnimationPreset>('slideDown');
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Card width={380} padding={4}>
      <VStack gap={3}>
        <Heading level={3}>Mount-only entry animation</Heading>
        <Text type="body" color="secondary">
          Dynamically mounted notices animate using the selected preset.
        </Text>

        <HStack gap={2}>
          {PRESETS.map(item => (
            <Button
              key={item}
              label={item}
              variant={preset === item ? 'primary' : 'secondary'}
              aria-pressed={preset === item}
              onClick={() => {
                setPreset(item);
                setIsVisible(false);
              }}
            />
          ))}
        </HStack>

        <HStack gap={2}>
          <Button
            label={isVisible ? 'Dismiss notice' : 'Show notice'}
            variant="secondary"
            onClick={() => setIsVisible(visible => !visible)}
          />
        </HStack>

        {isVisible && (
          <ValidationNotice
            key={preset}
            preset={preset}
            message={`Mounted dynamically with the "${preset}" preset.`}
          />
        )}
      </VStack>
    </Card>
  );
}
