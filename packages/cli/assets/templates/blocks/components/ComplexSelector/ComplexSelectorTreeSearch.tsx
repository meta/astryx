// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useState} from 'react';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TreeList, type TreeListItemData} from '@astryxdesign/core/TreeList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

interface DestinationNode {
  id: string;
  label: string;
  path: string;
  children?: DestinationNode[];
}

interface Destination {
  id: string;
  label: string;
  path: string;
}

const destinationTree: DestinationNode[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    path: '/Workspace',
    children: [
      {
        id: 'research',
        label: 'Research',
        path: '/Workspace/Research',
        children: [
          {
            id: 'field-notes',
            label: 'Field notes',
            path: '/Workspace/Research/Field notes',
          },
          {
            id: 'interviews',
            label: 'Interviews',
            path: '/Workspace/Research/Interviews',
          },
        ],
      },
      {
        id: 'roadmap',
        label: 'Roadmap',
        path: '/Workspace/Roadmap',
      },
    ],
  },
  {
    id: 'teams',
    label: 'Teams',
    path: '/Teams',
    children: [
      {
        id: 'design-systems',
        label: 'Design systems',
        path: '/Teams/Design systems',
        children: [
          {
            id: 'accessibility',
            label: 'Accessibility',
            path: '/Teams/Design systems/Accessibility',
          },
        ],
      },
    ],
  },
];

function matches(node: DestinationNode, query: string): boolean {
  if (node.label.toLowerCase().includes(query)) {
    return true;
  }
  return (node.children ?? []).some(child => matches(child, query));
}

function filterTree(
  nodes: DestinationNode[],
  query: string,
): DestinationNode[] {
  if (!query) {
    return nodes;
  }
  return nodes
    .filter(node => matches(node, query))
    .map(node => ({
      ...node,
      children: node.children ? filterTree(node.children, query) : undefined,
    }));
}

function toItems(
  nodes: DestinationNode[],
  selectedId: string,
  onSelect: (value: Destination) => void,
): TreeListItemData[] {
  return nodes.map(node => {
    const hasChildren = (node.children ?? []).length > 0;
    return {
      id: node.id,
      label: node.label,
      isSelected: node.id === selectedId,
      isExpanded: true,
      onClick: hasChildren
        ? undefined
        : () => onSelect({id: node.id, label: node.label, path: node.path}),
      children: hasChildren
        ? toItems(node.children ?? [], selectedId, onSelect)
        : undefined,
    };
  });
}

function DestinationSearch({
  value,
  onChange,
  close,
}: {
  value: Destination;
  onChange: (value: Destination) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const items = useMemo(
    () =>
      toItems(
        filterTree(destinationTree, query.toLowerCase()),
        value.id,
        next => {
          onChange(next);
          close();
        },
      ),
    [query, value.id, onChange, close],
  );

  return (
    <VStack gap={3} style={{width: 360}}>
      <TextInput
        label="Search destinations"
        isLabelHidden
        value={query}
        onChange={setQuery}
        hasClear
        placeholder="Search folders or teams"
      />
      {items.length > 0 ? (
        <TreeList items={items} density="compact" />
      ) : (
        <Text type="supporting" color="secondary">
          No matching destinations.
        </Text>
      )}
    </VStack>
  );
}

export default function ComplexSelectorTreeSearch() {
  const [value, setValue] = useState<Destination>({
    id: 'accessibility',
    label: 'Accessibility',
    path: '/Teams/Design systems/Accessibility',
  });

  return (
    <ComplexSelector<Destination>
      label="Destination"
      description="Search and browse nested folders."
      value={value}
      onChange={setValue}
      triggerLabel={value.path}
      controlStyle={{width: 360}}>
      {(selectedValue, onChange, close) => (
        <DestinationSearch
          value={selectedValue}
          onChange={onChange}
          close={close}
        />
      )}
    </ComplexSelector>
  );
}
