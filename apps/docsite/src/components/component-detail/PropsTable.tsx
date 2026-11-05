// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import {Badge} from '@astryxdesign/core/Badge';
import type {PropDoc} from '../../generated/componentRegistry';
import {MarkdownText} from '../MarkdownText';

function formatType(type: string, defaultValue?: string): string {
  if (defaultValue != null) {
    return `${type} (default: ${defaultValue})`;
  }
  return type;
}

interface PropsTableProps {
  props: PropDoc[];
  heading?: string;
}

export function PropsTable({props, heading}: PropsTableProps) {
  if (props.length === 0) {
    return null;
  }

  const required = props.filter(p => p.required);
  const optional = props.filter(p => !p.required);
  const sorted = [...required, ...optional];

  const data = sorted.map(prop => ({
    name: prop.name as unknown,
    required: prop.required as unknown,
    type: formatType(prop.type, prop.default) as unknown,
    description: (prop.description ?? '') as unknown,
  })) as Record<string, unknown>[];

  return (
    <Section>
      <VStack gap={2}>
        {heading && <Heading level={3}>{heading}</Heading>}
        <Table
          data={data}
          columns={[
            {
              key: 'name',
              header: 'Prop',
              width: pixel(180),
              renderCell: (item: Record<string, unknown>) => (
                <HStack gap={1} vAlign="center">
                  <Text type="code" weight="bold">
                    {item.name as string}
                  </Text>
                  {item.required === true && (
                    <Badge label="required" variant="info" />
                  )}
                </HStack>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              width: pixel(240),
              renderCell: (item: Record<string, unknown>) => (
                <Text type="code" color="secondary">
                  {item.type as string}
                </Text>
              ),
            },
            {
              key: 'description',
              header: 'Description',
              // Without a floor, a narrow screen squeezes this column to a
              // few characters and every row grows thousands of pixels tall.
              // The floor makes the table scroll sideways instead.
              width: proportional(1, {minWidth: 240}),
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
      </VStack>
    </Section>
  );
}
