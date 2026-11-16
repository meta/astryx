// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  VStack,
  HStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {List, ListItem} from '@astryxdesign/core/List';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import type {StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Banner} from '@astryxdesign/core/Banner';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Token} from '@astryxdesign/core/Token';
import {useToast} from '@astryxdesign/core/Toast';
import {rtlStyles} from '@astryxdesign/core/utils';
import {
  useAnnounce,
  useClipboard,
  useMediaQuery,
} from '@astryxdesign/core/hooks';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// Types
type OrderStatus = 'delivered' | 'shipped' | 'processing' | 'refunded';
type LookupKind = 'order' | 'email' | 'any';

interface OrderEvent {
  at: string;
  label: string;
}

interface OrderRecord {
  id: string;
  customer: string;
  email: string;
  status: OrderStatus;
  total: string;
  items: number;
  placed: string;
  carrier: string;
  warning?: string;
  events: OrderEvent[];
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  delivered: 'Delivered',
  shipped: 'Shipped',
  processing: 'Processing',
  refunded: 'Refunded',
};

const STATUS_DOT: Record<OrderStatus, StatusDotVariant> = {
  delivered: 'success',
  shipped: 'accent',
  processing: 'warning',
  refunded: 'neutral',
};

const KIND_OPTIONS = [
  {value: 'order', label: 'Order ID'},
  {value: 'email', label: 'Customer email'},
  {value: 'any', label: 'Anything'},
];

// Mock data: orders a support or operations team might look up
const ORDERS: OrderRecord[] = [
  {
    id: 'ORD-10482',
    customer: 'Priya Shah',
    email: 'priya.shah@example.com',
    status: 'delivered',
    total: '$128.40',
    items: 3,
    placed: '2025-07-02T14:20:00Z',
    carrier: 'Northline Freight',
    events: [
      {at: '2025-07-02T14:20:00Z', label: 'Order placed'},
      {at: '2025-07-03T09:05:00Z', label: 'Shipped'},
      {at: '2025-07-05T16:40:00Z', label: 'Delivered'},
    ],
  },
  {
    id: 'ORD-10519',
    customer: 'Daniel Kim',
    email: 'daniel.kim@example.com',
    status: 'shipped',
    total: '$54.00',
    items: 1,
    placed: '2025-07-06T10:12:00Z',
    carrier: 'Coastal Parcel',
    events: [
      {at: '2025-07-06T10:12:00Z', label: 'Order placed'},
      {at: '2025-07-07T08:30:00Z', label: 'Shipped'},
    ],
  },
  {
    id: 'ORD-10533',
    customer: 'Maria Lopez',
    email: 'maria.lopez@example.com',
    status: 'processing',
    total: '$212.75',
    items: 4,
    placed: '2025-07-07T18:45:00Z',
    carrier: 'Not assigned',
    warning: 'Payment is still being verified.',
    events: [{at: '2025-07-07T18:45:00Z', label: 'Order placed'}],
  },
  {
    id: 'ORD-10547',
    customer: 'Tom Becker',
    email: 'tom.becker@example.com',
    status: 'refunded',
    total: '$89.99',
    items: 2,
    placed: '2025-06-28T12:00:00Z',
    carrier: 'Northline Freight',
    events: [
      {at: '2025-06-28T12:00:00Z', label: 'Order placed'},
      {at: '2025-06-29T09:10:00Z', label: 'Shipped'},
      {at: '2025-07-01T15:20:00Z', label: 'Returned'},
      {at: '2025-07-02T11:00:00Z', label: 'Refunded'},
    ],
  },
  {
    id: 'ORD-10561',
    customer: 'Aisha Noor',
    email: 'aisha.noor@example.com',
    status: 'delivered',
    total: '$36.20',
    items: 1,
    placed: '2025-07-01T07:30:00Z',
    carrier: 'Coastal Parcel',
    events: [
      {at: '2025-07-01T07:30:00Z', label: 'Order placed'},
      {at: '2025-07-01T17:00:00Z', label: 'Shipped'},
      {at: '2025-07-03T13:15:00Z', label: 'Delivered'},
    ],
  },
  {
    id: 'ORD-10574',
    customer: 'Leo Martin',
    email: 'leo.martin@example.com',
    status: 'shipped',
    total: '$412.00',
    items: 6,
    placed: '2025-07-05T20:05:00Z',
    carrier: 'Northline Freight',
    events: [
      {at: '2025-07-05T20:05:00Z', label: 'Order placed'},
      {at: '2025-07-06T14:00:00Z', label: 'Shipped'},
    ],
  },
  {
    id: 'ORD-10588',
    customer: 'Grace Hill',
    email: 'grace.hill@example.com',
    status: 'delivered',
    total: '$74.50',
    items: 2,
    placed: '2025-06-30T09:40:00Z',
    carrier: 'Coastal Parcel',
    events: [
      {at: '2025-06-30T09:40:00Z', label: 'Order placed'},
      {at: '2025-07-01T10:00:00Z', label: 'Shipped'},
      {at: '2025-07-02T18:30:00Z', label: 'Delivered'},
    ],
  },
  {
    id: 'ORD-10592',
    customer: 'Omar Rahman',
    email: 'omar.rahman@example.com',
    status: 'processing',
    total: '$158.00',
    items: 3,
    placed: '2025-07-08T08:15:00Z',
    carrier: 'Not assigned',
    events: [{at: '2025-07-08T08:15:00Z', label: 'Order placed'}],
  },
  {
    id: 'ORD-10603',
    customer: 'Priya Shah',
    email: 'priya.shah@example.com',
    status: 'shipped',
    total: '$22.00',
    items: 1,
    placed: '2025-07-08T11:50:00Z',
    carrier: 'Coastal Parcel',
    events: [
      {at: '2025-07-08T11:50:00Z', label: 'Order placed'},
      {at: '2025-07-09T07:45:00Z', label: 'Shipped'},
    ],
  },
];

// The records a query matches: exact matches on the chosen field first, then
// partial matches, ranked by where the query appears.
function findOrders(query: string, kind: LookupKind): OrderRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const fields = (order: OrderRecord) =>
    kind === 'order'
      ? [order.id]
      : kind === 'email'
        ? [order.email]
        : [order.id, order.email, order.customer];
  const exact = ORDERS.filter(order =>
    fields(order).some(f => f.toLowerCase() === q),
  );
  if (exact.length === 1 && kind === 'order') {
    return exact;
  }
  const rest = ORDERS.filter(order => !exact.includes(order))
    .map(order => ({
      order,
      at: Math.min(
        ...fields(order).map(f => {
          const i = f.toLowerCase().indexOf(q);
          return i < 0 ? Infinity : i;
        }),
      ),
    }))
    .filter(x => x.at !== Infinity)
    .sort((a, b) => a.at - b.at || a.order.id.localeCompare(b.order.id))
    .map(x => x.order);
  return [...exact, ...rest];
}

const LOOKUP_DELAY_MS = 400;

export default function RecordLookupTemplate() {
  const showToast = useToast();
  const {copy} = useClipboard();
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const [kind, setKind] = useState<LookupKind>('order');
  const [query, setQuery] = useState('');
  // The submitted lookup; null before the first one.
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [results, setResults] = useState<OrderRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [recent, setRecent] = useState<
    ReadonlyArray<{query: string; kind: LookupKind}>
  >([
    {query: 'ORD-10519', kind: 'order'},
    {query: 'maria.lopez@example.com', kind: 'email'},
  ]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useAnnounce();
  const panelId = useId();

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  // A short delay stands in for the request a real lookup makes.
  const lookUp = (value: string, lookupKind: LookupKind = kind) => {
    const q = value.trim();
    if (!q) {
      return;
    }
    setQuery(q);
    setKind(lookupKind);
    setSubmitted(q);
    setIsLooking(true);
    setSelectedId(null);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      const found = findOrders(q, lookupKind);
      setResults(found);
      setSelectedId(found.length === 1 ? found[0].id : null);
      setTab('overview');
      setIsLooking(false);
      // The not-found state announces itself; only a result count is said here.
      if (found.length > 0) {
        announce(`${found.length} found for ${q}`);
      }
      if (found.length > 0) {
        setRecent(prev =>
          [
            {query: q, kind: lookupKind},
            ...prev.filter(r => r.query.toLowerCase() !== q.toLowerCase()),
          ].slice(0, 4),
        );
      }
    }, LOOKUP_DELAY_MS);
  };

  const clear = () => {
    setQuery('');
    setSubmitted(null);
    setResults([]);
    setSelectedId(null);
  };

  const selected = results.find(order => order.id === selectedId) ?? null;

  const selector = (
    <Selector
      label="Look up by"
      size="lg"
      options={KIND_OPTIONS}
      value={kind}
      onChange={value => {
        setKind(value as LookupKind);
        if (submitted !== null) {
          lookUp(query, value as LookupKind);
        }
      }}
    />
  );
  const field = (
    <TextInput
      label={
        kind === 'order'
          ? 'Order ID'
          : kind === 'email'
            ? 'Customer email'
            : 'Order, email or name'
      }
      type="search"
      enterKeyHint="search"
      size="lg"
      placeholder={kind === 'order' ? 'ORD-10482' : 'Search'}
      startIcon={MagnifyingGlassIcon}
      value={query}
      onChange={setQuery}
      onEnter={() => lookUp(query)}
    />
  );
  const submit = (
    <Button
      label="Look up"
      variant="primary"
      size="lg"
      isDisabled={query.trim() === ''}
      onClick={() => lookUp(query)}
    />
  );
  const searchBar = isNarrow ? (
    <VStack gap={2}>
      {selector}
      {field}
      {submit}
    </VStack>
  ) : (
    <HStack gap={2} vAlign="end">
      {selector}
      <StackItem size="fill">{field}</StackItem>
      {submit}
    </HStack>
  );

  const detail = selected && (
    <VStack gap={4}>
      {selected.warning && (
        <Banner status="warning" title={selected.warning} collapsible={false} />
      )}
      <Card padding={5}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={2}>{selected.id}</Heading>
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={STATUS_DOT[selected.status]}
                label={STATUS_LABEL[selected.status]}
              />
              <Text type="body">{STATUS_LABEL[selected.status]}</Text>
            </HStack>
          </VStack>
          <HStack gap={2} vAlign="center">
            <Button
              label="Copy ID"
              variant="secondary"
              icon={<Icon icon={DocumentDuplicateIcon} />}
              isIconOnly={isNarrow}
              onClick={() =>
                void copy(selected.id).then(copied =>
                  showToast({
                    body: copied
                      ? `Copied ${selected.id}`
                      : `Could not copy ${selected.id}`,
                    uniqueID: `copy-${selected.id}`,
                  }),
                )
              }
            />
            <Button
              label="Open full record"
              variant="secondary"
              isIconOnly={isNarrow}
              icon={
                <Icon
                  icon={ArrowTopRightOnSquareIcon}
                  xstyle={rtlStyles.mirror}
                />
              }
              onClick={() =>
                // Demo only: replace this toast with a link to the record.
                showToast({
                  body: `Demo: ${selected.id} would open in its own page`,
                  uniqueID: `open-${selected.id}`,
                })
              }
            />
          </HStack>
          {/* The tabs swap a panel in place, so they use the tabs pattern. */}
          <TabList value={tab} onChange={setTab} hasDivider role="tablist">
            {[
              {value: 'overview', label: 'Overview'},
              {value: 'activity', label: 'Activity'},
              {value: 'raw', label: 'Raw'},
            ].map(t => (
              <Tab
                key={t.value}
                id={`${panelId}-tab-${t.value}`}
                value={t.value}
                label={t.label}
                panelId={panelId}
              />
            ))}
          </TabList>
          <VStack
            gap={0}
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-tab-${tab}`}>
            {tab === 'overview' && (
              <MetadataList columns={isNarrow ? 'single' : 'multi'}>
                <MetadataListItem label="Customer">
                  {selected.customer}
                </MetadataListItem>
                <MetadataListItem label="Email">
                  {selected.email}
                </MetadataListItem>
                <MetadataListItem label="Total">
                  {selected.total}
                </MetadataListItem>
                <MetadataListItem label="Items">
                  {String(selected.items)}
                </MetadataListItem>
                <MetadataListItem label="Placed">
                  <Timestamp value={selected.placed} format="date_time" />
                </MetadataListItem>
                <MetadataListItem label="Carrier">
                  {selected.carrier}
                </MetadataListItem>
              </MetadataList>
            )}
            {tab === 'activity' && (
              <List density="compact" hasDividers>
                {[...selected.events].reverse().map(event => (
                  <ListItem
                    key={event.at + event.label}
                    label={event.label}
                    endContent={
                      <Timestamp value={event.at} format="date_time" />
                    }
                  />
                ))}
              </List>
            )}
            {tab === 'raw' && (
              <CodeBlock
                code={JSON.stringify(selected, null, 2)}
                language="json"
                width="100%"
              />
            )}
          </VStack>
        </VStack>
      </Card>
    </VStack>
  );

  const matches = (
    <List header={`${results.length} matches`} hasDividers>
      {results.map(order => (
        <ListItem
          key={order.id}
          itemKey={order.id}
          label={order.id}
          description={`${order.customer} · ${order.total}`}
          isSelected={order.id === selectedId}
          startContent={
            <StatusDot
              variant={STATUS_DOT[order.status]}
              label={STATUS_LABEL[order.status]}
            />
          }
          onClick={() => {
            setSelectedId(order.id);
            setTab('overview');
          }}
        />
      ))}
    </List>
  );

  let body;
  if (isLooking) {
    body = <Spinner size="lg" label={`Looking up “${submitted}”`} />;
  } else if (submitted === null) {
    body = (
      <EmptyState
        icon={<Icon icon={MagnifyingGlassIcon} size="lg" />}
        title="Look up an order"
        description="Enter an order ID, or search by customer email or name."
        actions={
          recent.length > 0 ? (
            <VStack gap={2} hAlign="center">
              <Text type="supporting" color="secondary">
                Recent lookups
              </Text>
              {recent.map(r => (
                <Button
                  key={r.query}
                  label={r.query}
                  variant="secondary"
                  size="sm"
                  onClick={() => lookUp(r.query, r.kind)}
                />
              ))}
            </VStack>
          ) : undefined
        }
      />
    );
  } else if (results.length === 0) {
    body = (
      <EmptyState
        title={`No order matches “${submitted}”`}
        description="Check the ID, or change “Look up by” to search by email or name."
        actions={
          <Button
            label="Clear"
            variant="secondary"
            icon={<Icon icon={XMarkIcon} />}
            onClick={clear}
          />
        }
      />
    );
  } else if (results.length === 1 || (isNarrow && selected)) {
    body = (
      <VStack gap={3}>
        {results.length > 1 && (
          <Button
            label="Back to matches"
            variant="ghost"
            icon={<Icon icon={ArrowLeftIcon} xstyle={rtlStyles.mirror} />}
            onClick={() => setSelectedId(null)}
          />
        )}
        {detail}
      </VStack>
    );
  } else if (isNarrow) {
    body = matches;
  } else {
    body = (
      <HStack gap={6} vAlign="start">
        <VStack width={320}>{matches}</VStack>
        <StackItem size="fill">
          {detail ?? (
            <EmptyState
              isCompact
              title="Pick a match"
              description="Its details show here."
            />
          )}
        </StackItem>
      </HStack>
    );
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={3}>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Heading level={1}>Order lookup</Heading>
              </StackItem>
              {submitted !== null && !isLooking && (
                <>
                  <Token label={`${results.length} found`} size="sm" />
                  <Button
                    label="Clear"
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={XMarkIcon} />}
                    onClick={clear}
                  />
                </>
              )}
            </HStack>
            {searchBar}
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" padding={isNarrow ? 4 : 6}>
          {body}
        </LayoutContent>
      }
    />
  );
}
