// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Fragment, useState, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Layout, LayoutHeader, LayoutContent} from '@astryxdesign/core/Layout';
import {TopNav} from '@astryxdesign/core/TopNav';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {Divider} from '@astryxdesign/core/Divider';
import {Kbd} from '@astryxdesign/core/Kbd';
import {SideNav} from '@astryxdesign/core/SideNav';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Card} from '@astryxdesign/core/Card';
import {StackItem, VStack, HStack} from '@astryxdesign/core/Stack';
import {useHotkeys} from '@astryxdesign/core/hooks';
import {useToast} from '@astryxdesign/core/Toast';
import {
  PlayIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

const noop = () => {};

const folder = (
  id: string,
  children: TreeListItemData[],
  isExpanded = true,
): TreeListItemData => ({
  id,
  label: <Text maxLines={1}>{id}</Text>,
  startContent: <Icon icon={FolderIcon} size="xsm" />,
  isExpanded,
  children,
});

const file = (id: string, isSelected = false): TreeListItemData => ({
  id,
  label: <Text maxLines={1}>{id}</Text>,
  startContent: <Icon icon={DocumentTextIcon} size="xsm" />,
  isSelected,
});

const FILE_TREE: TreeListItemData[] = [
  folder('src', [
    folder('components', [
      file('AppShell.tsx', true),
      file('TopNav.tsx'),
      file('SideNav.tsx'),
    ]),
    folder('hooks', [file('useTheme.ts'), file('useResizable.ts')]),
    file('index.tsx'),
    file('App.tsx'),
  ]),
  folder('public', [file('favicon.ico'), file('robots.txt')], false),
  file('package.json'),
  file('tsconfig.json'),
  file('README.md'),
];

// Each menu is split into groups; groups are separated by a divider.
// `[label, shortcut]` — the shortcut renders as a single combined Kbd
// (e.g. ⌘N); an empty shortcut renders no Kbd.
type MenuEntry = [label: string, shortcut: string];

const MENU_WIDTH = 280;

// The search asks for 240px and is the one bar item that narrows on a phone,
// so the actions and the menu button stay in view.
const searchStyles = stylex.create({
  field: {width: 240},
});

const MENUS: {label: string; groups: MenuEntry[][]}[] = [
  {
    label: 'File',
    groups: [
      [
        ['New File', '⌘N'],
        ['New Window', '⇧⌘N'],
      ],
      [
        ['Open...', '⌘O'],
        ['Save', '⌘S'],
        ['Save As...', '⇧⌘S'],
      ],
      [['Close Editor', '⌘W']],
    ],
  },
  {
    label: 'Edit',
    groups: [
      [
        ['Undo', '⌘Z'],
        ['Redo', '⇧⌘Z'],
      ],
      [
        ['Cut', '⌘X'],
        ['Copy', '⌘C'],
        ['Paste', '⌘V'],
      ],
      [['Find', '⌘F']],
    ],
  },
  {
    label: 'View',
    groups: [
      [['Command Palette', '⇧⌘P']],
      [
        ['Explorer', '⇧⌘E'],
        ['Search', '⇧⌘F'],
      ],
      [
        ['Toggle Terminal', '⌃`'],
        ['Zen Mode', '⌘K'],
      ],
    ],
  },
  {
    label: 'Window',
    groups: [
      [
        ['Minimize', '⌘M'],
        ['Zoom', ''],
      ],
      [
        ['Next Tab', '⌃⇥'],
        ['Previous Tab', '⌃⇧⇥'],
      ],
      [['Bring All to Front', '']],
    ],
  },
  {
    label: 'Help',
    groups: [
      [
        ['Documentation', ''],
        ['Release Notes', ''],
        ['Report Issue', ''],
        ['About', ''],
      ],
    ],
  },
];

const CODE_LINES = [
  '38%',
  '62%',
  '54%',
  '0%',
  '46%',
  '70%',
  '58%',
  '34%',
  '0%',
  '50%',
  '66%',
  '42%',
  '60%',
  '28%',
];

const EDITOR_TABS = ['AppShell.tsx', 'TopNav.tsx', 'theme.ts'];

const COMMANDS = [
  {id: 'new-file', label: 'New File'},
  {id: 'open-file', label: 'Open File…'},
  {id: 'save-all', label: 'Save All'},
  {id: 'find-in-files', label: 'Find in Files'},
  {id: 'toggle-terminal', label: 'Toggle Terminal'},
  {id: 'go-to-symbol', label: 'Go to Symbol…'},
  {id: 'appshell', label: 'AppShell.tsx'},
  {id: 'topnav', label: 'TopNav.tsx'},
  {id: 'sidenav', label: 'SideNav.tsx'},
  {id: 'use-theme', label: 'useTheme.ts'},
  {id: 'theme', label: 'theme.ts'},
];

export default function ShellNav() {
  const showToast = useToast();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const searchSource = useMemo(() => createStaticSource(COMMANDS), []);

  // Both combos on every platform, as the page has always accepted.
  const openPalette = () => setIsPaletteOpen(true);
  useHotkeys([
    {keys: 'meta+k', onPress: openPalette, allowInInputs: true},
    {keys: 'ctrl+k', onPress: openPalette, allowInInputs: true},
  ]);

  return (
    <>
      <AppShell
        contentPadding={0}
        topNav={
          <TopNav
            label="Astryx Studio menu bar"
            startContent={
              <>
                {MENUS.map(menu => (
                  <DropdownMenu
                    key={menu.label}
                    button={{label: menu.label, variant: 'ghost', size: 'sm'}}
                    hasChevron={false}
                    menuWidth={MENU_WIDTH}>
                    {menu.groups.map((group, gi) => (
                      <Fragment key={gi}>
                        {gi > 0 && <Divider />}
                        {group.map(([label, shortcut]) => (
                          <DropdownMenuItem
                            key={label}
                            label={label}
                            onClick={noop}
                            endContent={
                              shortcut ? <Kbd keys={shortcut} /> : undefined
                            }
                          />
                        ))}
                      </Fragment>
                    ))}
                  </DropdownMenu>
                ))}
              </>
            }
            endContent={
              <>
                <StackItem
                  size="fill"
                  xstyle={searchStyles.field}
                  onClick={() => setIsPaletteOpen(true)}>
                  <TextInput
                    label="Search files and commands"
                    isLabelHidden
                    size="sm"
                    width="100%"
                    startIcon={MagnifyingGlassIcon}
                    placeholder="Search files and commands…"
                    value=""
                    onChange={() => {}}
                  />
                </StackItem>
                <IconButton
                  label="Run project"
                  tooltip="Run"
                  variant="ghost"
                  icon={<Icon icon={PlayIcon} size="sm" />}
                  onClick={() =>
                    // Demo only: replace this toast with the call that performs the action.
                    showToast({
                      body: 'Demo: the project would run here',
                      uniqueID: 'run',
                    })
                  }
                />
                <StackItem>
                  <Button
                    label="Share"
                    variant="secondary"
                    onClick={() =>
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: sharing would start here',
                        uniqueID: 'share',
                      })
                    }
                  />
                </StackItem>
              </>
            }
          />
        }
        sideNav={
          <SideNav
            resizable={{defaultWidth: 240, minWidth: 180, maxWidth: 400}}>
            <TreeList items={FILE_TREE} density="compact" />
          </SideNav>
        }>
        <Layout
          height="fill"
          header={
            <LayoutHeader hasDivider padding={6}>
              <HStack gap={2}>
                {EDITOR_TABS.map(tab => (
                  <Card
                    key={tab}
                    variant="muted"
                    padding={0}
                    width={132}
                    height={36}
                  />
                ))}
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={6}>
              <VStack gap={2}>
                {CODE_LINES.map((width, i) =>
                  width === '0%' ? (
                    <Card
                      key={i}
                      variant="muted"
                      padding={0}
                      width={1}
                      height={14}
                    />
                  ) : (
                    <HStack key={i} gap={3} vAlign="center">
                      <Card
                        variant="muted"
                        padding={0}
                        width={20}
                        height={14}
                      />
                      <Card
                        variant="muted"
                        padding={0}
                        width={width}
                        height={14}
                      />
                    </HStack>
                  ),
                )}
              </VStack>
            </LayoutContent>
          }
        />
      </AppShell>
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        searchSource={searchSource}
        label="Search files and commands"
        onValueChange={() => setIsPaletteOpen(false)}
      />
    </>
  );
}
