// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Tour, type TourProps, type TourStep} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';
import {Card} from '@astryxdesign/core/Card';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {
  DropdownMenu,
  type DropdownMenuTriggerProps,
} from '@astryxdesign/core/DropdownMenu';
import {Heading} from '@astryxdesign/core/Heading';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {InputGroup, InputGroupText} from '@astryxdesign/core/InputGroup';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Popover} from '@astryxdesign/core/Popover';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Toolbar} from '@astryxdesign/core/Toolbar';

const meta: Meta<typeof Tour> = {
  title: 'Lab/Tour',
  component: Tour,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tour>;

type DemoProps = Partial<TourProps> & {
  /** Leaves the Share control out of the page; its step stays in the array. */
  hasShareControl?: boolean;
  /** Starts with a step that has no anchor. */
  hasWelcomeStep?: boolean;
  /** Puts the Export control far down a scrolling panel. */
  isExportScrolledAway?: boolean;
  /** Puts the Export control far down the page. */
  isExportBelowFold?: boolean;
  /** Starts on the first step. */
  startsOpen?: boolean;
  /** Gives each step a long title and a long body. */
  hasLongText?: boolean;
  /** The Share step waits this many milliseconds before it shows. */
  sharePreparationMs?: number;
  /** Lays the page out in a column this wide, in pixels. */
  containerWidth?: number;
  /** The Save control, the first step's anchor, has a tooltip. */
  hasSaveTooltip?: boolean;
  /** Each step has a body under its title. */
  hasBody?: boolean;
};

function Demo({
  hasShareControl = true,
  hasWelcomeStep = false,
  isExportScrolledAway = false,
  isExportBelowFold = false,
  startsOpen = false,
  hasLongText = false,
  sharePreparationMs,
  containerWidth,
  hasSaveTooltip = false,
  hasBody = true,
  ...props
}: DemoProps) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(
    startsOpen ? (hasWelcomeStep ? 'welcome' : 'save') : null,
  );
  const [lastEnd, setLastEnd] = useState('none');
  const [saves, setSaves] = useState(0);
  const [hasSave, setHasSave] = useState(true);

  const allSteps: TourStep[] = [
    ...(hasWelcomeStep
      ? [
          {
            id: 'welcome',
            title: 'Welcome',
            body: 'Three controls are new on this page.',
          },
        ]
      : []),
    {
      id: 'save',
      anchorRef: saveRef,
      title: hasLongText
        ? 'Save your work to the cloud and to this device at the same time'
        : 'Save your work',
      body: hasLongText
        ? 'Changes save to the cloud as you type. A copy stays on this device, so you can keep working without a connection, and the two copies merge the next time you are online.'
        : 'Changes save to the cloud.',
    },
    {
      id: 'share',
      anchorRef: shareRef,
      title: 'Share it',
      body: 'Invite people from here.',
      showAction:
        sharePreparationMs == null
          ? undefined
          : async () =>
              new Promise<void>(resolve => {
                setTimeout(resolve, sharePreparationMs);
              }),
    },
    {
      id: 'export',
      anchorRef: exportRef,
      title: 'Export',
      body: 'Download a copy.',
      placement: 'above',
    },
  ];
  const steps = hasBody
    ? allSteps
    : allSteps.map(step => ({...step, body: undefined}));

  const exportButton = <Button ref={exportRef} label="Export" />;

  return (
    <VStack gap={4} style={{width: containerWidth}}>
      <HStack gap={2} wrap="wrap">
        <Button
          label="Start tour"
          variant="primary"
          onClick={() => setActiveId(steps[0].id)}
        />
        {hasSave && (
          <Button
            ref={saveRef}
            label="Save"
            tooltip={hasSaveTooltip ? 'Saves your work' : undefined}
            onClick={() => setSaves(count => count + 1)}
          />
        )}
        {hasShareControl && <Button ref={shareRef} label="Share" />}
        {!isExportScrolledAway && !isExportBelowFold && exportButton}
        <Button
          label={hasSave ? 'Remove Save' : 'Restore Save'}
          variant="ghost"
          onClick={() => setHasSave(value => !value)}
        />
      </HStack>
      {isExportScrolledAway && (
        <div
          data-testid="panel"
          style={{height: 160, overflow: 'auto', border: '1px solid gray'}}>
          <div style={{height: 600}} />
          {exportButton}
          <div style={{height: 200}} />
        </div>
      )}
      <Text type="supporting">
        <span data-testid="tour-state">
          {`active: ${activeId ?? 'none'}; ended: ${lastEnd}; saves: ${saves}`}
        </span>
      </Text>
      <Button label="After the tour" variant="ghost" />
      {isExportBelowFold && (
        <>
          <div style={{height: 1600}} />
          {exportButton}
          <div style={{height: 400}} />
        </>
      )}
      <Tour
        steps={steps}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={reason => {
          setLastEnd(reason);
          setActiveId(null);
        }}
        hasStepCount
        {...props}
      />
    </VStack>
  );
}

/** A tour whose steps leave the page usable. */
export const Default: Story = {
  render: () => <Demo hasSkipButton />,
};

/** The first step's anchor has a tooltip, and the callout still follows it. */
export const AnchorWithTooltip: Story = {
  render: () => <Demo hasSkipButton hasSaveTooltip />,
};

/** A backdrop dims the page and makes each step modal. */
export const WithBackdrop: Story = {
  render: () => <Demo hasBackdrop />,
};

/** A step with no anchor shows in the center of the viewport. */
export const CenteredStep: Story = {
  render: () => <Demo hasWelcomeStep />,
};

/** A step whose anchor is not on the page shows centered by default. */
export const MissingAnchor: Story = {
  render: () => <Demo hasShareControl={false} />,
};

/** A step whose anchor is not on the page can be skipped instead. */
export const MissingAnchorSkipped: Story = {
  render: () => (
    <Demo hasShareControl={false} missingAnchorBehavior="skipStep" />
  ),
};

/** An anchor out of view scrolls into view when its step shows. */
export const ScrolledAnchor: Story = {
  render: () => <Demo isExportScrolledAway />,
};

/** A backdrop step whose anchor is in a scrolling panel. */
export const ScrolledAnchorWithBackdrop: Story = {
  render: () => <Demo isExportScrolledAway hasBackdrop />,
};

/** An anchor far down the page scrolls into view too. */
export const AnchorBelowFold: Story = {
  render: () => <Demo isExportBelowFold />,
};

/** A tour that is on its first step as the page loads. */
export const Open: Story = {
  render: () => <Demo startsOpen hasSkipButton />,
};

/** Long titles and bodies wrap inside the callout. */
export const LongText: Story = {
  render: () => (
    <Demo
      hasLongText
      hasSkipButton
      nextLabel="Continue to the next step"
      skipLabel="Skip the rest"
    />
  ),
};

/**
 * A narrow page: the controls sit in a column 288 pixels wide. In a
 * 320-pixel viewport the callout stays inside the page.
 */
export const NarrowContainer: Story = {
  render: () => <Demo hasLongText hasSkipButton containerWidth={288} />,
};

/** A step that prepares shows no callout until its `showAction` settles. */
export const PreparedStep: Story = {
  render: () => <Demo sharePreparationMs={1500} />,
};

/** A missing anchor can end the tour. */
export const MissingAnchorEndsTour: Story = {
  render: () => (
    <Demo hasShareControl={false} missingAnchorBehavior="endTour" />
  ),
};

/** A step needs only a title. */
export const TitleOnly: Story = {
  render: () => <Demo hasBody={false} hasSkipButton />,
};

function CardDemo(props: Partial<TourProps>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastEnd, setLastEnd] = useState('none');
  const [refreshes, setRefreshes] = useState(0);

  const steps: TourStep[] = [
    {
      id: 'revenue',
      anchorRef: cardRef,
      title: 'Your revenue',
      body: 'Totals for the quarter, updated daily.',
    },
    {
      id: 'refresh',
      anchorRef: refreshRef,
      title: 'Refresh it',
      body: 'Press Refresh to try it. The tour stays open.',
    },
  ];

  return (
    <VStack gap={4}>
      <HStack gap={2}>
        <Button
          label="Start tour"
          variant="primary"
          onClick={() => setActiveId('revenue')}
        />
      </HStack>
      <div data-testid="card" style={{width: 240}}>
        <Card ref={cardRef} padding={4}>
          <VStack gap={1}>
            <Heading level={4}>Revenue</Heading>
            <Text type="body">$1.2M this quarter</Text>
          </VStack>
        </Card>
      </div>
      <HStack gap={2}>
        <Button
          ref={refreshRef}
          label="Refresh"
          onClick={() => setRefreshes(count => count + 1)}
        />
      </HStack>
      <Text type="supporting">
        <span data-testid="tour-state">
          {`active: ${activeId ?? 'none'}; ended: ${lastEnd}; refreshes: ${refreshes}`}
        </span>
      </Text>
      <Button label="After the tour" variant="ghost" />
      <Tour
        steps={steps}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={reason => {
          setLastEnd(reason);
          setActiveId(null);
        }}
        hasStepCount
        {...props}
      />
    </VStack>
  );
}

/**
 * A step can point at an element that cannot take focus, such as a card. The
 * second step points at a control that the person can press during the tour.
 */
export const CardAnchor: Story = {
  render: () => <CardDemo />,
};

type PlacementArgs = {
  placement: NonNullable<TourStep['placement']>;
  alignment: NonNullable<TourStep['alignment']>;
};

function PlacementDemo({placement, alignment}: PlacementArgs) {
  const targetRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>('target');

  return (
    <VStack gap={4} align="center" justify="center" style={{minHeight: 460}}>
      <Button ref={targetRef} label="Target" />
      {activeId == null && (
        <Button label="Show step" onClick={() => setActiveId('target')} />
      )}
      <Tour
        steps={[
          {
            id: 'target',
            anchorRef: targetRef,
            title: 'Placed callout',
            body: `placement: ${placement}; alignment: ${alignment}`,
            placement,
            alignment,
          },
        ]}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={() => setActiveId(null)}
      />
    </VStack>
  );
}

/**
 * The side of the anchor that the callout sits on, and how it lines up along
 * that side. Change both in the Controls panel.
 */
export const Placement: StoryObj<PlacementArgs> = {
  argTypes: {
    placement: {
      control: 'select',
      options: ['above', 'below', 'start', 'end'],
    },
    alignment: {
      control: 'select',
      options: ['start', 'center', 'end'],
    },
  },
  args: {
    placement: 'below',
    alignment: 'start',
  },
  render: args => <PlacementDemo {...args} />,
};

/** Settles after the next render is on the page. */
async function afterRender(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function LayersDemo({hasBackdrop = false}: {hasBackdrop?: boolean}) {
  const openRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [applied, setApplied] = useState(0);
  const [lastEnd, setLastEnd] = useState('none');

  const steps: TourStep[] = [
    {
      id: 'open',
      anchorRef: openRef,
      title: 'Settings moved',
      body: 'They open in a dialog now.',
      showAction: async () => {
        setIsDialogOpen(false);
        setIsPopoverOpen(false);
        await afterRender();
      },
    },
    {
      id: 'field',
      anchorRef: fieldRef,
      title: 'Apply your changes',
      body: 'This control is inside the dialog.',
      showAction: async () => {
        setIsPopoverOpen(false);
        setIsDialogOpen(true);
        await afterRender();
      },
    },
    {
      id: 'filter',
      anchorRef: filterRef,
      title: 'Filter the list',
      body: 'This control is inside a popover.',
      showAction: async () => {
        setIsDialogOpen(false);
        setIsPopoverOpen(true);
        await afterRender();
      },
    },
  ];

  return (
    <VStack gap={4}>
      <HStack gap={2}>
        <Button
          label="Start tour"
          variant="primary"
          onClick={() => setActiveId('open')}
        />
        <Button
          ref={openRef}
          label="Open settings"
          onClick={() => setIsDialogOpen(true)}
        />
        <Popover
          label="Filters"
          isOpen={isPopoverOpen}
          onOpenChange={setIsPopoverOpen}
          hasLightDismiss={false}
          content={
            <Button
              ref={filterRef}
              label="Status"
              onClick={() => setApplied(count => count + 1)}
            />
          }>
          <Button label="Filters" />
        </Popover>
      </HStack>
      <Text type="supporting">
        <span data-testid="tour-state">
          {`active: ${activeId ?? 'none'}; ended: ${lastEnd}; applied: ${applied}`}
        </span>
      </Text>
      <Dialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Layout
          header={
            <DialogHeader title="Settings" onOpenChange={setIsDialogOpen} />
          }
          content={
            <LayoutContent>
              <HStack gap={2}>
                <Button
                  ref={fieldRef}
                  label="Apply"
                  onClick={() => setApplied(count => count + 1)}
                />
                <Button label="Reset" variant="ghost" />
              </HStack>
            </LayoutContent>
          }
        />
      </Dialog>
      <Tour
        steps={steps}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={reason => {
          setLastEnd(reason);
          setActiveId(null);
        }}
        hasStepCount
        hasBackdrop={hasBackdrop}
      />
    </VStack>
  );
}

/**
 * Steps whose anchors are inside a dialog and a popover that open after the
 * tour started. The callout shows above each one and stays usable.
 */
export const InsideLayers: Story = {
  render: () => <LayersDemo />,
};

/** The same steps with a backdrop. */
export const InsideLayersWithBackdrop: Story = {
  render: () => <LayersDemo hasBackdrop />,
};

const violetTheme = defineTheme({
  name: 'tour-violet-demo',
  tokens: {
    '--color-accent': ['#6D28D9', '#C4B5FD'],
  },
});

/** The ring and the callout take the tokens of the theme around the tour. */
export const ScopedTheme: Story = {
  render: () => (
    <Theme theme={violetTheme} mode="light">
      <Demo startsOpen />
    </Theme>
  ),
};

function MenuTrigger({
  anchorRef,
  ...props
}: DropdownMenuTriggerProps & {
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const ref = useMergedRefs(props.ref, anchorRef);
  return <Button label="Filters" {...props} ref={ref} />;
}

function MenuDemo() {
  const filtersRef = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastEnd, setLastEnd] = useState('none');
  return (
    <VStack gap={4}>
      <HStack gap={2}>
        <Button
          label="Start tour"
          variant="primary"
          onClick={() => setActiveId('filters')}
        />
        <DropdownMenu
          renderTrigger={props => (
            <MenuTrigger {...props} anchorRef={filtersRef} />
          )}
          items={[{label: 'Status'}, {label: 'Owner'}]}
        />
        <Button label="After the tour" variant="ghost" />
      </HStack>
      <Text type="supporting">
        <span data-testid="tour-state">
          {`active: ${activeId ?? 'none'}; ended: ${lastEnd}`}
        </span>
      </Text>
      <Tour
        steps={[
          {
            id: 'filters',
            anchorRef: filtersRef,
            title: 'Filter the list',
            body: 'Open the menu to pick a filter.',
          },
        ]}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={reason => {
          setLastEnd(reason);
          setActiveId(null);
        }}
      />
    </VStack>
  );
}

/** A step can point at a control that opens a menu of its own. */
export const AnchorWithMenu: Story = {
  render: () => <MenuDemo />,
};

const SIBLING_ANCHORS = [
  'group-first',
  'group-middle',
  'group-last',
  'toolbar-first',
  'input-first',
  'input-second',
  'tab-first',
  'tab-second',
  'item-first',
  'item-second',
  'cell-first',
  'cell-second',
] as const;

type SiblingAnchor = (typeof SIBLING_ANCHORS)[number];

function SiblingsDemo() {
  const anchorsRef = useRef<Partial<Record<SiblingAnchor, Element | null>>>({});
  const attach = (name: SiblingAnchor) => (element: Element | null) => {
    anchorsRef.current[name] = element;
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState('home');
  const [amount, setAmount] = useState('');
  const [search, setSearch] = useState('');

  const steps: TourStep[] = SIBLING_ANCHORS.map(name => ({
    id: name,
    anchorRef: {
      get current() {
        return anchorsRef.current[name] ?? null;
      },
    },
    title: name,
  }));

  return (
    <VStack gap={4}>
      <HStack gap={2}>
        <Button
          label="Start tour"
          variant="primary"
          onClick={() => setActiveId(SIBLING_ANCHORS[0])}
        />
      </HStack>
      <div data-testid="siblings">
        <VStack gap={4}>
          <ButtonGroup label="Clipboard">
            <Button label="Copy" ref={attach('group-first')} />
            <Button label="Cut" ref={attach('group-middle')} />
            <Button label="Paste" ref={attach('group-last')} />
          </ButtonGroup>
          <Toolbar
            label="Document"
            startContent={<Button label="Back" ref={attach('toolbar-first')} />}
            endContent={<Button label="Publish" variant="primary" />}
          />
          <InputGroup label="Search">
            <TextInput
              ref={attach('input-first')}
              label="Query"
              isLabelHidden
              value={search}
              onChange={setSearch}
            />
            <Button label="Go" />
          </InputGroup>
          <InputGroup label="Price">
            <InputGroupText>$</InputGroupText>
            <TextInput
              ref={attach('input-second')}
              label="Amount"
              isLabelHidden
              value={amount}
              onChange={setAmount}
            />
          </InputGroup>
          <TabList value={tab} onChange={setTab}>
            <Tab value="home" label="Home" ref={attach('tab-first')} />
            <Tab value="projects" label="Projects" ref={attach('tab-second')} />
            <Tab value="settings" label="Settings" />
          </TabList>
          <List hasDividers>
            <ListItem label="Notifications" ref={attach('item-first')} />
            <ListItem label="Privacy" ref={attach('item-second')} />
            <ListItem label="Security" />
          </List>
          <table>
            <tbody>
              <tr>
                <td ref={attach('cell-first')}>Name</td>
                <td ref={attach('cell-second')}>Owner</td>
                <td>Updated</td>
              </tr>
            </tbody>
          </table>
        </VStack>
      </div>
      <Button label="After the tour" variant="ghost" />
      <Tour
        steps={steps}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={() => setActiveId(null)}
        hasStepCount
      />
    </VStack>
  );
}

/**
 * Steps that point at members of groups, rows and cells. A step changes no
 * border, corner or size of the page around its anchor.
 */
export const AnchorsAmongSiblings: Story = {
  render: () => <SiblingsDemo />,
};
