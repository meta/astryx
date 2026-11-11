// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {defineTheme, useThemeName} from '@astryxdesign/core/theme';
import {HStack, Stack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const warmTheme = defineTheme({
  name: 'warm-docs',
  tokens: {
    '--color-accent': ['#D97706', '#FBBF24'],
    '--color-background-surface': ['#FFF7ED', '#1F1300'],
    '--color-background-card': ['#FFFBEB', '#2A1A05'],
    '--color-text-primary': ['#3B2F15', '#FEF3C7'],
    '--color-text-secondary': ['#92400E', '#FCD34D'],
    '--color-border': ['#FED7AA', '#92400E66'],
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
  },
});

const themes = {
  Warm: warmTheme,
  Forest: forestTheme,
} as const;

type ThemeKey = keyof typeof themes;

export default function UseThemeNameHookUsage() {
  const [themeKey, setThemeKey] = useState<ThemeKey>('Warm');
  // Inside the provider this reads the context; there is no token
  // resolution, so a theme-identity consumer stays cheap.
  const themeName = useThemeName();

  return (
    <Stack direction="vertical" gap={3} width={420}>
      <HStack gap={2}>
        {(Object.keys(themes) as ThemeKey[]).map(key => (
          <Button
            key={key}
            label={key}
            variant={themeKey === key ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setThemeKey(key)}
          />
        ))}
      </HStack>
      <Theme theme={themes[themeKey]}>
        <Card padding={4} width="100%">
          <VStack gap={2} align="start">
            <Heading level={4}>Brand assets</Heading>
            <Text type="body" color="secondary">
              The logo and illustration set is picked from the theme identity.
            </Text>
            <Text type="body" weight="bold">
              useThemeName() → {themeName ?? 'null'}
            </Text>
          </VStack>
        </Card>
      </Theme>
    </Stack>
  );
}
