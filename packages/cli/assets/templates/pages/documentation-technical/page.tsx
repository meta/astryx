// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useSyncExternalStore, type CSSProperties} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {List, ListItem} from '@astryxdesign/core/List';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {Outline, type OutlineItem} from '@astryxdesign/core/Outline';
import {useClipboard, useMediaQuery} from '@astryxdesign/core/hooks';
import {useToast} from '@astryxdesign/core/Toast';
import {
  SparklesIcon,
  ClipboardDocumentIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const OUTLINE_ITEMS: OutlineItem[] = [
  {id: 'prerequisites', label: 'Prerequisites', level: 2},
  {id: 'install-package', label: 'Install the package', level: 2},
  {id: 'configure-theming', label: 'Configure theming', level: 2},
  {id: 'next-steps', label: 'Next steps', level: 2},
];

const outlinePanel: CSSProperties = {
  position: 'sticky',
  top: 24,
  alignSelf: 'start',
  paddingBlockStart: 120,
};

/** Whether the page runs script never changes, so nothing is subscribed. */
const subscribeToNothing = () => () => {};

export default function TechnicalDocumentationPage() {
  const {copy} = useClipboard();
  const showToast = useToast();
  // Mobile first: the server render and a shared static copy, which run no
  // script, get one column with the section links on top. That reads well at
  // every width; once script runs, wide screens move the links to the rail.
  const isMobile = useMediaQuery('(max-width: 768px)', true);
  // Copy buttons need script, so they appear once the page runs rather than
  // sitting in a static copy as buttons that do nothing.
  const isInteractive = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  return (
    <Layout
      height="auto"
      contentWidth={960}
      end={
        isMobile ? undefined : (
          <LayoutPanel
            isScrollable={false}
            label="On this page"
            role="complementary"
            style={outlinePanel}>
            <Outline items={OUTLINE_ITEMS} />
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent role="main" isScrollable={false} padding={8}>
          <VStack gap={8}>
            <VStack gap={2}>
              <Text as="h1" type="display-1">
                Getting started with Product Name
              </Text>
              <Text type="supporting" color="secondary">
                Last updated March 30, 2026
              </Text>
              {isMobile && <Outline items={OUTLINE_ITEMS} />}
            </VStack>

            <Card>
              <VStack gap={3}>
                <HStack wrap="wrap" gap={2} vAlign="center">
                  <StackItem size="fill">
                    <HStack gap={2} vAlign="center">
                      <Icon icon={SparklesIcon} size="sm" color="secondary" />
                      <Text type="body" weight="semibold">
                        AI Assistance
                      </Text>
                    </HStack>
                  </StackItem>
                  {isInteractive && (
                    <Button
                      label="Copy prompt"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ClipboardDocumentIcon} />}
                      onClick={() => {
                        void copy(
                          'Help me get set up with Product Name. Based on my project, do the following: 1. Install @astryxdesign/core and import its precompiled reset.css and astryx.css once at the app entry point. 2. Wrap my app in Theme with a theme package such as @astryxdesign/theme-neutral. 3. Replace one existing component with an Astryx equivalent. After setup, suggest relevant next steps based on my project.',
                        );
                      }}
                    />
                  )}
                  <DropdownMenu
                    button={{
                      label: 'More options',
                      variant: 'ghost',
                      size: 'sm',
                      isIconOnly: true,
                      icon: <Icon icon={ChevronDownIcon} />,
                    }}
                    items={[
                      {
                        label: 'Open in v0',
                        onClick: () =>
                          // Demo only: replace this toast with the link that opens the prompt.
                          showToast({
                            body: 'Demo: this would open the prompt in v0 here',
                            uniqueID: 'open-v0',
                          }),
                      },
                      {
                        label: 'Open in Claude',
                        onClick: () =>
                          // Demo only: replace this toast with the link that opens the prompt.
                          showToast({
                            body: 'Demo: this would open the prompt in Claude here',
                            uniqueID: 'open-claude',
                          }),
                      },
                      {
                        label: 'Open in ChatGPT',
                        onClick: () =>
                          // Demo only: replace this toast with the link that opens the prompt.
                          showToast({
                            body: 'Demo: this would open the prompt in ChatGPT here',
                            uniqueID: 'open-chatgpt',
                          }),
                      },
                      {
                        label: 'Open in Cursor',
                        onClick: () =>
                          // Demo only: replace this toast with the link that opens the prompt.
                          showToast({
                            body: 'Demo: this would open the prompt in Cursor here',
                            uniqueID: 'open-cursor',
                          }),
                      },
                    ]}
                  />
                </HStack>
                <Text type="body" color="secondary">
                  Help me get set up with Product Name. Based on my project, do
                  the following: 1. Install @astryxdesign/core and import its
                  precompiled reset.css and astryx.css once at the app entry
                  point. 2. Wrap my app in Theme with a theme package such as
                  @astryxdesign/theme-neutral. 3. Replace one existing component
                  with an Astryx equivalent.
                </Text>
              </VStack>
            </Card>

            <VStack gap={4}>
              <Heading id="prerequisites" level={2}>
                Prerequisites
              </Heading>
              <List density="compact" listStyle="disc">
                {/* A node label wraps on a narrow screen; a string label
                    truncates to one line. */}
                <ListItem label={<>Node.js 18+</>} />
                <ListItem label={<>React 19 or later</>} />
                <ListItem label={<>A package manager (npm, yarn, or pnpm)</>} />
              </List>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="install-package" level={2}>
                Install the package
              </Heading>
              <Text type="body">
                Every project starts with installing the core package. This
                gives you access to all components, tokens, and utilities.
              </Text>
              <VStack gap={2}>
                <Text type="body" weight="bold">
                  Step 1: Install the core package
                </Text>
                <CodeBlock
                  hasCopyButton={isInteractive}
                  code="npm install @astryxdesign/core"
                  language="bash"
                  width="100%"
                />
              </VStack>
              <VStack gap={2}>
                <Text type="body" weight="bold">
                  Step 2: Import the precompiled styles
                </Text>
                <Text type="body" color="secondary">
                  Astryx ships precompiled CSS, so there is no build plugin to
                  configure. Import the reset and component stylesheets once at
                  your app entry point.
                </Text>
                <CodeBlock
                  hasCopyButton={isInteractive}
                  code={`import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';`}
                  language="tsx"
                  width="100%"
                />
              </VStack>
              <VStack gap={2}>
                <Text type="body" weight="bold">
                  Step 3: Import your first component
                </Text>
                <CodeBlock
                  hasCopyButton={isInteractive}
                  code={`import { Button } from '@astryxdesign/core/Button';

export default function App() {
  return <Button label="Hello Astryx" variant="primary" />;
}`}
                  language="tsx"
                  width="100%"
                />
              </VStack>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="configure-theming" level={2}>
                Configure theming
              </Heading>
              <Text type="body">
                Astryx ships with a default theme that works out of the box. To
                customize colors, typography, and spacing, install a theme
                package, import its stylesheet, and wrap your app in Theme.
              </Text>
              <CodeBlock
                hasCopyButton={isInteractive}
                code={`import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import '@astryxdesign/theme-neutral/theme.css';

export default function App({ children }) {
  return <Theme theme={neutralTheme}>{children}</Theme>;
}`}
                language="tsx"
                width="100%"
              />
              <Text type="body" color="secondary">
                See the theming guide for the full list of customizable tokens.
              </Text>
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="next-steps" level={2}>
                Next steps
              </Heading>
              <List density="compact" listStyle="disc">
                <ListItem
                  label={
                    <>
                      Fundamental concepts — How theming, layout, and
                      composition work
                    </>
                  }
                />
                <ListItem
                  label={
                    <>
                      Component API reference — Props, variants, and examples
                      for every component
                    </>
                  }
                />
                <ListItem
                  label={
                    <>
                      Accessibility — Built-in a11y features and ARIA patterns
                    </>
                  }
                />
                <ListItem
                  label={
                    <>CLI tools — Scaffold projects and manage templates</>
                  }
                />
                <ListItem
                  label={
                    <>Design tokens — Colors, spacing, typography, and sizing</>
                  }
                />
              </List>
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
