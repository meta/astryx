// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Four kinds of financial account on one page, each in a collapsible Card with
 * a table of its own — because a credit card and a checking account do not
 * share a column grid.
 *
 * This is the grouping shape for heterogeneous records. `useTableGroupedRows`
 * is the right tool when every group is the same kind of thing and grouping is
 * just a sort you can collapse: issues by status, orders by month, rows by
 * owner. One table, one header, section rows in between. It is the wrong tool
 * the moment the groups stop agreeing on what the columns mean. Utilization is
 * a credit-card idea, pending payout is a processor idea, and cost basis is an
 * investment idea; forcing all three into one grid produces a table that is
 * mostly em-dashes, with a header row that is true of no row beneath it.
 *
 * So each group owns a table. The Card supplies the boundary the shared header
 * row used to supply, and the Collapsible trigger carries the group's name,
 * count, and running total, so a collapsed group still answers the question
 * most people came for.
 *
 * The `table-grouped` template is the other half of this pair: one collection
 * of like rows, split into collapsible sections that all share a column set.
 * Reach for that one when the rows agree and this one when they do not.
 *
 * ## Extending this template
 *
 * **The test for splitting is column divergence, not group count.** Two groups
 * with different columns belong in separate tables; twelve groups with
 * identical columns belong in one table with the plugin. If you find yourself
 * adding a column that only applies to some groups and writing a fallback dash
 * for the rest, that is the signal to split. Conversely, if these four tables
 * ever converge on the same columns, collapse them back — this layout costs a
 * Card and a header per group, and that is only worth paying for real
 * structural difference.
 *
 * **Each table is data-driven, and that is the payoff.** Because the groups are
 * separate tables, every one of them can use `data` + `columns` with
 * `renderCell`, which is the RSC-friendly path and the one that gets headers,
 * widths, and plugins for free. The single-table version of this page has to
 * drop to children mode to emit section rows, and loses all of that.
 *
 * **What the four tables do share, they share by position.** Every table runs
 * name → qualifier → figures → change, on the same column widths, so the eye
 * can travel straight down the page across four different schemas. That is the
 * whole reason Utilization sits ahead of Balance rather than after it.
 *
 * **The trigger is a button, so it holds no buttons.** Group name, count, and
 * total are text and icons only. Per-account actions live in the rows, and
 * anything that acts on a whole group belongs in the page header rather than
 * inside the trigger — nesting a control inside the trigger makes the click
 * target ambiguous and is invalid HTML besides.
 *
 * **Open state is controlled, not `defaultIsOpen`.** The page owns a Set of
 * open group ids, which is what lets Expand all / Collapse all work and what
 * you would persist per user. Uncontrolled Collapsibles are fine for a static
 * FAQ; they cannot participate in a page-level control.
 *
 * **Money is stored in cents.** Every amount is an integer and only the display
 * step formats, so group totals and the header's net position stay exact. Net
 * position deliberately subtracts card balances — it is a derived figure, never
 * a stored one, so adding an account updates it with no other edit.
 *
 * **One time range drives the whole page.** The selector under the chart is
 * page state, not chart state: the Change column, every detail chart, and the
 * header's delta all read it from context. A page where the chart says "3M"
 * and the table says something else is a page with two different answers to
 * the same question.
 */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Icon} from '@astryxdesign/core/Icon';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Token} from '@astryxdesign/core/Token';
import {
  Table,
  pixel,
  proportional,
  useTableRowExpansion,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortComparator} from '@astryxdesign/core/Table';
import {
  ArrowsRightLeftIcon,
  BuildingLibraryIcon,
  CreditCardIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';

// ============= SHARED VOCABULARY =============

/** Everything the page-level machinery needs from a row, whatever group it is
 * in: an id to key its history by, and the drift that history follows. */
interface AccountRecord extends Record<string, unknown> {
  id: string;
  /** Direction and strength of the account's drift, as a daily fraction. Feeds
   * the generated history, so an account's chart and its Change agree. */
  trend: number;
}

// Pinned locale keeps the rendered output identical in every environment.
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function money(cents: number): string {
  return currency.format(cents / 100);
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/**
 * Every numeric cell on the page. Alignment is deliberately not its job: the
 * column's `align: 'end'` puts a `text-align` on the `<th>` as well as the
 * `<td>`, so the header travels with its figures instead of hugging the far
 * side of them. Doing it in the cell would right-align the numbers and leave
 * the header behind. All this adds is tabular digits, so a column of money
 * lines up digit for digit.
 *
 * There is no muted variant. A figure in a table is a value, and values are
 * primary text — the de-emphasis that used to sit on the comparison columns
 * made them read as annotations on the column beside them rather than as
 * numbers in their own right.
 */
function Figure({children}: {children: string}) {
  return <Text hasTabularNumbers>{children}</Text>;
}

// ============= TIME RANGE =============

const RANGE_IDS = ['1W', '1M', '3M', 'YTD', '1Y'] as const;
type RangeId = (typeof RANGE_IDS)[number];

/** Pinned so the generated series, the axis labels and the "as of" dates are
 * the same on every render and in every environment. */
const TODAY = Date.UTC(2025, 8, 30);

const RANGE_DAYS: Record<RangeId, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  // Days elapsed in the pinned year, so YTD means what it says on this date.
  YTD: 273,
  '1Y': 365,
};

/**
 * The selected window, read by the Change column and by every detail chart.
 * Context rather than prop-drilling because the readers are cells — four
 * column definitions deep, in four separate tables, none of which the page
 * renders directly.
 */
const RangeContext = createContext<RangeId>('YTD');
const useRange = () => useContext(RangeContext);

const SERIES_DAYS = RANGE_DAYS['1Y'];

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(daysAgo: number): string {
  const date = new Date(TODAY);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return dayFormat.format(date);
}

/** FNV-1a over the account id, so each account's walk is its own but stable. */
function seedFrom(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A year of daily values ending at the account's current figure.
 *
 * Built backwards from today so the last point is always the real number on
 * the row — the alternative is a series that drifts to something close to it
 * and a table that disagrees with its own chart. xorshift rather than
 * `Math.random` because a template that renders differently on the server and
 * the client is a hydration error waiting to happen.
 */
function historyFor<T extends AccountRecord>(
  rows: T[],
  pick: (row: T) => number,
  volatility: number,
): Array<[string, number[]]> {
  return rows.map(row => {
    let state = seedFrom(row.id) || 1;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 10000) / 10000 - 0.5;
    };

    const series = new Array<number>(SERIES_DAYS);
    let value = pick(row);
    series[SERIES_DAYS - 1] = value;
    for (let day = SERIES_DAYS - 2; day >= 0; day--) {
      value /= 1 + row.trend + random() * volatility;
      series[day] = Math.max(1, Math.round(value));
    }
    return [row.id, series];
  });
}

function windowOf(id: string, range: RangeId): number[] {
  return HISTORY[id].slice(-RANGE_DAYS[range]);
}

/**
 * The Change column is a percentage, not an amount. Four groups whose headline
 * figures span two orders of magnitude cannot be compared in dollars — a
 * $5,000 move is most of a vendor card and a rounding error on the treasury
 * sweep. A percentage is the one form of "how much did this move" that means
 * the same thing in every one of these tables, which is what makes it worth a
 * column in all four.
 */
function changePercentOf(id: string, range: RangeId): number {
  const points = windowOf(id, range);
  const start = points[0];
  if (start === 0) {
    return 0;
  }
  return ((points[points.length - 1] - start) / Math.abs(start)) * 100;
}

const percentFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// ============= CHART VOCABULARY =============

const UP_COLOR = 'var(--color-data-categorical-green, #0B991F)';
const DOWN_COLOR = 'var(--color-data-categorical-red, #F5394F)';
const GRID_COLOR = 'var(--color-border, rgba(5, 54, 89, 0.1))';
// Text tokens rather than the categorical pair the charts stroke with: these
// carry text contrast, which a 12px label needs and a 1.5px line does not.
const TEXT_UP_COLOR = 'var(--color-text-green, #0B991F)';
const TEXT_DOWN_COLOR = 'var(--color-text-red, #F5394F)';
const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: 'var(--color-text-secondary, #4E606F)',
};

/** Tooltips and readouts have no room for cents. */
const wholeCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Five evenly spaced dates, whether the window is a week or a year. */
function axisTicks(count: number): number[] {
  const stops = Math.min(5, count);
  if (stops < 2) {
    return [0];
  }
  return Array.from({length: stops}, (_, stop) =>
    Math.round((stop * (count - 1)) / (stops - 1)),
  );
}

/**
 * The width of the box the cards are laid out in, tracked as it changes.
 *
 * A media query answers a question about the window, and this template is not
 * always the window: the docsite preview puts it in a dialog and the catalog
 * draws it through `scale(0.5)`. Both leave `matchMedia` describing a viewport
 * the cards cannot see. `@container` asks the right question, but its answer
 * never leaves CSS and what changes here is the column *list*, which only
 * React can do — so the box is measured.
 *
 * `offsetWidth` for the first read rather than `getBoundingClientRect`: the
 * observer reports the box as laid out and ignores an ancestor transform,
 * while the rect bakes it in, so mixing the two under the catalog's scale
 * opens at half the real width and corrects an instant later.
 */
function useSurfaceWidth() {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    setWidth(node.offsetWidth);

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Below this the widest table — credit cards, carrying three money columns
 * and a change — has less room than its fixed widths ask for, and every table
 * switches together so the four cards stay legible as one page rather than
 * four differently-shaped ones.
 */
const COMPACT_BELOW_PX = 720;

/**
 * Every column the compact layout drops, folded into the one that survives:
 * the figure the group is headlined by, and beneath it the direction and size
 * of its move. The arrow states the sign that the colour also states, so the
 * cell still reads where the colour does not.
 */
function CompactValueCell({
  id,
  amountCents,
  isLiability,
}: {
  id: string;
  amountCents: number;
  isLiability?: boolean;
}) {
  const range = useRange();
  const percent = changePercentOf(id, range);
  const isUp = percent >= 0;
  const isGood = isLiability ? !isUp : isUp;
  return (
    <VStack gap={0} hAlign="end">
      <Figure>{money(amountCents)}</Figure>
      {/* Colour on the row so the icon and the figure inherit one value,
          rather than being told the same thing twice — Text has no success
          or error of its own to be told with. */}
      <HStack
        gap={0.5}
        vAlign="center"
        xstyle={styles.delta(isGood ? TEXT_UP_COLOR : TEXT_DOWN_COLOR)}>
        <Icon
          icon={isUp ? 'arrowUp' : 'arrowDown'}
          size="xsm"
          color="inherit"
        />
        <Text type="supporting" color="inherit">
          {percentFormat.format(Math.abs(percent))}%
        </Text>
      </HStack>
    </VStack>
  );
}

function ChangeCell({id, isLiability}: {id: string; isLiability?: boolean}) {
  const range = useRange();
  const percent = changePercentOf(id, range);
  const isUp = percent >= 0;
  const isGood = isLiability ? !isUp : isUp;
  return (
    // A Token is a flex box and fills the cell, so `text-align` from the
    // column's align cannot place it — the row does that here instead.
    <HStack hAlign="end">
      <Token
        size="sm"
        color={isGood ? 'green' : 'red'}
        label={`${isUp ? '+' : '−'}${percentFormat.format(Math.abs(percent))}%`}
      />
    </HStack>
  );
}

// ============= GROUP 1 — BANK ACCOUNTS =============

interface BankAccount extends AccountRecord {
  name: string;
  institution: string;
  mask: string;
  kind: 'Checking' | 'Savings' | 'Money market';
  availableCents: number;
}

const BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank-1',
    name: 'Operating',
    institution: 'First Meridian Bank',
    mask: '••4417',
    kind: 'Checking',
    availableCents: 84_215_600,
    trend: 0.00022,
  },
  {
    id: 'bank-2',
    name: 'Payroll',
    institution: 'First Meridian Bank',
    mask: '••8830',
    kind: 'Checking',
    availableCents: 21_940_800,
    trend: 0.00004,
  },
  {
    id: 'bank-3',
    name: 'Tax reserve',
    institution: 'Harborline Credit Union',
    mask: '••1265',
    kind: 'Savings',
    availableCents: 47_500_000,
    trend: 0.00009,
  },
  {
    id: 'bank-4',
    name: 'Treasury sweep',
    institution: 'Northgate Financial',
    mask: '••7702',
    kind: 'Money market',
    availableCents: 132_800_000,
    trend: 0.00033,
  },
];

const bankColumns: TableColumn<BankAccount>[] = [
  {
    key: 'name',
    sortable: true,
    header: 'Account',
    width: proportional(2),
    renderCell: account => (
      <VStack gap={0}>
        <Text>{account.name}</Text>
        <Text type="supporting">
          {account.institution} · {account.mask}
        </Text>
      </VStack>
    ),
  },
  {
    key: 'kind',
    sortable: true,
    header: 'Type',
    width: pixel(150),
    renderCell: account => <Text>{account.kind}</Text>,
  },
  {
    key: 'available',
    sortable: true,
    header: 'Available',
    width: pixel(150),
    align: 'end',
    renderCell: account => <Figure>{money(account.availableCents)}</Figure>,
  },
  {
    key: 'change',
    sortable: true,
    header: 'Change',
    width: pixel(110),
    align: 'end',
    renderCell: account => <ChangeCell id={account.id} />,
  },
];

// The name cell is reused rather than restated, so the two layouts cannot
// drift apart in the one column they share.
const bankCompactColumns: TableColumn<BankAccount>[] = [
  bankColumns[0],
  {
    key: 'available',
    sortable: true,
    header: 'Available',
    width: pixel(150),
    align: 'end',
    renderCell: account => (
      <CompactValueCell id={account.id} amountCents={account.availableCents} />
    ),
  },
];

const bankComparators: Partial<
  Record<string, TableSortComparator<BankAccount>>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  kind: (a, b) => a.kind.localeCompare(b.kind),
  available: (a, b) => a.availableCents - b.availableCents,
};

// ============= GROUP 2 — CREDIT CARDS =============

interface CreditCardAccount extends AccountRecord {
  name: string;
  issuer: string;
  mask: string;
  balanceCents: number;
  limitCents: number;
}

const CREDIT_CARDS: CreditCardAccount[] = [
  {
    id: 'card-1',
    name: 'Corporate — Engineering',
    issuer: 'Meridian Business Card',
    mask: '••2041',
    balanceCents: 4_182_300,
    limitCents: 15_000_000,
    trend: 0.00042,
  },
  {
    id: 'card-2',
    name: 'Corporate — Travel',
    issuer: 'Meridian Business Card',
    mask: '••6688',
    balanceCents: 9_640_500,
    limitCents: 12_000_000,
    trend: 0.00071,
  },
  {
    id: 'card-3',
    name: 'Vendor payments',
    issuer: 'Northgate Commercial',
    mask: '••3319',
    balanceCents: 1_205_000,
    limitCents: 25_000_000,
    trend: -0.00018,
  },
];

/**
 * Bar and reading on one line, because they are one fact. ProgressBar's own
 * `hasValueLabel` stacks the number above the track, which costs a second row
 * in every card row and leaves the widest column on the page mostly empty; the
 * component's guidance is to compose the reading alongside instead.
 *
 * Neutral, and neutral for all three. Colour-coding utilization turns a
 * measurement into a verdict, and the thresholds that verdict needs are a
 * policy this page does not have — 80% on a card kept deliberately near its
 * limit is not the same event as 80% on one that is usually idle. Neutral over
 * accent for the same reason one step further on: the accent is the page's
 * emphasis colour, and there is nothing here to emphasise. The number is right
 * beside the bar.
 */
function UtilizationCell({card}: {card: CreditCardAccount}) {
  const percent = Math.round((card.balanceCents / card.limitCents) * 100);
  return (
    <HStack gap={2} vAlign="center">
      <StackItem size="fill">
        <ProgressBar
          label={`${card.name} utilization`}
          isLabelHidden
          value={percent}
          variant="neutral"
        />
      </StackItem>
      <Text hasTabularNumbers>{percent}%</Text>
    </HStack>
  );
}

const creditCardColumns: TableColumn<CreditCardAccount>[] = [
  {
    key: 'name',
    sortable: true,
    header: 'Card',
    width: proportional(2),
    renderCell: card => (
      <VStack gap={0}>
        <Text>{card.name}</Text>
        <Text type="supporting">
          {card.issuer} · {card.mask}
        </Text>
      </VStack>
    ),
  },
  // Utilization sits where every other group puts its qualifier — bank's type,
  // the processor's merchant id — so the money columns start at the same place
  // in all four tables and the eye can run straight down the page.
  {
    key: 'utilization',
    sortable: true,
    header: 'Utilization',
    width: pixel(150),
    renderCell: card => <UtilizationCell card={card} />,
  },
  {
    key: 'balance',
    sortable: true,
    header: 'Balance',
    width: pixel(150),
    align: 'end',
    renderCell: card => <Figure>{money(card.balanceCents)}</Figure>,
  },
  {
    key: 'limit',
    sortable: true,
    header: 'Limit',
    width: pixel(150),
    align: 'end',
    renderCell: card => <Figure>{money(card.limitCents)}</Figure>,
  },
  {
    key: 'change',
    sortable: true,
    header: 'Change',
    width: pixel(110),
    align: 'end',
    // The only group whose Change column is read inversely: a balance that
    // grew is a debt that grew.
    renderCell: card => <ChangeCell id={card.id} isLiability />,
  },
];

const creditCardCompactColumns: TableColumn<CreditCardAccount>[] = [
  creditCardColumns[0],
  {
    key: 'balance',
    sortable: true,
    header: 'Balance',
    width: pixel(150),
    align: 'end',
    renderCell: card => (
      <CompactValueCell
        id={card.id}
        amountCents={card.balanceCents}
        isLiability
      />
    ),
  },
];

const creditCardComparators: Partial<
  Record<string, TableSortComparator<CreditCardAccount>>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  // Utilization is a ratio, not a balance — sorting it by balance would put a
  // maxed-out small card below a barely-touched large one.
  utilization: (a, b) =>
    a.balanceCents / a.limitCents - b.balanceCents / b.limitCents,
  balance: (a, b) => a.balanceCents - b.balanceCents,
  limit: (a, b) => a.limitCents - b.limitCents,
};

// ============= GROUP 3 — PAYMENT PROCESSORS =============

interface ProcessorAccount extends AccountRecord {
  name: string;
  merchantId: string;
  pendingPayoutCents: number;
  feesMtdCents: number;
}

const PROCESSORS: ProcessorAccount[] = [
  {
    id: 'proc-1',
    name: 'Stripe',
    merchantId: 'acct_1Qf82LmR',
    pendingPayoutCents: 18_442_900,
    feesMtdCents: 612_400,
    trend: 0.00058,
  },
  {
    id: 'proc-2',
    name: 'PayPal Commerce',
    merchantId: 'MRC-88214-XT',
    pendingPayoutCents: 3_218_650,
    feesMtdCents: 148_900,
    trend: -0.00024,
  },
  {
    id: 'proc-3',
    name: 'Adyen',
    merchantId: 'AD-NORTHWIND-01',
    pendingPayoutCents: 7_905_100,
    feesMtdCents: 233_050,
    trend: 0.00031,
  },
];

const processorColumns: TableColumn<ProcessorAccount>[] = [
  {
    key: 'name',
    sortable: true,
    header: 'Processor',
    width: proportional(2),
    renderCell: processor => (
      <VStack gap={0}>
        <Text>{processor.name}</Text>
        <Text type="supporting">{processor.merchantId}</Text>
      </VStack>
    ),
  },
  {
    key: 'pendingPayout',
    sortable: true,
    header: 'Pending payout',
    width: pixel(150),
    align: 'end',
    renderCell: processor => (
      <Figure>{money(processor.pendingPayoutCents)}</Figure>
    ),
  },
  {
    key: 'feesMtd',
    sortable: true,
    header: 'Fees (MTD)',
    width: pixel(150),
    align: 'end',
    renderCell: processor => <Figure>{money(processor.feesMtdCents)}</Figure>,
  },
  {
    key: 'change',
    sortable: true,
    header: 'Change',
    width: pixel(110),
    align: 'end',
    renderCell: processor => <ChangeCell id={processor.id} />,
  },
];

const processorCompactColumns: TableColumn<ProcessorAccount>[] = [
  processorColumns[0],
  {
    key: 'pendingPayout',
    sortable: true,
    header: 'Pending payout',
    width: pixel(150),
    align: 'end',
    renderCell: processor => (
      <CompactValueCell
        id={processor.id}
        amountCents={processor.pendingPayoutCents}
      />
    ),
  },
];

const processorComparators: Partial<
  Record<string, TableSortComparator<ProcessorAccount>>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  pendingPayout: (a, b) => a.pendingPayoutCents - b.pendingPayoutCents,
  feesMtd: (a, b) => a.feesMtdCents - b.feesMtdCents,
};

// ============= GROUP 4 — INVESTMENT ACCOUNTS =============

interface InvestmentAccount extends AccountRecord {
  name: string;
  custodian: string;
  marketValueCents: number;
  costBasisCents: number;
}

const INVESTMENTS: InvestmentAccount[] = [
  {
    id: 'inv-1',
    name: 'Short-duration treasuries',
    custodian: 'Northgate Asset Management',
    marketValueCents: 245_180_000,
    costBasisCents: 240_000_000,
    trend: 0.00012,
  },
  {
    id: 'inv-2',
    name: 'Corporate bond ladder',
    custodian: 'Northgate Asset Management',
    marketValueCents: 98_420_000,
    costBasisCents: 100_000_000,
    trend: -0.00006,
  },
  {
    id: 'inv-3',
    name: 'Money market fund',
    custodian: 'Harborline Capital',
    marketValueCents: 61_050_000,
    costBasisCents: 61_000_000,
    trend: 0.00003,
  },
];

const investmentColumns: TableColumn<InvestmentAccount>[] = [
  {
    key: 'name',
    sortable: true,
    header: 'Account',
    width: proportional(2),
    renderCell: account => (
      <VStack gap={0}>
        <Text>{account.name}</Text>
        <Text type="supporting">{account.custodian}</Text>
      </VStack>
    ),
  },
  {
    key: 'marketValue',
    sortable: true,
    header: 'Market value',
    width: pixel(150),
    align: 'end',
    renderCell: account => <Figure>{money(account.marketValueCents)}</Figure>,
  },
  {
    key: 'costBasis',
    sortable: true,
    header: 'Cost basis',
    width: pixel(150),
    align: 'end',
    renderCell: account => <Figure>{money(account.costBasisCents)}</Figure>,
  },
  {
    key: 'change',
    sortable: true,
    header: 'Change',
    width: pixel(110),
    align: 'end',
    renderCell: account => <ChangeCell id={account.id} />,
  },
];

const investmentCompactColumns: TableColumn<InvestmentAccount>[] = [
  investmentColumns[0],
  {
    key: 'marketValue',
    sortable: true,
    header: 'Market value',
    width: pixel(150),
    align: 'end',
    renderCell: account => (
      <CompactValueCell
        id={account.id}
        amountCents={account.marketValueCents}
      />
    ),
  },
];

const investmentComparators: Partial<
  Record<string, TableSortComparator<InvestmentAccount>>
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  marketValue: (a, b) => a.marketValueCents - b.marketValueCents,
  costBasis: (a, b) => a.costBasisCents - b.costBasisCents,
};

/** Every row id on the page, so a page-level control can address the details
 * and not just the cards holding them. */
const ALL_ROW_IDS = [
  ...BANK_ACCOUNTS,
  ...CREDIT_CARDS,
  ...PROCESSORS,
  ...INVESTMENTS,
].map(record => record.id);

// ============= DERIVED HISTORY =============

/**
 * A year of daily values per account. Built once at module scope: the numbers
 * are a pure function of the pinned data, so recomputing them per render would
 * be work with no possible different answer.
 *
 * The volatilities differ by group because the accounts do. A payout balance
 * that empties on a schedule is genuinely choppier than a bond ladder, and
 * giving them the same noise makes every chart on the page the same chart.
 */
const HISTORY: Record<string, number[]> = Object.fromEntries([
  ...historyFor(BANK_ACCOUNTS, account => account.availableCents, 0.014),
  ...historyFor(CREDIT_CARDS, card => card.balanceCents, 0.016),
  ...historyFor(PROCESSORS, processor => processor.pendingPayoutCents, 0.04),
  ...historyFor(INVESTMENTS, account => account.marketValueCents, 0.008),
]);

// ============= DETAIL PANEL =============

/**
 * The account's shape over the selected window, given the width the metadata
 * beside it does not need. At sparkline size the line was a gesture; at this
 * size the dates underneath mean something and a reading of the value is worth
 * following, so it carries an axis and a tooltip.
 *
 * `syncId` is what links it to its siblings: every chart in a group shares
 * one, so pointing at a date in one open row draws the cursor at that date in
 * every other open row of the same category. Recharts syncs on index, which is
 * sound here only because every account in a group is sampled over the same
 * window — same length, same days, same order.
 */
const CHART_HEIGHT = 132;

/**
 * How long the row this content sits in takes to open.
 *
 * The animating element is an ancestor, so its `transitionend` never reaches
 * us — bubbling runs child to parent. Walking up to read the duration off
 * whichever ancestor actually carries the transition costs one pass and keeps
 * this honest: reduced motion zeroes the token and a theme override changes
 * it, and both are picked up without knowing a class name.
 */
function openDurationMs(from: HTMLElement | null): number {
  for (let el = from; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.transitionProperty.includes('grid-template-rows')) {
      return parseFloat(style.transitionDuration) * 1000;
    }
  }
  return 0;
}

/**
 * Recharts costs around 400ms of main thread to mount, and spending it while
 * the row is still growing starves the open: measured 9-12 frames across a
 * transition with budget for roughly 40. So hold a skeleton of the chart's
 * exact height until the row has finished opening, then swap. The row animates
 * over a cheap box, and the chart mounts into a panel that is already still.
 * The chart arrives at the same moment either way — only the jank moves off
 * the animation.
 */
function useSettledAfterOpen(): [
  React.RefObject<HTMLDivElement | null>,
  boolean,
] {
  const ref = useRef<HTMLDivElement>(null);
  const [isSettled, setIsSettled] = useState(false);

  useEffect(() => {
    const duration = openDurationMs(ref.current);
    // Nothing to protect when there is no animation.
    if (duration === 0) {
      setIsSettled(true);
      return;
    }
    const timer = setTimeout(() => setIsSettled(true), duration);
    return () => clearTimeout(timer);
  }, []);

  return [ref, isSettled];
}

function DetailChart({
  id,
  group,
  isLiability,
}: {
  id: string;
  group: GroupId;
  isLiability?: boolean;
}) {
  const [hostRef, isSettled] = useSettledAfterOpen();
  const range = useRange();
  const points = windowOf(id, range);
  const delta = points[points.length - 1] - points[0];
  const isGood = isLiability ? delta <= 0 : delta >= 0;
  const color = isGood ? UP_COLOR : DOWN_COLOR;
  const data = points.map((value, day) => ({
    day,
    label: dayLabel(points.length - 1 - day),
    value: value / 100,
  }));
  const ticks = axisTicks(data.length);
  // One gradient per account, because two charts sharing a fill id take
  // whichever definition the DOM happens to hold — and open two rows of
  // opposite sign and that is a green area under a red line.
  const fillId = `detail-fill-${id}`;

  return (
    <VStack gap={0} ref={hostRef}>
      {!isSettled ? (
        <Skeleton width="100%" height={CHART_HEIGHT} radius={2} />
      ) : (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={data} syncId={group} margin={{top: 4, right: 4}}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* No CartesianGrid and no axis line. A rule at every Y tick reads
              as a table ruled behind a table, and an axis line at the bottom
              marks the frame rather than anything in the data. The one rule
              worth drawing is where the window opened: everything above it is
              the gain the Change column reports, everything below the loss. */}
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, data.length - 1]}
              ticks={ticks}
              tickFormatter={(day: number) => data[day]?.label ?? ''}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <ReferenceLine
              y={data[0].value}
              stroke={GRID_COLOR}
              strokeDasharray="3 3"
            />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip content={<DetailTooltip color={color} />} />
            <Area
              type="linear"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${fillId})`}
              dot={false}
              activeDot={{r: 3, strokeWidth: 0}}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </VStack>
  );
}

function DetailTooltip({
  active,
  payload,
  color,
}: {
  active?: boolean;
  payload?: Array<{payload: {label: string; value: number}}>;
  color?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          {point.label}
        </Text>
        <HStack gap={2} vAlign="center">
          <HStack xstyle={styles.swatch(color ?? UP_COLOR)} />
          <Text weight="semibold" hasTabularNumbers>
            {wholeCurrency.format(point.value)}
          </Text>
        </HStack>
      </VStack>
    </Card>
  );
}

// ============= GROUP SHELL =============

const GROUP_IDS = ['bank', 'cards', 'processors', 'investments'] as const;
type GroupId = (typeof GROUP_IDS)[number];

/**
 * Square side of the category tile in the group header. 24px is not a look, it
 * is an alignment: the tile plus the 8px gap after it is exactly the inset the
 * cells below give their own text, so the group name starts on the same x as
 * the first column's header and rows. It is also the size of the row-expansion
 * chevron buttons, and it sits at their x — so the group's disclosure and its
 * rows' disclosures form one column down the left edge of the card.
 */
const TILE_SIZE = 24;

const styles = stylex.create({
  // The page is a wash so the group cards read as surfaces sitting on it
  // rather than as outlines drawn on the same sheet. Body is the right token
  // for that: a theme that wants its cards to contrast sets it away from
  // --color-background-card, and one that wants them flush sets it equal and
  // separates them by border instead. Either way the page follows the theme.
  wash: {
    backgroundColor: colorVars['--color-background-body'],
  },
  delta: (color: string) => ({color}),
  swatch: (color: string) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  categoryTile: {
    display: 'grid',
    placeItems: 'center',
    width: TILE_SIZE,
    height: TILE_SIZE,
    flexShrink: 0,
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-background-muted'],
  },
});

function AccountGroup({
  icon,
  title,
  count,
  summaryLabel,
  summaryValue,
  isOpen,
  onOpenChange,
  children,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  count: number;
  summaryLabel: string;
  summaryValue: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    // 8px on the Card and nothing on the Collapsible: one content line for the
    // header and the table both, and the table's rows then inset themselves by
    // their own cell padding on top of it.
    <Card padding={2}>
      <Collapsible
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        trigger={
          // paddingBlock, because the trigger has none of its own: its height
          // is exactly the 24px tile, so the only space above the group name
          // was the Card's 8px. The column header below it is a table cell and
          // brings its own inset, which is what made the row read as pinned to
          // the top edge even though the two gaps measured the same.
          <HStack
            gap={2}
            vAlign="center"
            hAlign="between"
            paddingBlock={2}
            paddingInline={2}>
            <HStack gap={2} vAlign="center">
              <HStack xstyle={styles.categoryTile}>
                <Icon icon={icon} size="sm" />
              </HStack>
              <Text weight="semibold">{title}</Text>
              <Badge variant="neutral" label={String(count)} />
            </HStack>
            <HStack gap={2} vAlign="center">
              {/* Body rather than supporting: it is the label on the one
                  figure a collapsed group still shows, so it has to survive
                  being read at a glance from across the page. */}
              <Text color="secondary">{summaryLabel}</Text>
              <Text weight="semibold" hasTabularNumbers>
                {summaryValue}
              </Text>
            </HStack>
          </HStack>
        }>
        {/* The trigger is a row of text and the table opens with a row of
            text, so without this they read as one block with a hairline in
            it. 12px is enough to say the header is a header. */}
        <VStack paddingBlockStart={3}>{children}</VStack>
      </Collapsible>
    </Card>
  );
}

/**
 * The four tables differ in their columns and in nothing else, so the plugin
 * wiring lives here once rather than four times.
 *
 * The built-in expansion plugin owns the disclosure chevron and its muted
 * detail surface, so every table exposes the same interaction and panel
 * treatment without custom row event handling.
 */
function GroupTable<T extends AccountRecord>({
  data,
  columns,
  comparators,
  expandedRows,
  onToggleRow,
  renderExpanded,
}: {
  data: T[];
  columns: TableColumn<T>[];
  comparators: Partial<Record<string, TableSortComparator<T>>>;
  expandedRows: Set<string>;
  onToggleRow: (key: string) => void;
  renderExpanded: (item: T) => React.ReactNode;
}) {
  const range = useRange();

  // Change is the one column whose value is not in the row — it is derived
  // from the page's range. The sort memo keys on data identity, so a range
  // switch has to hand it a different array or the rows would keep the order
  // computed from the old window while showing figures from the new one.
  const rows = useMemo(() => data.slice(), [data, range]);

  const sortComparators = useMemo(
    () => ({
      ...comparators,
      change: (a: T, b: T) =>
        changePercentOf(a.id, range) - changePercentOf(b.id, range),
    }),
    [comparators, range],
  );

  const {sortedData, sortConfig} = useTableSortableState<T>({
    data: rows,
    comparators: sortComparators,
  });
  const sort = useTableSortable<T>(sortConfig);

  const expansion = useTableRowExpansion<T>({
    expandedKeys: expandedRows,
    onToggle: onToggleRow,
    getRowKey: item => item.id,
    renderExpanded,
  });

  return (
    <Table
      data={sortedData}
      columns={columns}
      idKey="id"
      density="compact"
      dividers="rows"
      plugins={{sort, expansion}}
    />
  );
}

// ============= PAGE =============

export default function ConnectedAccountsTemplate() {
  const [openGroups, setOpenGroups] = useState<Set<GroupId>>(
    () => new Set(GROUP_IDS),
  );

  // Lifted out of the chart because it is not the chart's setting — it is the
  // page's. Year to date is the default because it is the window accounts are
  // actually reasoned about in, and it is long enough that a monthly cycle
  // shows up several times rather than once or twice.
  const [range, setRange] = useState<RangeId>('YTD');

  // One Set for all four tables, not one per group. Row ids are unique across
  // the page, so a single Set is unambiguous, and it is what a "collapse every
  // open detail" control or a persisted view would need to read.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleRow = (key: string) => {
    setExpandedRows(previous => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (id: GroupId) => (open: boolean) => {
    setOpenGroups(previous => {
      const next = new Set(previous);
      if (open) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    const banks = sum(BANK_ACCOUNTS, account => account.availableCents);
    const cards = sum(CREDIT_CARDS, card => card.balanceCents);
    const pending = sum(PROCESSORS, p => p.pendingPayoutCents);
    const investments = sum(INVESTMENTS, i => i.marketValueCents);
    return {
      banks,
      cards,
      pending,
      investments,
      // Outstanding card balances are a liability, so they come off the top.
      net: banks + pending + investments - cards,
    };
  }, []);

  const [contentRef, contentWidth] = useSurfaceWidth();
  // Zero is the width before the first measurement, not a narrow box, and
  // treating it as narrow would flash the compact tables on every mount.
  const isCompact = contentWidth > 0 && contentWidth < COMPACT_BELOW_PX;

  // "All open" has to mean the details too. A control labelled Expand all that
  // opens four cards and leaves thirteen collapsed rows inside them has not
  // expanded all, and its next click would read as Collapse all while most of
  // the page is still shut.
  const isEverythingOpen =
    openGroups.size === GROUP_IDS.length &&
    expandedRows.size === ALL_ROW_IDS.length;

  const toggleEverything = () => {
    const open = !isEverythingOpen;
    setOpenGroups(open ? new Set(GROUP_IDS) : new Set());
    setExpandedRows(open ? new Set(ALL_ROW_IDS) : new Set());
  };

  return (
    <RangeContext.Provider value={range}>
      <Layout
        height="auto"
        contentWidth={1200}
        xstyle={styles.wash}
        header={
          <LayoutHeader padding={4}>
            <HStack gap={3} vAlign="center" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={0.5}>
                  <Heading level={1}>Connected accounts</Heading>
                  <Text type="supporting">
                    Net position {money(totals.net)} across 13 accounts
                  </Text>
                </VStack>
              </StackItem>
              <Button
                label={isEverythingOpen ? 'Collapse all' : 'Expand all'}
                variant="ghost"
                onClick={toggleEverything}
              />
              {/* The range belongs to the page, not to any one table, so it
                  sits with the page title rather than inside a card. */}
              <SegmentedControl
                value={range}
                onChange={value => setRange(value as RangeId)}
                label="Time range">
                {RANGE_IDS.map(id => (
                  <SegmentedControlItem key={id} value={id} label={id} />
                ))}
              </SegmentedControl>
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4} ref={contentRef}>
              <AccountGroup
                icon={BuildingLibraryIcon}
                title="Bank accounts"
                count={BANK_ACCOUNTS.length}
                summaryLabel="Available"
                summaryValue={money(totals.banks)}
                isOpen={openGroups.has('bank')}
                onOpenChange={toggleGroup('bank')}>
                <GroupTable<BankAccount>
                  data={BANK_ACCOUNTS}
                  columns={isCompact ? bankCompactColumns : bankColumns}
                  comparators={bankComparators}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  renderExpanded={account => (
                    <DetailChart id={account.id} group="bank" />
                  )}
                />
              </AccountGroup>

              <AccountGroup
                icon={CreditCardIcon}
                title="Credit cards"
                count={CREDIT_CARDS.length}
                summaryLabel="Outstanding"
                summaryValue={money(totals.cards)}
                isOpen={openGroups.has('cards')}
                onOpenChange={toggleGroup('cards')}>
                <GroupTable<CreditCardAccount>
                  data={CREDIT_CARDS}
                  columns={
                    isCompact ? creditCardCompactColumns : creditCardColumns
                  }
                  comparators={creditCardComparators}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  renderExpanded={card => (
                    <DetailChart id={card.id} group="cards" isLiability />
                  )}
                />
              </AccountGroup>

              <AccountGroup
                icon={ArrowsRightLeftIcon}
                title="Payment processors"
                count={PROCESSORS.length}
                summaryLabel="Pending payout"
                summaryValue={money(totals.pending)}
                isOpen={openGroups.has('processors')}
                onOpenChange={toggleGroup('processors')}>
                <GroupTable<ProcessorAccount>
                  data={PROCESSORS}
                  columns={
                    isCompact ? processorCompactColumns : processorColumns
                  }
                  comparators={processorComparators}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  renderExpanded={processor => (
                    <DetailChart id={processor.id} group="processors" />
                  )}
                />
              </AccountGroup>

              <AccountGroup
                icon={PresentationChartLineIcon}
                title="Investment accounts"
                count={INVESTMENTS.length}
                summaryLabel="Market value"
                summaryValue={money(totals.investments)}
                isOpen={openGroups.has('investments')}
                onOpenChange={toggleGroup('investments')}>
                <GroupTable<InvestmentAccount>
                  data={INVESTMENTS}
                  columns={
                    isCompact ? investmentCompactColumns : investmentColumns
                  }
                  comparators={investmentComparators}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  renderExpanded={account => (
                    <DetailChart id={account.id} group="investments" />
                  )}
                />
              </AccountGroup>
            </VStack>
          </LayoutContent>
        }
      />
    </RangeContext.Provider>
  );
}
