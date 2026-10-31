// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {TreeList} from '@astryxdesign/core/TreeList';
import type {TreeListItemData} from '@astryxdesign/core/TreeList';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {
  FolderIcon,
  DocumentIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

const noop = () => {};

const meta: Meta<typeof TreeList> = {
  title: 'Core/TreeList',
  component: TreeList,
  tags: ['autodocs'],
  argTypes: {
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Spacing density for tree list items',
    },
    variant: {
      control: 'select',
      options: ['lineGuides', 'noGuides'],
      description: 'Hierarchy guide-line treatment',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TreeList>;

const fileTreeItems: TreeListItemData[] = [
  {
    id: 'src',
    label: 'src',
    isExpanded: true,
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          {id: 'button', label: 'Button.tsx', onClick: noop},
          {id: 'card', label: 'Card.tsx', onClick: noop},
          {id: 'list', label: 'List.tsx', onClick: noop},
        ],
      },
      {id: 'app', label: 'App.tsx', onClick: noop},
      {id: 'index', label: 'index.tsx', onClick: noop},
    ],
  },
  {
    id: 'public',
    label: 'public',
    children: [
      {id: 'favicon', label: 'favicon.ico', onClick: noop},
      {id: 'index-html', label: 'index.html', onClick: noop},
    ],
  },
  {id: 'pkg', label: 'package.json', onClick: noop},
  {id: 'readme', label: 'README.md', onClick: noop},
];

export const Basic: Story = {
  args: {
    items: fileTreeItems,
  },
};

export const FullyExpanded: Story = {
  args: {
    items: [
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        children: [
          {
            id: 'components',
            label: 'components',
            isExpanded: true,
            children: [
              {id: 'button', label: 'Button.tsx', onClick: noop},
              {id: 'card', label: 'Card.tsx', onClick: noop},
              {id: 'list', label: 'List.tsx', onClick: noop},
            ],
          },
          {id: 'app', label: 'App.tsx', onClick: noop},
          {id: 'index', label: 'index.tsx', onClick: noop},
        ],
      },
      {
        id: 'public',
        label: 'public',
        isExpanded: true,
        children: [
          {id: 'favicon', label: 'favicon.ico', onClick: noop},
          {id: 'index-html', label: 'index.html', onClick: noop},
        ],
      },
      {id: 'pkg', label: 'package.json', onClick: noop},
      {id: 'readme', label: 'README.md', onClick: noop},
    ],
  },
};

export const WithIcons: Story = {
  args: {
    items: [
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        startContent: <Icon icon={FolderIcon} />,
        children: [
          {
            id: 'app',
            label: 'App.tsx',
            onClick: noop,
            startContent: <Icon icon={DocumentIcon} />,
          },
          {
            id: 'index',
            label: 'index.tsx',
            onClick: noop,
            startContent: <Icon icon={DocumentIcon} />,
          },
        ],
      },
      {
        id: 'pkg',
        label: 'package.json',
        onClick: noop,
        startContent: <Icon icon={DocumentIcon} />,
      },
    ],
  },
};

export const WithHeader: Story = {
  args: {
    items: fileTreeItems,
    header: <strong>Project Files</strong>,
  },
};

export const Compact: Story = {
  args: {
    items: [
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        children: [
          {
            id: 'components',
            label: 'components',
            isExpanded: true,
            children: [
              {id: 'button', label: 'Button.tsx', onClick: noop},
              {id: 'card', label: 'Card.tsx', onClick: noop},
              {id: 'list', label: 'List.tsx', onClick: noop},
            ],
          },
          {id: 'app', label: 'App.tsx', onClick: noop},
          {id: 'index', label: 'index.tsx', onClick: noop},
        ],
      },
      {
        id: 'public',
        label: 'public',
        children: [
          {id: 'favicon', label: 'favicon.ico', onClick: noop},
          {id: 'index-html', label: 'index.html', onClick: noop},
        ],
      },
      {id: 'pkg', label: 'package.json', onClick: noop},
      {id: 'readme', label: 'README.md', onClick: noop},
    ],
    density: 'compact',
  },
};

export const Spacious: Story = {
  args: {
    items: fileTreeItems,
    density: 'spacious',
  },
};

export const TopAligned: Story = {
  args: {
    items: [
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        children: [
          {
            id: 'components',
            label: 'components',
            isExpanded: true,
            children: [
              {id: 'button', label: 'Button.tsx', onClick: noop},
              {id: 'card', label: 'Card.tsx', onClick: noop},
              {id: 'list', label: 'List.tsx', onClick: noop},
            ],
          },
          {id: 'app', label: 'App.tsx', onClick: noop},
          {id: 'index', label: 'index.tsx', onClick: noop},
        ],
      },
      {
        id: 'public',
        label: 'public',
        children: [
          {id: 'favicon', label: 'favicon.ico', onClick: noop},
          {id: 'index-html', label: 'index.html', onClick: noop},
        ],
      },
      {id: 'pkg', label: 'package.json', onClick: noop},
      {id: 'readme', label: 'README.md', onClick: noop},
    ],
  },
};

export const Interactive: Story = {
  args: {
    items: [
      {
        id: 'settings',
        label: 'Settings',
        isExpanded: true,
        startContent: <Icon icon={Cog6ToothIcon} />,
        onClick: () => alert('Settings'),
        children: [
          {
            id: 'general',
            label: 'General',
            onClick: () => alert('General settings'),
          },
          {
            id: 'advanced',
            label: 'Advanced',
            onClick: () => alert('Advanced settings'),
          },
        ],
      },
      {
        id: 'docs',
        label: 'Documentation',
        href: '#',
        endContent: <Icon icon={ChevronRightIcon} />,
      },
    ],
  },
};

export const WithEndContent: Story = {
  args: {
    items: [
      {
        id: 'inbox',
        label: 'Inbox',
        isExpanded: true,
        endContent: <Badge label="3" />,
        children: [
          {
            id: 'unread',
            label: 'Unread',
            onClick: noop,
            endContent: <Badge label="3" />,
          },
          {id: 'starred', label: 'Starred', onClick: noop},
        ],
      },
      {id: 'sent', label: 'Sent', onClick: noop},
      {
        id: 'drafts',
        label: 'Drafts',
        onClick: noop,
        endContent: <Badge label="1" />,
      },
    ],
  },
};

export const DisabledItems: Story = {
  args: {
    items: [
      {
        id: 'active',
        label: 'Active Section',
        isExpanded: true,
        children: [
          {id: 'item1', label: 'Available Item', onClick: noop},
          {
            id: 'item2',
            label: 'Disabled Item',
            onClick: noop,
            isDisabled: true,
          },
        ],
      },
      {
        id: 'disabled-parent',
        label: 'Disabled Parent',
        onClick: noop,
        isDisabled: true,
      },
    ],
  },
};

export const SelectedItems: Story = {
  args: {
    items: [
      {
        id: 'nav',
        label: 'Navigation',
        isExpanded: true,
        children: [
          {id: 'home', label: 'Home', onClick: noop},
          {id: 'about', label: 'About', onClick: noop, isSelected: true},
          {id: 'contact', label: 'Contact', onClick: noop},
        ],
      },
    ],
  },
};

/**
 * Theme the expand/collapse chevron precisely via `defineTheme`.
 *
 * - `components['tree-list-chevron'].base` scopes overrides to the toggle
 *   control only (via the `astryx-tree-list-chevron` target), instead of
 *   reaching it through the functional `[data-tree-toggle]` attribute.
 * - `state:expanded` / `state:collapsed` restyle each open/closed state,
 *   which the toggle reflects as a `data-state` attribute.
 *
 * Defaults are unchanged; this story only demonstrates the override channel.
 */
const chevronTheme = defineTheme({
  name: 'tree-list-chevron-demo',
  components: {
    'tree-list-chevron': {
      base: {
        color: 'var(--color-accent)',
      },
      'state:expanded': {
        color: 'var(--color-success)',
      },
    },
  },
});

/**
 * Theme the item label text precisely via `defineTheme`.
 *
 * - `components['tree-list-item-label'].base` scopes overrides to the label
 *   text only (via the `astryx-tree-list-item-label` target), instead of a
 *   fragile `button:not([data-tree-toggle]) > span` structural selector.
 * - `selected` restyles just the selected item's label (bold here), which the
 *   label reflects as a `data-selected` attribute.
 *
 * Defaults are unchanged; this story only demonstrates the override channel.
 */
const labelTheme = defineTheme({
  name: 'tree-list-item-label-demo',
  components: {
    'tree-list-item-label': {
      selected: {
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-accent)',
      },
    },
  },
});

export const ThemedChevron: Story = {
  render: () => (
    <Theme theme={chevronTheme} mode="light">
      <TreeList
        items={[
          {
            id: 'root',
            label: 'Expanded branch (accent → success)',
            isExpanded: true,
            children: [
              {id: 'leaf-1', label: 'Leaf 1', onClick: noop},
              {
                id: 'nested',
                label: 'Collapsed branch (accent)',
                children: [{id: 'leaf-2', label: 'Leaf 2', onClick: noop}],
              },
            ],
          },
        ]}
      />
    </Theme>
  ),
};

export const ThemedItemLabel: Story = {
  render: () => (
    <Theme theme={labelTheme} mode="light">
      <TreeList
        items={[
          {
            id: 'nav',
            label: 'Navigation',
            isExpanded: true,
            children: [
              {id: 'home', label: 'Home', onClick: noop},
              {
                id: 'about',
                label: 'About (selected — bold accent label)',
                onClick: noop,
                isSelected: true,
              },
              {id: 'contact', label: 'Contact', onClick: noop},
            ],
          },
        ]}
      />
    </Theme>
  ),
};

const guideItems: TreeListItemData[] = [
  {
    id: 'root',
    label: 'Project',
    isExpanded: true,
    children: [
      {
        id: 'src',
        label: 'src',
        isExpanded: true,
        children: [
          {id: 'app', label: 'App.tsx'},
          {id: 'index', label: 'index.tsx'},
        ],
      },
      {id: 'pkg', label: 'package.json'},
    ],
  },
];

/**
 * Hide the hierarchy guide (connector) lines through the
 * `astryx-tree-list-guide` theme target — `display: 'none'` — when the
 * surrounding layout already conveys nesting, or when a theme supplies its own
 * connectors. No prop is needed: the theme rule lands in `@layer astryx-theme`,
 * above StyleX's base layer, so it wins.
 */
const hiddenGuidesTheme = defineTheme({
  name: 'tree-list-guide-hidden-demo',
  components: {
    'tree-list-guide': {
      base: {
        display: 'none',
      },
    },
  },
});

export const HiddenGuides: Story = {
  render: () => (
    <Theme theme={hiddenGuidesTheme} mode="light">
      <TreeList items={guideItems} />
    </Theme>
  ),
};

/**
 * Recolor the guides via the `astryx-tree-list-guide` theme target instead of
 * hiding the built-in connectors and reimplementing them.
 *
 * `components['tree-list-guide'].base` restyles the connector lines only.
 * Defaults are unchanged; this story only demonstrates the override channel.
 */
const guideTheme = defineTheme({
  name: 'tree-list-guide-demo',
  components: {
    'tree-list-guide': {
      base: {
        backgroundColor: 'var(--color-accent)',
      },
    },
  },
});

export const ThemedGuides: Story = {
  render: () => (
    <Theme theme={guideTheme} mode="light">
      <TreeList items={guideItems} />
    </Theme>
  ),
};

/**
 * The `variant` prop selects the base guide-line look, orthogonal to `density`
 * (which owns spacing). `lineGuides` (default) draws the connector lines;
 * `noGuides` hides them while keeping the indentation intact, so nesting is
 * conveyed by indent alone. The guides remain themeable via the
 * `astryx-tree-list-guide` target regardless of variant.
 */
export const Variants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 48, alignItems: 'flex-start'}}>
      <div>
        <div style={{marginBottom: 8, fontWeight: 600}}>
          lineGuides (default)
        </div>
        <TreeList items={guideItems} variant="lineGuides" />
      </div>
      <div>
        <div style={{marginBottom: 8, fontWeight: 600}}>noGuides</div>
        <TreeList items={guideItems} variant="noGuides" />
      </div>
    </div>
  ),
};

export const NoGuides: Story = {
  args: {
    items: guideItems,
    variant: 'noGuides',
  },
};

// =============================================================================
// Collapse with focus inside the branch (AR2)
// =============================================================================

/**
 * The app collapses "src" from a keyboard shortcut (`[`), which leaves focus
 * where it was. Focus on "index.ts" moves to "src"; focus elsewhere stays put.
 */
function CollapseFocusDemo() {
  const [isExpanded, setIsExpanded] = useState(true);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '[') {
        setIsExpanded(expanded => !expanded);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return (
    <VStack gap={2}>
      <TreeList
        aria-label="Files"
        items={[
          {
            id: 'src',
            label: 'src',
            isExpanded,
            children: [{id: 'index', label: 'index.ts'}],
          },
          {id: 'readme', label: 'README.md'},
        ]}
      />
      <Button label="Elsewhere" variant="secondary" />
    </VStack>
  );
}

export const CollapseFocus: Story = {
  name: 'Collapse Focus',
  render: () => <CollapseFocusDemo />,
};
