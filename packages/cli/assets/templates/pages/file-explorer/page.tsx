// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useMemo, type CSSProperties} from 'react';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {List, ListItem} from '@astryxdesign/core/List';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {StackItem} from '@astryxdesign/core/Stack';
import {rtlStyles} from '@astryxdesign/core/utils';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Section} from '@astryxdesign/core/Section';
import {Avatar} from '@astryxdesign/core/Avatar';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ShareIcon,
  TagIcon,
  EllipsisHorizontalIcon,
  ViewColumnsIcon,
  Squares2X2Icon,
  Bars4Icon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import {FolderIcon} from '@heroicons/react/24/solid';

interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileSystemItem[];
}

const FILESYSTEM: FileSystemItem[] = [
  {
    id: 'applications',
    name: 'Applications',
    type: 'folder',
    children: [
      {
        id: 'chrome-apps',
        name: 'Chrome Apps',
        type: 'folder',
        children: [
          {id: 'component-lab', name: 'Component Lab.app', type: 'file'},
          {id: 'google-chat', name: 'Google Chat.app', type: 'file'},
          {id: 'workchat', name: 'Workchat.app', type: 'file'},
        ],
      },
      {id: 'figma', name: 'Figma.app', type: 'file'},
      {id: 'safari', name: 'Safari.app', type: 'file'},
      {id: 'slack', name: 'Slack.app', type: 'file'},
      {id: 'terminal', name: 'Terminal.app', type: 'file'},
      {id: 'vscode', name: 'Visual Studio Code.app', type: 'file'},
      {id: 'xcode', name: 'Xcode.app', type: 'file'},
    ],
  },
  {id: 'debug-log', name: 'debug-storybook.log', type: 'file'},
  {
    id: 'desktop',
    name: 'Desktop',
    type: 'folder',
    children: [
      {id: 'screenshot1', name: 'Screenshot 2026-03-28.png', type: 'file'},
      {id: 'notes-txt', name: 'meeting-notes.txt', type: 'file'},
      {
        id: 'projects',
        name: 'Projects',
        type: 'folder',
        children: [
          {id: 'readme-proj', name: 'README.md', type: 'file'},
          {
            id: 'src-folder',
            name: 'src',
            type: 'folder',
            children: [
              {id: 'index-ts', name: 'index.ts', type: 'file'},
              {id: 'app-tsx', name: 'App.tsx', type: 'file'},
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'documents',
    name: 'Documents',
    type: 'folder',
    children: [
      {id: 'design-spec', name: 'design-spec.pdf', type: 'file'},
      {id: 'resume', name: 'resume.docx', type: 'file'},
      {
        id: 'work',
        name: 'Work',
        type: 'folder',
        children: [
          {id: 'q1-report', name: 'Q1-report.xlsx', type: 'file'},
          {id: 'presentation', name: 'team-presentation.pptx', type: 'file'},
        ],
      },
    ],
  },
  {
    id: 'downloads',
    name: 'Downloads',
    type: 'folder',
    children: [
      {id: 'archive', name: 'archive.zip', type: 'file'},
      {id: 'installer', name: 'installer.dmg', type: 'file'},
      {id: 'photo', name: 'photo-2026.jpg', type: 'file'},
    ],
  },
  {id: 'login-screenshot', name: 'login-02-screenshot.png', type: 'file'},
  {
    id: 'movies',
    name: 'Movies',
    type: 'folder',
    children: [{id: 'recording', name: 'screen-recording.mov', type: 'file'}],
  },
  {
    id: 'music',
    name: 'Music',
    type: 'folder',
    children: [{id: 'playlist', name: 'favorites.m3u', type: 'file'}],
  },
  {
    id: 'node-modules',
    name: 'node_modules',
    type: 'folder',
    children: [
      {
        id: 'react',
        name: 'react',
        type: 'folder',
        children: [{id: 'react-index', name: 'index.js', type: 'file'}],
      },
      {
        id: 'react-dom',
        name: 'react-dom',
        type: 'folder',
        children: [{id: 'react-dom-index', name: 'index.js', type: 'file'}],
      },
    ],
  },
  {
    id: 'pictures',
    name: 'Pictures',
    type: 'folder',
    children: [
      {
        id: 'vacation',
        name: 'vacation-2026',
        type: 'folder',
        children: [
          {id: 'img1', name: 'IMG_0001.jpg', type: 'file'},
          {id: 'img2', name: 'IMG_0002.jpg', type: 'file'},
          {id: 'img3', name: 'IMG_0003.jpg', type: 'file'},
        ],
      },
      {
        id: 'screenshots-folder',
        name: 'Screenshots',
        type: 'folder',
        children: [
          {id: 'ss1', name: 'Screen Shot 1.png', type: 'file'},
          {id: 'ss2', name: 'Screen Shot 2.png', type: 'file'},
        ],
      },
    ],
  },
  {
    id: 'public',
    name: 'Public',
    type: 'folder',
    children: [
      {id: 'drop-box', name: 'Drop Box', type: 'folder', children: []},
    ],
  },
  {
    id: 'astryx',
    name: 'astryx',
    type: 'folder',
    children: [
      {id: 'astryx-readme', name: 'README.md', type: 'file'},
      {id: 'astryx-pkg', name: 'package.json', type: 'file'},
      {
        id: 'astryx-packages',
        name: 'packages',
        type: 'folder',
        children: [
          {
            id: 'astryx-core',
            name: 'core',
            type: 'folder',
            children: [
              {
                id: 'core-src',
                name: 'src',
                type: 'folder',
                children: [
                  {id: 'button-tsx', name: 'Button.tsx', type: 'file'},
                  {id: 'card-tsx', name: 'Card.tsx', type: 'file'},
                  {id: 'text-tsx', name: 'Text.tsx', type: 'file'},
                ],
              },
            ],
          },
          {
            id: 'astryx-cli',
            name: 'cli',
            type: 'folder',
            children: [{id: 'cli-index', name: 'index.ts', type: 'file'}],
          },
        ],
      },
      {
        id: 'astryx-apps',
        name: 'apps',
        type: 'folder',
        children: [
          {
            id: 'storybook',
            name: 'storybook',
            type: 'folder',
            children: [
              {
                id: 'sb-config',
                name: '.storybook',
                type: 'folder',
                children: [],
              },
            ],
          },
          {
            id: 'sandbox-app',
            name: 'sandbox',
            type: 'folder',
            children: [
              {
                id: 'sandbox-src',
                name: 'src',
                type: 'folder',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
];

const page: CSSProperties = {height: '100dvh'};
// The detail column fills the rest of the row but never narrows below 320px;
// past that, the row scrolls sideways.
const detailFloor: CSSProperties = {flexShrink: 0, flexBasis: 320};

function findItem(items: FileSystemItem[], id: string): FileSystemItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (item.children) {
      const found = findItem(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(dot + 1).toUpperCase() : 'File';
}

export default function FileExplorerPage() {
  const [selectedPath, setSelectedPath] = useState<string[]>([
    'applications',
    'chrome-apps',
    'component-lab',
  ]);

  const columns = useMemo(() => {
    const cols: {items: FileSystemItem[]; selectedId: string | null}[] = [];
    cols.push({items: FILESYSTEM, selectedId: selectedPath[0] ?? null});
    let currentItems: FileSystemItem[] = FILESYSTEM;
    for (let i = 0; i < selectedPath.length; i++) {
      const selected = currentItems.find(item => item.id === selectedPath[i]);
      if (selected?.children && selected.children.length > 0) {
        cols.push({
          items: selected.children,
          selectedId: selectedPath[i + 1] ?? null,
        });
        currentItems = selected.children;
      } else {
        break;
      }
    }
    return cols;
  }, [selectedPath]);

  const currentFolderName = useMemo(() => {
    if (selectedPath.length === 0) {
      return 'Home';
    }
    const lastId = selectedPath[selectedPath.length - 1];
    const item = findItem(FILESYSTEM, lastId);
    if (item?.type === 'folder') {
      return item.name;
    }
    if (selectedPath.length >= 2) {
      const parent = findItem(
        FILESYSTEM,
        selectedPath[selectedPath.length - 2],
      );
      return parent?.name ?? 'Home';
    }
    return 'Home';
  }, [selectedPath]);

  const selectedFile = useMemo(() => {
    if (selectedPath.length === 0) {
      return null;
    }
    const lastId = selectedPath[selectedPath.length - 1];
    const item = findItem(FILESYSTEM, lastId);
    return item?.type === 'file' ? item : null;
  }, [selectedPath]);

  const handleSelect = (columnIndex: number, itemId: string) => {
    setSelectedPath([...selectedPath.slice(0, columnIndex), itemId]);
  };

  return (
    <Layout
      style={page}
      height="fill"
      header={
        <Toolbar
          label="File Explorer"
          size="sm"
          dividers={['bottom']}
          startContent={
            <>
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <Icon
                    icon={ChevronLeftIcon}
                    size="sm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                onClick={() => {
                  if (selectedPath.length > 0) {
                    setSelectedPath(selectedPath.slice(0, -1));
                  }
                }}
                isDisabled={selectedPath.length === 0}
                label="Go back"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={
                  <Icon
                    icon={ChevronRightIcon}
                    size="sm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                isDisabled
                label="Go forward"
              />
              <Text type="label">{currentFolderName}</Text>
            </>
          }
          centerContent={
            <SegmentedControl
              value="column"
              onChange={() => {}}
              label="View mode">
              <SegmentedControlItem
                value="grid"
                label="Grid"
                icon={<Icon icon={Squares2X2Icon} size="sm" />}
                isLabelHidden
              />
              <SegmentedControlItem
                value="list"
                label="List"
                icon={<Icon icon={Bars4Icon} size="sm" />}
                isLabelHidden
              />
              <SegmentedControlItem
                value="column"
                label="Column"
                icon={<Icon icon={ViewColumnsIcon} size="sm" />}
                isLabelHidden
              />
              <SegmentedControlItem
                value="gallery"
                label="Gallery"
                icon={<Icon icon={TableCellsIcon} size="sm" />}
                isLabelHidden
              />
            </SegmentedControl>
          }
          endContent={
            <>
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={AdjustmentsHorizontalIcon} size="sm" />}
                label="Group"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={ShareIcon} size="sm" />}
                label="Share"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={TagIcon} size="sm" />}
                label="Tags"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={EllipsisHorizontalIcon} size="sm" />}
                label="More"
              />
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
                label="Search"
              />
            </>
          }
        />
      }
      content={
        <LayoutContent padding={0} isScrollable={false}>
          <HStack height="100%" isScrollable>
            {columns.map((col, colIndex) => {
              const showDivider =
                colIndex < columns.length - 1 || selectedFile != null;
              return (
                <StackItem
                  key={colIndex}
                  size="static"
                  isScrollable
                  aria-label={
                    colIndex === 0
                      ? 'Home'
                      : findItem(FILESYSTEM, selectedPath[colIndex - 1])?.name
                  }>
                  <Section
                    width={240}
                    height="100%"
                    padding={2}
                    variant="transparent"
                    dividers={showDivider ? ['end'] : undefined}>
                    <List density="compact" hasDividers={false}>
                      {col.items.map(item => {
                        const isSelected = col.selectedId === item.id;
                        const hasChildren =
                          item.type === 'folder' &&
                          item.children != null &&
                          item.children.length > 0;
                        return (
                          <ListItem
                            key={item.id}
                            label={item.name}
                            startContent={
                              <Icon
                                icon={
                                  item.type === 'folder'
                                    ? FolderIcon
                                    : DocumentIcon
                                }
                                color={
                                  item.type === 'folder'
                                    ? 'accent'
                                    : 'secondary'
                                }
                                size="sm"
                              />
                            }
                            endContent={
                              hasChildren ? (
                                <Icon
                                  icon={ChevronRightIcon}
                                  size="xsm"
                                  color="secondary"
                                  xstyle={rtlStyles.mirror}
                                />
                              ) : undefined
                            }
                            onClick={() => handleSelect(colIndex, item.id)}
                            isSelected={isSelected}
                          />
                        );
                      })}
                    </List>
                  </Section>
                </StackItem>
              );
            })}
            {selectedFile && (
              <StackItem
                size="fill"
                isScrollable
                aria-label={selectedFile.name}
                style={detailFloor}>
                <Section padding={6} variant="transparent">
                  <VStack gap={4} hAlign="center">
                    <Avatar name={selectedFile.name} size={96} />
                    <VStack gap={1} hAlign="center">
                      <Text type="label">{selectedFile.name}</Text>
                      <Text type="supporting">
                        {getFileExtension(selectedFile.name)} Document
                      </Text>
                    </VStack>
                    <MetadataList title="Information">
                      <MetadataListItem label="Created">
                        March 28, 2026 at 2:15 PM
                      </MetadataListItem>
                      <MetadataListItem label="Modified">
                        Yesterday, 10:27 PM
                      </MetadataListItem>
                      <MetadataListItem label="Kind">
                        {getFileExtension(selectedFile.name)} Document
                      </MetadataListItem>
                    </MetadataList>
                  </VStack>
                </Section>
              </StackItem>
            )}
          </HStack>
        </LayoutContent>
      }
    />
  );
}
