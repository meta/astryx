// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Section} from '@astryxdesign/core/Section';
import {Stack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {useToast} from '@astryxdesign/core/Toast';

const warmTheme = defineTheme({
  name: 'warm-docs',
  tokens: {
    '--color-accent': ['#D97706', '#FBBF24'],
    '--color-background-surface': ['#FFF7ED', '#1F1300'],
    '--color-background-card': ['#FFFBEB', '#2A1A05'],
    '--color-text-primary': ['#3B2F15', '#FEF3C7'],
    '--color-text-secondary': ['#92400E', '#FCD34D'],
    '--color-border': ['#FED7AA', '#92400E66'],
    '--radius-container': '20px',
  },
});

const forestTheme = defineTheme({
  name: 'forest-docs',
  tokens: {
    '--color-accent': ['#15803D', '#86EFAC'],
    '--color-background-surface': ['#F0FDF4', '#052E16'],
    '--color-background-card': ['#FFFFFF', '#0F3D24'],
    '--color-text-primary': ['#052E16', '#DCFCE7'],
    '--color-text-secondary': ['#166534', '#BBF7D0'],
    '--color-border': ['#BBF7D0', '#15803D66'],
    '--radius-container': '8px',
  },
});

function ThemeCard({label}: {label: string}) {
  const showToast = useToast();
  return (
    <Card padding={4} width="100%">
      <Stack direction="vertical" gap={3}>
        <Stack direction="horizontal" gap={2} vAlign="center">
          <Heading level={4}>{label}</Heading>
          <Badge label="Active" variant="success" />
        </Stack>
        <Text type="body" color="secondary">
          The same content inherits this provider's colors, typography, radius,
          and component treatment.
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
    </Card>
  );
}

export default function ThemeShowcase() {
  return (
    <Section variant="muted" padding={4} maxWidth={600}>
      <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={3} width="100%">
        <Theme theme={warmTheme}>
          <ThemeCard label="Warm" />
        </Theme>
        <Theme theme={forestTheme}>
          <ThemeCard label="Forest" />
        </Theme>
      </Grid>
    </Section>
  );
}
