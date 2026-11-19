// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

const forestTheme = defineTheme({
  name: 'forest-docs',
  tokens: {
    '--color-accent': ['#15803D', '#86EFAC'],
    '--color-background-card': ['#FFFFFF', '#0F3D24'],
    '--color-text-primary': ['#052E16', '#DCFCE7'],
    '--color-text-secondary': ['#166534', '#BBF7D0'],
    '--color-border': ['#BBF7D0', '#15803D66'],
  },
});

export default function ThemeApply() {
  const showToast = useToast();
  return (
    <Section variant="muted" padding={4} maxWidth={420}>
      <Theme theme={forestTheme}>
        <Card padding={4} width="100%">
          <Stack direction="vertical" gap={3}>
            <Heading level={4}>Forest workspace</Heading>
            <Text type="body" color="secondary">
              Wrap any subtree to apply a theme locally.
            </Text>
            <Button
              label="Create project"
              onClick={() =>
                showToast({body: 'Demo: a new project would be created here'})
              }
            />
          </Stack>
        </Card>
      </Theme>
    </Section>
  );
}
