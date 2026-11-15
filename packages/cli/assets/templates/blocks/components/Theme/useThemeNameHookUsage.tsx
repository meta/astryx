// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Theme, defineTheme, useThemeName} from '@astryxdesign/core/theme';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';

const harborTheme = defineTheme({
  name: 'harbor',
  tokens: {
    '--color-accent': ['#1D4ED8', '#93C5FD'],
    '--color-background-card': ['#FFFFFF', '#0F172A'],
    '--color-text-primary': ['#0F172A', '#E2E8F0'],
  },
});

function ThemeName() {
  const name = useThemeName();
  return <Text type="body">{name ?? 'No theme'}</Text>;
}

export default function UseThemeNameHookUsage() {
  return (
    <Theme theme={harborTheme}>
      <Card padding={4} width={280}>
        <ThemeName />
      </Card>
    </Theme>
  );
}
