// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
  Card,
  Section,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {TabList, Tab, TabMenu} from '@astryxdesign/core/TabList';
import {Divider} from '@astryxdesign/core/Divider';
import {Link} from '@astryxdesign/core/Link';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Icon} from '@astryxdesign/core/Icon';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {
  CalendarIcon,
  FlagIcon,
  FunnelIcon,
  HandThumbUpIcon,
  HeartIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';

// ─── Styles ─────────────────────────────────────────────────────────────────
import type {CSSProperties} from 'react';

// The only custom CSS in this template is a small optical-alignment negative
// margin: List has no "bleed to container edge" prop (#2626). Everything else
// uses props. Plain inline styles — no StyleX compiler required.
// Pull the list items' inner padding back so their content optically aligns
// with the section heading above (ListItem insets content by ~8px). No
// edge/inset prop on List (#2626).
const itemsList: CSSProperties = {
  marginInline: -8,
};

// ─── Product data ───────────────────────────────────────────────────────────
const PRODUCT_IMAGES = [
  '/template-assets/light-product-1.png',
  '/template-assets/light-product-2.png',
  '/template-assets/light-product-3.png',
  '/template-assets/light-product-4.png',
  '/template-assets/light-product-5.png',
];

const PRODUCTS = [
  {
    name: 'Solstice Mug',
    details: 'Glaze: Snow\nFinish: Matte',
    price: 89.0,
    qty: 1,
    image: PRODUCT_IMAGES[0],
  },
  {
    name: 'Ember Bowl',
    details: 'Glaze: Sage\nSize: 6 in',
    price: 42.0,
    qty: 2,
    image: PRODUCT_IMAGES[1],
  },
  {
    name: 'Terra Cup',
    details: 'Glaze: Oat\nSize: 14 in',
    price: 65.0,
    qty: 1,
    image: PRODUCT_IMAGES[2],
  },
  {
    name: 'Dawn Plate Set',
    details: 'Glaze: Charcoal\nCapacity: 3 oz',
    price: 34.0,
    qty: 3,
    image: PRODUCT_IMAGES[3],
  },
  {
    name: 'Kiln Salad Bowl',
    details: 'Glaze: Snow\nHeight: 8 in',
    price: 78.0,
    qty: 1,
    image: PRODUCT_IMAGES[4],
  },
];

const SUBTOTAL = PRODUCTS.reduce((sum, p) => sum + p.price * p.qty, 0);
const DISCOUNT = 15.0;
const SHIPPING = 0;
const TAX_RATE = 0.0825;
const TAX = Math.round((SUBTOTAL - DISCOUNT) * TAX_RATE * 100) / 100;
const TOTAL = SUBTOTAL - DISCOUNT + SHIPPING + TAX;
const fmt = (n: number) => `$${n.toFixed(2)}`;

// ─── Activity data ──────────────────────────────────────────────────────────
const ACTIVITY = [
  {
    type: 'event' as const,
    user: 'Jane Doe',
    text: 'placed order #1001',
    reactions: 2,
    time: 'Feb 23 at 9:12 AM',
  },
  {
    type: 'comment' as const,
    user: 'Alex Rivera',
    text: "Customer requested gift wrapping for the mug & plate set. I've added a note to the packing slip — warehouse team should wrap in recycled kraft paper.",
    reactions: 3,
    time: 'Feb 23 at 10:45 AM',
  },
  {
    type: 'update' as const,
    user: 'System',
    text: 'has several information changes',
    time: 'Feb 23 at 11:30 AM',
    changes: [
      'Payment verified via Visa ...7482',
      'Fraud check passed — low risk',
    ],
  },
  {
    type: 'event' as const,
    user: 'Alex Rivera',
    text: 'marked order as ready for fulfillment',
    reactions: 1,
    time: 'Feb 23 at 2:15 PM',
  },
];

// ─── Bullet separator ───────────────────────────────────────────────────────
function Bullet() {
  return (
    <Text type="supporting" color="secondary">
      {'・'}
    </Text>
  );
}

// ─── Page Header ────────────────────────────────────────────────────────────
function PageHeader({
  activeTab,
  onTabChange,
  isPanelOpen,
  onTogglePanel,
  isNarrow,
}: {
  activeTab: string;
  onTabChange: (v: string) => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  isNarrow: boolean;
}) {
  return (
    <LayoutHeader hasDivider padding={4} paddingBlockEnd={0}>
      <VStack gap={3}>
        <HStack gap={4} vAlign="start">
          <StackItem size="fill">
            <VStack gap={0}>
              <Link href="#" color="secondary">
                <HStack gap={1} vAlign="center">
                  <Icon icon={ArrowLeftIcon} size="sm" color="inherit" />
                  All orders
                </HStack>
              </Link>
              <VStack gap={0}>
                <Heading level={1} maxLines={1}>
                  #1001
                </Heading>
                {/* Metadata wraps to multiple lines on narrow screens (rather
                    than collapsing items behind a "+N more" overflow). */}
                <HStack gap={1} vAlign="center" wrap="wrap">
                  <Text type="body" maxLines={1}>
                    {PRODUCTS.length} ordered items
                  </Text>
                  <HStack gap={1} vAlign="center">
                    <Bullet />
                    <Avatar name="Jane Doe" size="sm" />
                    <Text type="body" maxLines={1}>
                      Jane Doe
                    </Text>
                  </HStack>
                  <HStack gap={1} vAlign="center">
                    <Bullet />
                    <Badge variant="warning" label="Unfulfilled" />
                  </HStack>
                  <HStack gap={1} vAlign="center">
                    <Bullet />
                    <Icon icon={CalendarIcon} size="sm" color="secondary" />
                    <Text type="body" maxLines={1}>
                      02/23/2026
                    </Text>
                  </HStack>
                  <HStack gap={1} vAlign="center">
                    <Bullet />
                    <Icon icon={FlagIcon} size="sm" color="secondary" />
                    <Text type="body" maxLines={1}>
                      Needs attention
                    </Text>
                  </HStack>
                  <HStack gap={1} vAlign="center">
                    <Bullet />
                    <Link href="#" color="secondary">
                      See all
                    </Link>
                  </HStack>
                </HStack>
              </VStack>
            </VStack>
          </StackItem>
          {!isNarrow && (
            <HStack gap={2}>
              <Button label="Restock" variant="secondary" />
              <Button label="Edit" variant="secondary" />
            </HStack>
          )}
        </HStack>

        {/* Mobile: actions drop below the metadata as a full-width row. The
            VStack hAlign="stretch" wrapper is the full-width-button
            workaround — Button has no full-width prop (#2600). */}
        {isNarrow && (
          <HStack gap={2}>
            <StackItem size="fill">
              <VStack hAlign="stretch">
                <Button label="Restock" variant="secondary" />
              </VStack>
            </StackItem>
            <StackItem size="fill">
              <VStack hAlign="stretch">
                <Button label="Edit" variant="secondary" />
              </VStack>
            </StackItem>
          </HStack>
        )}

        <HStack vAlign="center">
          <StackItem size="fill">
            <TabList
              value={activeTab}
              onChange={onTabChange}
              size="lg"
              isFullBleed>
              <Tab value="details" label="Details" />
              <Tab value="invoices" label="Invoices" />
              <Tab value="timeline" label="Timeline" />
              <TabMenu
                label="More"
                options={[
                  {value: 'customer', label: 'Customer'},
                  {value: 'analysis', label: 'Analysis'},
                ]}
              />
            </TabList>
          </StackItem>
          <Button
            label={isPanelOpen ? 'Hide panel' : 'Show panel'}
            variant="ghost"
            size="md"
            icon={<Icon icon={ViewColumnsIcon} size="sm" />}
            isIconOnly
            onClick={onTogglePanel}
          />
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}

// ─── Items Card ─────────────────────────────────────────────────────────────
function ItemsCard() {
  return (
    <Section>
      <VStack gap={4}>
        <HStack vAlign="center" gap={2} wrap="wrap">
          <StackItem size="fill">
            <HStack gap={2} vAlign="center">
              <Heading level={2}>Items</Heading>
              <Badge variant="warning" label="Unfulfilled" />
            </HStack>
          </StackItem>
          <HStack gap={2}>
            <Button label="Fulfill item" variant="ghost" />
            <Button label="Create label" variant="secondary" />
          </HStack>
        </HStack>

        <List density="spacious" style={itemsList}>
          {PRODUCTS.map((product, i) => (
            <ListItem
              key={i}
              label={product.name}
              description={
                <VStack gap={0}>
                  {product.details.split('\n').map((line, j) => (
                    <Text key={j} type="supporting" color="secondary">
                      {line}
                    </Text>
                  ))}
                </VStack>
              }
              onClick={() => {}}
              startContent={
                <Thumbnail
                  src={product.image}
                  alt={product.name}
                  label={product.name}
                />
              }
              endContent={
                <VStack gap={0} hAlign="end">
                  <Text type="body" weight="bold" maxLines={1}>
                    {fmt(product.price * product.qty)}
                  </Text>
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {fmt(product.price)} {'×'} {product.qty}
                  </Text>
                </VStack>
              }
            />
          ))}
        </List>
      </VStack>
    </Section>
  );
}

// ─── Invoice Card ───────────────────────────────────────────────────────────
function InvoiceCard() {
  return (
    <Section>
      <VStack gap={4}>
        <HStack vAlign="center" gap={2} wrap="wrap">
          <StackItem size="fill">
            <HStack gap={2} vAlign="center">
              <Heading level={2}>Invoice</Heading>
              <Badge variant="success" label="Paid" />
            </HStack>
          </StackItem>
          <HStack gap={2}>
            <Button label="Refund" variant="ghost" />
            <Button label="Send Invoice" variant="secondary" />
          </HStack>
        </HStack>

        <MetadataList>
          <MetadataListItem label="Subtotal">
            <HStack>
              <StackItem size="fill">
                <Text type="body">{PRODUCTS.length} items</Text>
              </StackItem>
              <Text type="body">{fmt(SUBTOTAL)}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Discount">
            <HStack>
              <StackItem size="fill">
                <Text type="body">New customer code: NEW15</Text>
              </StackItem>
              <Text type="body">– {fmt(DISCOUNT)}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Shipping">
            <HStack>
              <StackItem size="fill">
                <Text type="body">Free shipping (0.0lbs) USPS</Text>
              </StackItem>
              <Text type="body">{fmt(SHIPPING)}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Tax">
            <HStack>
              <StackItem size="fill">
                <Text type="body">Sales tax (8.25%)</Text>
              </StackItem>
              <Text type="body">{fmt(TAX)}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Total">
            <HStack>
              <StackItem size="fill" />
              <Text type="body" weight="bold">
                {fmt(TOTAL)}
              </Text>
            </HStack>
          </MetadataListItem>
        </MetadataList>

        <Divider />

        <MetadataList>
          <MetadataListItem label="Paid by customer">
            <HStack>
              <StackItem size="fill">
                <Text type="body">Visa ...7482</Text>
              </StackItem>
              <Text type="body">{fmt(TOTAL)}</Text>
            </HStack>
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </Section>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────
function TimelineSection() {
  return (
    <Section>
      <VStack gap={4}>
        <HStack vAlign="center">
          <StackItem size="fill">
            <Heading level={2}>Timeline</Heading>
          </StackItem>
          <Button
            label="Filters"
            variant="ghost"
            icon={<Icon icon={FunnelIcon} />}
            isIconOnly
          />
        </HStack>

        <VStack gap={4}>
          {ACTIVITY.map((item, i) => (
            <VStack key={i} gap={2}>
              <HStack gap={3} vAlign="start">
                <Avatar name={item.user} size="md" />
                <StackItem size="fill">
                  <VStack gap={2}>
                    <Card variant="muted" padding={3}>
                      <VStack gap={1}>
                        <Text type="body" weight="bold">
                          {item.user}
                        </Text>
                        <Text type="body">{item.text}</Text>
                        {item.changes && (
                          <VStack gap={1}>
                            {item.changes.map((change, j) => (
                              <HStack key={j} gap={2} vAlign="center">
                                <Icon
                                  icon={PencilSquareIcon}
                                  size="sm"
                                  color="secondary"
                                />
                                <Text type="supporting" color="secondary">
                                  {change}
                                </Text>
                              </HStack>
                            ))}
                          </VStack>
                        )}
                      </VStack>
                    </Card>
                    <HStack gap={3} vAlign="center">
                      <HStack gap={1} vAlign="center">
                        <Icon
                          icon={HandThumbUpIcon}
                          size="xsm"
                          color="secondary"
                        />
                        <Icon icon={HeartIcon} size="xsm" color="secondary" />
                        <Text type="supporting" color="secondary">
                          {item.reactions}
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary">
                        Like
                      </Text>
                      <Bullet />
                      <Text type="supporting" color="secondary">
                        Reply
                      </Text>
                      <Bullet />
                      <Text type="supporting" color="secondary">
                        {item.time}
                      </Text>
                    </HStack>
                  </VStack>
                </StackItem>
              </HStack>
            </VStack>
          ))}
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Right Panel ────────────────────────────────────────────────────────────
// Renders as a fixed-width side panel on desktop, and as a plain stacked section
// on mobile (so it flows below the content instead of squishing beside it).
function PanelContent() {
  return (
    <VStack gap={4}>
      <Collapsible trigger={<Heading level={4}>Notes</Heading>}>
        <Text type="body">
          Customer is a repeat buyer — 3rd order this quarter. Prefers snow and
          oat glazes. Requested gift wrapping for the mug set. Ships to a
          residential address in CA.{' '}
          <Link href="#" color="secondary">
            Show more
          </Link>
        </Text>
      </Collapsible>
      <Collapsible trigger={<Heading level={4}>Customer</Heading>}>
        <MetadataList>
          <MetadataListItem label="Name">Jane Doe</MetadataListItem>
          <MetadataListItem label="Address">
            321 Smith Road, CA 38238
          </MetadataListItem>
          <MetadataListItem label="Phone">234-</MetadataListItem>
          <MetadataListItem label="Email">janedoe@email.com</MetadataListItem>
          <MetadataListItem label="Billing Address">
            Same as shipping address
          </MetadataListItem>
        </MetadataList>
      </Collapsible>
      <Collapsible trigger={<Heading level={4}>Fraud Analysis</Heading>}>
        <VStack gap={1}>
          <ProgressBar
            label="Risk level"
            value={15}
            variant="success"
            isLabelHidden
          />
          <Text type="body">Recommendation: Fulfill order</Text>
          <Text type="body">
            There is a low chance that you will receive a chargeback on this
            order.
          </Text>
        </VStack>
      </Collapsible>
    </VStack>
  );
}

// Desktop: fixed-width side panel in the layout's `end` slot.
function RightPanel() {
  return (
    <LayoutPanel width={320} padding={4} role="complementary">
      <PanelContent />
    </LayoutPanel>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function DetailPage2Template() {
  const [activeTab, setActiveTab] = useState('details');
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  // Desktop: a fixed-width `end`-slot side panel that can be hidden.
  const [showSidePanel, setShowSidePanel] = useState(true);
  // Mobile: the panel opens as a full-screen dialog (the side slot would squish
  // the main content), driven by the same toolbar button.
  const [isPanelDialogOpen, setPanelDialogOpen] = useState(false);

  const isPanelShown = isNarrow ? isPanelDialogOpen : showSidePanel;
  const togglePanel = () =>
    isNarrow
      ? setPanelDialogOpen(prev => !prev)
      : setShowSidePanel(prev => !prev);

  return (
    <>
      <Layout
        height="fill"
        contentWidth={1000}
        defaultHasDividers
        header={
          <PageHeader
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isPanelOpen={isPanelShown}
            onTogglePanel={togglePanel}
            isNarrow={isNarrow}
          />
        }
        content={
          <LayoutContent role="main">
            <VStack gap={4}>
              <ItemsCard />
              <InvoiceCard />
              <TimelineSection />
            </VStack>
          </LayoutContent>
        }
        end={!isNarrow && showSidePanel ? <RightPanel /> : undefined}
      />
      {/* Mobile: the side-panel content uses the full viewport so order details
          are not squeezed beside narrow page chrome. Drawer remains available
          for side-overlay flows that intentionally preserve page context. */}
      <Dialog
        variant="fullscreen"
        isOpen={isNarrow && isPanelDialogOpen}
        onOpenChange={setPanelDialogOpen}>
        <Layout
          header={
            <DialogHeader
              title="Order details"
              onOpenChange={setPanelDialogOpen}
            />
          }
          content={
            <LayoutContent padding={4}>
              <PanelContent />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
