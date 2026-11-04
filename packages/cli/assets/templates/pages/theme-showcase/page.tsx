// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {type CSSProperties, type ReactNode} from 'react';
import {
  Plus,
  Search,
  Tag,
  Folder,
  MapPin,
  List,
  LayoutGrid,
  ShoppingBag,
  Banknote,
  Mic,
  CreditCard,
  Lock,
  X,
  Download,
  Smartphone,
  Wallet,
  User,
} from 'lucide-react';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {useAppShellMobile} from '@astryxdesign/core/AppShell';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Link} from '@astryxdesign/core/Link';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Divider} from '@astryxdesign/core/Divider';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Item} from '@astryxdesign/core/Item';
import {Table, proportional, pixel} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Center} from '@astryxdesign/core/Center';
import {Section} from '@astryxdesign/core/Section';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {
  ChatComposer,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';

// Styles passed to Astryx components via their `style` prop. Astryx components
// forward the DOM `style` prop, so these work with no CSS compiler — in
// compiled builds and in the live playground preview alike.
const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'var(--color-background-body)',
    color: 'var(--color-text-primary)',
    minWidth: 0,
    borderColor: 'transparent',
  },
  checkoutStack: {
    minWidth: 0,
    width: '100%',
  },
  paymentCardContent: {
    minWidth: 0,
    width: '100%',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  inventoryCard: {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
  },
  inventoryHeader: {
    paddingBlock: 'var(--spacing-6)',
    paddingInline: 'var(--spacing-6)',
  },
  inventoryFilterRow: {
    paddingBlock: 'var(--spacing-4)',
    paddingInline: 'var(--spacing-6)',
    width: '100%',
    overflowX: 'auto' as const,
  },
  // Inset the table by --spacing-6 (the card is padding={0}) so its edge lines
  // up with the header/filter row in every theme's spacing scale.
  inventoryTableWrap: {
    paddingInline: 'var(--spacing-6)',
    paddingBlockEnd: 'var(--spacing-2)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: 240,
  },
  activityCard: {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    minWidth: 0,
    height: '100%',
  },
  chatCard: {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  chatHeader: {
    paddingBlock: 'var(--spacing-4)',
    paddingInline: 'var(--spacing-4)',
  },
  activityCardStack: {
    height: '100%',
  },
  activityListFade: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    maskImage:
      'linear-gradient(to bottom, black calc(100% - 48px), transparent)',
    WebkitMaskImage:
      'linear-gradient(to bottom, black calc(100% - 48px), transparent)',
    marginInline: 'calc(var(--spacing-2) * -1)',
  },
  content: {
    maxWidth: 960,
    marginInline: 'auto',
    minWidth: 0,
  },
  contentFluid: {
    maxWidth: 880,
  },
  heroText: {
    textAlign: 'center' as const,
    maxWidth: 560,
  },
  centerText: {
    textAlign: 'center',
  },
  cardStack: {
    height: '100%',
  },
  cardDescription: {
    flex: 1,
  },
  quantityInput: {
    flexShrink: 0,
  },
  // `auto` basis so the button wraps to its own line rather than ellipsizing.
  cartButton: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  cartRow: {
    width: '100%',
    minWidth: 0,
  },
};

// Styles applied directly to plain DOM elements via the `style` prop.
// Plain inline styles so they render with no CSS compiler. All are static
// (no media/pseudo variants), so inline styles reproduce them exactly.
const inlineStyles: Record<string, CSSProperties> = {
  inventoryBannerWrap: {
    paddingInline: 'var(--spacing-6)',
    paddingBottom: 'var(--spacing-4)',
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 'var(--radius-element)',
    objectFit: 'cover',
    display: 'block',
    flexShrink: 0,
  },
  thumbnailFallback: {
    width: 40,
    height: 40,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    flexShrink: 0,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.1,
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-heading)',
    letterSpacing: '-0.01em',
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  chatSuggestions: {
    paddingInline: 'var(--spacing-4)',
    paddingBottom: 'var(--spacing-2)',
  },
  chatComposer: {
    paddingInline: 'var(--spacing-4)',
    paddingBottom: 'var(--spacing-4)',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardBody: {
    padding: 'var(--spacing-4)',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  // Flex bases, not grid tracks: the checkout form needs a width floor, and the
  // chat wraps to its own row rather than squeezing it under one.
  checkoutColumn: {
    flex: '1 1 300px',
    minWidth: 0,
    display: 'grid',
  },
  chatColumn: {
    flex: '2 1 520px',
    minWidth: 0,
    display: 'grid',
  },
};

const PRODUCT_IMAGE_KEYS = ['watch', 'headphones', 'backpack'];

/** Categorical badge variants usable for showcase product/inventory tags. */
export type ShowcaseBadgeVariant =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow';

export interface ProductSpec {
  name: string;
  description: string;
  badge: string;
  badgeVariant: ShowcaseBadgeVariant;
}

const DEFAULT_PRODUCTS: ProductSpec[] = [
  {
    name: 'Minimalist Watch',
    description: 'Clean design meets everyday durability.',
    badge: 'New',
    badgeVariant: 'blue',
  },
  {
    name: 'Wireless Headphones',
    description: 'Immersive sound, all-day comfort.',
    badge: 'Popular',
    badgeVariant: 'green',
  },
  {
    name: 'Canvas Backpack',
    description: 'Water-resistant canvas with a quiet, modern profile.',
    badge: 'Limited',
    badgeVariant: 'yellow',
  },
];

// Neutral product photos, served from the shared astryx asset CDN so the
// scaffolded template renders real imagery without needing local public assets.
const DEFAULT_IMAGES: Record<string, string> = {
  watch: '/template-assets/Neutral-Watch.png',
  headphones: '/template-assets/Neutral-Headphones.png',
  backpack: '/template-assets/Neutral-Backpack.png',
  wallet: '/template-assets/Neutral-Wallet.png',
  tumbler: '/template-assets/Neutral-Tumbler.png',
  throw_: '/template-assets/Neutral-Blanket.png',
};

export interface ThemeShowcaseProps {
  /** Product card images keyed by slot (watch/headphones/backpack/…). */
  images?: Record<string, string>;
  /** The three hero product cards. Defaults to the neutral store products. */
  products?: ProductSpec[];
  /** Inventory table rows. Defaults to the neutral store inventory. */
  inventory?: InventoryRow[];
}

// Default export is the route page (sandbox renders this as a Next.js page, so
// it must take no props / satisfy PageProps). It renders the store with the
// neutral defaults. Consumers that need per-theme content import the named
// `ThemeShowcaseStore` below and pass images/products/inventory.
export default function ThemeShowcase() {
  return <ThemeShowcaseStore />;
}

export function ThemeShowcaseStore({
  images = DEFAULT_IMAGES,
  products = DEFAULT_PRODUCTS,
  inventory = DEFAULT_INVENTORY,
}: ThemeShowcaseProps = {}) {
  const {isMobile} = useAppShellMobile();
  return (
    <div
      style={{
        minHeight: '100%',
        backgroundColor: 'var(--color-background-body)',
      }}>
      <StorePreview images={images} products={products} isMobile={isMobile} />
      <div
        style={{
          padding: 'var(--spacing-6)',
          backgroundColor: 'var(--color-background-surface)',
        }}>
        <CardShowcase
          images={images}
          inventory={inventory}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

function CardShowcase({
  images,
  inventory,
  isMobile,
}: {
  images: Record<string, string>;
  inventory: InventoryRow[];
  isMobile: boolean;
}) {
  const columns = isMobile ? 1 : ({minWidth: 200, repeat: 'fit'} as const);

  return (
    <VStack gap={8}>
      <HStack gap={4} wrap="wrap">
        <div style={inlineStyles.checkoutColumn}>
          <CheckoutCard isMobile={isMobile} />
        </div>
        <div style={inlineStyles.chatColumn}>
          <ChatCard />
        </div>
      </HStack>
      <Grid columns={columns} gap={4}>
        <GridSpan columns={isMobile ? 1 : 3}>
          <InventoryCard images={images} inventory={inventory} />
        </GridSpan>
        <GridSpan columns={1}>
          <LatestActivityCard isMobile={isMobile} />
        </GridSpan>
      </Grid>
    </VStack>
  );
}

function StorePreview({
  images,
  products,
  isMobile,
}: {
  images: Record<string, string>;
  products: ProductSpec[];
  isMobile: boolean;
}) {
  return (
    <div data-theme-preview="true">
      <VStack gap={0}>
        <TopNav
          label="Theme preview navigation"
          heading={<TopNavHeading heading="Studio" />}
          centerContent={
            isMobile ? undefined : (
              <>
                <TopNavItem label="Shop" href="#" isSelected />
                <TopNavItem label="New In" href="#" />
                <TopNavItem label="Stories" href="#" />
                <TopNavItem label="Help" href="#" />
              </>
            )
          }
          endContent={
            <HStack gap={2} vAlign="center">
              <HStack gap={0.5}>
                <Button
                  label="Search"
                  tooltip="Search"
                  variant="ghost"
                  isIconOnly
                  icon={<Search size={20} />}
                  href="#"
                />
                <Button
                  label="Account"
                  tooltip="Account"
                  variant="ghost"
                  isIconOnly
                  icon={<User size={20} />}
                  href="#"
                />
                <Button
                  label="Cart"
                  tooltip="Cart"
                  variant="ghost"
                  isIconOnly
                  icon={<ShoppingBag size={20} />}
                  href="#"
                />
              </HStack>
              <Button label="Sign in" variant="primary" href="#" />
            </HStack>
          }
        />

        <Section padding={6} variant="transparent">
          <VStack gap={10} style={{...styles.content, ...styles.contentFluid}}>
            <Center>
              <VStack gap={4} hAlign="center" style={styles.heroText}>
                <Text type="display-2" color="accent">
                  Little joys,
                  <br />
                  everywhere you go
                </Text>
                <Text type="body" color="secondary">
                  We believe the smallest details are the ones that matter most.
                  Turn an ordinary day into something worth remembering.
                </Text>
              </VStack>
            </Center>

            <Grid columns={isMobile ? 1 : {minWidth: 200, max: 3}} gap={4}>
              {products.map((p, i) => (
                <Card key={p.name} padding={0} height="100%">
                  <VStack gap={0} style={styles.cardStack}>
                    <AspectRatio ratio={1}>
                      <img
                        src={images[PRODUCT_IMAGE_KEYS[i]]}
                        alt={p.name}
                        style={inlineStyles.productImage}
                      />
                    </AspectRatio>
                    <div style={inlineStyles.cardBody}>
                      <VStack gap={2} hAlign="center" style={styles.cardStack}>
                        <HStack>
                          <Badge label={p.badge} variant={p.badgeVariant} />
                        </HStack>
                        <Heading level={2} style={styles.centerText}>
                          {p.name}
                        </Heading>
                        <Text
                          type="supporting"
                          color="secondary"
                          style={{
                            ...styles.cardDescription,
                            ...styles.centerText,
                          }}>
                          {p.description}
                        </Text>
                        <HStack
                          gap={2}
                          vAlign="center"
                          hAlign="center"
                          wrap="wrap"
                          style={styles.cartRow}>
                          <NumberInput
                            label="Quantity"
                            isLabelHidden
                            value={1}
                            onChange={() => {}}
                            min={1}
                            max={99}
                            size="sm"
                            width={72}
                            controlStyle={styles.quantityInput}
                          />
                          <Button
                            label="Add to cart"
                            variant="secondary"
                            size="sm"
                            href="#"
                            style={styles.cartButton}
                          />
                        </HStack>
                      </VStack>
                    </div>
                  </VStack>
                </Card>
              ))}
            </Grid>
          </VStack>
        </Section>
      </VStack>
    </div>
  );
}

function CheckoutCard({isMobile}: {isMobile: boolean}) {
  return (
    <Card padding={isMobile ? 4 : 5} style={styles.card}>
      <VStack gap={4} style={styles.checkoutStack}>
        <Heading level={2}>Checkout</Heading>

        <VStack gap={3} style={styles.checkoutStack}>
          <TextInput
            label="Email"
            placeholder="you@studio.com"
            value=""
            onChange={() => {}}
            size="lg"
          />

          <RadioList
            label="Shipping method"
            description="Delivery time may vary based on location and availability."
            value="economy"
            onChange={() => {}}>
            <RadioListItem
              value="economy"
              label="Economy Shipping"
              description="Delivered in 5–7 business days"
              endContent={
                <Text type="body" weight="bold">
                  $12.00
                </Text>
              }
            />
            <RadioListItem
              value="standard"
              label="Standard Shipping"
              description="Delivered in 3–5 business days"
              endContent={
                <Text type="body" weight="bold">
                  $16.00
                </Text>
              }
            />
            <RadioListItem
              value="express"
              label="Express Shipping"
              description="Delivered in 1–2 business days"
              endContent={
                <Text type="body" weight="bold">
                  $24.00
                </Text>
              }
            />
          </RadioList>

          <VStack gap={2} style={styles.checkoutStack}>
            <Text type="supporting" weight="bold">
              Payment method
            </Text>
            <Grid columns={isMobile ? 1 : {minWidth: 80, max: 3}} gap={2}>
              <SelectableCard
                label="Pay with card"
                isSelected={true}
                onChange={() => {}}
                padding={3}>
                <VStack
                  gap={1}
                  hAlign="center"
                  style={styles.paymentCardContent}>
                  <CreditCard size={20} />
                  <Text type="supporting" weight="bold">
                    Card
                  </Text>
                </VStack>
              </SelectableCard>
              <SelectableCard
                label="Pay with Apple Pay"
                isSelected={false}
                onChange={() => {}}
                padding={3}>
                <VStack
                  gap={1}
                  hAlign="center"
                  style={styles.paymentCardContent}>
                  <Smartphone size={20} />
                  <Text type="supporting" weight="bold">
                    Apple Pay
                  </Text>
                </VStack>
              </SelectableCard>
              <SelectableCard
                label="Pay with Google Pay"
                isSelected={false}
                onChange={() => {}}
                padding={3}>
                <VStack
                  gap={1}
                  hAlign="center"
                  style={styles.paymentCardContent}>
                  <Wallet size={20} />
                  <Text type="supporting" weight="bold">
                    Google Pay
                  </Text>
                </VStack>
              </SelectableCard>
            </Grid>
          </VStack>

          <TextInput
            label="Card number"
            placeholder="1234 1234 1234 1234"
            value=""
            onChange={() => {}}
            startIcon={isMobile ? undefined : <CreditCard size={16} />}
            size="lg"
          />

          <Grid columns={isMobile ? 1 : {minWidth: 90, max: 2}} gap={2}>
            <TextInput
              label="Expiry"
              placeholder="MM / YY"
              value=""
              onChange={() => {}}
              size="lg"
            />
            <TextInput
              label="CVC"
              placeholder="123"
              value=""
              onChange={() => {}}
              size="lg"
            />
          </Grid>

          <Selector
            label="Country"
            value="us"
            onChange={() => {}}
            size="lg"
            options={[
              {value: 'us', label: 'United States'},
              {value: 'ca', label: 'Canada'},
              {value: 'uk', label: 'United Kingdom'},
              {value: 'de', label: 'Germany'},
              {value: 'jp', label: 'Japan'},
              {value: 'au', label: 'Australia'},
            ]}
          />
        </VStack>

        <CheckboxInput
          label="Securely save my information for 1-click checkout"
          description="Pay faster on Studio and everywhere Link is accepted."
          value={true}
          onChange={() => {}}
        />

        <Button
          variant="primary"
          size="lg"
          label="Pay now"
          icon={<Lock size={16} />}
        />
      </VStack>
    </Card>
  );
}

const SUGGESTED_QUESTIONS = [
  'Reschedule delivery',
  'Update shipping address',
  'Start a return',
];

function ChatCard() {
  return (
    <Card padding={0} style={styles.chatCard}>
      <HStack
        hAlign="between"
        vAlign="center"
        gap={3}
        style={styles.chatHeader}>
        <Heading level={2}>Studio AI</Heading>

        <HStack gap={1} vAlign="center">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            label="Export conversation"
            tooltip="Export conversation"
            icon={<Download size={16} />}
          />
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            label="Close chat"
            tooltip="Close chat"
            icon={<X size={16} />}
          />
        </HStack>
      </HStack>

      <Divider variant="subtle" />

      <div style={inlineStyles.chatBody}>
        <ChatMessageList>
          <ChatSystemMessage>Today</ChatSystemMessage>

          <ChatMessage sender="user">
            <ChatMessageBubble variant="filled">
              Where’s my order?
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="assistant">
            <VStack gap={3}>
              <Text type="body">
                Your order #1043 — the Minimalist Watch and Linen Throw —
                shipped this morning from the Aisle 3 warehouse and is currently
                in transit with UPS. It’s on track to arrive at your address by
                end of day tomorrow.
              </Text>
              <Text type="body">
                Let me know if you’d like to reschedule the delivery, redirect
                it to a pickup point, or start a return once it arrives.
              </Text>
            </VStack>
          </ChatMessage>

          <ChatMessage sender="user">
            <ChatMessageBubble variant="filled">
              Can you show me the full details?
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="assistant">
            <VStack gap={3}>
              <Text type="body">Here’s everything I have on order #1043:</Text>
              <Card padding={3}>
                <VStack gap={1}>
                  <Item
                    label="Items"
                    description="Minimalist Watch · Linen Throw"
                    endContent={
                      <Text type="body" weight="bold">
                        $248
                      </Text>
                    }
                  />
                  <Item
                    label="Shipping"
                    description="UPS Ground"
                    endContent={
                      <Text type="body" weight="bold">
                        $12
                      </Text>
                    }
                  />
                  <Item
                    label="Estimated arrival"
                    description="Tomorrow by 8pm"
                    endContent={<Badge variant="green" label="On time" />}
                  />
                  <Item
                    label="Tracking"
                    description="UPS 1Z 999 AA1 0123 4567 84"
                    endContent={<Link href="#">Track →</Link>}
                  />
                </VStack>
              </Card>
            </VStack>
          </ChatMessage>
        </ChatMessageList>
      </div>

      <div style={inlineStyles.chatSuggestions}>
        <HStack gap={1} hAlign="center" wrap="wrap">
          {SUGGESTED_QUESTIONS.map(question => (
            <Button
              key={question}
              variant="secondary"
              size="sm"
              label={question}
            />
          ))}
        </HStack>
      </div>

      <div style={inlineStyles.chatComposer}>
        <ChatComposer
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          placeholder="Ask Studio AI…"
          footerActions={
            <Button
              variant="ghost"
              size="md"
              isIconOnly
              label="Attach"
              tooltip="Attach"
              icon={<Plus size={16} />}
            />
          }
          sendActions={
            <Button
              variant="ghost"
              size="md"
              isIconOnly
              label="Voice input"
              tooltip="Voice input"
              icon={<Mic size={16} />}
            />
          }
        />
      </div>
    </Card>
  );
}

interface ActivityRow {
  id: string;
  icon: ReactNode;
  label: string;
  detail: string;
  time: string;
  amount: number;
}

const ACTIVITY: ActivityRow[] = [
  {
    id: '1',
    icon: <ShoppingBag size={16} />,
    label: 'Order #1043',
    detail: 'Placed · 1:59 pm',
    time: '1:59 pm',
    amount: 248,
  },
  {
    id: '2',
    icon: <Banknote size={16} />,
    label: 'Order #1041',
    detail: 'Refunded · 12:40 pm',
    time: '12:40 pm',
    amount: -89,
  },
  {
    id: '3',
    icon: <ShoppingBag size={16} />,
    label: 'Order #1040',
    detail: 'Placed · 10:30 am',
    time: '10:30 am',
    amount: 156,
  },
  {
    id: '4',
    icon: <ShoppingBag size={16} />,
    label: 'Order #1038',
    detail: 'Placed · 9:11 am',
    time: '9:11 am',
    amount: 412,
  },
  {
    id: '5',
    icon: <ShoppingBag size={16} />,
    label: 'Order #1037',
    detail: 'Placed · 8:42 am',
    time: '8:42 am',
    amount: 95,
  },
];

function formatAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return sign + '$' + Math.abs(amount).toLocaleString();
}

function LatestActivityCard({isMobile}: {isMobile: boolean}) {
  return (
    <Card padding={5} style={styles.activityCard}>
      <VStack gap={4} style={styles.activityCardStack}>
        <Heading level={2}>Revenue</Heading>

        <Grid columns={isMobile ? 1 : 2} gap={3}>
          <VStack gap={0}>
            <span style={inlineStyles.kpiValue}>18K</span>
            <Text type="supporting" color="secondary">
              Monthly revenue
            </Text>
          </VStack>
          <VStack gap={0}>
            <span style={inlineStyles.kpiValue}>+12%</span>
            <Text type="supporting" color="secondary">
              Order growth
            </Text>
          </VStack>
        </Grid>

        <Divider variant="subtle" />

        <HStack hAlign="between" vAlign="center">
          <Heading level={3}>Activity</Heading>
          <Link href="#">See all</Link>
        </HStack>

        <VStack gap={1} style={styles.activityListFade}>
          {ACTIVITY.map(item => (
            <Item
              key={item.id}
              startContent={
                <div style={inlineStyles.activityIcon} aria-hidden="true">
                  {item.icon}
                </div>
              }
              label={item.label}
              description={item.detail}
              endContent={
                <Text
                  type="body"
                  weight="bold"
                  color={item.amount < 0 ? 'secondary' : 'primary'}>
                  {formatAmount(item.amount)}
                </Text>
              }
              href="#"
            />
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

type TagSpec = {label: string; variant: ShowcaseBadgeVariant};

export interface InventoryRow extends Record<string, unknown> {
  id: string;
  name: string;
  meta: string;
  available: number;
  location: string;
  tags: TagSpec[];
  imageKey?: string;
  thumbnailFallback: string;
  selected: boolean;
}

const DEFAULT_INVENTORY: InventoryRow[] = [
  {
    id: 'a',
    name: 'Minimalist Watch',
    meta: 'Stainless steel, sapphire crystal',
    available: 42,
    location: 'Aisle 3',
    tags: [{label: 'New', variant: 'blue'}],
    imageKey: 'watch',
    thumbnailFallback: 'M',
    selected: false,
  },
  {
    id: 'b',
    name: 'Wireless Headphones',
    meta: 'ANC, 30hr battery',
    available: 128,
    location: 'Aisle 1',
    tags: [{label: 'Popular', variant: 'green'}],
    imageKey: 'headphones',
    thumbnailFallback: 'W',
    selected: true,
  },
  {
    id: 'c',
    name: 'Canvas Backpack',
    meta: 'Water-resistant, 25L',
    available: 63,
    location: 'Aisle 2',
    tags: [{label: 'Limited', variant: 'yellow'}],
    imageKey: 'backpack',
    thumbnailFallback: 'C',
    selected: false,
  },
  {
    id: 'd',
    name: 'Leather Wallet',
    meta: 'Full-grain, RFID blocking',
    available: 15,
    location: 'Aisle 4',
    tags: [{label: 'Leather', variant: 'yellow'}],
    imageKey: 'wallet',
    thumbnailFallback: 'L',
    selected: true,
  },
  {
    id: 'e',
    name: 'Travel Tumbler',
    meta: 'Vacuum insulated, 16oz',
    available: 87,
    location: 'Aisle 5',
    tags: [{label: 'Drinkware', variant: 'green'}],
    imageKey: 'tumbler',
    thumbnailFallback: 'T',
    selected: false,
  },
  {
    id: 'f',
    name: 'Linen Throw',
    meta: 'Heavyweight, oat',
    available: 24,
    location: 'Aisle 6',
    tags: [{label: 'Home', variant: 'orange'}],
    imageKey: 'throw_',
    thumbnailFallback: 'L',
    selected: true,
  },
];

const LOW_STOCK_THRESHOLD = 25;

function SelectCell({row}: {row: InventoryRow}) {
  return (
    <CheckboxInput
      label={'Select ' + row.name}
      isLabelHidden
      value={row.selected}
      onChange={() => {}}
    />
  );
}

function ItemCell({
  row,
  images,
}: {
  row: InventoryRow;
  images: Record<string, string>;
}) {
  const thumbnailSrc = row.imageKey ? images[row.imageKey] : undefined;
  return (
    <HStack gap={3} vAlign="center">
      {thumbnailSrc ? (
        <img src={thumbnailSrc} alt="" style={inlineStyles.thumbnail} />
      ) : (
        <div style={inlineStyles.thumbnailFallback} aria-hidden="true">
          {row.thumbnailFallback}
        </div>
      )}
      <VStack gap={0} style={{minWidth: 0}}>
        <Text type="body" weight="bold">
          {row.name}
        </Text>
        <Text type="supporting" color="secondary">
          {row.meta}
        </Text>
      </VStack>
    </HStack>
  );
}

function TagsCell({row}: {row: InventoryRow}) {
  return (
    <HStack gap={1} wrap="wrap" hAlign="end">
      {row.tags.map(tag => (
        <Badge key={tag.label} label={tag.label} variant={tag.variant} />
      ))}
    </HStack>
  );
}

function ActionsCell() {
  return (
    <MoreMenu
      label="Row actions"
      size="sm"
      items={[
        {label: 'Edit'},
        {label: 'Duplicate'},
        {label: 'Move to…'},
        {type: 'divider'},
        {label: 'Delete'},
      ]}
    />
  );
}

function InventoryCard({
  images,
  inventory,
}: {
  images: Record<string, string>;
  inventory: InventoryRow[];
}) {
  const lowStockCount = inventory.filter(
    row => row.available < LOW_STOCK_THRESHOLD,
  ).length;
  return (
    <Card padding={0} style={styles.inventoryCard}>
      <HStack hAlign="between" vAlign="center" style={styles.inventoryHeader}>
        <Heading level={2}>Inventory</Heading>
        <Button
          label="Add item"
          variant="primary"
          size="sm"
          icon={<Plus size={16} />}
        />
      </HStack>

      <Divider variant="subtle" />

      <HStack
        gap={3}
        vAlign="center"
        hAlign="between"
        style={styles.inventoryFilterRow}>
        <HStack gap={2} vAlign="center" style={{flex: 1, minWidth: 0}}>
          <TextInput
            label="Search inventory"
            isLabelHidden
            placeholder="Type and hit enter…"
            value=""
            onChange={() => {}}
            startIcon={<Search size={16} />}
            controlStyle={styles.searchInput}
          />
          <OverflowList
            gap={2}
            overflowRenderer={() => (
              <Button
                label="Filters"
                variant="ghost"
                size="sm"
                icon={<Tag size={16} />}
              />
            )}>
            <Selector
              label="Categories"
              isLabelHidden
              placeholder="Categories"
              size="sm"
              startIcon={<Folder size={16} />}
              value={undefined}
              onChange={() => {}}
              options={['Wearables', 'Audio', 'Bags', 'Drinkware', 'Home']}
            />
            <Selector
              label="Locations"
              isLabelHidden
              placeholder="Locations"
              size="sm"
              startIcon={<MapPin size={16} />}
              value={undefined}
              onChange={() => {}}
              options={[
                'Aisle 1',
                'Aisle 2',
                'Aisle 3',
                'Aisle 4',
                'Aisle 5',
                'Aisle 6',
              ]}
            />
            <Selector
              label="Tags"
              isLabelHidden
              placeholder="Tags"
              size="sm"
              startIcon={<Tag size={16} />}
              value={undefined}
              onChange={() => {}}
              options={[
                'New',
                'Popular',
                'Limited',
                'Leather',
                'Drinkware',
                'Home',
              ]}
            />
          </OverflowList>
        </HStack>
        <HStack gap={1} vAlign="center">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            label="List view"
            tooltip="List view"
            icon={<List size={18} />}
          />
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            label="Grid view"
            tooltip="Grid view"
            icon={<LayoutGrid size={18} />}
          />
        </HStack>
      </HStack>

      {lowStockCount > 0 && (
        <div style={inlineStyles.inventoryBannerWrap}>
          <Banner
            status="warning"
            title={lowStockCount + ' items are running low'}
          />
        </div>
      )}

      <div style={styles.inventoryTableWrap}>
        <Table<InventoryRow>
          data={inventory}
          columns={[
            {
              key: 'select',
              header: '',
              // Wide enough that the control + the theme's cell padding (up to
              // --spacing-4 = 16px/side on spacious density) fit inside the cell,
              // so the control's hover background doesn't overflow toward the
              // card's clipped (rounded) edge on larger-padding themes.
              width: pixel(64),
              renderCell: row => <SelectCell row={row} />,
            },
            {
              key: 'item',
              header: 'Item',
              // Lower min-width (default 120) so the table fits its container on
              // larger-spacing themes instead of overflowing the actions column.
              width: proportional(3, {minWidth: 80}),
              renderCell: row => <ItemCell row={row} images={images} />,
            },
            {
              key: 'available',
              header: 'Available',
              width: pixel(100),
              renderCell: row => <Text type="body">{row.available}</Text>,
            },
            {
              key: 'location',
              header: 'Location',
              width: pixel(100),
              renderCell: row => <Text type="body">{row.location}</Text>,
            },
            {
              key: 'tags',
              header: 'Tags',
              width: proportional(2, {minWidth: 80}),
              align: 'end',
              renderCell: row => <TagsCell row={row} />,
            },
            {
              key: 'actions',
              header: '',
              // Match the select column: fit the sm more-menu button + cell
              // padding so its hover background stays clear of the card's
              // clipped rounded edge across themes.
              width: pixel(64),
              align: 'end',
              renderCell: () => <ActionsCell />,
            },
          ]}
          density="spacious"
          dividers="rows"
          hasHover
        />
      </div>
    </Card>
  );
}
