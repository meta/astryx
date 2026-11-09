// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Table} from '@astryxdesign/core/Table';
import type {TokenTableProps} from './types';
import {resolveToken, getTokensByPrefix} from './helpers';

const styles = stylex.create({
  radiusBox: {
    width: 96,
    height: 96,
    backgroundColor: 'var(--color-accent-muted)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    flexShrink: 0,
  },
  borderLine: {
    width: 96,
    height: 0,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border-emphasized)',
    flexShrink: 0,
  },
});

// Semantic ordering from the tokens doc
const RADIUS_ORDER = [
  '--radius-none',
  '--radius-inner',
  '--radius-element',
  '--radius-container',
  '--radius-page',
  '--radius-chat',
  '--radius-full',
];

function sortByOrder(tokens: string[], order: string[]): string[] {
  const orderMap = new Map(order.map((k, i) => [k, i]));
  return [...tokens].sort((a, b) => {
    const ai = orderMap.get(a) ?? 99;
    const bi = orderMap.get(b) ?? 99;
    return ai - bi;
  });
}

function RadiusTokenTable({theme}: TokenTableProps) {
  const tokens = sortByOrder(
    getTokensByPrefix(theme, '--radius-'),
    RADIUS_ORDER,
  );
  const data = tokens.map(name => ({
    tokenName: name,
    value: resolveToken(theme, name),
  }));

  return (
    <Table
      data={data as Record<string, unknown>[]}
      columns={[
        {key: 'tokenName', header: 'Token'},
        {
          key: 'value',
          header: 'Value',
          renderCell: (item: Record<string, unknown>) => (
            <Text type="code" color="secondary">
              {item.value as string}
            </Text>
          ),
        },
        {
          key: 'example',
          header: 'Example',
          renderCell: (item: Record<string, unknown>) => (
            <div
              {...stylex.props(styles.radiusBox)}
              style={{borderRadius: item.value as string}}
            />
          ),
        },
      ]}
      density="spacious"
      dividers="rows"
      hasHover
    />
  );
}

function BorderTokenTable({theme}: TokenTableProps) {
  const tokens = getTokensByPrefix(theme, '--border-');
  if (tokens.length === 0) {
    return null;
  }

  const data = tokens.map(name => ({
    tokenName: name,
    value: resolveToken(theme, name),
  }));

  return (
    <Table
      data={data as Record<string, unknown>[]}
      columns={[
        {key: 'tokenName', header: 'Token'},
        {
          key: 'value',
          header: 'Value',
          renderCell: (item: Record<string, unknown>) => (
            <Text type="code" color="secondary">
              {item.value as string}
            </Text>
          ),
        },
        {
          key: 'example',
          header: 'Example',
          renderCell: (item: Record<string, unknown>) => (
            <div
              {...stylex.props(styles.borderLine)}
              style={{borderBottomWidth: item.value as string}}
            />
          ),
        },
      ]}
      density="spacious"
      dividers="rows"
      hasHover
    />
  );
}

export function ShapeTokenTable({theme}: TokenTableProps) {
  return (
    <VStack gap={6}>
      <VStack gap={3}>
        <Heading level={3}>Radius</Heading>
        <RadiusTokenTable theme={theme} />
      </VStack>
      <VStack gap={3}>
        <Heading level={3}>Border</Heading>
        <BorderTokenTable theme={theme} />
      </VStack>
    </VStack>
  );
}
