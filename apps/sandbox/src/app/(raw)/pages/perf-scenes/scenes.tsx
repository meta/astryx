// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file scenes.tsx
 * @input A scene id
 * @output The five perf scenes, each a deterministic composition of Core
 *   components that marks the document ready once it has committed
 * @position The scenes the perf driver measures in Chromium
 *   (apps/sandbox/perf/scenes.perf.spec.ts). Each scene renders the same
 *   content on every run: fixtures come from seeded generators shared with
 *   the hand-run Table Lab and Markdown perf pages.
 *
 * The driver mounts a scene with the page's "Mount scene" button, waits for
 * `html[data-perf-scene="ready"]`, plays the scene's interaction with real
 * input, then unmounts it and checks what stayed behind.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {useAnimatedLayout} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Markdown} from '@astryxdesign/core/Markdown';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Popover} from '@astryxdesign/core/Popover';
import {
  Table,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import type {TableSortState} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {generateMarkdownFixture} from '../../../(fullscreen)/pages/markdown-perf/benchmark';
import {
  generateRows,
  labColumns,
  type LabRow,
} from '../../../(sandbox)/pages/table-lab/tableLabData';
import type {PerfSceneId} from './sceneIds';

const styles = stylex.create({
  panelWide: {inlineSize: 560},
  panelNarrow: {inlineSize: 320},
  commentBody: {flexGrow: 1, minInlineSize: 0},
  tableFrame: {blockSize: 560},
  treeFrame: {maxInlineSize: 480},
});

/**
 * Marks the document while the scene is mounted. A parent's effects run
 * after its children's, so the mark lands once the whole scene committed.
 */
function useSceneReady(): void {
  useEffect(() => {
    document.documentElement.dataset.perfScene = 'ready';
    return () => {
      delete document.documentElement.dataset.perfScene;
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Comments panel
// ---------------------------------------------------------------------------

const AUTHORS = ['Ava Chen', 'Liam Okafor', 'Noah Silva', 'Emma Novak'];
const SENTENCE =
  'The rollout looks healthy on the canary, but the retry budget on the read path is close to its limit and the dashboard still reads from the old table, so a second pass before Friday would help.';

const COMMENTS = Array.from({length: 40}, (_, index) => ({
  id: `comment-${index}`,
  author: AUTHORS[index % AUTHORS.length],
  // Every third comment is short, so rows mix truncated and untruncated text.
  body:
    index % 3 === 0
      ? `Looks good, ship it (${index + 1}).`
      : `${SENTENCE} (${index + 1}) ${SENTENCE}`,
  date: `October ${(index % 28) + 1}, 2026 at ${(index % 12) + 1}:05 PM`,
  ago: `${(index % 23) + 1}h`,
}));

const COMMENT_ACTIONS = [
  {label: 'Reply'},
  {label: 'Copy link'},
  {label: 'Delete', variant: 'destructive' as const},
];

function CommentsPanelScene() {
  useSceneReady();
  const [isNarrow, setIsNarrow] = useState(false);
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Button
          label="Resize panel"
          variant="secondary"
          onClick={() => setIsNarrow(narrow => !narrow)}
        />
      </HStack>
      <VStack gap={3} xstyle={isNarrow ? styles.panelNarrow : styles.panelWide}>
        {COMMENTS.map(comment => (
          <HStack key={comment.id} gap={2} vAlign="start">
            <Avatar name={comment.author} size="sm" />
            <VStack gap={0.5} xstyle={styles.commentBody}>
              <HStack gap={2}>
                <Text weight="semibold" maxLines={1}>
                  {comment.author}
                </Text>
                <Tooltip content={comment.date}>
                  <Text type="supporting">{comment.ago}</Text>
                </Tooltip>
              </HStack>
              <Text maxLines={2}>{comment.body}</Text>
            </VStack>
            <MoreMenu
              label="Comment actions"
              size="sm"
              items={COMMENT_ACTIONS}
            />
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const TABLE_ROWS = generateRows(1000);

function TableScene() {
  useSceneReady();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSortState>([]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === ''
      ? TABLE_ROWS
      : TABLE_ROWS.filter(row => row.name.toLowerCase().includes(needle));
  }, [query]);
  const {sortedData, sortConfig} = useTableSortableState<LabRow>({
    data: filtered,
    sort,
    onSortChange: setSort,
  });
  const sortPlugin = useTableSortable<LabRow>(sortConfig);
  return (
    <VStack gap={3}>
      <TextInput label="Filter by name" value={query} onChange={setQuery} />
      <VStack xstyle={styles.tableFrame}>
        <Table
          data={sortedData}
          columns={labColumns}
          idKey="id"
          plugins={{sort: sortPlugin}}
        />
      </VStack>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// TreeList
// ---------------------------------------------------------------------------

/** 50 folders of 9 files: 500 items. */
function treeItems(isExpanded: boolean): TreeListItemData[] {
  return Array.from({length: 50}, (_, folder) => ({
    id: `folder-${folder}`,
    label: `Folder ${folder + 1}`,
    isExpanded,
    children: Array.from({length: 9}, (_, file) => ({
      id: `folder-${folder}-file-${file}`,
      label: `file-${folder + 1}-${file + 1}.tsx`,
      description: file % 3 === 0 ? 'Modified' : undefined,
    })),
  }));
}

function TreeListScene() {
  useSceneReady();
  const containerRef = useRef<HTMLElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const [isExpanded, setIsExpanded] = useState(false);
  const items = useMemo(() => treeItems(isExpanded), [isExpanded]);
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Button
          label={isExpanded ? 'Collapse all' : 'Expand all'}
          variant="secondary"
          onClick={() => setIsExpanded(expanded => !expanded)}
        />
      </HStack>
      <VStack ref={containerRef}>
        <TreeList
          items={items}
          animatedLayout={animatedLayout}
          header={<Text weight="semibold">Repository</Text>}
          xstyle={styles.treeFrame}
        />
      </VStack>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const MARKDOWN_SECTIONS = 120;

function MarkdownScene() {
  useSceneReady();
  const [sections, setSections] = useState(MARKDOWN_SECTIONS);
  const source = useMemo(() => generateMarkdownFixture(sections), [sections]);
  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <Button
          label="Append section"
          variant="secondary"
          onClick={() => setSections(count => count + 1)}
        />
      </HStack>
      <Markdown>{source}</Markdown>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Overlay churn
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  {label: 'Rename'},
  {label: 'Duplicate'},
  {label: 'Archive'},
];

function OverlayChurnScene() {
  useSceneReady();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const closeDialog = useCallback((open: boolean) => setIsDialogOpen(open), []);
  return (
    <HStack gap={3}>
      <Popover content={<Text>Popover content</Text>}>
        <Button label="Open popover" variant="secondary" />
      </Popover>
      <DropdownMenu button={{label: 'Open menu'}} items={MENU_ITEMS} />
      <Button
        label="Open dialog"
        variant="secondary"
        onClick={() => setIsDialogOpen(true)}
      />
      <Dialog isOpen={isDialogOpen} onOpenChange={closeDialog}>
        <DialogHeader title="Perf dialog" onOpenChange={closeDialog} />
        <Text>Dialog content</Text>
      </Dialog>
    </HStack>
  );
}

const SCENES: Readonly<Record<PerfSceneId, () => React.ReactNode>> = {
  'comments-panel': CommentsPanelScene,
  table: TableScene,
  'tree-list': TreeListScene,
  markdown: MarkdownScene,
  'overlay-churn': OverlayChurnScene,
};

export function PerfScene({scene}: {scene: PerfSceneId}) {
  const Scene = SCENES[scene];
  return <Scene />;
}
