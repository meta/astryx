// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core';

export default function Home() {
  const [email, setEmail] = useState('');
  return (
    <main
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
      }}>
      <div style={{maxWidth: 640, width: '100%'}}>
        <VStack gap={6}>
          <VStack gap={2}>
            <Heading level={1}>Astryx Example — Next.js (Dist)</Heading>
            <Text type="body" color="secondary">
              This example consumes{' '}
              <Text type="body" weight="bold">
                @astryxdesign/core
              </Text>{' '}
              as a pre-built dist package: no StyleX build plugin needed. Plain
              inline styles handle layout. Astryx handles components, theming,
              and design tokens.
            </Text>
          </VStack>

          <Divider />

          {/* Buttons */}
          <VStack gap={3}>
            <Heading level={2}>Buttons</Heading>
            <HStack gap={3} vAlign="center">
              <Button label="Primary" variant="primary" />
              <Button label="Secondary" variant="secondary" />
              <Button label="Ghost" variant="ghost" />
            </HStack>
          </VStack>

          <Divider />

          {/* Badges */}
          <VStack gap={3}>
            <Heading level={2}>Badges</Heading>
            <HStack gap={3} vAlign="center">
              <Badge variant="info" label="Info" />
              <Badge variant="success" label="Success" />
              <Badge variant="warning" label="Warning" />
              <Badge variant="error" label="Error" />
            </HStack>
          </VStack>

          <Divider />

          {/* Text Input */}
          <VStack gap={3}>
            <Heading level={2}>Text Input</Heading>
            <TextInput
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
            />
          </VStack>

          <Divider />

          {/* Typography */}
          <VStack gap={3}>
            <Heading level={2}>Typography</Heading>
            <Text type="large" weight="bold">
              Large bold text
            </Text>
            <Text type="body">Default body text</Text>
            <Text type="supporting" color="secondary">
              Supporting text in secondary color
            </Text>
          </VStack>
        </VStack>
      </div>
    </main>
  );
}
