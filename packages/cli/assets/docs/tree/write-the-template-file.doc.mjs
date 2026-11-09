// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/write-the-template-file`:
 * what gets copied, where the copied file lands, and the imports and
 * export a copied template needs.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'write-the-template-file',
  placement: {
    parent: 'namespace:build-the-template',
    slot: 'guides',
    order: 10,
  },
  title: 'Write the template file',
  category: 'guide',
  description:
    'Astryx copies just this one file into an app, so write it to work on its own there: where it lands, what it can import, and what it exports.',
  sections: [
    {
      id: 'know-what-gets-copied',
      title: 'Know what gets copied',
      content: [
        {
          type: 'prose',
          text: '`{@command template}` copies exactly one source file. It does not copy sibling helpers, stylesheets, fonts, icons, images, or media. Plan for that before you add supporting files.',
        },
        {
          type: 'table',
          headers: ['Template', 'Directory target', 'Explicit file target'],
          rows: [
            ['Page', 'Writes `<target>/page.tsx`', 'Writes the exact file path'],
            [
              'Block',
              'Writes `<target>/<source-basename>.tsx`',
              'Writes the exact file path',
            ],
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: `# Page: src/app/account/page.tsx
{@command template acme-account src/app/account}

# Block: src/features/account/acme-stat-card.tsx
{@command template acme-stat-card src/features/account}

# Exact destination for either kind
{@command template acme-stat-card src/features/account/StatusCard.tsx}`,
        },
        {
          type: 'prose',
          text: 'Astryx refuses to replace an existing file unless the caller passes `--overwrite` or `-f`.',
        },
      ],
    },
    {
      id: 'keep-edited-code-in-one-file',
      title: 'Keep edited code in one file',
      content: [
        {
          type: 'prose',
          text: 'Put every helper that the app is expected to edit in the template source. Small local components, example data, constants, and event handlers can live above or below the default component in the same file.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Inline a helper when it is part of the editable starting point.',
            'Move a helper into the integration package only when it should stay package-owned and update with the package.',
            'Do not import `./helper`, `./styles`, or any other sibling file.',
            'Do not create routes, configuration, or extra files at runtime. Give the app one explicit source file to own.',
          ],
        },
      ],
    },
    {
      id: 'use-imports-that-work',
      title: 'Use imports that work in the app',
      content: [
        {
          type: 'prose',
          text: 'After the copy, imports resolve from the app, not from the template directory. Every bare import must name a package the app installs, and every package path must be public.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {AcmeStatusCard} from '@acme/astryx-widgets/components/AcmeStatusCard';

const metrics = [
  {label: 'Healthy accounts', value: '1,248'},
  {label: 'Needs review', value: '37'},
];

function MetricRow({label, value}: {label: string; value: string}) {
  return (
    <HStack justify="between">
      <Text>{label}</Text>
      <Text>{value}</Text>
    </HStack>
  );
}

export default function AcmeAccountSummary() {
  return (
    <Card>
      <VStack gap={4}>
        <AcmeStatusCard />
        {metrics.map(metric => <MetricRow key={metric.label} {...metric} />)}
        <Button label="Review accounts" />
      </VStack>
    </Card>
  );
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Import Astryx components from their public Core paths.',
            'Import integration-owned components, helpers, icons, or styles only through paths the package exports ({@link generic:export-template-assets}).',
            'Avoid adding another library when Astryx or platform APIs already provide the behavior.',
          ],
        },
      ],
    },
    {
      id: 'export-one-component',
      title: 'Export one component',
      content: [
        {
          type: 'prose',
          text: 'The source must default-export one React component. Named helpers inside the file are fine.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Add `use client` as the first statement only when hooks, event handlers, browser APIs, or a component passed as a prop, such as `icon={BellIcon}`, need a client boundary.',
            'Keep a static template server-compatible when it needs no client behavior.',
          ],
        },
      ],
    },
  ],
};
