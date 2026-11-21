// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContainerCorners.stories.tsx
 * @input Card, Dialog, BottomSheet, Section, Table, List, and DropdownMenu
 * @output Stories where a full-bleed child meets, or stops short of, a
 *   rounded container corner, including corners a theme gives different radii
 * @position Storybook evidence for container corner geometry. The
 *   ContainerCorners Chromium spec reads these stories.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Card} from '@astryxdesign/core/Card';
import {Dialog} from '@astryxdesign/core/Dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu';
import {List, ListItem} from '@astryxdesign/core/List';
import {Section} from '@astryxdesign/core/Section';
import {Table} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {Theme, defineTheme} from '@astryxdesign/core/theme';

const meta: Meta = {
  title: 'Core/ContainerCorners',
  parameters: {layout: 'padded'},
};

export default meta;
type Story = StoryObj;

interface Order extends Record<string, unknown> {
  id: string;
  customer: string;
  item: string;
  quantity: string;
  warehouse: string;
  carrier: string;
  status: string;
  email: string;
  tracking: string;
}

const orders: Order[] = [
  {
    id: '1',
    customer: 'Alice Johnson',
    item: 'Standing desk',
    quantity: '1',
    warehouse: 'Oakland',
    carrier: 'Ground',
    status: 'Shipped',
    email: 'alice.johnson@example.com',
    tracking: '1Z999AA10123456784',
  },
  {
    id: '2',
    customer: 'Bob Martinez',
    item: 'Monitor arm',
    quantity: '2',
    warehouse: 'Reno',
    carrier: 'Express',
    status: 'Packing',
    email: 'bob.martinez@example.com',
    tracking: '1Z999AA10123456785',
  },
  {
    id: '3',
    customer: 'Chen Wei',
    item: 'Desk lamp',
    quantity: '4',
    warehouse: 'Oakland',
    carrier: 'Ground',
    status: 'Delivered',
    email: 'chen.wei@example.com',
    tracking: '1Z999AA10123456786',
  },
];

// Enough columns that the table scrolls inline in a narrow card, so its
// scroll region is a tab stop with a focus ring.
const orderColumns: TableColumn<Order>[] = [
  {key: 'customer', header: 'Customer'},
  {key: 'item', header: 'Item'},
  {key: 'quantity', header: 'Quantity'},
  {key: 'warehouse', header: 'Warehouse'},
  {key: 'carrier', header: 'Carrier'},
  {key: 'status', header: 'Status'},
  {key: 'email', header: 'Email'},
  {key: 'tracking', header: 'Tracking number'},
];

function OrdersTable() {
  return (
    <Table
      data={orders}
      columns={orderColumns}
      idKey="id"
      dividers="rows"
      density="compact"
      textOverflow="truncate"
      aria-label="Orders"
    />
  );
}

const rows = ['Inbox', 'Drafts', 'Sent', 'Archive'];

function BleedList() {
  return (
    <List edge="bleed" hasDividers>
      {rows.map(label => (
        <ListItem key={label} label={label} onClick={() => {}} />
      ))}
    </List>
  );
}

/** A table fills a Card and reaches all four of its corners. */
export const TableInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <OrdersTable />
      </Card>
    </div>
  ),
};

/**
 * Text sits above the table, so the card's top padding stays between the
 * table and the top corners: only the bottom corners are reached.
 */
export const TableAfterTextInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <Text>Open orders</Text>
        <OrdersTable />
      </Card>
    </div>
  ),
};

/** A Section is a square container: a table inside it reaches no corner. */
export const TableInSectionInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <Section>
          <OrdersTable />
        </Section>
      </Card>
    </div>
  ),
};

/**
 * A Dialog with no padding: the bleeding list's first and last rows touch
 * the dialog's corners.
 */
export const BleedListInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <BleedList />
    </Dialog>
  ),
};

/**
 * A Dialog with no padding: the bleeding list has a header, so the header
 * sits above the first row, and only the last row takes the dialog corners.
 */
export const BleedListWithHeaderInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <List edge="bleed" hasDividers header={<Text>Folders</Text>}>
        {rows.map(label => (
          <ListItem key={label} label={label} onClick={() => {}} />
        ))}
      </List>
    </Dialog>
  ),
};

/**
 * A Dialog with no padding, with the table between two lines of text: the
 * table reaches no corner, so it stays square.
 */
export const TableBetweenTextInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <Text>Open orders</Text>
      <OrdersTable />
      <Text>Three open orders.</Text>
    </Dialog>
  ),
};

/**
 * A Dialog with no padding, with the bleeding list inside a wrapper element
 * below a heading: the list is not the dialog's own child, so its rows stay
 * square.
 */
export const WrappedBleedListInDialog: Story = {
  render: () => (
    <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
      <Text>Folders</Text>
      <div>
        <BleedList />
      </div>
    </Dialog>
  ),
};

/**
 * The card's block padding is larger than its corner radius, so the
 * bleeding list's rows stay square.
 */
export const BleedListInCard: Story = {
  render: () => (
    <div style={{width: 360}}>
      <Card>
        <BleedList />
      </Card>
    </div>
  ),
};

/**
 * A table at the top of a bottom sheet starts below the grab bar's band, so it
 * reaches no corner and stays square.
 */
export const TableInBottomSheet: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Orders"
        height="hug">
        <OrdersTable />
        <Text>Three open orders.</Text>
      </BottomSheet>
    );
  },
};

/** A theme that rounds only a Card's top corners. */
const roundedTopCard = defineTheme({
  name: 'container-corners-rounded-top-card',
  components: {card: {base: {borderRadius: '12px 12px 0 0'}}},
});

/** A theme that rounds only a Card's start-start corner, written logically. */
const startCornerCard = defineTheme({
  name: 'container-corners-start-corner-card',
  components: {
    card: {base: {borderRadius: '0', borderStartStartRadius: '20px'}},
  },
});

/** A theme that rounds only a Dialog's bottom corners. */
const roundedBottomDialog = defineTheme({
  name: 'container-corners-rounded-bottom-dialog',
  components: {dialog: {base: {borderRadius: '0 0 16px 16px'}}},
});

/**
 * A theme gives the Card's corners different radii: the table that fills it
 * takes each corner as the card draws it.
 */
export const TableInCardWithRoundedTop: Story = {
  render: () => (
    <Theme theme={roundedTopCard} mode="light">
      <div style={{width: 360}}>
        <Card>
          <OrdersTable />
        </Card>
      </div>
    </Theme>
  ),
};

/**
 * The same Card's start-start corner, written as a logical corner, in a
 * right-to-left page: the table rounds the top-right corner, where the card
 * does.
 */
export const TableInCardWithStartCornerRtl: Story = {
  render: () => (
    <Theme theme={startCornerCard} mode="light">
      <div dir="rtl" style={{width: 360}}>
        <Card>
          <OrdersTable />
        </Card>
      </div>
    </Theme>
  ),
};

/**
 * A theme rounds only the Dialog's bottom corners: the first bleeding row
 * stays square and the last takes the bottom corners.
 */
export const BleedListInDialogWithRoundedBottom: Story = {
  render: () => (
    <Theme theme={roundedBottomDialog} mode="light">
      <Dialog isOpen isInline onOpenChange={() => {}} width={360} padding={0}>
        <BleedList />
      </Dialog>
    </Theme>
  ),
};

/** A theme that rounds only a muted Card, more than the default. */
const roundedMutedCard = defineTheme({
  name: 'container-corners-rounded-muted-card',
  components: {card: {'variant:muted': {borderRadius: '24px'}}},
});

/**
 * A default Card inside a Card the theme rounds more: the table that fills
 * the inner card takes the inner card's corners, not the outer card's.
 */
export const TableInDefaultCardInsideRoundedCard: Story = {
  render: () => (
    <Theme theme={roundedMutedCard} mode="light">
      <div style={{width: 400}}>
        <Card variant="muted">
          <Card>
            <OrdersTable />
          </Card>
        </Card>
      </div>
    </Theme>
  ),
};

/** A theme that rounds only a menu's bottom corners. */
const roundedBottomMenu = defineTheme({
  name: 'container-corners-rounded-bottom-menu',
  components: {'dropdown-menu': {base: {borderRadius: '0 0 12px 12px'}}},
});

/** A theme that gives a menu one radius at every corner. */
const roundedMenu = defineTheme({
  name: 'container-corners-rounded-menu',
  components: {'dropdown-menu': {base: {borderRadius: '12px'}}},
});

/** An open menu with each kind of row: item, checkbox, radio and sub-menu. */
function EveryRowMenu() {
  const [isChecked, setIsChecked] = useState(true);
  const [sort, setSort] = useState('newest');
  return (
    <DropdownMenu
      button={{label: 'Actions'}}
      isMenuOpen
      onOpenChange={() => {}}
      menuWidth={240}
      presentation="popover">
      <DropdownMenuItem label="Rename" />
      <DropdownMenuCheckboxItem
        label="Show archived"
        value={isChecked}
        onChange={setIsChecked}
      />
      <DropdownMenuRadioGroup value={sort} onChange={setSort} label="Sort by">
        <DropdownMenuRadioItem value="newest" label="Newest" />
        <DropdownMenuRadioItem value="oldest" label="Oldest" />
      </DropdownMenuRadioGroup>
      <DropdownMenuSubMenu label="Share">
        <DropdownMenuItem label="Copy link" />
      </DropdownMenuSubMenu>
    </DropdownMenu>
  );
}

/**
 * A theme rounds only the menu's bottom corners: every row, of each kind,
 * takes the menu's shape less its padding.
 */
export const MenuRowsWithRoundedBottom: Story = {
  render: () => (
    <Theme theme={roundedBottomMenu} mode="light">
      <EveryRowMenu />
    </Theme>
  ),
};

/** A theme gives the menu one radius: every row takes it less the padding. */
export const MenuRowsWithOneRadius: Story = {
  render: () => (
    <Theme theme={roundedMenu} mode="light">
      <EveryRowMenu />
    </Theme>
  ),
};

/** A theme that rounds only a menu's bottom-right corner. */
const roundedBottomRightMenu = defineTheme({
  name: 'container-corners-rounded-bottom-right-menu',
  components: {'dropdown-menu': {base: {borderRadius: '0 0 12px 0'}}},
});

/**
 * The menu rounds only its bottom-right corner, in a right-to-left page: each
 * row rounds the bottom-right corner too, where the menu does.
 */
export const MenuRowsWithRoundedBottomRightRtl: Story = {
  render: () => (
    <Theme theme={roundedBottomRightMenu} mode="light">
      <div dir="rtl">
        <EveryRowMenu />
      </div>
    </Theme>
  ),
};

/** A theme that rounds only a Card's top-left corner, written physically. */
const topLeftCard = defineTheme({
  name: 'container-corners-top-left-card',
  components: {card: {base: {borderRadius: '12px 0 0 0'}}},
});

/**
 * A physical corner in a right-to-left page: the table rounds the top-left
 * corner, where the card does.
 */
export const TableInCardWithTopLeftRtl: Story = {
  render: () => (
    <Theme theme={topLeftCard} mode="light">
      <div dir="rtl" style={{width: 360}}>
        <Card>
          <OrdersTable />
        </Card>
      </div>
    </Theme>
  ),
};
