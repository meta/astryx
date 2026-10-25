// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Button} from '@astryxdesign/core/Button';
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof MoreMenu> = {
  title: 'Core/MoreMenu',
  component: MoreMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    items: {
      description: 'Menu items (items, dividers, or sections)',
    },
    label: {
      control: 'text',
      description: 'Accessible label for the trigger button',
    },
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      description: 'Visual style variant of the trigger button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the trigger button',
    },
    isDisabled: {
      control: 'boolean',
      description: 'Whether the menu trigger is disabled',
    },
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
      description: 'Position of the menu relative to the trigger',
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'Alignment of the menu along the placement axis',
    },
    presentation: {
      control: 'select',
      options: ['popover', 'bottom-sheet', 'adaptive'],
      description:
        'Popover, BottomSheet, or adaptive compact-touch presentation',
    },
    'data-testid': {
      control: 'text',
      description: 'Test ID for testing frameworks',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MoreMenu>;

// Basic usage — just items, all defaults
export const Default: Story = {
  render: () => (
    <MoreMenu
      items={[
        {label: 'Edit', onClick: () => console.log('Edit clicked')},
        {label: 'Duplicate', onClick: () => console.log('Duplicate clicked')},
        {label: 'Delete', onClick: () => console.log('Delete clicked')},
      ]}
    />
  ),
};

// With icons on items
export const WithIcons: Story = {
  render: () => (
    <MoreMenu
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
        {
          label: 'Download',
          icon: ArrowDownTrayIcon,
          onClick: () => console.log('Download'),
        },
        {
          label: 'Share',
          icon: ShareIcon,
          onClick: () => console.log('Share'),
        },
      ]}
    />
  ),
};

// With dividers
export const WithDividers: Story = {
  render: () => (
    <MoreMenu
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
        {type: 'divider'},
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
    <MoreMenu
      label="Document actions"
      items={[
        {
          type: 'section',
          title: 'Actions',
          items: [
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
          ],
        },
        {
          type: 'section',
          title: 'Danger zone',
          items: [
            {
              label: 'Delete',
              icon: TrashIcon,
              onClick: () => console.log('Delete'),
            },
          ],
        },
      ]}
    />
  ),
};

// Small size — for table rows and dense layouts
export const SmallSize: Story = {
  render: () => (
    <MoreMenu
      size="sm"
      label="Row actions"
      items={[
        {
          label: 'Edit',
          icon: PencilIcon,
          onClick: () => console.log('Edit'),
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: TrashIcon,
          onClick: () => console.log('Delete'),
        },
      ]}
    />
  ),
};

// Different variants
export const Variants: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <MoreMenu
        variant="ghost"
        label="Ghost variant"
        items={[{label: 'Action', onClick: () => {}}]}
      />
      <MoreMenu
        variant="secondary"
        label="Secondary variant"
        items={[{label: 'Action', onClick: () => {}}]}
      />
      <MoreMenu
        variant="primary"
        label="Primary variant"
        items={[{label: 'Action', onClick: () => {}}]}
      />
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <MoreMenu
      isDisabled
      items={[
        {label: 'Edit', onClick: () => console.log('Edit')},
        {label: 'Delete', onClick: () => console.log('Delete')},
      ]}
    />
  ),
};

// In a toolbar alongside other buttons
export const InToolbar: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
      <Button label="Save" variant="primary" onClick={() => {}} />
      <Button label="Preview" variant="secondary" onClick={() => {}} />
      <MoreMenu
        label="More actions"
        items={[
          {
            label: 'Export',
            icon: ArrowDownTrayIcon,
            onClick: () => console.log('Export'),
          },
          {
            label: 'Share',
            icon: ShareIcon,
            onClick: () => console.log('Share'),
          },
          {type: 'divider'},
          {
            label: 'Delete',
            icon: TrashIcon,
            onClick: () => console.log('Delete'),
          },
        ]}
      />
    </div>
  ),
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
          'The real MoreMenu component using DropdownMenu’s BottomSheet presentation. Its visible kebab trigger remains the discoverable mobile entry point.',
      },
    },
  },
  render: () => (
    <div style={{padding: 16, display: 'flex', justifyContent: 'flex-end'}}>
      <MoreMenu
        presentation="bottom-sheet"
        label="Project actions"
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

export const AdaptivePresentation: Story = {
  name: 'Presentation / adaptive',
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      description: {
        story:
          'Uses the built-in adaptive policy: BottomSheet on a compact touch screen (a coarse primary pointer, and a viewport narrower than the theme `md` breakpoint (768px by default) or shorter than 500px), anchored popover otherwise. Use device emulation to exercise the touch branch.',
      },
    },
  },
  render: () => (
    <div style={{padding: 16, display: 'flex', justifyContent: 'flex-end'}}>
      <MoreMenu
        presentation="adaptive"
        label="Project actions"
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => {}},
          {label: 'Share', icon: ShareIcon, onClick: () => {}},
          {
            label: 'Delete',
            icon: TrashIcon,
            variant: 'destructive',
            onClick: () => {},
          },
        ]}
      />
    </div>
  ),
};

// With custom item rendering
export const CustomItemRendering: Story = {
  render: () => (
    <MoreMenu
      label="User actions"
      items={[
        {label: 'Alice Johnson', onClick: () => console.log('Alice')},
        {label: 'Bob Smith', onClick: () => console.log('Bob')},
        {label: 'Carol Williams', onClick: () => console.log('Carol')},
      ]}
    />
  ),
};

// With disabled items
export const WithDisabledItems: Story = {
  render: () => (
    <MoreMenu
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
          isDisabled: true,
        },
        {type: 'divider'},
        {
          label: 'Delete',
          icon: TrashIcon,
          onClick: () => console.log('Delete'),
          isDisabled: true,
        },
      ]}
    />
  ),
};

// Alignment along the placement axis — the default start-aligned menu and an
// end-aligned one. Both triggers sit mid-viewport with room on either side, so
// the difference is the `alignment` prop, not a collision flip.
export const Alignment: Story = {
  parameters: {layout: 'padded'},
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 240,
        justifyContent: 'center',
        paddingBlock: 120,
      }}>
      <MoreMenu
        label="Start aligned"
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => {}},
          {label: 'Duplicate', icon: DocumentDuplicateIcon, onClick: () => {}},
          {type: 'divider'},
          {label: 'Delete', icon: TrashIcon, onClick: () => {}},
        ]}
      />
      <MoreMenu
        label="End aligned"
        alignment="end"
        items={[
          {label: 'Edit', icon: PencilIcon, onClick: () => {}},
          {label: 'Duplicate', icon: DocumentDuplicateIcon, onClick: () => {}},
          {type: 'divider'},
          {label: 'Delete', icon: TrashIcon, onClick: () => {}},
        ]}
      />
    </div>
  ),
};

// Custom trigger icon — replaces the default three-dots
export const CustomIcon: Story = {
  render: () => (
    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
      <MoreMenu
        icon={<Cog6ToothIcon />}
        label="Settings"
        items={[
          {label: 'Preferences', onClick: () => console.log('Preferences')},
          {label: 'Account', onClick: () => console.log('Account')},
          {label: 'Logout', onClick: () => console.log('Logout')},
        ]}
      />
      <MoreMenu
        icon={<PencilIcon />}
        label="Edit options"
        items={[
          {label: 'Edit title', onClick: () => console.log('Edit title')},
          {
            label: 'Edit description',
            onClick: () => console.log('Edit description'),
          },
        ]}
      />
    </div>
  ),
};
