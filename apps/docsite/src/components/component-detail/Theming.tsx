// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Theming.tsx
 * @input A component's `theming` doc (targets, vars, derived) + its props.
 * @output Renders the component detail page's "Theming" tab: a table of
 *   theme targets shown as the keys they take in a `defineTheme` `components`
 *   config, a copyable `defineTheme` example, and a table of themeable CSS
 *   variables.
 * @position Component detail "Theming" tab body. Mirrors the Overview tab's
 *   layout — a bare VStack of display-3 sections, no wrapping Section.
 *
 * Data shaping lives in ./themingHelpers (unit-tested); this file is the view.
 */

import {Fragment} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Table, pixel} from '@astryxdesign/core/Table';
import {Banner} from '@astryxdesign/core/Banner';
import {Card} from '@astryxdesign/core/Card';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Divider} from '@astryxdesign/core';
import {CodeExampleBlock} from '../CodeExampleBlock';
import {MarkdownText} from '../MarkdownText';
import {CURRENT_TARGET} from '../../lib/docsVersions';
import type {
  PropDoc,
  ThemingDoc,
  ThemingTarget,
  ComponentVar,
} from '../../generated/componentRegistry';
import {
  configKey,
  targetDataAttributes,
  targetPropValues,
  buildDefineThemeExample,
  publicVars,
} from './themingHelpers';

interface TargetsTableProps {
  targets: ThemingTarget[];
  props: PropDoc[];
}

function TargetsTable({targets, props}: TargetsTableProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <Card>
        <VStack gap={0}>
          {targets.map(target => {
            const dataAttrs = targetDataAttributes(target);
            const propValues = targetPropValues(target, props);
            const states = target.states ?? [];
            return (
              <Fragment key={target.className}>
                <Divider />
                <VStack gap={1} style={{paddingBlock: 8}}>
                  <Text type="code" weight="bold">
                    {configKey(target)}
                  </Text>
                  <Text type="code" color="secondary">
                    .{target.className}
                  </Text>
                  {dataAttrs.length > 0 && (
                    <Text type="supporting" color="secondary">
                      Data attrs: {dataAttrs.map(a => `[${a}]`).join(', ')}
                    </Text>
                  )}
                  {propValues.length > 0 && (
                    <Text type="supporting" color="secondary">
                      Props: {propValues.join(', ')}
                    </Text>
                  )}
                  {states.length > 0 && (
                    <Text type="supporting" color="secondary">
                      States: {states.join(', ')}
                    </Text>
                  )}
                </VStack>
              </Fragment>
            );
          })}
        </VStack>
      </Card>
    );
  }

  const data = targets.map(target => ({
    key: configKey(target) as unknown,
    className: target.className as unknown,
    dataAttrs: targetDataAttributes(target) as unknown,
    props: targetPropValues(target, props) as unknown,
    states: (target.states ?? []) as unknown,
  })) as Record<string, unknown>[];

  return (
    <Card>
      <Table
        data={data}
        columns={[
          {
            key: 'key',
            header: 'Config key',
            width: pixel(180),
            renderCell: (item: Record<string, unknown>) => (
              <Text type="code" weight="bold" style={{whiteSpace: 'nowrap'}}>
                {item.key as string}
              </Text>
            ),
          },
          {
            key: 'className',
            header: 'Class',
            width: pixel(200),
            renderCell: (item: Record<string, unknown>) => (
              <Text
                type="code"
                color="secondary"
                style={{whiteSpace: 'nowrap'}}>
                .{item.className as string}
              </Text>
            ),
          },
          {
            key: 'dataAttrs',
            header: 'Data attributes',
            width: pixel(220),
            renderCell: (item: Record<string, unknown>) => {
              const attrs = item.dataAttrs as string[];
              return attrs.length > 0 ? (
                <Text type="code" color="secondary">
                  {attrs.map(a => `[${a}]`).join(', ')}
                </Text>
              ) : (
                <Text color="secondary">—</Text>
              );
            },
          },
          {
            key: 'props',
            header: 'Props',
            renderCell: (item: Record<string, unknown>) => {
              const values = item.props as string[];
              return values.length > 0 ? (
                <Text type="code" color="secondary">
                  {values.join(', ')}
                </Text>
              ) : (
                <Text color="secondary">—</Text>
              );
            },
          },
          {
            key: 'states',
            header: 'States',
            renderCell: (item: Record<string, unknown>) => {
              const values = item.states as string[];
              return values.length > 0 ? (
                <Text type="code" color="secondary">
                  {values.join(', ')}
                </Text>
              ) : (
                <Text color="secondary">—</Text>
              );
            },
          },
        ]}
        density="spacious"
        dividers="rows"
      />
    </Card>
  );
}

interface CssVarsTableProps {
  vars: ComponentVar[];
}

function CssVarsTable({vars}: CssVarsTableProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <Card>
        <VStack gap={0}>
          {vars.map(v => (
            <Fragment key={v.name}>
              <Divider />
              <VStack gap={1} style={{paddingBlock: 8}}>
                <Text type="code" weight="bold">
                  {v.name}
                </Text>
                <Text type="code" color="secondary">
                  {v.default}
                </Text>
                {v.description && (
                  <MarkdownText type="body" color="secondary">
                    {v.description}
                  </MarkdownText>
                )}
              </VStack>
            </Fragment>
          ))}
        </VStack>
      </Card>
    );
  }

  const data = vars.map(v => ({
    name: v.name as unknown,
    default: v.default as unknown,
    description: (v.description ?? '') as unknown,
  })) as Record<string, unknown>[];

  return (
    <Card>
      <Table
        data={data}
        columns={[
          {
            key: 'name',
            header: 'CSS variable',
            width: pixel(240),
            renderCell: (item: Record<string, unknown>) => (
              <Text type="code" weight="bold" style={{whiteSpace: 'nowrap'}}>
                {item.name as string}
              </Text>
            ),
          },
          {
            key: 'default',
            header: 'Default',
            width: pixel(220),
            renderCell: (item: Record<string, unknown>) => (
              <Text type="code" color="secondary">
                {item.default as string}
              </Text>
            ),
          },
          {
            key: 'description',
            header: 'Description',
            renderCell: (item: Record<string, unknown>) => (
              <MarkdownText type="body">
                {item.description as string}
              </MarkdownText>
            ),
          },
        ]}
        density="spacious"
        dividers="rows"
      />
    </Card>
  );
}

interface ThemingProps {
  theming: ThemingDoc;
  props: PropDoc[];
}

export function Theming({theming, props}: ThemingProps) {
  // Canary-only while the theming API is hardened. Production (`latest`) hides
  // the section entirely rather than documenting an unstable contract.
  if (CURRENT_TARGET !== 'canary') {
    return null;
  }

  const hasTargets = theming.targets.length > 0;
  const vars = publicVars(theming);
  const hasVars = vars.length > 0;

  if (!hasTargets && !hasVars) {
    return null;
  }

  const example = hasTargets ? buildDefineThemeExample(theming) : '';

  return (
    <VStack gap={8}>
      <VStack gap={4}>
        <Banner
          container="card"
          status="warning"
          title="Experimental"
          description="The theming API is experimental and not yet guaranteed — targets, keys, and CSS variables may change while we harden the theme system."
        />
        <Text type="large" weight="normal">
          Restyle this component with a <Text type="code">defineTheme</Text>{' '}
          config. Target the component through the keys below, or override the
          CSS variables it exposes.
        </Text>
      </VStack>

      {hasTargets && (
        <VStack gap={4}>
          <Heading level={2} type="display-3">
            Theme targets
          </Heading>
          <Text color="secondary">
            Each target is a key in the <Text type="code">components</Text> map
            of <Text type="code">defineTheme</Text>. Scope styles to a prop or
            state with a <Text type="code">prop:value</Text> or state key; use{' '}
            <Text type="code">base</Text> for all instances.
          </Text>
          <TargetsTable targets={theming.targets} props={props} />
          {example && (
            <CodeExampleBlock
              code={example}
              language="ts"
              width="100%"
              hasCopyButton
            />
          )}
        </VStack>
      )}

      {hasVars && (
        <VStack gap={4}>
          <Heading level={2} type="display-3">
            Themeable CSS variables
          </Heading>
          <Text color="secondary">
            Additional custom properties this component reads. Override them in
            a <Text type="code">base</Text> block of the component's{' '}
            <Text type="code">defineTheme</Text> config.
          </Text>
          <CssVarsTable vars={vars} />
        </VStack>
      )}
    </VStack>
  );
}
