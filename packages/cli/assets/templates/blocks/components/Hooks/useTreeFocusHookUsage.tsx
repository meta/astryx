// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {useTreeFocus} from '@astryxdesign/core/hooks';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {rtlStyles} from '@astryxdesign/core/utils';
import {ChevronDownIcon, ChevronRightIcon} from '@heroicons/react/24/outline';

type FileNode = {name: string; children?: FileNode[]};

const FILES: FileNode[] = [
  {name: 'src', children: [{name: 'index.ts'}, {name: 'theme.ts'}]},
  {name: 'docs', children: [{name: 'intro.md'}, {name: 'usage.md'}]},
  {name: 'package.json'},
  {name: 'README.md'},
];

const FOLDERS = new Set(
  FILES.filter(node => node.children != null).map(node => node.name),
);

export default function UseTreeFocusHookUsage() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(['src']),
  );
  const [openFile, setOpenFile] = useState<string | null>(null);
  const toggle = (name: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });
  const {treeRef, handleKeyDown, handleFocus} = useTreeFocus({
    hasRovingTabIndex: true,
    onToggleExpand: toggle,
    onActivate: (_item, name) => {
      if (name == null || FOLDERS.has(name)) {
        return false;
      }
      setOpenFile(name);
      return true;
    },
  });

  const renderRow = (node: FileNode, level: 1 | 2) => {
    const isFolder = node.children != null;
    const isExpanded = expanded.has(node.name);
    return (
      <HStack
        key={node.name}
        role="treeitem"
        aria-level={level}
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isFolder ? undefined : openFile === node.name}
        data-tree-id={node.name}
        gap={1}
        vAlign="center"
        paddingInlineStart={isFolder ? 0 : level === 1 ? 5 : 10}
        onClick={() => (isFolder ? toggle(node.name) : setOpenFile(node.name))}>
        {isFolder &&
          (isExpanded ? (
            <Icon icon={ChevronDownIcon} />
          ) : (
            // The collapsed chevron points toward the inline end, where
            // ArrowRight (ArrowLeft under RTL) opens the folder.
            <Icon icon={ChevronRightIcon} xstyle={rtlStyles.mirror} />
          ))}
        <Text type="body">{node.name}</Text>
      </HStack>
    );
  };

  return (
    <VStack gap={3} width={240}>
      <VStack
        ref={treeRef}
        role="tree"
        aria-label="Files"
        gap={1}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}>
        {FILES.flatMap(node => [
          renderRow(node, 1),
          ...(expanded.has(node.name)
            ? (node.children ?? []).map(child => renderRow(child, 2))
            : []),
        ])}
      </VStack>
      <Text type="supporting">Open file: {openFile ?? 'none'}</Text>
    </VStack>
  );
}
