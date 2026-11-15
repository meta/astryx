// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Theme comparison shell and embeddable preview.
 * @input Optional product images, product descriptions, and inventory fixtures
 * @output One responsive showcase built from Astryx components
 * @position Theme preview shared by the sandbox, docsite, and playground
 */

import {type CSSProperties, useRef, useState} from 'react';
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
import {DialogHeader, useImperativeDialog} from '@astryxdesign/core/Dialog';
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutFooter,
} from '@astryxdesign/core/Layout';
import {StackItem} from '@astryxdesign/core/Stack';
import {AppShell, useAppShellMobile} from '@astryxdesign/core/AppShell';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
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
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {
  ChatComposer,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
  useChatNewMessages,
  useChatStreamScroll,
} from '@astryxdesign/core/Chat';

// StackItem has no wrapping basis; Stack has no body variant.
// LayoutContent has no height cap; keep the message viewport bounded.
const styles: Record<string, CSSProperties> = {
  preview: {backgroundColor: 'var(--color-background-body)'},
  checkoutColumn: {flex: '1 1 300px'},
  chatColumn: {flex: '2 1 520px'},
  chatViewport: {maxHeight: 720},
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

export default function ThemeShowcase() {
  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      data-theme-preview="true"
      topNav={<ShowcaseNavigation />}>
      <ShowcaseContent headingLevel={1} />
    </AppShell>
  );
}

/** Embeddable comparison surface: the host owns its application shell. */
export function ThemeShowcaseStore(props: ThemeShowcaseProps = {}) {
  return (
    <VStack gap={0} data-theme-preview="true" style={styles.preview}>
      <ShowcaseNavigation />
      <ShowcaseContent {...props} />
    </VStack>
  );
}

function ShowcaseContent({
  images = DEFAULT_IMAGES,
  products = DEFAULT_PRODUCTS,
  inventory = DEFAULT_INVENTORY,
  headingLevel = 2,
}: ThemeShowcaseProps & {headingLevel?: 1 | 2} = {}) {
  const {isMobile} = useAppShellMobile();
  return (
    <Layout height="auto" padding={0}>
      <LayoutContent padding={0} isScrollable={false}>
        <VStack gap={0}>
          <StorePreview
            images={images}
            products={products}
            headingLevel={headingLevel}
          />
          <Section padding={6} variant="transparent">
            <CardShowcase
              images={images}
              inventory={inventory}
              isMobile={isMobile}
            />
          </Section>
        </VStack>
      </LayoutContent>
    </Layout>
  );
}

function ShowcaseNavigation() {
  const {isMobile} = useAppShellMobile();
  // Named explicitly: DialogHeader only names a dialog that already contains
  // it when the dialog mounts, and imperative content arrives later.
  const signIn = useImperativeDialog({
    purpose: 'form',
    width: 400,
    'aria-label': 'Sign in',
  });
  // A new key on each open mounts a new form, so a reopened dialog starts empty.
  const signInOpens = useRef(0);
  return (
    <>
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
                icon={<Icon icon={Search} size="md" />}
                href="#"
              />
              <Button
                label="Account"
                tooltip="Account"
                variant="ghost"
                isIconOnly
                icon={<Icon icon={User} size="md" />}
                href="#"
              />
              <Button
                label="Cart"
                tooltip="Cart"
                variant="ghost"
                isIconOnly
                icon={<Icon icon={ShoppingBag} size="md" />}
                href="#"
              />
            </HStack>
            <Button
              label="Sign in"
              variant="primary"
              onClick={() =>
                signIn.show(
                  <SignInForm
                    key={++signInOpens.current}
                    onClose={signIn.hide}
                  />,
                )
              }
            />
          </HStack>
        }
      />
      {signIn.element}
    </>
  );
}

/** Sign in opens a real dialog, so a theme's header, close control, fields
 * and footer buttons can be reviewed together. */
function SignInForm({onClose}: {onClose: () => void}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <Layout
      header={<DialogHeader title="Sign in" onOpenChange={() => onClose()} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            <TextInput
              label="Email"
              placeholder="you@studio.com"
              value={email}
              onChange={setEmail}
            />
            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
            />
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="secondary" onClick={onClose} />
            <Button label="Sign in" variant="primary" onClick={onClose} />
          </HStack>
        </LayoutFooter>
      }
    />
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
  const activity = <LatestActivityCard />;
  return (
    <VStack gap={8}>
      <HStack gap={4} wrap="wrap">
        <StackItem size="fill" style={styles.checkoutColumn}>
          <CheckoutCard />
        </StackItem>
        <StackItem size="fill" style={styles.chatColumn}>
          <ChatCard />
        </StackItem>
      </HStack>
      <HStack gap={isMobile ? 4 : 0} wrap={isMobile ? 'wrap' : 'nowrap'}>
        <StackItem size="fill">
          <InventoryCard
            key={inventory.map(row => row.name).join('|')}
            images={images}
            inventory={inventory}
          />
        </StackItem>
        <VStack
          as={StackItem}
          width={isMobile ? '100%' : 280}
          paddingInlineStart={isMobile ? 0 : 4}>
          {activity}
        </VStack>
      </HStack>
    </VStack>
  );
}

function StorePreview({
  images,
  products,
  headingLevel,
}: {
  images: Record<string, string>;
  products: ProductSpec[];
  headingLevel: 1 | 2;
}) {
  return (
    <Section padding={6} variant="transparent">
      <Center>
        <VStack gap={10} width="100%" maxWidth={880}>
          <Center>
            <VStack gap={4} hAlign="center" maxWidth={560}>
              <Heading
                level={1}
                accessibilityLevel={headingLevel}
                type="display-2"
                color="accent"
                justify="center">
                <Text type="inherit" display="block">
                  Little joys,
                </Text>
                <Text type="inherit" display="block">
                  everywhere you go
                </Text>
              </Heading>
              <Text type="body" color="secondary" justify="center">
                We believe the smallest details are the ones that matter most.
                Turn an ordinary day into something worth remembering.
              </Text>
            </VStack>
          </Center>
          <Grid columns={{minWidth: 200, max: 3}} gap={4}>
            {products.map((product, index) => (
              <ProductCard
                key={product.name}
                product={product}
                image={images[PRODUCT_IMAGE_KEYS[index]]}
              />
            ))}
          </Grid>
        </VStack>
      </Center>
    </Section>
  );
}

function ProductCard({product, image}: {product: ProductSpec; image?: string}) {
  const [quantity, setQuantity] = useState<number | null>(1);
  const [isAdded, setIsAdded] = useState(false);
  return (
    <Card padding={0} height="100%">
      <VStack gap={0} height="100%">
        <AspectRatio ratio={1} fit="cover">
          <img src={image} alt={product.name} />
        </AspectRatio>
        <StackItem size="fill">
          <VStack padding={4} gap={2} hAlign="center" height="100%">
            <Badge label={product.badge} variant={product.badgeVariant} />
            <Heading level={2} justify="center">
              {product.name}
            </Heading>
            <StackItem size="fill">
              <Text
                type="supporting"
                color="secondary"
                justify="center"
                display="block">
                {product.description}
              </Text>
            </StackItem>
            <HStack
              gap={2}
              vAlign="center"
              hAlign="center"
              wrap="wrap"
              width="100%">
              <NumberInput
                label="Quantity"
                isLabelHidden
                value={quantity}
                onChange={value => {
                  setQuantity(value);
                  setIsAdded(false);
                }}
                min={1}
                max={99}
                size="sm"
                width={72}
              />
              <Button
                label={isAdded ? 'Added to cart' : 'Add to cart'}
                variant="secondary"
                size="sm"
                onClick={() => setIsAdded(true)}
              />
            </HStack>
          </VStack>
        </StackItem>
      </VStack>
    </Card>
  );
}

function CheckoutCard() {
  const {isMobile} = useAppShellMobile();
  const [email, setEmail] = useState('');
  const [shipping, setShipping] = useState('economy');
  const [payment, setPayment] = useState('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [country, setCountry] = useState<string | undefined>('us');
  const [saveInformation, setSaveInformation] = useState(true);
  const [showPaymentPreview, setShowPaymentPreview] = useState(false);
  return (
    <Card height="100%" padding={isMobile ? 4 : 5}>
      <VStack gap={4}>
        <Heading level={2}>Checkout</Heading>
        <VStack gap={3}>
          <TextInput
            label="Email"
            placeholder="you@studio.com"
            value={email}
            onChange={setEmail}
            size="lg"
          />
          <RadioList
            label="Shipping method"
            description="Delivery time may vary based on location and availability."
            value={shipping}
            onChange={setShipping}>
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
          <VStack gap={2}>
            <Text type="supporting" weight="bold">
              Payment method
            </Text>
            <Grid
              columns={
                isMobile ? {minWidth: 80, max: 1} : {minWidth: 80, max: 3}
              }
              gap={2}>
              <SelectableCard
                label="Pay with card"
                isSelected={payment === 'card'}
                onChange={() => setPayment('card')}
                padding={3}>
                <VStack gap={1} hAlign="center">
                  <Icon icon={CreditCard} size="md" />
                  <Text type="supporting" weight="bold" justify="center">
                    Card
                  </Text>
                </VStack>
              </SelectableCard>
              <SelectableCard
                label="Pay with Apple Pay"
                isSelected={payment === 'apple'}
                onChange={() => setPayment('apple')}
                padding={3}>
                <VStack gap={1} hAlign="center">
                  <Icon icon={Smartphone} size="md" />
                  <Text type="supporting" weight="bold" justify="center">
                    Apple Pay
                  </Text>
                </VStack>
              </SelectableCard>
              <SelectableCard
                label="Pay with Google Pay"
                isSelected={payment === 'google'}
                onChange={() => setPayment('google')}
                padding={3}>
                <VStack gap={1} hAlign="center">
                  <Icon icon={Wallet} size="md" />
                  <Text type="supporting" weight="bold" justify="center">
                    Google Pay
                  </Text>
                </VStack>
              </SelectableCard>
            </Grid>
          </VStack>
          <TextInput
            label="Card number"
            placeholder="1234 1234 1234 1234"
            value={cardNumber}
            onChange={setCardNumber}
            startIcon={
              isMobile ? undefined : <Icon icon={CreditCard} size="sm" />
            }
            size="lg"
          />
          <Grid
            columns={isMobile ? {minWidth: 90, max: 1} : {minWidth: 90, max: 2}}
            gap={2}>
            <TextInput
              label="Expiry"
              placeholder="MM / YY"
              value={expiry}
              onChange={setExpiry}
              size="lg"
            />
            <TextInput
              label="CVC"
              placeholder="123"
              value={cvc}
              onChange={setCvc}
              size="lg"
            />
          </Grid>
          <Selector
            label="Country"
            value={country}
            onChange={setCountry}
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
          value={saveInformation}
          onChange={setSaveInformation}
        />
        {showPaymentPreview && (
          <Banner
            status="info"
            title="Payment preview only"
            description="No payment is submitted or saved."
          />
        )}
        <Button
          variant="primary"
          size="lg"
          label="Pay now"
          icon={<Icon icon={Lock} size="sm" />}
          onClick={() => setShowPaymentPreview(true)}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const {lock, isLocked, scrollIfLocked} = useChatStreamScroll({scrollRef});
  const {contentRef} = useChatNewMessages({isLocked, onResize: scrollIfLocked});
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{id: number; text: string}>>(
    [],
  );
  function submitMessage() {
    const message = draft.trim();
    if (!message) {
      return;
    }
    lock();
    setMessages(previous => [
      ...previous,
      {id: (previous.at(-1)?.id ?? 0) + 1, text: message},
    ]);
    setDraft('');
  }
  return (
    <Card padding={0} height="100%">
      <Layout
        height="fill"
        padding={4}
        header={
          <LayoutHeader hasDivider>
            <HStack hAlign="between" vAlign="center" gap={3}>
              <Heading level={2}>Studio AI</Heading>
              <HStack gap={1} vAlign="center">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label="Export conversation"
                  tooltip="Export conversation"
                  icon={<Icon icon={Download} size="sm" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label="Close chat"
                  tooltip="Close chat"
                  icon={<Icon icon={X} size="sm" />}
                />
              </HStack>
            </HStack>
          </LayoutHeader>
        }
        footer={
          <LayoutFooter>
            <VStack gap={2}>
              <HStack gap={1} hAlign="center" wrap="wrap">
                {SUGGESTED_QUESTIONS.map(question => (
                  <Button
                    key={question}
                    variant="secondary"
                    size="sm"
                    label={question}
                    onClick={() => setDraft(question)}
                  />
                ))}
              </HStack>
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSubmit={submitMessage}
                placeholder="Ask Studio AI…"
                footerActions={
                  <Button
                    variant="ghost"
                    size="md"
                    isIconOnly
                    label="Attach"
                    tooltip="Attach"
                    icon={<Icon icon={Plus} size="sm" />}
                  />
                }
                sendActions={
                  <Button
                    variant="ghost"
                    size="md"
                    isIconOnly
                    label="Voice input"
                    tooltip="Voice input"
                    icon={<Icon icon={Mic} size="sm" />}
                  />
                }
              />
            </VStack>
          </LayoutFooter>
        }>
        <LayoutContent
          ref={scrollRef}
          style={styles.chatViewport}
          padding={0}
          label="Studio AI conversation">
          <ChatMessageList ref={contentRef}>
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
                  shipped this morning from the Aisle 3 warehouse and is
                  currently in transit with UPS. It’s on track to arrive at your
                  address by end of day tomorrow.
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
                <Text type="body">
                  Here’s everything I have on order #1043:
                </Text>
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
                      endContent={<Link href="#">Track</Link>}
                    />
                  </VStack>
                </Card>
              </VStack>
            </ChatMessage>
            {messages.map(message => (
              <ChatMessage key={message.id} sender="user">
                <ChatMessageBubble variant="filled">
                  {message.text}
                </ChatMessageBubble>
              </ChatMessage>
            ))}
          </ChatMessageList>
        </LayoutContent>
      </Layout>
    </Card>
  );
}

interface ActivityRow {
  id: string;
  kind: 'order' | 'refund';
  label: string;
  detail: string;
  amount: number;
}

const ACTIVITY: ActivityRow[] = [
  {
    id: '1',
    kind: 'order',
    label: 'Order #1043',
    detail: 'Placed · 1:59 pm',
    amount: 248,
  },
  {
    id: '2',
    kind: 'refund',
    label: 'Order #1041',
    detail: 'Refunded · 12:40 pm',
    amount: -89,
  },
  {
    id: '3',
    kind: 'order',
    label: 'Order #1040',
    detail: 'Placed · 10:30 am',
    amount: 156,
  },
  {
    id: '4',
    kind: 'order',
    label: 'Order #1038',
    detail: 'Placed · 9:11 am',
    amount: 412,
  },
  {
    id: '5',
    kind: 'order',
    label: 'Order #1037',
    detail: 'Placed · 8:42 am',
    amount: 95,
  },
];

function formatAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '+';
  return sign + '$' + Math.abs(amount).toLocaleString();
}

function LatestActivityCard() {
  const {isMobile} = useAppShellMobile();
  return (
    <Card height="100%" padding={5}>
      <VStack gap={4} height="100%">
        <Heading level={2}>Revenue</Heading>
        <Grid
          columns={isMobile ? {minWidth: 80, max: 1} : {minWidth: 80, max: 2}}
          gap={3}>
          <VStack gap={0}>
            <Text type="large" weight="bold" hasTabularNumbers>
              18K
            </Text>
            <Text type="supporting" color="secondary">
              Monthly revenue
            </Text>
          </VStack>
          <VStack gap={0}>
            <Text type="large" weight="bold" hasTabularNumbers>
              +12%
            </Text>
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
        <StackItem size="fill">
          <ScrollableArea label="Recent order activity" height="100%">
            <VStack gap={1}>
              {ACTIVITY.map(item => (
                <Item
                  key={item.id}
                  startContent={
                    <Center width={32} height={32}>
                      <Icon
                        icon={item.kind === 'refund' ? Banknote : ShoppingBag}
                        size="sm"
                        color="secondary"
                      />
                    </Center>
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
          </ScrollableArea>
        </StackItem>
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
  /** Optional category supplied by a preview's inventory fixtures. */
  category?: string;
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
    category: 'Wearables',
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
    category: 'Audio',
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
    category: 'Bags',
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
    category: 'Wearables',
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
    category: 'Drinkware',
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
    category: 'Home',
    tags: [{label: 'Home', variant: 'orange'}],
    imageKey: 'throw_',
    thumbnailFallback: 'L',
    selected: true,
  },
];

const LOW_STOCK_THRESHOLD = 25;

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
      <StackItem>
        <VStack width={40}>
          {thumbnailSrc ? (
            <AspectRatio ratio={1} fit="cover">
              <img src={thumbnailSrc} alt="" />
            </AspectRatio>
          ) : (
            <Center width={40} height={40} aria-hidden="true">
              <Text type="supporting" weight="bold">
                {row.thumbnailFallback}
              </Text>
            </Center>
          )}
        </VStack>
      </StackItem>
      <StackItem size="fill">
        <VStack gap={0}>
          <Text type="body" weight="bold">
            {row.name}
          </Text>
          <Text type="supporting" color="secondary">
            {row.meta}
          </Text>
        </VStack>
      </StackItem>
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(inventory.filter(row => row.selected).map(row => row.id)),
  );
  const lowStockCount = inventory.filter(
    row => row.available < LOW_STOCK_THRESHOLD,
  ).length;
  const categories = [
    ...new Set(inventory.flatMap(row => (row.category ? [row.category] : []))),
  ];
  const rows = inventory.filter(
    row =>
      (!query ||
        `${row.name} ${row.meta}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!category || row.category === category) &&
      (!location || row.location === location) &&
      (!tag || row.tags.some(value => value.label === tag)),
  );
  function selectRow(id: string, selected: boolean) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
  return (
    <Card padding={0}>
      <VStack gap={0}>
        <HStack hAlign="between" vAlign="center" padding={6}>
          <Heading level={2}>Inventory</Heading>
          <Button
            label="Add item"
            variant="primary"
            size="sm"
            icon={<Icon icon={Plus} size="sm" />}
          />
        </HStack>
        <Divider variant="subtle" />
        <ScrollableArea
          label="Inventory filters"
          axis="inline"
          paddingBlock={4}
          paddingInline={6}>
          <HStack gap={3} vAlign="center" hAlign="between">
            <HStack gap={2} vAlign="center">
              <TextInput
                label="Search inventory"
                isLabelHidden
                placeholder="Type and hit enter…"
                value={query}
                onChange={setQuery}
                startIcon={<Icon icon={Search} size="sm" />}
                width={240}
              />
              <HStack gap={2} wrap="wrap" vAlign="center">
                <Selector
                  label="Categories"
                  isLabelHidden
                  placeholder="Categories"
                  size="sm"
                  startIcon={<Icon icon={Folder} size="sm" />}
                  value={category}
                  hasClear
                  onChange={setCategory}
                  options={categories}
                  isDisabled={categories.length === 0}
                />
                <Selector
                  label="Locations"
                  isLabelHidden
                  placeholder="Locations"
                  size="sm"
                  startIcon={<Icon icon={MapPin} size="sm" />}
                  value={location}
                  hasClear
                  onChange={setLocation}
                  options={[...new Set(inventory.map(row => row.location))]}
                />
                <Selector
                  label="Tags"
                  isLabelHidden
                  placeholder="Tags"
                  size="sm"
                  startIcon={<Icon icon={Tag} size="sm" />}
                  value={tag}
                  hasClear
                  onChange={setTag}
                  options={[
                    ...new Set(
                      inventory.flatMap(row =>
                        row.tags.map(value => value.label),
                      ),
                    ),
                  ]}
                />
              </HStack>
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
        </ScrollableArea>
        {lowStockCount > 0 && (
          <VStack paddingInline={6} paddingBlockEnd={4}>
            <Banner
              status="warning"
              title={lowStockCount + ' items are running low'}
            />
          </VStack>
        )}
        <VStack paddingInline={6} paddingBlockEnd={2}>
          <Table<InventoryRow>
            data={rows}
            columns={[
              {
                key: 'select',
                header: '',
                width: pixel(64),
                renderCell: row => (
                  <CheckboxInput
                    label={'Select ' + row.name}
                    isLabelHidden
                    value={selectedIds.has(row.id)}
                    onChange={value => selectRow(row.id, value)}
                  />
                ),
              },
              {
                key: 'item',
                header: 'Item',
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
                width: pixel(64),
                align: 'end',
                renderCell: () => <ActionsCell />,
              },
            ]}
            density="spacious"
            dividers="rows"
            hasHover
          />
        </VStack>
      </VStack>
    </Card>
  );
}
