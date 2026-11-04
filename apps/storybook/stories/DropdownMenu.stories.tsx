// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useState} from 'react';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu';
import {Button} from '@astryxdesign/core/Button';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {TextInput} from '@astryxdesign/core/TextInput';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  ArchiveBoxIcon,
  FolderPlusIcon,
  DocumentPlusIcon,
  UserIcon,
  EllipsisHorizontalIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Core/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    button: {
      description: 'Props for customizing the trigger button',
    },
    items: {
      description: 'Menu items (items, dividers, or sections)',
    },
    presentation: {
      control: 'select',
      options: ['popover', 'bottom-sheet'],
      description: 'Surface used to present data-driven menu actions',
    },
    isMenuOpen: {
      control: 'boolean',
      description: 'Controlled open state',
    },
    menuWidth: {
      control: 'text',
      description:
        'Minimum menu width for lengths, or preferred width for intrinsic keywords; capped to the available viewport space',
    },
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
      description: 'Menu placement relative to trigger',
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'Menu alignment along the placement axis',
    },
    'data-testid': {
      control: 'text',
      description: 'Test ID for testing frameworks',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

const readinessStyles = stylex.create({
  viewportStoryCanvas: {
    boxSizing: 'border-box',
    inlineSize: '100%',
    minBlockSize: '100dvh',
    paddingBlockStart: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-4'],
    overflow: 'clip',
  },
  edgeAnchorRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

const PROJECT_ACTIONS = [
  {
    label: 'Edit project',
    description: 'Update the project details.',
    icon: PencilIcon,
  },
  {
    label: 'Duplicate project',
    description: 'Create a copy of this project.',
    icon: DocumentDuplicateIcon,
  },
  {
    label: 'Share project',
    description: 'Invite people to collaborate.',
    icon: ShareIcon,
  },
  {
    label: 'Archive project',
    description: 'Move this project out of active work.',
    icon: ArchiveBoxIcon,
  },
] as const;

function CompactDrillInActionSheet() {
  return (
    <DropdownMenu
      button={{label: 'Project actions'}}
      presentation="bottom-sheet"
      items={[
        {label: 'Rename project', icon: PencilIcon},
        {
          label: 'Move to project',
          icon: FolderPlusIcon,
          items: PROJECT_DESTINATIONS.slice(0, 4).map(([label, team]) => ({
            label,
            description: team,
            icon: FolderPlusIcon,
          })),
        },
        {label: 'Archive project', icon: ArchiveBoxIcon},
      ]}
    />
  );
}

const PROJECT_DESTINATIONS = [
  ['Apollo launch', 'Marketing'],
  ['Customer insights', 'Research'],
  ['Design systems', 'Platform'],
  ['Growth experiments', 'Product'],
  ['Incident review', 'Operations'],
  ['Mobile quality', 'Engineering'],
  ['Quarterly planning', 'Strategy'],
  ['Recruiting plan', 'People'],
  ['Security follow-up', 'Trust'],
  ['Website refresh', 'Brand'],
] as const;

// Basic usage
export const Default: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Actions'}}
      items={[
        {label: 'Edit', onClick: () => console.log('Edit clicked')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate clicked')},
        {label: 'Delete', onClick: () => console.log('Delete clicked')},
      ]}
    />
  ),
};

// With icons
export const WithIcons: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Actions', variant: 'primary'}}
      items={[
        {label: 'Edit', icon: PencilIcon, onClick: () => console.log('Edit')},
        {
          label: 'Duplicate',
          icon: DocumentDuplicateIcon,
          onClick: () => console.log('Duplicate'),
        },
        {
          label: 'Download',
          icon: ArrowDownTrayIcon,
          onClick: () => console.log('Download'),
        },
        {
          label: 'Delete',
          icon: TrashIcon,
          onClick: () => console.log('Delete'),
        },
      ]}
    />
  ),
};

// With sections
export const WithSections: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'File', variant: 'ghost'}}
      items={[
        {
          type: 'section',
          title: 'Create',
          items: [
            {
              label: 'New File',
              icon: DocumentPlusIcon,
              onClick: () => console.log('New File'),
            },
            {
              label: 'New Folder',
              icon: FolderPlusIcon,
              onClick: () => console.log('New Folder'),
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
              label: 'Archive',
              icon: ArchiveBoxIcon,
              onClick: () => console.log('Archive'),
            },
          ],
        },
      ]}
    />
  ),
};

// With dividers
export const WithDividers: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Actions'}}
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate')},
        {type: 'divider'},
        {label: 'Delete', onClick: () => console.log('Delete')},
      ]}
    />
  ),
};

// With disabled items
export const WithDisabledItems: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Actions'}}
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate')},
        {label: 'Delete (disabled)', isDisabled: true},
      ]}
    />
  ),
};

export const DestructiveItem: Story = {
  name: 'Destructive item',
  render: () => (
    <DropdownMenu
      button={{label: 'Actions'}}
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {
          label: 'Duplicate',
          icon: 'copy',
          onClick: () => console.log('Duplicate'),
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: 'close',
          variant: 'destructive',
          onClick: () => console.log('Delete'),
        },
      ]}
    />
  ),
};

// Controlled mode
export const Controlled: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'center',
        }}>
        <div>Menu is {isOpen ? 'open' : 'closed'}</div>
        <DropdownMenu
          button={{label: 'Controlled Menu'}}
          isMenuOpen={isOpen}
          onOpenChange={setIsOpen}
          items={[
            {label: 'Item 1', onClick: () => console.log('Item 1')},
            {label: 'Item 2', onClick: () => console.log('Item 2')},
            {label: 'Item 3', onClick: () => console.log('Item 3')},
          ]}
        />
      </div>
    );
  },
};

// Mounted already open: the menu is visible on first render, but focus stays
// where it was. Only an open the user initiates moves focus into the first
// item; from the focused trigger, ArrowDown walks into the open menu (#5976).
export const MountedOpen: Story = {
  render: function MountedOpenStory() {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <DropdownMenu
        button={{label: 'Sort'}}
        isMenuOpen={isOpen}
        onOpenChange={setIsOpen}>
        <DropdownMenuItem label="Newest" />
        <DropdownMenuItem label="Oldest" />
      </DropdownMenu>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A controlled menu mounted with `isMenuOpen` true renders open without taking focus; `document.activeElement` stays on the page until the user opens the menu themselves. Tab to the trigger, then ArrowDown enters the already-open menu at the first item.',
      },
    },
  },
};

// Custom menu width
export const CustomWidth: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Wide Menu'}}
      menuWidth={300}
      items={[
        {
          label: 'This is a longer option that needs more space',
          onClick: () => console.log('Option 1'),
        },
        {
          label: 'Another long option with extra text',
          onClick: () => console.log('Option 2'),
        },
        {label: 'Short one', onClick: () => console.log('Option 3')},
      ]}
    />
  ),
};

// Button variants
export const ButtonVariants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
      <DropdownMenu
        button={{label: 'Secondary', variant: 'secondary'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
      <DropdownMenu
        button={{label: 'Primary', variant: 'primary'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
      <DropdownMenu
        button={{label: 'Ghost', variant: 'ghost'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
      <DropdownMenu
        button={{label: 'Destructive', variant: 'destructive'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
    </div>
  ),
};

// Button sizes
export const ButtonSizes: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <DropdownMenu
        button={{label: 'Small', size: 'sm'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
      <DropdownMenu
        button={{label: 'Medium', size: 'md'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
      <DropdownMenu
        button={{label: 'Large', size: 'lg'}}
        items={[{label: 'Option 1'}, {label: 'Option 2'}]}
      />
    </div>
  ),
};

// With onClick callback
export const WithOnClick: Story = {
  render: () => {
    const [clickCount, setClickCount] = useState(0);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'center',
        }}>
        <div>Button clicked {clickCount} times</div>
        <DropdownMenu
          button={{label: 'Click Me'}}
          onClick={() => setClickCount(c => c + 1)}
          items={[
            {label: 'Menu Item', onClick: () => console.log('Item clicked')},
          ]}
        />
      </div>
    );
  },
};

export const StaysOpenOnSelect: Story = {
  render: () => {
    const [copied, setCopied] = useState(false);
    return (
      <DropdownMenu
        button={{label: 'Session'}}
        items={[
          {
            label: copied ? 'Copied' : 'Copy session ID',
            icon: <DocumentDuplicateIcon style={{width: 16, height: 16}} />,
            hasCloseOnSelect: false,
            onClick: () => setCopied(true),
          },
          {label: 'Rename'},
          {label: 'Delete', variant: 'destructive'},
        ]}
        onOpenChange={isOpen => {
          if (!isOpen) {
            setCopied(false);
          }
        }}
      />
    );
  },
};

// Custom item rendering with compound mode
export const CustomItemRender: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Select User'}} menuWidth={280}>
      <DropdownMenuItem
        icon={UserIcon}
        label="Alice Johnson"
        description="alice.johnson@example.com"
        onClick={() => console.log('Alice')}
      />
      <DropdownMenuItem
        icon={UserIcon}
        label="Bob Smith"
        description="bob.smith@example.com"
        onClick={() => console.log('Bob')}
      />
      <DropdownMenuItem
        icon={UserIcon}
        label="Carol Williams"
        description="carol.williams@example.com"
        onClick={() => console.log('Carol')}
      />
    </DropdownMenu>
  ),
};

// Icon-only trigger — renders as a square icon button (e.g., "⋯" menu)
export const IconOnly: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <DropdownMenu
        button={{
          label: 'More options',
          icon: <EllipsisHorizontalIcon />,
          variant: 'ghost',
          isIconOnly: true,
        }}
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => console.log('Edit')},
          {
            label: 'Delete',
            icon: TrashIcon,
            onClick: () => console.log('Delete'),
          },
        ]}
      />
      <DropdownMenu
        button={{
          label: 'Settings',
          icon: <Cog6ToothIcon />,
          variant: 'secondary',
          isIconOnly: true,
        }}
        items={[
          {label: 'Preferences', onClick: () => console.log('Preferences')},
          {label: 'Account', onClick: () => console.log('Account')},
        ]}
      />
    </div>
  ),
};

// Icon + label together — pass children on button to get visible text with icon
export const IconWithLabel: Story = {
  render: () => (
    <DropdownMenu
      button={{
        label: 'Settings',
        icon: <Cog6ToothIcon />,
        variant: 'ghost',
        children: 'Settings',
      }}
      items={[
        {label: 'Preferences', onClick: () => console.log('Preferences')},
        {label: 'Account', onClick: () => console.log('Account')},
      ]}
    />
  ),
};

// No chevron — label-only trigger without dropdown indicator
export const NoChevron: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Sort by: Name', variant: 'ghost'}}
      hasChevron={false}
      items={[
        {label: 'Name', onClick: () => console.log('Name')},
        {label: 'Date', onClick: () => console.log('Date')},
        {label: 'Size', onClick: () => console.log('Size')},
      ]}
    />
  ),
};

// Compound-component mode — JSX children with interactive items
export const CompoundBasic: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem
        icon={PencilIcon}
        label="Edit"
        onClick={() => console.log('Edit')}
      />
      <DropdownMenuItem
        icon={DocumentDuplicateIcon}
        label="Duplicate"
        onClick={() => console.log('Duplicate')}
      />
      <DropdownMenuDivider />
      <DropdownMenuItem
        icon={TrashIcon}
        label="Delete"
        onClick={() => console.log('Delete')}
      />
    </DropdownMenu>
  ),
};

// Compound mode with disabled items
export const CompoundWithDisabled: Story = {
  render: () => (
    <DropdownMenu button={{label: 'File Actions'}}>
      <DropdownMenuItem
        icon={PencilIcon}
        label="Edit"
        onClick={() => console.log('Edit')}
      />
      <DropdownMenuItem
        icon={DocumentDuplicateIcon}
        label="Duplicate"
        onClick={() => console.log('Duplicate')}
      />
      <DropdownMenuDivider />
      <DropdownMenuItem
        icon={TrashIcon}
        label="Delete (no permission)"
        isDisabled
      />
    </DropdownMenu>
  ),
};

// Compound mode with conditional items
export const CompoundConditional: Story = {
  render: () => {
    const [canDelete, setCanDelete] = useState(false);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'center',
        }}>
        <label style={{display: 'flex', gap: 8, alignItems: 'center'}}>
          <input
            type="checkbox"
            checked={canDelete}
            onChange={e => setCanDelete(e.target.checked)}
          />
          Show delete option
        </label>
        <DropdownMenu button={{label: 'Actions'}}>
          <DropdownMenuItem
            icon={PencilIcon}
            label="Edit"
            onClick={() => console.log('Edit')}
          />
          <DropdownMenuItem
            icon={ShareIcon}
            label="Share"
            onClick={() => console.log('Share')}
          />
          {canDelete && (
            <>
              <DropdownMenuDivider />
              <DropdownMenuItem
                icon={TrashIcon}
                label="Delete"
                onClick={() => console.log('Delete')}
              />
            </>
          )}
        </DropdownMenu>
      </div>
    );
  },
};

// Compound mode with descriptions
export const CompoundWithDescriptions: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Select User'}} menuWidth={280}>
      <DropdownMenuItem
        icon={UserIcon}
        label="Alice Johnson"
        description="alice.johnson@example.com"
        onClick={() => console.log('Alice')}
      />
      <DropdownMenuItem
        icon={UserIcon}
        label="Bob Smith"
        description="bob.smith@example.com"
        onClick={() => console.log('Bob')}
      />
      <DropdownMenuItem
        icon={UserIcon}
        label="Carol Williams"
        description="carol.williams@example.com"
        onClick={() => console.log('Carol')}
      />
    </DropdownMenu>
  ),
};

export const CompoundWithGroups: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Version'}}>
      <DropdownMenuGroup title="Version history">
        <DropdownMenuItem
          icon={ArrowDownTrayIcon}
          label="Restore this version"
          onClick={() => console.log('Restore')}
        />
        <DropdownMenuItem
          icon={DocumentDuplicateIcon}
          label="Compare with current"
          onClick={() => console.log('Compare')}
        />
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuGroup title="Add to message">
        <DropdownMenuItem
          icon={ShareIcon}
          label="As a link"
          onClick={() => console.log('Link')}
        />
        <DropdownMenuItem
          icon={DocumentPlusIcon}
          label="As a snippet"
          onClick={() => console.log('Snippet')}
        />
      </DropdownMenuGroup>
    </DropdownMenu>
  ),
};

export const PlacementAbove: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Bottom toolbar menu'}}
      placement="above"
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate')},
        {label: 'Delete', onClick: () => console.log('Delete')},
      ]}
    />
  ),
};

export const AlignmentEnd: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Row actions'}}
      alignment="end"
      menuWidth={220}
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate')},
        {label: 'Delete', onClick: () => console.log('Delete')},
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Use alignment="end" when a menu should extend back over the trigger, such as a row action menu near the inline-end edge.',
      },
    },
  },
};

export const RTL: Story = {
  render: () => (
    <div style={{direction: 'rtl', display: 'flex', gap: '16px'}}>
      <DropdownMenu
        button={{label: 'CSS direction: rtl'}}
        items={[
          {label: 'Edit', onClick: () => console.log('Edit')},
          {label: 'Duplicate', onClick: () => console.log('Duplicate')},
          {label: 'Delete', onClick: () => console.log('Delete')},
        ]}
      />
      <div dir="ltr">
        <div dir="rtl">
          <DropdownMenu
            button={{label: 'dir="rtl" attribute'}}
            items={[
              {label: 'Edit', onClick: () => console.log('Edit')},
              {label: 'Duplicate', onClick: () => console.log('Duplicate')},
              {label: 'Delete', onClick: () => console.log('Delete')},
            ]}
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In RTL contexts (CSS direction property or dir attribute) the menu right-edge-aligns to the trigger and grows toward the left — the logical mirror of the LTR default (#3389). Both direction mechanisms are shown; the popover inherits direction from the trigger subtree and the self-* position-area keywords mirror it in pure CSS.',
      },
    },
  },
};

// =============================================================================
// Lab — selectable items (#3829)
// =============================================================================

export const LabCheckboxItems: Story = {
  render: function LabCheckboxItemsStory() {
    const [showArchived, setShowArchived] = useState(false);
    const [showDrafts, setShowDrafts] = useState(true);
    const [syncFolders, setSyncFolders] = useState(true);
    return (
      <DropdownMenu button={{label: 'View'}}>
        <DropdownMenuCheckboxItem
          label="Show archived"
          value={showArchived}
          onChange={setShowArchived}
        />
        <DropdownMenuCheckboxItem
          label="Show drafts"
          description="Include unpublished items"
          value={showDrafts}
          onChange={setShowDrafts}
        />
        <DropdownMenuCheckboxItem
          label="Sync folders"
          icon={ArchiveBoxIcon}
          endContent={
            <span data-testid="dropdown-menu-checkbox-item-end-content">
              <Badge label="Beta" />
            </span>
          }
          value={syncFolders}
          onChange={setSyncFolders}
        />
        <DropdownMenuCheckboxItem
          label="Managed by your organization"
          value={true}
          isDisabled
        />
      </DropdownMenu>
    );
  },
  tags: ['visual-theme-matrix'],
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          'DropdownMenuCheckboxItem — independent toggles (role="menuitemcheckbox"). The menu stays open on toggle by default so several can be flipped at once.',
      },
    },
  },
};

export const LabRadioGroup: Story = {
  render: function LabRadioGroupStory() {
    const [sort, setSort] = useState('newest');
    return (
      <DropdownMenu button={{label: 'Sort'}}>
        <DropdownMenuRadioGroup value={sort} onChange={setSort} label="Sort by">
          <DropdownMenuRadioItem value="newest" label="Newest" />
          <DropdownMenuRadioItem value="oldest" label="Oldest" />
          <DropdownMenuRadioItem
            value="az"
            label="Alphabetical"
            description="A → Z"
          />
        </DropdownMenuRadioGroup>
      </DropdownMenu>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'DropdownMenuRadioGroup + DropdownMenuRadioItem — single-select group (role="menuitemradio"). Selecting closes the menu by default.',
      },
    },
  },
};

export const LabSelectableSizes: Story = {
  render: function LabSelectableSizesStory() {
    const [sm, setSm] = useState('a');
    const [lg, setLg] = useState('a');
    return (
      <div style={{display: 'flex', gap: 24}}>
        <DropdownMenu button={{label: 'Small menu', size: 'sm'}}>
          <DropdownMenuRadioGroup value={sm} onChange={setSm} label="Small">
            <DropdownMenuRadioItem value="a" label="Option A" />
            <DropdownMenuRadioItem value="b" label="Option B" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
        <DropdownMenu button={{label: 'Large menu', size: 'lg'}}>
          <DropdownMenuRadioGroup value={lg} onChange={setLg} label="Large">
            <DropdownMenuRadioItem value="a" label="Option A" />
            <DropdownMenuRadioItem value="b" label="Option B" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The checkbox/radio control size is derived from the menu item size — a `sm` menu renders the small (18px) control, `md`/`lg` render the standard (22px) control. On coarse-pointer (touch) devices the control swaps to the inline-end of the row.',
      },
    },
  },
};

export const Submenu: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem icon={PencilIcon} label="Rename" onClick={() => {}} />
      <DropdownMenuSubMenu icon={FolderPlusIcon} label="Move to">
        <DropdownMenuItem label="Folder A" onClick={() => {}} />
        <DropdownMenuItem label="Folder B" onClick={() => {}} />
        <DropdownMenuItem label="Folder C" onClick={() => {}} />
      </DropdownMenuSubMenu>
      <DropdownMenuItem icon={TrashIcon} label="Delete" onClick={() => {}} />
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'DropdownMenuSubMenu is a single menu row that reveals a nested flyout of its own children. Hover or Right arrow (Left in RTL) / Enter / Space opens it and moves focus to its first item; Left arrow / Escape closes it and returns focus to the trigger. The flyout opens inline-end by default and auto-flips at the viewport edge.',
      },
    },
  },
};

export const NestedSubmenu: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Share'}}>
      <DropdownMenuItem icon={ShareIcon} label="Copy link" onClick={() => {}} />
      <DropdownMenuSubMenu label="Share to">
        <DropdownMenuItem label="Email" onClick={() => {}} />
        <DropdownMenuSubMenu label="Team">
          <DropdownMenuItem label="Design" onClick={() => {}} />
          <DropdownMenuItem label="Engineering" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenuSubMenu>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Submenus nest to arbitrary depth — each level owns its own roving focus and positioning layer.',
      },
    },
  },
};

export const SubmenuAsyncSpinner: Story = {
  render: () => (
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem label="Rename" onClick={() => {}} />
      <DropdownMenuSubMenu label="Move to" hasSpinner>
        <DropdownMenuItem label="Loading…" isDisabled onClick={() => {}} />
      </DropdownMenuSubMenu>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A submenu row can show a spinner in place of the caret via `hasSpinner`, e.g. while a lazy submenu\u2019s children load.',
      },
    },
  },
};

export const SubmenuDataDriven: Story = {
  render: () => (
    <DropdownMenu
      button={{label: 'Actions'}}
      items={[
        {label: 'Rename', onClick: () => {}},
        {
          label: 'Move to',
          icon: FolderPlusIcon,
          items: [
            {label: 'Folder A', onClick: () => {}},
            {label: 'Folder B', onClick: () => {}},
          ],
        },
        {type: 'divider'},
        {label: 'Delete', onClick: () => {}},
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Data-driven parity: give a menu item a nested `items` array and it becomes a submenu automatically — no separate item type.',
      },
    },
  },
};

// The same menu — dividers and a trailing shortcut hint — expressed in each
// mode. Neither could express both before: data mode had no `endContent`,
// compound mode had no divider component.
export const ModeParity: Story = {
  parameters: {layout: 'padded'},
  render: () => (
    <div style={{display: 'flex', gap: 160, justifyContent: 'center'}}>
      <DropdownMenu
        button={{label: 'Data mode'}}
        menuWidth={220}
        items={[
          {
            label: 'Search',
            icon: MagnifyingGlassIcon,
            endContent: <Badge label="⌘K" />,
          },
          {
            label: 'Duplicate',
            icon: DocumentDuplicateIcon,
            endContent: <Badge label="⌘D" />,
          },
          {type: 'divider'},
          {label: 'Delete', icon: TrashIcon, variant: 'destructive'},
        ]}
      />
      <DropdownMenu button={{label: 'Compound mode'}} menuWidth={220}>
        <DropdownMenuItem
          icon={MagnifyingGlassIcon}
          label="Search"
          endContent={<Badge label="⌘K" />}
        />
        <DropdownMenuItem
          icon={DocumentDuplicateIcon}
          label="Duplicate"
          endContent={<Badge label="⌘D" />}
        />
        <DropdownMenuDivider />
        <DropdownMenuItem
          icon={TrashIcon}
          label="Delete"
          variant="destructive"
        />
      </DropdownMenu>
    </div>
  ),
};

// =============================================================================
// Responsive and Interaction Readiness Evidence
// =============================================================================

export const ActionSheetPresentation: Story = {
  name: 'Presentation / action sheet',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'Forces DropdownMenu’s bottom-sheet presentation for a short, flat set of actions. It uses BottomSheet behavior including dialog focus, a scrim, Escape, and swipe dismissal.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <DropdownMenu
        presentation="bottom-sheet"
        button={{label: 'Project actions'}}
        items={PROJECT_ACTIONS.map(action => ({
          ...action,
          onClick: () => console.log(`${action.label} selected`),
        }))}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const ActionSheetCustomTrigger: Story = {
  name: 'Presentation / action sheet, custom trigger',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'A control the caller renders opens the bottom-sheet presentation. When the sheet closes, focus returns to that control, with a focus ring only after keyboard input.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <DropdownMenu
        presentation="bottom-sheet"
        renderTrigger={props => (
          <IconButton
            icon={<EllipsisHorizontalIcon />}
            label="Project actions"
            variant="ghost"
            {...props}
          />
        )}
        items={PROJECT_ACTIONS.map(action => ({
          ...action,
          onClick: () => console.log(`${action.label} selected`),
        }))}
      />
    </div>
  ),
};

export const SectionedActionSheetPresentation: Story = {
  name: 'Presentation / sectioned action sheet',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'Shows titled sections in the bottom-sheet presentation. Section headings and spacious action rows share the same inline content edge.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <DropdownMenu
        presentation="bottom-sheet"
        button={{label: 'File actions'}}
        items={[
          {
            type: 'section',
            title: 'Create',
            items: [{label: 'New file'}, {label: 'New folder'}],
          },
          {
            type: 'section',
            title: 'Manage',
            items: [{label: 'Share file'}, {label: 'Archive file'}],
          },
        ]}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const AdaptiveActionPresentation: Story = {
  name: 'Presentation / adaptive action menu',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'Uses DropdownMenu’s adaptive presentation: a BottomSheet on compact coarse-pointer layouts and an anchored popover elsewhere.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <DropdownMenu
        presentation="adaptive"
        button={{label: 'Project actions'}}
        items={PROJECT_ACTIONS.map(action => ({
          ...action,
          onClick: () => console.log(`${action.label} selected`),
        }))}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const CompactDrillInPresentation: Story = {
  name: 'Presentation / compact drill-in hierarchy',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        story:
          'Uses DropdownMenu’s bottom-sheet presentation for a hierarchy that cannot fit as adjacent flyouts. Move to project drills into a second list with a Back action while BottomSheet owns the modal contract.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <CompactDrillInActionSheet />
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
      const submenuRow = Array.from(canvasElement.querySelectorAll('li')).find(
        item => item.textContent?.includes('Move to project'),
      );
      submenuRow?.querySelector('button')?.click();
    }
  },
};

export const CompactDrillInPresentationRTL: Story = {
  ...CompactDrillInPresentation,
  name: 'Presentation / compact drill-in hierarchy / RTL',
  globals: {
    viewport: {value: 'mobile1', isRotated: false},
    direction: 'rtl',
  },
};

export const ViewportFit: Story = {
  name: 'Readiness / viewport fit',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Uses the actual Storybook viewport. The menu requests a 640px minimum width near the inline edge and must keep 16px safe-area-aware gutters instead of widening the page.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <div {...stylex.props(readinessStyles.edgeAnchorRow)}>
        <DropdownMenu
          button={{label: 'Project actions'}}
          alignment="end"
          menuWidth={640}
          items={[
            {label: 'Rename project', onClick: () => {}},
            {label: 'Duplicate project', onClick: () => {}},
            {
              label: 'Share with external collaborators and reviewers',
              onClick: () => {},
            },
            {type: 'divider'},
            {label: 'Archive project', onClick: () => {}},
          ]}
        />
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const TallContentOverflow: Story = {
  name: 'Readiness / tall content overflow',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Uses the actual Storybook viewport and a realistic project list. The anchored menu stays at or below 300px and scrolls internally, so its actions remain reachable without scrolling the page.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <DropdownMenu button={{label: 'Move to project'}} menuWidth={280}>
        {PROJECT_DESTINATIONS.map(([label, team]) => (
          <DropdownMenuItem
            key={label}
            label={label}
            description={team}
            onClick={() => {}}
          />
        ))}
      </DropdownMenu>
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const SubmenuViewportFit: Story = {
  name: 'Readiness / submenu edge fit',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Uses the actual Storybook viewport with concise parent and child menus that can fit side by side. The submenu flips toward the available side, remains separated from its parent, and stays within viewport gutters. Use the compact drill-in example when the hierarchy cannot fit this contract.',
      },
    },
  },
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <div {...stylex.props(readinessStyles.edgeAnchorRow)}>
        <DropdownMenu
          button={{label: 'Project actions'}}
          alignment="end"
          menuWidth={140}>
          <DropdownMenuItem label="Rename" onClick={() => {}} />
          <DropdownMenuSubMenu label="Move to" menuWidth={140}>
            <DropdownMenuItem label="Research" onClick={() => {}} />
            <DropdownMenuItem label="Platform" onClick={() => {}} />
            <DropdownMenuItem label="Engineering" onClick={() => {}} />
          </DropdownMenuSubMenu>
          <DropdownMenuItem label="Archive" onClick={() => {}} />
        </DropdownMenu>
      </div>
    </div>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (!(trigger instanceof HTMLElement)) {
      return;
    }
    trigger.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const submenuTrigger = canvasElement.querySelector(
      '[role="menuitem"][aria-haspopup="menu"]',
    );
    if (submenuTrigger instanceof HTMLElement) {
      submenuTrigger.click();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );

      const openMenus = Array.from(
        canvasElement.querySelectorAll<HTMLElement>('[role="menu"]'),
      ).filter(menu => menu.getClientRects().length > 0);
      const [parentMenu, submenu] = openMenus;
      if (parentMenu && submenu) {
        const parentRect = parentMenu.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();
        const isSeparated =
          submenuRect.right <= parentRect.left ||
          submenuRect.left >= parentRect.right;
        if (!isSeparated) {
          throw new Error('Submenu must not overlap its parent menu');
        }
      }
    }
  },
};

export const CustomTrigger: Story = {
  name: 'Custom trigger (any control)',
  render: () => (
    <DropdownMenu
      renderTrigger={props => (
        <IconButton
          icon={<EllipsisHorizontalIcon />}
          label="More actions"
          variant="ghost"
          {...props}
        />
      )}>
      <DropdownMenuItem icon={PencilIcon} label="Rename" onClick={() => {}} />
      <DropdownMenuItem
        icon={DocumentDuplicateIcon}
        label="Duplicate"
        onClick={() => {}}
      />
      <DropdownMenuItem
        icon={TrashIcon}
        label="Delete"
        variant="destructive"
        onClick={() => {}}
      />
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Any control can open a menu: `trigger` renders it and receives the props to spread — the press model (a mouse opens on press-down, a held finger opens with the finger down), the keyboard opens, the toggle click, and the ARIA wiring. The menu is named by that control through `aria-labelledby`.',
      },
    },
  },
};

export const LinkRows: Story = {
  name: 'Rows that navigate (href)',
  render: () => (
    <DropdownMenu button={{label: 'Places'}}>
      <DropdownMenuItem icon={UserIcon} label="Profile" href="/profile" />
      <DropdownMenuItem
        icon={Cog6ToothIcon}
        label="Settings"
        href="/settings"
        onClick={() => console.log('leaving for settings')}
      />
      <DropdownMenuItem
        icon={ShareIcon}
        label="Help center"
        description="Opens in a new tab"
        href="https://example.com/help"
        target="_blank"
      />
      <DropdownMenuDivider />
      <DropdownMenuItem
        icon={TrashIcon}
        label="Delete"
        variant="destructive"
        onClick={() => {}}
      />
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A row whose act is navigation takes an `href` and renders as a real anchor with role="menuitem", routed through LinkProvider. A ⌘-click, Ctrl-click or middle click keeps the browser\'s meaning (a new tab) and skips `onClick`; a plain click runs `onClick`, closes the menu and navigates. Enter and Space synthesize a click that keeps the key\'s modifiers.',
      },
    },
  },
};

export const SubmenuDrillIn: Story = {
  name: 'Submenu / drill-in on a phone',
  parameters: {
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      description: {
        story:
          'On a phone (a coarse pointer, decided when the menu opened) a sub-menu row drills in: its rows replace the menu\'s rows in the same box, led by a "Back to <parent>" row; Back, Escape or ArrowLeft return to the row. `presentation="drill-in"` forces it, `"flyout"` keeps the flyout; the default `"adaptive"` follows the pointer.',
      },
    },
  },
  render: () => (
    <DropdownMenu button={{label: 'Actions'}}>
      <DropdownMenuItem icon={PencilIcon} label="Rename" onClick={() => {}} />
      <DropdownMenuSubMenu
        icon={FolderPlusIcon}
        label="Move to"
        presentation="drill-in">
        <DropdownMenuItem label="Folder A" onClick={() => {}} />
        <DropdownMenuItem label="Folder B" onClick={() => {}} />
        <DropdownMenuSubMenu icon={ArchiveBoxIcon} label="Archive">
          <DropdownMenuItem label="2025" onClick={() => {}} />
          <DropdownMenuItem label="2024" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenuSubMenu>
      <DropdownMenuItem icon={TrashIcon} label="Delete" onClick={() => {}} />
    </DropdownMenu>
  ),
};

export const SubmenuAdaptiveFixture: Story = {
  name: 'Submenu / adaptive fixture',
  parameters: {docs: {disable: true}},
  render: () => (
    <div data-testid="drill-in-fixture" style={{padding: 16}}>
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuItem icon={PencilIcon} label="Rename" onClick={() => {}} />
        <DropdownMenuSubMenu icon={FolderPlusIcon} label="Move to">
          <DropdownMenuItem label="Folder A" onClick={() => {}} />
          <DropdownMenuItem label="Folder B" onClick={() => {}} />
          <DropdownMenuSubMenu icon={ArchiveBoxIcon} label="Archive">
            <DropdownMenuItem label="2025" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenuSubMenu>
        <DropdownMenuItem icon={TrashIcon} label="Delete" onClick={() => {}} />
      </DropdownMenu>
    </div>
  ),
};

const LABELS = ['Bug', 'Feature', 'Documentation', 'Design', 'Performance'];

/**
 * A filter field above the rows and a "Create" button below them. Both sit in
 * the popover beside the menu, never inside it: the menu holds only its rows,
 * so it stays a valid menu to a screen reader, and the field and button keep
 * their own keys and presses. The popover is a modal dialog around the menu:
 * Tab walks field, menu, button and wraps at either end; Escape closes.
 */
export const HeaderAndFooter: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    const [created, setCreated] = useState(0);
    const visible = LABELS.filter(label =>
      label.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
      <>
        <DropdownMenu
          button={{label: 'Labels'}}
          header={
            <TextInput
              label="Filter labels"
              isLabelHidden
              placeholder="Filter labels"
              value={query}
              onChange={setQuery}
            />
          }
          footer={
            <Button
              label="Create label"
              variant="ghost"
              onClick={() => setCreated(count => count + 1)}
            />
          }>
          {visible.map(label => (
            <DropdownMenuItem key={label} label={label} onClick={() => {}} />
          ))}
          <DropdownMenuSubMenu label="Move to">
            <DropdownMenuItem label="Archive" onClick={() => {}} />
            <DropdownMenuItem label="Backlog" onClick={() => {}} />
          </DropdownMenuSubMenu>
        </DropdownMenu>
        <output data-testid="created">{created}</output>
      </>
    );
  },
};

/**
 * A sub-menu with its own filter field and "Create" button: the Labels level
 * of a session menu. Its surface (the flyout, or the drilled-in view on a
 * phone) is a modal dialog named by its row, beside the menu rather than
 * inside it: Tab walks field, rows, button and wraps; Escape returns to the
 * row. The picks are checkbox rows, so the sub-menu stays open while several
 * are chosen.
 */
export const SubMenuHeaderAndFooter: Story = {
  name: 'Submenu / header and footer',
  render: () => {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<ReadonlyArray<string>>(['Bug']);
    const [created, setCreated] = useState(0);
    const visible = LABELS.filter(label =>
      label.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
      <div data-testid="submenu-regions-fixture" style={{padding: 16}}>
        <DropdownMenu button={{label: 'Session'}}>
          <DropdownMenuItem
            icon={PencilIcon}
            label="Rename"
            onClick={() => {}}
          />
          <DropdownMenuSubMenu
            label="Labels"
            header={
              <TextInput
                label="Filter labels"
                isLabelHidden
                placeholder="Filter labels"
                value={query}
                onChange={setQuery}
              />
            }
            footer={
              <Button
                label="Create label"
                variant="ghost"
                onClick={() => setCreated(count => count + 1)}
              />
            }>
            {visible.map(label => (
              <DropdownMenuCheckboxItem
                key={label}
                label={label}
                value={picked.includes(label)}
                onChange={isChecked =>
                  setPicked(current =>
                    isChecked
                      ? [...current, label]
                      : current.filter(item => item !== label),
                  )
                }
              />
            ))}
          </DropdownMenuSubMenu>
          <DropdownMenuItem
            icon={TrashIcon}
            label="Delete"
            onClick={() => {}}
          />
        </DropdownMenu>
        <output data-testid="picked">{picked.join(', ')}</output>
        <output data-testid="created">{created}</output>
      </div>
    );
  },
};

/**
 * A sub-menu whose header holds a choice rather than a field: whether the
 * picked labels must all match. The radio group keeps its own arrow keys, and
 * a flyout the pointer has left stays open while focus is inside it, so the
 * choice can still be changed from the keyboard.
 */
export const SubMenuHeaderChoice: Story = {
  name: 'Submenu / header with a choice',
  render: () => {
    const [match, setMatch] = useState('any');
    const [picked, setPicked] = useState<ReadonlyArray<string>>(['Bug']);
    return (
      <div data-testid="submenu-choice-fixture" style={{padding: 16}}>
        <DropdownMenu button={{label: 'Filters'}}>
          <DropdownMenuItem label="Reset" onClick={() => {}} />
          <DropdownMenuSubMenu
            label="Labels"
            header={
              <RadioList label="Match" value={match} onChange={setMatch}>
                <RadioListItem label="Any label" value="any" />
                <RadioListItem label="All labels" value="all" />
              </RadioList>
            }>
            {LABELS.map(label => (
              <DropdownMenuCheckboxItem
                key={label}
                label={label}
                value={picked.includes(label)}
                onChange={isChecked =>
                  setPicked(current =>
                    isChecked
                      ? [...current, label]
                      : current.filter(item => item !== label),
                  )
                }
              />
            ))}
          </DropdownMenuSubMenu>
        </DropdownMenu>
        <output data-testid="match">{match}</output>
      </div>
    );
  },
};
