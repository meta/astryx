// Copyright (c) Meta Platforms, Inc. and affiliates.
import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
} from '@astryxdesign/core/ContextMenu';
import {Divider} from '@astryxdesign/core/Divider';
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  ScissorsIcon,
  ClipboardIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';

const triggerStyles = stylex.create({
  area: {
    padding: '48px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: '8px',
    textAlign: 'center',
    color: '#6b7280',
    userSelect: 'none',
  },
});

const meta: Meta<typeof ContextMenu> = {
  title: 'Core/ContextMenu',
  component: ContextMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    items: {
      description: 'Menu items (items, dividers, or sections)',
    },
    menuWidth: {
      control: 'text',
      description: 'Custom menu width (number for px or CSS string)',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Menu item size',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Disable custom context menu',
    },
    presentation: {
      control: 'select',
      options: ['popover', 'bottom-sheet', 'adaptive'],
      description:
        'Cursor popover, BottomSheet, or adaptive compact-touch presentation',
    },
    'data-testid': {
      control: 'text',
      description: 'Test ID for testing frameworks',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  render: () => (
    <ContextMenu
      items={[
        {label: 'Cut', onClick: () => console.log('Cut')},
        {label: 'Copy', onClick: () => console.log('Copy')},
        {label: 'Paste', onClick: () => console.log('Paste')},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click this area</div>
    </ContextMenu>
  ),
};

export const PointerPresentation: Story = {
  name: 'Presentation / pointer menu',
  tags: ['visual-theme-matrix'],
  render: () => (
    <ContextMenu
      data-testid="pointer-context-menu"
      label="Document actions"
      items={[
        {label: 'Edit', icon: PencilIcon, onClick: () => {}},
        {
          label: 'Duplicate',
          icon: DocumentDuplicateIcon,
          onClick: () => {},
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: TrashIcon,
          variant: 'destructive',
          onClick: () => {},
        },
      ]}>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click for document actions
      </div>
    </ContextMenu>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector(
      '[data-testid="pointer-context-menu"]',
    );
    const box = trigger?.getBoundingClientRect();
    trigger?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: (box?.left ?? 0) + 40,
        clientY: (box?.top ?? 0) + 40,
      }),
    );
  },
};

export const WithIcons: Story = {
  render: () => (
    <ContextMenu
      items={[
        {
          label: 'Cut',
          icon: ScissorsIcon,
          onClick: () => console.log('Cut'),
        },
        {
          label: 'Copy',
          icon: ClipboardDocumentIcon,
          onClick: () => console.log('Copy'),
        },
        {
          label: 'Paste',
          icon: ClipboardIcon,
          onClick: () => console.log('Paste'),
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: TrashIcon,
          onClick: () => console.log('Delete'),
        },
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click for actions</div>
    </ContextMenu>
  ),
};

export const DestructiveItem: Story = {
  name: 'Destructive item',
  render: () => (
    <ContextMenu
      items={[
        {label: 'Rename', onClick: () => console.log('Rename')},
        {
          label: 'Duplicate',
          icon: ClipboardDocumentIcon,
          onClick: () => console.log('Duplicate'),
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: TrashIcon,
          variant: 'destructive',
          onClick: () => console.log('Delete'),
        },
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click for actions</div>
    </ContextMenu>
  ),
};

export const WithSections: Story = {
  render: () => (
    <ContextMenu
      items={[
        {
          type: 'section',
          title: 'Edit',
          items: [
            {
              label: 'Cut',
              icon: ScissorsIcon,
              onClick: () => console.log('Cut'),
            },
            {
              label: 'Copy',
              icon: ClipboardDocumentIcon,
              onClick: () => console.log('Copy'),
            },
            {
              label: 'Paste',
              icon: ClipboardIcon,
              onClick: () => console.log('Paste'),
            },
          ],
        },
        {
          type: 'section',
          title: 'Share',
          items: [
            {
              label: 'Share',
              icon: ShareIcon,
              onClick: () => console.log('Share'),
            },
            {
              label: 'Download',
              icon: ArrowDownTrayIcon,
              onClick: () => console.log('Download'),
            },
          ],
        },
      ]}>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click for grouped actions
      </div>
    </ContextMenu>
  ),
};

export const WithDividers: Story = {
  render: () => (
    <ContextMenu
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate')},
        {type: 'divider'},
        {label: 'Delete', onClick: () => console.log('Delete')},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click this area</div>
    </ContextMenu>
  ),
};

export const WithDisabledItems: Story = {
  render: () => (
    <ContextMenu
      items={[
        {
          label: 'Edit',
          icon: PencilIcon,
          onClick: () => console.log('Edit'),
        },
        {
          label: 'Duplicate',
          icon: DocumentDuplicateIcon,
          onClick: () => console.log('Duplicate'),
        },
        {label: 'Delete (no permission)', icon: TrashIcon, isDisabled: true},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click this area</div>
    </ContextMenu>
  ),
};

export const CustomWidth: Story = {
  render: () => (
    <ContextMenu
      menuWidth={280}
      items={[
        {
          label: 'This is a longer option that needs more space',
          onClick: () => console.log('Option 1'),
        },
        {
          label: 'Another long option',
          onClick: () => console.log('Option 2'),
        },
        {label: 'Short', onClick: () => console.log('Option 3')},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>Right-click for wide menu</div>
    </ContextMenu>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <ContextMenu
      size="sm"
      items={[
        {label: 'Cut', onClick: () => console.log('Cut')},
        {label: 'Copy', onClick: () => console.log('Copy')},
        {label: 'Paste', onClick: () => console.log('Paste')},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click for compact menu
      </div>
    </ContextMenu>
  ),
};

export const Disabled: Story = {
  render: () => (
    <ContextMenu
      isDisabled
      items={[
        {label: 'Cut', onClick: () => console.log('Cut')},
        {label: 'Copy', onClick: () => console.log('Copy')},
      ]}>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click shows native menu (disabled)
      </div>
    </ContextMenu>
  ),
};

export const CompoundBasic: Story = {
  render: () => (
    <ContextMenu
      menuContent={
        <>
          <ContextMenuItem
            icon={PencilIcon}
            label="Edit"
            onClick={() => console.log('Edit')}
          />
          <ContextMenuItem
            icon={DocumentDuplicateIcon}
            label="Duplicate"
            onClick={() => console.log('Duplicate')}
          />
          <Divider />
          <ContextMenuItem
            icon={TrashIcon}
            label="Delete"
            onClick={() => console.log('Delete')}
          />
        </>
      }>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click for compound menu
      </div>
    </ContextMenu>
  ),
};

export const CompoundWithDescriptions: Story = {
  render: () => (
    <ContextMenu
      menuWidth={280}
      menuContent={
        <>
          <ContextMenuItem
            icon={PencilIcon}
            label="Edit"
            description="Modify this item"
            onClick={() => console.log('Edit')}
          />
          <ContextMenuItem
            icon={ShareIcon}
            label="Share"
            description="Share with others"
            onClick={() => console.log('Share')}
          />
          <Divider />
          <ContextMenuItem
            icon={TrashIcon}
            label="Delete"
            description="Permanently remove"
            onClick={() => console.log('Delete')}
          />
        </>
      }>
      <div {...stylex.props(triggerStyles.area)}>
        Right-click for detailed menu
      </div>
    </ContextMenu>
  ),
};

export const WithSelectableItems: Story = {
  render: function WithSelectableItemsStory() {
    const [sort, setSort] = useState('name');
    const [showHidden, setShowHidden] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    return (
      <ContextMenu
        menuWidth={220}
        menuContent={
          <>
            <ContextMenuItem
              icon={PencilIcon}
              label="Rename"
              onClick={() => console.log('Rename')}
            />
            <Divider />
            <ContextMenuRadioGroup
              value={sort}
              onChange={setSort}
              label="Sort by">
              <ContextMenuRadioItem value="name" label="Sort by name" />
              <ContextMenuRadioItem value="date" label="Sort by date" />
              <ContextMenuRadioItem value="size" label="Sort by size" />
            </ContextMenuRadioGroup>
            <Divider />
            <ContextMenuCheckboxItem
              label="Show hidden files"
              value={showHidden}
              onChange={setShowHidden}
            />
            <ContextMenuCheckboxItem
              label="Show preview pane"
              value={showPreview}
              onChange={setShowPreview}
            />
          </>
        }>
        <div {...stylex.props(triggerStyles.area)}>
          Right-click for selectable items
        </div>
      </ContextMenu>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Checkbox and radio menu items compose inside a ContextMenu just like in a DropdownMenu. The radio group is a single-select set (menuitemradio) that closes the menu on selection; the checkbox items are independent toggles (menuitemcheckbox) that keep the menu open so several can be flipped. Arrow keys, typeahead, and Enter/Space traverse and activate all three row types alongside plain items.',
      },
    },
  },
};

export const BottomSheetPresentation: Story = {
  name: 'Presentation / BottomSheet',
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'The real ContextMenu component forced to BottomSheet presentation. Long-press opens this surface on touch; this story opens it with a contextmenu event so the sheet is directly reviewable.',
      },
    },
  },
  render: () => (
    <div style={{padding: 16}}>
      <ContextMenu
        data-testid="bottom-sheet-context-menu"
        presentation="bottom-sheet"
        label="Document actions"
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => {}},
          {
            label: 'Duplicate',
            icon: DocumentDuplicateIcon,
            onClick: () => {},
          },
          {label: 'Share', icon: ShareIcon, onClick: () => {}},
          {
            label: 'Delete',
            icon: TrashIcon,
            variant: 'destructive',
            onClick: () => {},
          },
        ]}>
        <div {...stylex.props(triggerStyles.area)}>
          Long-press or right-click for document actions
        </div>
      </ContextMenu>
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector(
      '[data-testid="bottom-sheet-context-menu"]',
    );
    trigger?.dispatchEvent(
      new MouseEvent('contextmenu', {bubbles: true, clientX: 40, clientY: 40}),
    );
  },
};

export const AdaptivePresentation: Story = {
  name: 'Presentation / adaptive',
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      description: {
        story:
          'Uses the built-in adaptive policy: BottomSheet on a compact touch screen (a coarse primary pointer, and a viewport narrower than the theme `md` breakpoint (768px by default) or shorter than 500px), cursor-positioned popover otherwise. Important actions still need a visible MoreMenu or equivalent entry point.',
      },
    },
  },
  render: () => (
    <div style={{padding: 16}}>
      <ContextMenu
        presentation="adaptive"
        label="Document actions"
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => {}},
          {label: 'Share', icon: ShareIcon, onClick: () => {}},
          {
            label: 'Delete',
            icon: TrashIcon,
            variant: 'destructive',
            onClick: () => {},
          },
        ]}>
        <div {...stylex.props(triggerStyles.area)}>
          Long-press or right-click for document actions
        </div>
      </ContextMenu>
    </div>
  ),
};

export const InlineTrigger: Story = {
  name: 'Inline trigger in prose (triggerAs)',
  parameters: {
    docs: {
      description: {
        story:
          'A reference inside running text owns a context menu without breaking the flow: `triggerAs="span"` wraps it inline. Right-click, a held press or Shift+F10 on the reference opens the menu at the pointer.',
      },
    },
  },
  render: () => (
    <p style={{maxWidth: 480, lineHeight: 1.6}}>
      The regression was tracked in{' '}
      <ContextMenu
        triggerAs="span"
        label="Task actions"
        items={[
          {label: 'Open', onClick: () => {}},
          {label: 'Copy link', onClick: () => {}},
        ]}>
        <a href="/tasks/123">T123</a>
      </ContextMenu>{' '}
      and fixed by{' '}
      <ContextMenu
        triggerAs="span"
        label="Diff actions"
        items={[
          {label: 'Open', onClick: () => {}},
          {label: 'Copy link', onClick: () => {}},
        ]}>
        <a href="/diff/456">D456</a>
      </ContextMenu>{' '}
      the same afternoon.
    </p>
  ),
};

export const InScrollContainer: Story = {
  name: 'Inside a scroll container',
  parameters: {
    docs: {
      description: {
        story:
          'The trigger scrolls inside a box. The menu opens at the pointer, and the browser hides it while the box scrolls the pointer position out of view.',
      },
    },
  },
  render: () => (
    <div
      data-testid="context-menu-scroller"
      // The box scrolls but holds nothing focusable, so it needs a tab stop
      // and a name for keyboard scrolling (axe: scrollable-region-focusable).
      tabIndex={0}
      role="region"
      aria-label="Scrolling content"
      style={{width: 320, height: 160, overflowY: 'auto'}}>
      <p style={{height: 240, margin: 0}}>Scroll down to the area.</p>
      <ContextMenu
        items={[
          {label: 'Cut', onClick: () => {}},
          {label: 'Copy', onClick: () => {}},
          {label: 'Paste', onClick: () => {}},
        ]}>
        <div {...stylex.props(triggerStyles.area)}>Right-click this area</div>
      </ContextMenu>
    </div>
  ),
};
