// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Card} from '@astryxdesign/core/Card';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading} from '@astryxdesign/core/Text';
import {Theme} from '@astryxdesign/core/theme';
import {VStack} from '@astryxdesign/core/VStack';
import {themes, defaultThemeSlug} from './astryx-themes';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  return (
    <Theme theme={themes[defaultThemeSlug]} mode={isDark ? 'dark' : 'light'}>
      <AppShell variant="surface" height="auto" contentPadding={6}>
        <Card maxWidth={480}>
          <VStack gap={4}>
            <Heading level={2}>Appearance</Heading>
            <Switch label="Dark mode" value={isDark} onChange={setIsDark} />
          </VStack>
        </Card>
      </AppShell>
    </Theme>
  );
}
