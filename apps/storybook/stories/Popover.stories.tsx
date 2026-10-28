// Copyright (c) Meta Platforms, Inc. and affiliates.

import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Popover} from '@astryxdesign/core/Popover';
import type {PopoverTriggerRenderProps} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {Token} from '@astryxdesign/core/Token';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Switch} from '@astryxdesign/core/Switch';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Section} from '@astryxdesign/core/Section';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const meta: Meta<typeof Popover> = {
  title: 'Core/Popover',
  component: Popover,
  tags: ['autodocs'],
  argTypes: {
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
      description: 'Position relative to trigger',
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
      description: 'Alignment on placement axis',
    },
    isEnabled: {
      control: 'boolean',
      description: 'Enable/disable the popover',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Popover>;
type PresentationRecipeStory = StoryObj<PresentationRecipeArgs>;

type ProjectAction = 'owner' | 'label' | 'due-date';
type PresentationChoice = 'popover' | 'bottom-sheet';

interface PresentationRecipeArgs {
  presentation?: PresentationChoice;
  touchPresentation?: PresentationChoice;
}

const PROJECT_ACTIONS: ReadonlyArray<{
  id: ProjectAction;
  label: string;
  description: string;
}> = [
  {
    id: 'owner',
    label: 'Assign owner',
    description: 'Route follow-up to a teammate.',
  },
  {
    id: 'label',
    label: 'Add label',
    description: 'Group this item with related work.',
  },
  {
    id: 'due-date',
    label: 'Set due date',
    description: 'Pick a lightweight reminder for review.',
  },
];

const PROJECT_DESTINATIONS = [
  ['Apollo launch', 'Marketing · 12 open tasks'],
  ['Customer insights', 'Research · 8 open tasks'],
  ['Design systems', 'Platform · 24 open tasks'],
  ['Growth experiments', 'Product · 6 open tasks'],
  ['Incident review', 'Operations · 4 open tasks'],
  ['Mobile quality', 'Engineering · 15 open tasks'],
  ['Quarterly planning', 'Strategy · 9 open tasks'],
  ['Recruiting plan', 'People · 7 open tasks'],
  ['Security follow-up', 'Trust · 3 open tasks'],
  ['Website refresh', 'Brand · 11 open tasks'],
] as const;

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
  oversizedTrigger: {
    inlineSize: 640,
  },
  boundedPopoverContent: {
    maxBlockSize: stylex.firstThatWorks(
      'min(50dvb, 360px)',
      'min(50vh, 360px)',
    ),
  },
  evidenceCopy: {
    maxInlineSize: 520,
    overflowWrap: 'anywhere',
  },
  actionList: {
    inlineSize: '100%',
  },
});

function ProjectActionList({
  selectedAction,
  onSelectAction,
  onReset,
  presentation,
}: {
  selectedAction: ProjectAction | null;
  onSelectAction: (action: ProjectAction) => void;
  onReset: () => void;
  presentation: PresentationChoice;
}) {
  return (
    <VStack gap={3} xstyle={readinessStyles.actionList}>
      <List
        density="compact"
        hasDividers
        header={
          <VStack gap={1}>
            <Heading level={4} tabIndex={-1}>
              Project actions
            </Heading>
            <Text type="supporting" color="secondary">
              {presentation === 'popover'
                ? 'Compact supplemental actions stay anchored to the trigger and keep the surrounding context visible.'
                : 'The same actions can move into a BottomSheet when a product explicitly wants a bottom-edge touch surface.'}
            </Text>
          </VStack>
        }>
        {PROJECT_ACTIONS.map(action => (
          <ListItem
            key={action.id}
            label={action.label}
            description={action.description}
            isSelected={selectedAction === action.id}
            onClick={() => onSelectAction(action.id)}
          />
        ))}
      </List>
      <Divider />
      <HStack gap={2} hAlign="between">
        <Text type="supporting" color="secondary">
          Selected:{' '}
          {selectedAction == null
            ? 'none'
            : PROJECT_ACTIONS.find(action => action.id === selectedAction)
                ?.label}
        </Text>
        <Button label="Reset selection" variant="ghost" onClick={onReset}>
          Reset
        </Button>
      </HStack>
    </VStack>
  );
}

function useOptInTouchPresentation(
  presentation: PresentationChoice | undefined,
  touchPresentation: PresentationChoice | undefined,
): PresentationChoice {
  const [matchesTouchSurface, setMatchesTouchSurface] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia(
      '(max-width: 639px) and (pointer: coarse) and (hover: none)',
    );
    const sync = () => setMatchesTouchSurface(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  if (presentation != null) {
    return presentation;
  }
  return touchPresentation === 'bottom-sheet' && matchesTouchSurface
    ? 'bottom-sheet'
    : 'popover';
}

function ProjectActionSurface({
  presentation = 'popover',
  touchPresentation = 'bottom-sheet',
}: PresentationRecipeArgs) {
  const resolvedPresentation = useOptInTouchPresentation(
    presentation,
    touchPresentation,
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedAction, setSelectedAction] =
    React.useState<ProjectAction | null>(null);
  const content = (
    <ProjectActionList
      presentation={resolvedPresentation}
      selectedAction={selectedAction}
      onSelectAction={setSelectedAction}
      onReset={() => setSelectedAction(null)}
    />
  );

  if (resolvedPresentation === 'bottom-sheet') {
    return (
      <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
        <Button label="Open project actions" onClick={() => setIsOpen(true)}>
          Open project actions
        </Button>
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label="Project actions"
          height="hug">
          <Section padding={4}>{content}</Section>
        </BottomSheet>
      </div>
    );
  }

  return (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <Popover
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placement="below"
        alignment="start"
        label="Project actions"
        width={320}
        content={content}>
        <Button label="Open project actions">Open project actions</Button>
      </Popover>
    </div>
  );
}

function TallContentOverflowExample() {
  const [selectedProject, setSelectedProject] = React.useState<string | null>(
    null,
  );

  return (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <Popover
        placement="below"
        alignment="start"
        label="Move to project"
        width={320}
        data-testid="tall-popover"
        xstyle={readinessStyles.boundedPopoverContent}
        content={
          <List
            density="compact"
            hasDividers
            header={
              <VStack gap={1}>
                <Heading level={4} tabIndex={-1}>
                  Move to project
                </Heading>
                <Text type="supporting" color="secondary">
                  Choose a destination for this task.
                </Text>
              </VStack>
            }>
            {PROJECT_DESTINATIONS.map(([label, description]) => (
              <ListItem
                key={label}
                label={label}
                description={description}
                isSelected={selectedProject === label}
                onClick={() => setSelectedProject(label)}
              />
            ))}
          </List>
        }>
        <Button label="Move task">Move task</Button>
      </Popover>
    </div>
  );
}

// =============================================================================
// Settings Panel
// =============================================================================

function SettingsContent() {
  const [notifications, setNotifications] = React.useState(true);
  const [darkMode, setDarkMode] = React.useState(false);
  const [sounds, setSounds] = React.useState(true);

  return (
    <VStack gap={3}>
      <Heading level={4} tabIndex={-1}>
        Settings
      </Heading>
      <Divider />
      <Switch
        label="Notifications"
        description="Receive push notifications"
        value={notifications}
        onChange={setNotifications}
      />
      <Switch
        label="Dark mode"
        description="Use dark color theme"
        value={darkMode}
        onChange={setDarkMode}
      />
      <Switch
        label="Sounds"
        description="Play sounds for actions"
        value={sounds}
        onChange={setSounds}
      />
    </VStack>
  );
}

export const Default: Story = {
  args: {
    placement: 'below',
    label: 'Settings',
    width: 280,
    content: <SettingsContent />,
    children: <Button label="Settings">Settings</Button>,
  },
};

// =============================================================================
// Filter Panel
// =============================================================================

function FilterContent({onApply}: {onApply?: () => void}) {
  const [filters, setFilters] = React.useState({
    active: true,
    archived: false,
    drafts: true,
    shared: false,
  });

  const toggle = (key: keyof typeof filters) =>
    setFilters(prev => ({...prev, [key]: !prev[key]}));

  return (
    <VStack gap={3}>
      <Heading level={4} tabIndex={-1}>
        Filter by status
      </Heading>
      <Divider />
      <CheckboxInput
        label="Active"
        value={filters.active}
        onChange={() => toggle('active')}
      />
      <CheckboxInput
        label="Archived"
        value={filters.archived}
        onChange={() => toggle('archived')}
      />
      <CheckboxInput
        label="Drafts"
        value={filters.drafts}
        onChange={() => toggle('drafts')}
      />
      <CheckboxInput
        label="Shared with me"
        value={filters.shared}
        onChange={() => toggle('shared')}
      />
      <Divider />
      <HStack gap={2} hAlign="end">
        <Button label="Apply" variant="primary" onClick={onApply}>
          Apply
        </Button>
        <Button
          label="Reset"
          variant="ghost"
          onClick={() =>
            setFilters({
              active: true,
              archived: false,
              drafts: true,
              shared: false,
            })
          }>
          Reset
        </Button>
      </HStack>
    </VStack>
  );
}

export const FilterPanel: Story = {
  render: function FilterPanelStory() {
    const [isOpen, setIsOpen] = React.useState(false);
    return (
      <Popover
        placement="below"
        label="Filter"
        width={240}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        content={<FilterContent onApply={() => setIsOpen(false)} />}>
        <Button label="Filter">Filter</Button>
      </Popover>
    );
  },
};

// =============================================================================
// Confirmation
// =============================================================================

function ConfirmContent({
  onConfirm,
  onCancel,
}: {
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <VStack gap={3}>
      <Heading level={4} tabIndex={-1}>
        Delete project?
      </Heading>
      <Text type="body">
        This will permanently delete the project and all its data. This action
        cannot be undone.
      </Text>
      <HStack gap={2} hAlign="end">
        <Button label="Delete" variant="destructive" onClick={onConfirm}>
          Delete
        </Button>
        <Button label="Cancel" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </HStack>
    </VStack>
  );
}

export const Confirmation: Story = {
  render: function ConfirmationStory() {
    const [isOpen, setIsOpen] = React.useState(false);
    return (
      <Popover
        placement="below"
        label="Confirm deletion"
        width={300}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        content={
          <ConfirmContent
            onConfirm={() => setIsOpen(false)}
            onCancel={() => setIsOpen(false)}
          />
        }>
        <Button label="Delete project" variant="destructive">
          Delete project
        </Button>
      </Popover>
    );
  },
};

// =============================================================================
// Sibling Mode (anchorRef)
// =============================================================================

export const AnchorRef: Story = {
  render: function AnchorRefStory() {
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    return (
      <>
        <Button ref={buttonRef} label="Anchor button">
          Anchor button
        </Button>
        <Popover
          anchorRef={buttonRef as React.RefObject<HTMLElement>}
          label="Sibling popover"
          width={260}
          placement="below"
          content={
            <VStack gap={2}>
              <Heading level={4} tabIndex={-1}>
                Sibling mode
              </Heading>
              <Text type="body">
                This popover uses anchorRef to attach to the button as a
                sibling, without wrapping it.
              </Text>
            </VStack>
          }
        />
      </>
    );
  },
};

// =============================================================================
// Placement: Above
// =============================================================================

export const Above: Story = {
  render: () => (
    <div style={{paddingTop: 200}}>
      <Popover
        placement="above"
        label="Info"
        width={260}
        content={
          <VStack gap={2}>
            <Heading level={4} tabIndex={-1}>
              Keyboard shortcuts
            </Heading>
            <Divider />
            <HStack gap={3}>
              <Text type="body" weight="bold">
                ⌘K
              </Text>
              <Text type="body">Command palette</Text>
            </HStack>
            <HStack gap={3}>
              <Text type="body" weight="bold">
                ⌘/
              </Text>
              <Text type="body">Toggle sidebar</Text>
            </HStack>
            <HStack gap={3}>
              <Text type="body" weight="bold">
                ⌘.
              </Text>
              <Text type="body">Quick actions</Text>
            </HStack>
          </VStack>
        }>
        <Button label="Shortcuts">Shortcuts</Button>
      </Popover>
    </div>
  ),
};

// =============================================================================
// Disabled
// =============================================================================

export const Disabled: Story = {
  args: {
    placement: 'below',
    label: 'Disabled popover',
    isEnabled: false,
    content: <Text type="body">This should not appear.</Text>,
    children: (
      <Button label="Disabled popover" isDisabled>
        Disabled
      </Button>
    ),
  },
};

// =============================================================================
// Token as Popover Trigger (via InteractiveRoleContext)
// =============================================================================

export const TokenTrigger: Story = {
  render: () => (
    <Popover
      placement="below"
      label="Token options"
      width={220}
      content={
        <VStack gap={2}>
          <Heading level={4} tabIndex={-1}>
            Filter options
          </Heading>
          <Divider />
          <Text type="body">
            The token automatically renders as a button via context.
          </Text>
        </VStack>
      }>
      <Token label="Status: Active" icon="filter" />
    </Popover>
  ),
};

// =============================================================================
// Link as Popover Trigger (no href → renders as button)
// =============================================================================

export const LinkTrigger: Story = {
  render: () => (
    <Popover
      placement="below"
      label="Link actions"
      width={220}
      content={
        <VStack gap={2}>
          <Heading level={4} tabIndex={-1}>
            Quick actions
          </Heading>
          <Divider />
          <Text type="body">
            Link without href renders as a button, suitable for triggers.
          </Text>
        </VStack>
      }>
      <Link>More options</Link>
    </Popover>
  ),
};

// =============================================================================
// Render Prop Pattern (explicit trigger wiring)
// =============================================================================

export const RenderProp: Story = {
  render: () => (
    <Popover
      placement="below"
      label="Custom trigger"
      width={260}
      content={
        <VStack gap={2}>
          <Heading level={4} tabIndex={-1}>
            Custom trigger
          </Heading>
          <Divider />
          <Text type="body">
            The render prop gives full control over the trigger element.
          </Text>
        </VStack>
      }>
      {(triggerProps: PopoverTriggerRenderProps) => (
        <button
          ref={triggerProps.ref}
          onClick={triggerProps.onClick}
          aria-haspopup={triggerProps['aria-haspopup']}
          aria-expanded={triggerProps['aria-expanded']}
          aria-controls={triggerProps['aria-controls']}
          style={{
            padding: '8px 16px',
            border: '1px dashed currentColor',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
          }}>
          Custom trigger element
        </button>
      )}
    </Popover>
  ),
};
// =============================================================================
// Responsive and Interaction Readiness Evidence
// =============================================================================

// Viewport geometry — gutters, caps, flips, the slide — is the layer runtime's
// and is demonstrated under Core/Layer (spec:AST-059). Popover keeps the
// stories for what is Popover's own: its match-trigger preference, scrolling,
// focus, dismissal, and surface styling.

export const MatchTriggerViewportFit: Story = {
  name: 'Match-trigger viewport fit',
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Uses the actual Storybook viewport. The real trigger is intentionally 640px wide, while Popover keeps its default match-trigger sizing; the preference is clamped by the layer runtime\u2019s viewport cap (spec:AST-059 FR7) instead of inheriting the full trigger width.',
      },
    },
  },
  render: () => (
    <div {...stylex.props(readinessStyles.viewportStoryCanvas)}>
      <Popover
        placement="below"
        alignment="start"
        label="Match-trigger viewport evidence"
        data-testid="match-trigger-popover"
        content={
          <VStack gap={2} xstyle={readinessStyles.evidenceCopy}>
            <Heading level={4} tabIndex={-1}>
              Match-trigger sizing
            </Heading>
            <Text type="body">
              The anchor is wider than this viewport, but the Popover stays
              inside the available inline space.
            </Text>
          </VStack>
        }>
        <Button
          label="Oversized match-width trigger"
          xstyle={readinessStyles.oversizedTrigger}>
          Oversized match-width trigger
        </Button>
      </Popover>
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
  name: 'Tall content overflow',
  parameters: {
    layout: 'fullscreen',
    viewport: {defaultViewport: 'mobile1'},
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Uses the actual Storybook viewport and a realistic project picker. The product-level 360px/50dvh cap keeps this lightweight anchored surface compact, while Popover detects the overflow and makes its content scrollable. Scrolling demonstrates bounded overflow handling; it does not by itself determine whether another presentation is more appropriate.',
      },
    },
  },
  render: () => <TallContentOverflowExample />,
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const ReadOnlyDialogFocus: Story = {
  name: 'Read-only dialog focus',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Manual assistive-technology check for a dialog-style Popover with no content controls. On open, the labeled dialog container receives focus without revealing the fallback close button. Confirm the dialog name and role are announced, Tab reaches Close popover, Shift+Tab remains contained, Escape closes, and focus returns to the trigger.',
      },
    },
  },
  render: () => (
    <Popover
      placement="below"
      label="Deployment status"
      content={
        <VStack gap={2}>
          <Heading level={4}>Deployment status</Heading>
          <Text type="body">
            The latest production deployment completed successfully.
          </Text>
        </VStack>
      }>
      <Button label="View deployment status">View deployment status</Button>
    </Popover>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const TriggerInteractionEvidence: Story = {
  name: 'Trigger Interaction Evidence',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Desktop Storybook interaction evidence: the native button trigger opens the popover without hover. Use real touch/iOS evidence before claiming mobile Safari behavior.',
      },
    },
  },
  render: () => (
    <Popover
      placement="below"
      label="Interaction evidence"
      content={
        <VStack gap={2}>
          <Heading level={4} tabIndex={-1}>
            Interaction evidence
          </Heading>
          <Text type="body">
            Opened by trigger activation; Escape, outside press, and focus
            return are covered by unit tests.
          </Text>
        </VStack>
      }>
      <Button label="Open interaction evidence">
        Open interaction evidence
      </Button>
    </Popover>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const KeepPopoverPresentation: Story = {
  name: 'Keep Popover Presentation',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Keep Popover for anchored, compact supplemental details and actions. The trigger is click/tap activated, not hover dependent, and the compact surface keeps context near the trigger.',
      },
    },
  },
  render: () => <ProjectActionSurface presentation="popover" />,
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const BottomSheetPresentationOption: Story = {
  name: 'BottomSheet Presentation Option',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'This story shows BottomSheet as an explicit alternative for the same focused task when a product wants a bottom-edge modal touch surface. It changes the contract: dialog focus ownership, scrim behavior, Escape handling, swipe-to-dismiss, and sheet body scrolling differ from Popover.',
      },
    },
  },
  render: () => <ProjectActionSurface presentation="bottom-sheet" />,
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};

export const AdaptivePresentation: Story = {
  name: 'Adaptive Presentation',
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'presentation="adaptive": on a compact touch screen (a phone) the content is presented in a BottomSheet, the way iOS presents a popover on an iPhone; with a mouse or on a larger screen it stays anchored to its trigger.',
      },
    },
  },
  render: () => (
    <div style={{padding: 16}}>
      <Popover
        label="Filter by status"
        presentation="adaptive"
        width={280}
        content={<FilterContent />}>
        <Button label="Filter">Filter</Button>
      </Popover>
    </div>
  ),
};

export const AdaptivePopoverRecipe: PresentationRecipeStory = {
  name: 'Adaptive Popover Recipe',
  args: {
    presentation: 'popover',
    touchPresentation: 'bottom-sheet',
  },
  argTypes: {
    presentation: {
      control: 'select',
      options: ['popover', 'bottom-sheet'],
      description:
        'Deterministic review/test override for the presentation used by this recipe story.',
    },
    touchPresentation: {
      control: 'select',
      options: ['popover', 'bottom-sheet'],
      description:
        'Opt-in touch presentation. If a consumer omits the deterministic presentation override, the recipe may choose BottomSheet only for compact + coarse pointer + no hover.',
    },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '844px'},
      description: {
        story:
          'Story-local recipe only: Core Popover does not silently adapt. Products opt in with touchPresentation="bottom-sheet" and can force presentation="popover" or presentation="bottom-sheet" for review and tests.',
      },
    },
  },
  render: args => <ProjectActionSurface {...args} />,
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};
