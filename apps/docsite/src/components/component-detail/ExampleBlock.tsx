// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Renders one generated component example and its supporting content.
 * @input An ExampleEntry and owning component name.
 * @output A live, deep-linkable preview with description, code, and install tabs.
 * @position Used by ComponentDetailClient's Examples section.
 */

import {useEffect, useState, type ComponentType} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Center} from '@astryxdesign/core/Center';
import {Text} from '@astryxdesign/core/Text';
import {CodeExampleBlock} from '../CodeExampleBlock';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import type {ExampleEntry} from '../../generated/exampleRegistry';
import {ComponentPreviewTheme} from './ComponentPreviewTheme';
import {ExampleAnchor} from './ExampleAnchor';
import {buildPlaygroundHref} from '../playgroundLink';
import {trackOpenPlayground} from '../../lib/analytics';
import {MarkdownText} from '../MarkdownText';
import {preventPreviewNavigation} from './previewNavigation';
import {
  shadcnRegistryIsPreview,
  shadcnRegistryOrigin,
} from '../../generated/shadcnRegistry';
import {shadcnInstallCommand} from '../../lib/shadcnRegistry.mjs';

function LivePreview({
  entry,
  componentName,
}: {
  entry: ExampleEntry;
  componentName: string;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    entry
      .load()
      .then(mod => setComponent(() => mod.default))
      .catch(() => setError(true));
  }, [entry]);

  const previewNavigationProps =
    componentName === 'SideNav'
      ? {onClickCapture: preventPreviewNavigation}
      : {};

  if (error) {
    return (
      <Center style={{minHeight: 200, width: '100%'}}>
        <Text type="supporting" color="secondary">
          Preview not available
        </Text>
      </Center>
    );
  }

  if (!Component) {
    return (
      <Center style={{minHeight: 200, width: '100%'}}>
        <Spinner size="md" />
      </Center>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        overflow: 'auto',
        minHeight: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      {...previewNavigationProps}>
      <div style={{minWidth: 'fit-content', padding: 'var(--spacing-4)'}}>
        <Component />
      </div>
    </div>
  );
}

interface ExampleBlockProps {
  entry: ExampleEntry;
  componentName: string;
}

export function ExampleBlock({entry, componentName}: ExampleBlockProps) {
  const [tab, setTab] = useState<string>('description');

  return (
    <ExampleAnchor id={entry.anchorId}>
      <ComponentPreviewTheme>
        <Card padding={3}>
          <Text type="body" weight="medium">
            {entry.name}
          </Text>

          <LivePreview entry={entry} componentName={componentName} />

          <Section variant="muted" padding={1} dividers={['top']}>
            <HStack
              gap={1}
              style={{justifyContent: 'space-between', alignItems: 'center'}}>
              <TabList value={tab} onChange={setTab} size="sm">
                <Tab value="description" label="Description" />
                <Tab value="code" label="Code" />
                {entry.registryItemPath && (
                  <Tab value="install" label="Install" />
                )}
              </TabList>
              {entry.source && (
                <Button
                  label="Open in Playground"
                  variant="ghost"
                  size="sm"
                  // Real anchor (Button renders <a> with href) so right-click /
                  // Cmd-click / middle-click "open in new tab" work. onClick stays
                  // for analytics; the href handles navigation natively.
                  href={buildPlaygroundHref(entry.source)}
                  onClick={() => {
                    trackOpenPlayground({page: 'components', item: entry.name});
                  }}
                />
              )}
            </HStack>
          </Section>
          <Section variant="muted" padding={tab === 'code' ? 0 : 4}>
            {tab === 'description' ? (
              <MarkdownText type="body">
                {entry.description || 'No description available.'}
              </MarkdownText>
            ) : tab === 'code' ? (
              <CodeExampleBlock
                code={entry.source}
                language="tsx"
                hasCopyButton
                container="section"
                width="100%"
              />
            ) : entry.registryItemPath ? (
              <VStack gap={2}>
                {shadcnRegistryIsPreview && (
                  <Text type="supporting" color="secondary">
                    This install URL expires with the draft preview.
                  </Text>
                )}
                <CodeExampleBlock
                  code={shadcnInstallCommand(
                    entry.registryItemPath,
                    shadcnRegistryOrigin,
                  )}
                  language="bash"
                  hasCopyButton
                  container="section"
                  width="100%"
                />
              </VStack>
            ) : null}
          </Section>
        </Card>
      </ComponentPreviewTheme>
    </ExampleAnchor>
  );
}
