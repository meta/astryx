// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useCallback, type CSSProperties} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Dialog} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {
  HStack,
  VStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {Table, proportional} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Section} from '@astryxdesign/core/Section';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {
  Squares2X2Icon,
  DocumentTextIcon,
  PhotoIcon,
  CursorArrowRaysIcon,
  ViewColumnsIcon,
  SparklesIcon,
  MegaphoneIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon,
  PlusCircleIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  ChatBubbleLeftIcon,
  PlayCircleIcon,
  EllipsisHorizontalIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import {Spinner} from '@astryxdesign/core/Spinner';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';

type BlockType =
  'hero' | 'text' | 'image' | 'button' | 'cards' | 'features' | 'cta';

interface Block {
  id: string;
  type: BlockType;
  label: string;
  props: Record<string, unknown>;
}

type ViewportSize = 'desktop' | 'tablet' | 'phone';
type SidebarTab = 'blocks' | 'properties';
type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const BLOCK_META: Record<BlockType, {label: string; icon: IconComponent}> = {
  hero: {label: 'Hero', icon: Squares2X2Icon},
  text: {label: 'Text', icon: DocumentTextIcon},
  image: {label: 'Image', icon: PhotoIcon},
  button: {label: 'Button', icon: CursorArrowRaysIcon},
  cards: {label: 'Cards', icon: ViewColumnsIcon},
  features: {label: 'Features', icon: SparklesIcon},
  cta: {label: 'CTA', icon: MegaphoneIcon},
};

type Transaction = {
  id: string;
  name: string;
  category: string;
  date: string;
  amount: string;
  isPositive?: boolean;
};

const CATEGORY_ICONS: Record<string, IconComponent> = {
  'Food & Drink': ShoppingBagIcon,
  Groceries: ShoppingCartIcon,
  Income: BanknotesIcon,
  Transport: ChatBubbleLeftIcon,
  Entertainment: PlayCircleIcon,
};

const TRANSACTION_COLUMNS: TableColumn<Transaction>[] = [
  {
    key: 'name',
    header: 'Transaction',
    // An icon and a name share this cell, so the default 60px floor leaves a
    // letter or two per line on a phone. Each column's share matches its
    // floor, so the floors add up to the table's minimum (480px), and the
    // Table scrolls sideways only below that.
    width: proportional(3, {minWidth: 180}),
    renderCell: (item: Transaction) => (
      <HStack gap={3} vAlign="center">
        <Icon icon={CATEGORY_ICONS[item.category] || SparklesIcon} />
        <VStack gap={0}>
          <Text type="label" weight="semibold">
            {item.name}
          </Text>
          <Text type="supporting" color="secondary">
            {item.category}
          </Text>
        </VStack>
      </HStack>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    width: proportional(2, {minWidth: 120}),
    renderCell: (item: Transaction) => (
      <Text type="body" color="secondary">
        {item.date}
      </Text>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    width: proportional(2, {minWidth: 120}),
    renderCell: (item: Transaction) => (
      <Text type="label" weight="semibold" color={undefined} hasTabularNumbers>
        {item.amount}
      </Text>
    ),
  },
  {
    key: 'actions',
    header: <VisuallyHidden>Actions</VisuallyHidden>,
    width: proportional(1, {minWidth: 60}),
    renderCell: () => (
      <Button
        label="More"
        icon={<Icon icon={EllipsisHorizontalIcon} size="sm" />}
        variant="ghost"
        size="sm"
        isIconOnly
      />
    ),
  },
];

const VIEWPORT_MAX: Record<ViewportSize, number> = {
  desktop: 960,
  tablet: 768,
  phone: 375,
};

let nextId = 5;
function uid() {
  return String(nextId++);
}

const DEFAULT_BLOCKS: Block[] = [
  {
    id: '2',
    type: 'features',
    label: 'Recent Transactions',
    props: {
      heading: 'Recent Transactions',
      description: 'Your latest account activity.',
      items: [
        {
          id: 't1',
          name: 'Blue Bottle Coffee',
          category: 'Food & Drink',
          date: 'Today, 10:24 AM',
          amount: '-$6.50',
        },
        {
          id: 't2',
          name: 'Whole Foods Market',
          category: 'Groceries',
          date: 'Yesterday',
          amount: '-$142.30',
        },
        {
          id: 't3',
          name: 'Stripe Payout',
          category: 'Income',
          date: 'Oct 12',
          amount: '+$4,200.00',
          isPositive: true,
        },
        {
          id: 't4',
          name: 'Uber Technologies',
          category: 'Transport',
          date: 'Oct 11',
          amount: '-$24.10',
        },
        {
          id: 't5',
          name: 'Netflix Subscription',
          category: 'Entertainment',
          date: 'Oct 10',
          amount: '-$19.99',
        },
      ],
    },
  },
  {
    id: '3',
    type: 'text',
    label: 'Syncing State',
    props: {
      heading: 'Syncing your accounts',
      description:
        "We're pulling in your latest transactions.\nThis usually takes a few seconds.",
      buttonLabel: 'Cancel',
    },
  },
  {
    id: '4',
    type: 'cta',
    label: 'Trust Notice',
    props: {
      heading: 'Adding devices from people you trust',
      description:
        "When you approve a request, you grant someone full access to your account. They'll be able to change reservations and send messages on your behalf.",
    },
  },
];

function defaultProps(type: BlockType): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return {
        heading: 'New Hero',
        subheading: 'Subtitle goes here',
        buttonLabel: 'Click Me',
        alignment: 'center',
      };
    case 'text':
      return {content: 'Enter your text here.'};
    case 'image':
      return {};
    case 'button':
      return {label: 'Button', variant: 'primary', size: 'md'};
    case 'cards':
      return {
        cards: [
          {
            title: 'Pricing',
            description: 'Flexible plans for every team size.',
          },
          {
            title: 'Support',
            description: 'Get help whenever you need it.',
          },
        ],
      };
    case 'features':
      return {
        heading: 'Activity',
        description: '',
        items: [
          {
            id: 't1',
            name: 'New Item',
            category: 'General',
            date: 'Today',
            amount: '$0.00',
          },
        ],
      };
    case 'cta':
      return {
        heading: 'Call to Action',
        description: 'Description text',
        primaryLabel: 'Primary',
        secondaryLabel: 'Secondary',
      };
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
// The layout (sidebar + scrollable canvas, full height) is all Layout +
// LayoutPanel now. The few remaining styles are things Astryx has no prop for:
// the responsive canvas max-width, a selection ring on the active block card,
// and the circular icon chip's surface.

// Fill the window. Layout height="fill" is height:100%, which only resolves
// against a definite height — and the host's <html>/<body> don't set one, so
// the layout anchors a definite viewport height itself. No background; the
// host owns the page surface.
const pageStyle: CSSProperties = {height: '100dvh'};
// Canvas reflows to the chosen viewport width; VStack has no maxWidth prop.
const canvasStyle = (maxWidth: number): CSSProperties => ({
  maxWidth,
  width: '100%',
  marginInline: 'auto',
});
const clickable: CSSProperties = {
  cursor: 'pointer',
};
// Selection ring on the active block — Card has no `isSelected` state.
const selectedCard: CSSProperties = {
  outline: '2px solid',
  outlineColor: 'var(--color-border-blue)',
  outlineOffset: -2,
};
// Circular muted chip behind the CTA icon — Center handles the centering
// and sizing; only the surface (radius + fill) needs custom CSS.
const iconCircle: CSSProperties = {
  borderRadius: '50%',
  backgroundColor: 'var(--color-background-muted)',
};

// ---------------------------------------------------------------------------
// Properties Form
// ---------------------------------------------------------------------------

function PropertiesForm({
  block,
  onUpdate,
}: {
  block: Block;
  onUpdate: (key: string, value: unknown) => void;
}) {
  const {type, props} = block;

  switch (type) {
    case 'hero':
      return (
        <VStack gap={4}>
          <TextInput
            label="Heading"
            value={(props.heading as string) ?? ''}
            onChange={(v: string) => onUpdate('heading', v)}
          />
          <TextArea
            label="Subheading"
            value={(props.subheading as string) ?? ''}
            onChange={(v: string) => onUpdate('subheading', v)}
          />
          <TextInput
            label="Button Label"
            value={(props.buttonLabel as string) ?? ''}
            onChange={(v: string) => onUpdate('buttonLabel', v)}
          />
          <Selector
            label="Alignment"
            value={(props.alignment as string) ?? 'center'}
            onChange={(v: string) => onUpdate('alignment', v)}
            options={[
              {label: 'Left', value: 'left'},
              {label: 'Center', value: 'center'},
              {label: 'Right', value: 'right'},
            ]}
          />
        </VStack>
      );

    case 'text':
      return (
        <VStack gap={4}>
          <TextInput
            label="Heading"
            value={(props.heading as string) ?? ''}
            onChange={(v: string) => onUpdate('heading', v)}
          />
          <TextArea
            label="Description"
            value={(props.description as string) ?? ''}
            onChange={(v: string) => onUpdate('description', v)}
          />
          <TextInput
            label="Button Label"
            value={(props.buttonLabel as string) ?? ''}
            onChange={(v: string) => onUpdate('buttonLabel', v)}
          />
        </VStack>
      );

    case 'features':
    case 'cta':
      return (
        <VStack gap={4}>
          <TextInput
            label="Heading"
            value={(props.heading as string) ?? ''}
            onChange={(v: string) => onUpdate('heading', v)}
          />
          <TextArea
            label="Description"
            value={(props.description as string) ?? ''}
            onChange={(v: string) => onUpdate('description', v)}
          />
        </VStack>
      );

    case 'button':
      return (
        <VStack gap={4}>
          <TextInput
            label="Label"
            value={(props.label as string) ?? ''}
            onChange={(v: string) => onUpdate('label', v)}
          />
          <Selector
            label="Variant"
            value={(props.variant as string) ?? 'primary'}
            onChange={(v: string) => onUpdate('variant', v)}
            options={[
              {label: 'Primary', value: 'primary'},
              {label: 'Secondary', value: 'secondary'},
              {label: 'Ghost', value: 'ghost'},
            ]}
          />
          <Selector
            label="Size"
            value={(props.size as string) ?? 'md'}
            onChange={(v: string) => onUpdate('size', v)}
            options={[
              {label: 'Small', value: 'sm'},
              {label: 'Medium', value: 'md'},
              {label: 'Large', value: 'lg'},
            ]}
          />
        </VStack>
      );

    default:
      return <EmptyState title="No configurable properties" isCompact />;
  }
}

// ---------------------------------------------------------------------------
// Block Preview
// ---------------------------------------------------------------------------

function BlockPreview({
  block,
  isSelected,
  onSelect,
}: {
  block: Block;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {type, props} = block;
  const cardStyle: CSSProperties = {
    ...clickable,
    ...(isSelected ? selectedCard : null),
  };

  switch (type) {
    case 'hero':
      return (
        <Card padding={6} style={cardStyle} onClick={onSelect}>
          <VStack gap={4}>
            <Heading level={2}>
              {(props.heading as string) || 'Hero Heading'}
            </Heading>
            <Text type="supporting" color="secondary">
              {(props.subheading as string) || 'Subtitle text goes here'}
            </Text>
            {(props.buttonLabel as string) && (
              <Button label={props.buttonLabel as string} />
            )}
          </VStack>
        </Card>
      );

    case 'text':
      if (props.heading) {
        return (
          <Card padding={6} style={cardStyle} onClick={onSelect}>
            <EmptyState
              title={props.heading as string}
              description={props.description as string}
              icon={<Spinner />}
              actions={
                (props.buttonLabel as string) ? (
                  <Button
                    label={props.buttonLabel as string}
                    variant="secondary"
                  />
                ) : undefined
              }
            />
          </Card>
        );
      }
      return (
        <Card style={cardStyle} onClick={onSelect}>
          <Text type="body">
            {(props.content as string) || 'Text content goes here'}
          </Text>
        </Card>
      );

    case 'image':
      return (
        <Card style={cardStyle} onClick={onSelect}>
          <EmptyState
            title="Image Block"
            description="Drop an image or enter a URL"
            icon={<Icon icon={PhotoIcon} />}
            isCompact
          />
        </Card>
      );

    case 'button':
      return (
        <Card padding={6} style={cardStyle} onClick={onSelect}>
          <Center>
            <Button
              label={(props.label as string) || 'Button'}
              variant={
                (props.variant as 'primary' | 'secondary' | 'ghost') ||
                'primary'
              }
              size={(props.size as 'sm' | 'md' | 'lg') || 'md'}
            />
          </Center>
        </Card>
      );

    case 'features': {
      const items = (props.items as Transaction[]) || [];
      return (
        <Card padding={6} style={cardStyle} onClick={onSelect}>
          <HStack gap={3} vAlign="start" hAlign="between" paddingBlockEnd={4}>
            <VStack gap={1}>
              <Heading level={3} accessibilityLevel={2}>
                {(props.heading as string) || 'Features'}
              </Heading>
              {(props.description as string) && (
                <Text type="supporting" color="secondary">
                  {props.description as string}
                </Text>
              )}
            </VStack>
            <StackItem>
              <Button label="View All" variant="secondary" size="sm" />
            </StackItem>
          </HStack>
          <Table
            data={items}
            columns={TRANSACTION_COLUMNS}
            idKey="id"
            hasHover
          />
        </Card>
      );
    }

    case 'cards': {
      const cardItems =
        (props.cards as Array<{title: string; description: string}>) || [];
      return (
        <Card style={cardStyle} onClick={onSelect}>
          <VStack gap={4}>
            <Heading level={3} accessibilityLevel={2}>
              Cards
            </Heading>
            <Divider />
            <List density="balanced" hasDividers={false}>
              {cardItems.map((card, i) => (
                <ListItem
                  key={i}
                  label={card.title}
                  description={card.description}
                />
              ))}
            </List>
          </VStack>
        </Card>
      );
    }

    case 'cta':
      return (
        <Card padding={6} style={cardStyle} onClick={onSelect}>
          <HStack gap={4} vAlign="start">
            <Center width={40} height={40} style={iconCircle}>
              <Icon icon={LockClosedIcon} color="secondary" />
            </Center>
            <VStack gap={1}>
              <Text type="label" weight="semibold">
                {(props.heading as string) || 'Notice'}
              </Text>
              <Text type="supporting" color="secondary">
                {(props.description as string) || 'Description text'}
              </Text>
            </VStack>
          </HStack>
        </Card>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Editor Page
// ---------------------------------------------------------------------------

export default function EditorPage() {
  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('blocks');
  const [pageTitle, setPageTitle] = useState('Page Editor');
  const showToast = useToast();
  const publish = () =>
    // Demo only: replace this toast with the call that publishes the page.
    showToast({
      body: `Demo: ${pageTitle} would be published here`,
      uniqueID: 'publish',
    });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  // Mobile only: the customizations (tabs + Add Block/Layers) open in a
  // fullscreen dialog over the preview, since there's no room to dock them.
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  // On phones the editor stacks: the panel sits in the header slot (full width,
  // above the canvas) showing just its toolbar, so the canvas isn't crushed
  // beside a 320px sidebar. On desktop the full panel (tabs + lists) shows.
  const isMobile = useMediaQuery('(max-width: 768px)');

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  const updateBlockProp = useCallback(
    (id: string, key: string, value: unknown) => {
      setBlocks(prev =>
        prev.map(b =>
          b.id === id ? {...b, props: {...b.props, [key]: value}} : b,
        ),
      );
    },
    [],
  );

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) {
        return prev;
      }
      const target = idx + dir;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const deleteBlock = useCallback(
    (id: string) => {
      setBlocks(prev => prev.filter(b => b.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
    },
    [selectedId],
  );

  const addBlock = useCallback((type: BlockType) => {
    const id = uid();
    const newBlock: Block = {
      id,
      type,
      label: BLOCK_META[type].label,
      props: defaultProps(type),
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedId(id);
    setSidebarTab('properties');
  }, []);

  const selectBlock = useCallback(
    (id: string) => {
      setSelectedId(prev => (prev === id ? null : id));
      setSidebarTab('properties');
      // On mobile, tapping a block on the canvas opens its properties dialog.
      if (isMobile) {
        setIsCustomizeOpen(true);
      }
    },
    [isMobile],
  );

  // --- sidebar content ---

  const blocksTabContent = (
    <VStack gap={2}>
      <VStack gap={1}>
        <Heading level={4} accessibilityLevel={2}>
          Add Block
        </Heading>
        <List density="balanced" hasDividers={false}>
          {(Object.keys(BLOCK_META) as BlockType[]).map(type => (
            <ListItem
              key={type}
              label={BLOCK_META[type].label}
              startContent={
                <Icon icon={BLOCK_META[type].icon} color="secondary" />
              }
              onClick={() => addBlock(type)}
            />
          ))}
        </List>
      </VStack>

      <VStack gap={1}>
        <Heading level={4} accessibilityLevel={2}>
          Layers
        </Heading>
        <List density="balanced" hasDividers={false}>
          {blocks.map(block => (
            <ListItem
              key={block.id}
              label={block.label}
              isSelected={block.id === selectedId}
              onClick={() => selectBlock(block.id)}
              startContent={
                <Icon icon={BLOCK_META[block.type].icon} color="secondary" />
              }
              endContent={
                <HStack gap={1}>
                  <Button
                    label="Move up"
                    icon={<Icon icon={ChevronUpIcon} size="sm" />}
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      moveBlock(block.id, -1);
                    }}
                    isIconOnly
                  />
                  <Button
                    label="Move down"
                    icon={<Icon icon={ChevronDownIcon} size="sm" />}
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      moveBlock(block.id, 1);
                    }}
                    isIconOnly
                  />
                  <Button
                    label="Delete"
                    icon={<Icon icon={TrashIcon} size="sm" />}
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      deleteBlock(block.id);
                    }}
                    isIconOnly
                  />
                </HStack>
              }
            />
          ))}
        </List>
      </VStack>
    </VStack>
  );

  const propertiesTabContent = selectedBlock ? (
    <PropertiesForm
      block={selectedBlock}
      onUpdate={(key, value) => updateBlockProp(selectedBlock.id, key, value)}
    />
  ) : (
    <EmptyState
      title="No block selected"
      description="Select a block to edit its properties"
      isCompact
    />
  );

  // Tabs + the active tab's content. Shown inline in the sidebar on desktop,
  // and inside a fullscreen dialog on mobile.
  const editingContent = (
    <VStack gap={4}>
      <VStack gap={0}>
        <TabList
          layout="fill"
          value={sidebarTab}
          onChange={(v: string) => setSidebarTab(v as SidebarTab)}>
          <Tab value="blocks" label="Blocks" />
          <Tab value="properties" label="Properties" />
        </TabList>
        <Divider />
      </VStack>
      <Section variant="transparent" padding={4}>
        {sidebarTab === 'blocks' ? blocksTabContent : propertiesTabContent}
      </Section>
    </VStack>
  );

  const sidebar = (
    <LayoutPanel
      hasDivider={!isMobile}
      padding={0}
      width={isMobile ? '100%' : 320}>
      <VStack gap={4}>
        {/* Panel Header */}
        <Section variant="transparent" padding={4}>
          {isMobile ? (
            // Mobile: the title, an Edit button that opens the customizations
            // dialog, and the primary action.
            <HStack gap={3} vAlign="center" hAlign="between">
              <Heading level={2} accessibilityLevel={1}>
                {pageTitle}
              </Heading>
              <HStack gap={2} vAlign="center">
                <Button
                  label="Edit"
                  icon={<Icon icon={AdjustmentsHorizontalIcon} size="sm" />}
                  variant="ghost"
                  isIconOnly
                  onClick={() => setIsCustomizeOpen(true)}
                />
                <Button label="Publish" variant="primary" onClick={publish} />
              </HStack>
            </HStack>
          ) : (
            <VStack gap={4}>
              {isEditingTitle ? (
                <TextInput
                  label="Page title"
                  isLabelHidden
                  value={pageTitle}
                  onChange={setPageTitle}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      setIsEditingTitle(false);
                    }
                  }}
                  hasAutoFocus
                  onBlur={() => setIsEditingTitle(false)}
                />
              ) : (
                <Heading level={2} accessibilityLevel={1}>
                  {pageTitle}
                </Heading>
              )}

              <Toolbar
                label="Viewport and actions"
                startContent={
                  <SegmentedControl
                    label="Viewport size"
                    value={viewport}
                    onChange={(v: string) => setViewport(v as ViewportSize)}>
                    <SegmentedControlItem
                      value="desktop"
                      label="Desktop"
                      icon={<Icon icon={ComputerDesktopIcon} size="sm" />}
                      isLabelHidden
                    />
                    <SegmentedControlItem
                      value="tablet"
                      label="Tablet"
                      icon={<Icon icon={DeviceTabletIcon} size="sm" />}
                      isLabelHidden
                    />
                    <SegmentedControlItem
                      value="phone"
                      label="Phone"
                      icon={<Icon icon={DevicePhoneMobileIcon} size="sm" />}
                      isLabelHidden
                    />
                  </SegmentedControl>
                }
                endContent={
                  <HStack gap={2}>
                    <Button
                      label="Preview"
                      icon={<Icon icon={EyeIcon} size="sm" />}
                      variant="ghost"
                      isIconOnly
                      onClick={() =>
                        // Demo only: replace this toast with the call that performs the action.
                        showToast({
                          body: 'Demo: a preview of the page would open here',
                          uniqueID: 'preview',
                        })
                      }
                    />
                    <Button
                      label="Publish"
                      variant="primary"
                      onClick={publish}
                    />
                  </HStack>
                }
              />
            </VStack>
          )}
        </Section>

        {!isMobile && editingContent}
      </VStack>
    </LayoutPanel>
  );

  return (
    <>
      <Layout
        style={pageStyle}
        height="fill"
        header={isMobile ? sidebar : undefined}
        start={isMobile ? undefined : sidebar}
        content={
          <LayoutContent role="main" padding={8}>
            <VStack gap={4} style={canvasStyle(VIEWPORT_MAX[viewport])}>
              {blocks.length > 0 ? (
                blocks.map(block => (
                  <BlockPreview
                    key={block.id}
                    block={block}
                    isSelected={block.id === selectedId}
                    onSelect={() => selectBlock(block.id)}
                  />
                ))
              ) : (
                <EmptyState
                  title="No blocks yet"
                  description="Add blocks from the sidebar to start building your page"
                  icon={<Icon icon={PlusCircleIcon} />}
                />
              )}
            </VStack>
          </LayoutContent>
        }
      />

      {/* Mobile: customizations open in a fullscreen dialog over the preview. */}
      <Dialog
        isOpen={isMobile && isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        variant="fullscreen"
        purpose="info"
        padding={0}>
        <Layout
          height="fill"
          header={
            <LayoutHeader hasDivider>
              <HStack gap={3} vAlign="center" hAlign="between">
                <Heading level={3}>Customize</Heading>
                <Button
                  label="Close"
                  icon={<Icon icon={XMarkIcon} size="sm" />}
                  variant="ghost"
                  isIconOnly
                  onClick={() => setIsCustomizeOpen(false)}
                />
              </HStack>
            </LayoutHeader>
          }
          content={<LayoutContent padding={0}>{editingContent}</LayoutContent>}
        />
      </Dialog>
    </>
  );
}
