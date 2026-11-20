// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core';
import {Card} from '@astryxdesign/core/Card';
import {Switch} from '@astryxdesign/core/Switch';

const styles = stylex.create({
  main: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  container: {
    maxWidth: 640,
    width: '100%',
  },
  layerDemo: {
    padding: '1.5rem',
    borderRadius: 12,
    backgroundColor: 'var(--color-background-secondary)',
  },
  customButton: {
    borderRadius: 999,
  },
  wideButton: {
    width: '100%',
  },
  brandSecondary: {
    backgroundColor: 'mediumseagreen',
    color: 'white',
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '1rem',
    backgroundColor: 'var(--color-background-body)',
  },
  prefixDemo: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    padding: '0.5rem',
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 6,
    overflowX: 'auto',
  },
});

export default function Home() {
  const [email, setEmail] = useState('');
  const [toggle, setToggle] = useState(false);

  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.container)}>
        <VStack gap={6}>
          <VStack gap={2}>
            <Heading level={1}>Astryx + Next.js (Source Build)</Heading>
            <Text type="body" color="secondary">
              This example compiles{' '}
              <Text type="body" weight="bold">
                @astryxdesign/core
              </Text>{' '}
              from raw TypeScript + StyleX source. The{' '}
              <Text type="body" weight="bold">
                @astryxdesign/build
              </Text>{' '}
              package provides a babel plugin and PostCSS plugin that compile
              library and product code with separate class name prefixes,
              enabling independent CSS layers.
            </Text>
          </VStack>

          <Divider />

          {/* Layer Demo */}
          <VStack gap={3}>
            <Heading level={2}>Layer Demo</Heading>
            <Text type="body" color="secondary">
              Four CSS layers in strict order. Product styles override theme,
              theme overrides base, all without <code>!important</code>.
            </Text>

            <div {...stylex.props(styles.layerDemo)}>
              <VStack gap={4}>
                {/* Base layer */}
                <VStack gap={1}>
                  <Text type="supporting" weight="bold">
                    1. astryx-base — default component styles
                  </Text>
                  <HStack gap={3} vAlign="center">
                    <Button label="Primary" variant="primary" />
                    <Button label="Secondary" variant="secondary" />
                    <Button label="Ghost" variant="ghost" />
                  </HStack>
                </VStack>

                {/* Theme layer */}
                <VStack gap={1}>
                  <Text type="supporting" weight="bold">
                    2. astryx-theme — theme overrides base
                  </Text>
                  <Text type="supporting" color="secondary">
                    The secondary button background comes from the theme layer,
                    overriding the base default.
                  </Text>
                  <HStack gap={3} vAlign="center">
                    <Button label="Theme color" variant="secondary" />
                    <Badge variant="info" label="Themed" />
                    <Badge variant="success" label="Themed" />
                  </HStack>
                </VStack>

                {/* Product layer overrides */}
                <VStack gap={1}>
                  <Text type="supporting" weight="bold">
                    3. product — product overrides theme
                  </Text>
                  <Text type="supporting" color="secondary">
                    Product styles use a different class prefix (x vs astryx) so
                    they don't collide with library classes in the base layer.
                  </Text>
                  <HStack gap={3} vAlign="center">
                    <Button
                      label="Pill shape"
                      variant="primary"
                      xstyle={styles.customButton}
                    />
                    <Button
                      label="Green override"
                      variant="secondary"
                      xstyle={styles.brandSecondary}
                    />
                  </HStack>
                </VStack>

                {/* Full width */}
                <Button
                  label="Full width product override"
                  variant="primary"
                  xstyle={styles.wideButton}
                />
              </VStack>
            </div>
          </VStack>

          <Divider />

          {/* Class prefix verification */}
          <VStack gap={3}>
            <Heading level={2}>Class Prefix Verification</Heading>
            <Text type="body" color="secondary">
              Inspect these elements in devtools. Astryx library classes start
              with <code>astryx</code>, product classes start with{' '}
              <code>x</code>.
            </Text>
            <Card padding={4}>
              <VStack gap={2}>
                <Text type="supporting" weight="bold">
                  This card is an Astryx component → astryx-prefixed classes
                </Text>
                <div {...stylex.props(styles.prefixDemo)}>
                  This div uses product StyleX → x-prefixed classes
                </div>
              </VStack>
            </Card>
          </VStack>

          <Divider />

          {/* Form components */}
          <VStack gap={3}>
            <Heading level={2}>Form Components</Heading>
            <TextInput
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChange={setEmail}
            />
            <Switch
              label="Enable notifications"
              value={toggle}
              onChange={checked => setToggle(checked)}
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

          <Divider />

          {/* How it works */}
          <VStack gap={3}>
            <Heading level={2}>How It Works</Heading>
            <div {...stylex.props(styles.card)}>
              <VStack gap={2}>
                <Text type="body">
                  <code>@astryxdesign/build/babel</code> wraps the StyleX babel
                  plugin and routes files to two internal instances with
                  different <code>classNamePrefix</code> values based on file
                  path.
                </Text>
                <Text type="body">
                  <code>@astryxdesign/build/postcss</code> does the same for CSS
                  extraction, placing each group in its own <code>@layer</code>{' '}
                  block.
                </Text>
                <Text type="body">
                  Open devtools → CSS layers panel to see:{' '}
                  <code>
                    reset &lt; astryx-base &lt; astryx-theme &lt; product
                  </code>
                </Text>
              </VStack>
            </div>
          </VStack>
        </VStack>
      </div>
    </main>
  );
}
