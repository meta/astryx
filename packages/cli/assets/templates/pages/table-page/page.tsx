// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A searchable table: one flat list of uniform records, three ways to narrow
 * it, and a summary underneath that follows whatever survives.
 *
 * The fixture is an invoice, but nothing structural depends on that. Swap the
 * rows for orders, runs, assets or tickets and the page is unchanged — what
 * picks this template is the shape, not the subject: a single homogeneous
 * list, searched and filtered in place, with figures below that recompute as
 * the list narrows. `table-grouped` is the version for records that do not
 * share a schema, `table-tree` for nested rows, `table-inbox` for triage.
 *
 * ## Extending this template
 *
 * ### Narrowing: search, scope, and column filters
 *
 * **Three surfaces, three different questions.** Decide which you need before
 * you build them, because they are not interchangeable:
 *
 * - A **free-text box** answers "find the row I am thinking of". One field,
 *   substring, no syntax. Cheap to learn, useless for anything comparative.
 * - A **scope toggle** answers a single high-frequency cut that is worth a
 *   permanent control — here, "which lines are time-based?". Two or three
 *   segments is the ceiling; past that it is a filter wearing a toggle's
 *   clothes, and belongs in the column popovers with everything else.
 * - **Per-column filters** answer "show me only X", per field and typed.
 *   Discoverable from the column they act on, and invisible until wanted.
 *
 * The failure mode is shipping all of them by reflex, so two controls do the
 * same job. A `PowerSearch` query builder sitting above a set of column
 * filters is the usual version: both reach `category = Design`, and the user
 * has to guess which one you meant. Reach for `PowerSearch` when the useful
 * queries genuinely span fields and operators — `amount > 5000 AND category =
 * Design` — and drop the column filters when you do.
 *
 * **Typed controls come from the search config, not from the column.**
 * `usePowerSearchConfig(SEARCH_FIELDS)` is still the source here even though
 * no `PowerSearch` is rendered: `useTableFiltering` resolves each column's
 * control from a config of that shape, and `toSearchFilters` turns the
 * resulting state back into predicates. The `type` is what decides Category
 * gets a checklist and Quantity gets a numeric comparison — an `enum` field
 * that forgets its `enumValues` silently degrades to a text box.
 *
 * **`variant="popover"` unless the table owns the page.** `inline` puts a
 * control row under every header, which roughly doubles the header's height;
 * on a page that also carries a masthead and a summary that is most of a
 * viewport spent on controls nobody has asked for yet. Switch to `inline` when
 * filtering *is* the activity and the table is the only thing on screen.
 *
 * **Narrow once, into one array.** All three surfaces converge in a single
 * `useMemo` that returns `visible`, and everything downstream — the body, the
 * subtotal, the tax, the total, the banner — reads that one array. There is
 * therefore no path where the figures describe a different set of rows than
 * the table shows. Deriving a second filtered list somewhere else is exactly
 * how a total starts disagreeing with the rows above it. The predicates are
 * independent, so order them by selectivity if the list is ever long enough
 * for it to matter; correctness does not depend on it.
 *
 * **One reset that clears all of them.** `clearEverything` resets the box, the
 * toggle and the popovers together. A "clear filters" that only empties the
 * popovers leaves the user staring at three rows and hunting for the stale
 * search term that explains them.
 *
 * ### Sorting
 *
 * **Sort after filtering, not before.** `useTableSortableState` is handed
 * `visible`, not `ROWS`. Sorting first does the work over rows about to be
 * discarded, and — the part that actually bites — leaves a sorted-but-
 * unfiltered array lying around for someone to render by mistake.
 *
 * **Sort keys default to the column key, so derived columns need comparators.**
 * `unitPrice` and `amount` are display names with no matching field — the
 * numbers live in `unitPriceCents` and `amountCents` — and the fallback
 * stringifies whatever it finds, which for a missing key means sorting a
 * column of `undefined`.
 *
 * **Sort the value, never the label.** The fallback compares rendered strings,
 * so `$1,240.00` sorts below `$980.00`, `Apr` sorts below `Jan`, and `10`
 * sorts below `9`. Every numeric column here subtracts integers instead.
 * The same rule covers dates (compare timestamps) and enums — `category`
 * compares the *label* a reader sees rather than the raw key, so the order
 * matches the column instead of matching the database.
 *
 * ### Saying what the reader is looking at
 *
 * **Two states, not one.** A filter that matches nothing needs an `EmptyState`
 * with a reset in it. A filter that matches *something* needs the opposite
 * treatment: the rows are fine, but every figure below them now describes a
 * subset, so the `Banner` says so and offers the same reset.
 *
 * **Detect on filter presence, not on row count.** A filter that happens to
 * match every row still means the summary is a view rather than the whole. And
 * the banner is mounted on the filter change rather than rendered hidden and
 * revealed: `status="warning"` carries `role="alert"`, and inserting that node
 * is what announces it.
 *
 * **Derive the summary from the rows on screen.** `visible` feeds the body and
 * every figure under it, so narrowing the list really does recompute them. The
 * failure mode this avoids is a hardcoded total that quietly disagrees with
 * the rows above it.
 *
 * ### Structure
 *
 * **Record-level facts go above the table, not inside it.** The test is
 * whether the value varies per row. Client, project and terms are true of the
 * whole document, so they render as a `MetadataList` rather than as columns
 * repeating one value nineteen times.
 *
 * **The masthead scrolls.** Title, actions and those facts sit in the content,
 * not in the `Layout` header slot — with `height="fill"` the content area is
 * the scroll container, so a slotted header stays pinned while the controls
 * slide underneath it. A document's own title is not chrome. Keep the slot for
 * things that stay useful mid-scroll: an app bar, a toolbar, a sticky action
 * row. `contentWidth` still caps the column either way, and caps it on the
 * `Layout` rather than on the table so full-bleed dividers keep spanning the
 * window.
 *
 * **Per-row detail, given no `rowComponent`.** Three constraints force the
 * shape in `DescriptionCell`: `<HoverCard>` wraps its trigger in a
 * `display: contents` span, which is invalid between `<tr>` and `<td>`;
 * `renderCell` is a plain function, so the hook needs a per-row component; and
 * `Table` exposes no row-level escape hatch. Letting `useHoverCard` stay
 * uncontrolled and pointing it at the enclosing `<tr>` is the way through —
 * drive `isOpen` from row mouse handlers instead and the card closes the
 * moment the pointer leaves the row, which makes anything inside it
 * unreachable.
 *
 * **Plugins mean data mode, and data mode has no footer.** `BaseTable` renders
 * `children ? children : (header + body)`, so composing rows by hand — the
 * only way to reach `TableFooter` — bypasses the plugin pipeline entirely.
 * Sorting and column filters are render plugins and need `data` + `columns`,
 * which puts `TableFooter` permanently out of reach. Don't work around it with
 * a second `<Table>` sharing the first one's `colgroup`: that costs a
 * hand-written `<colgroup>`, a `<col>` per column, a border declaration on
 * every ruled cell, and an extra table in the accessibility tree. A summary is
 * arithmetic *about* the table, not rows *of* it, and `TotalRow` gets the same
 * alignment out of a right-aligned stack — see the note there.
 *
 * **Sitting flush takes two separate fixes, not one.** A `Table` bleeds past
 * its container — the scroll wrapper applies negative inline margins equal to
 * `--container-padding-inline-*`, and the outer cells add that padding back so
 * text still lines up. Correct for a table that owns its surface; wrong here,
 * where the table shares a content line with a `MetadataList`.
 *
 * Half one is `LayoutContent padding={0}`, which stops the container
 * publishing the padding the table would escape. The padding moves to the
 * `VStack`, a plain flex box that publishes nothing. Half two is
 * `useFlushEdges`, because cell padding resolves to
 * `max(var(--container-padding-inline-start), spacing-2)` — a hard floor, so
 * zeroing the variable still leaves the text indented 8px. Only the cell can
 * close that gap. Do not reach instead for a wrapper `<div>` that zeroes the
 * variables inline: it works, and it hides the cause. The padding belongs to
 * the container, so that is where it should be turned off.
 *
 * `useFlushEdges` is worth reading as a plugin in its own right — a complete
 * one in a dozen lines, no factory, no registration. Reach for the same shape
 * whenever you need per-cell chrome that columns cannot express.
 *
 * ### Reading the figures
 *
 * **No dividers on the rows, three rules around the summary.** The table runs
 * `dividers="none"` and leans on `hasHover` to track a row, so the grid stays
 * quiet under nineteen lines of similar text. That is what buys the totals
 * their three `Divider`s: on a page with no other hairline they read as
 * punctuation rather than as one more line in a grid. Turn the row dividers
 * back on and the rules stop meaning anything.
 *
 * **Tabular figures are load-bearing, not decorative.** Figtree's default
 * digits are proportional — ten `1`s measure 63px against ten `0`s at 87px —
 * so a numeric column will not align at the decimal without
 * `hasTabularNumbers`, which the shared `Figure` and `TotalRow` both set.
 *
 * **Store the sortable value, format at the edge.** Money lives in integer
 * cents and only the display step goes through `Intl.NumberFormat`, at a
 * pinned locale. Float dollars accumulate rounding drift across nineteen lines
 * and the total is precisely where it surfaces. The general rule outlives the
 * currency: keep the comparable primitive on the row — a timestamp, an
 * integer, an enum key — and format it in `renderCell`, so sorting and
 * display never read the same field. Swap the formatter for the viewer's
 * locale in a real app; keep the primitive.
 */

import {useEffect, useMemo, useRef, useState} from 'react';

import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useHoverCard} from '@astryxdesign/core/HoverCard';
import {Icon} from '@astryxdesign/core/Icon';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {usePowerSearchConfig} from '@astryxdesign/core/PowerSearch';
import type {PowerSearchFilter} from '@astryxdesign/core/PowerSearch';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  Table,
  pixel,
  proportional,
  toSearchFilters,
  useTableFilterState,
  useTableFiltering,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import type {
  TableColumn,
  TablePlugin,
  TableSortComparator,
} from '@astryxdesign/core/Table';
import {
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

// ============= DATA =============

type LineCategory = 'design' | 'development' | 'content' | 'project';

/**
 * How the line is priced. Hourly lines vary with the time booked against them
 * and are the ones a client queries; fixed-fee lines were agreed up front.
 */
type BillingBasis = 'hourly' | 'fixed';

interface LineItem extends Record<string, unknown> {
  id: string;
  description: string;
  category: LineCategory;
  basis: BillingBasis;
  /** Hours booked on an hourly line, or units delivered on a fixed-fee one. */
  quantity: number;
  /** Integer cents. Dollars are a formatting concern, never a stored one. */
  unitPriceCents: number;
}

/** A line with its extended amount precomputed, so `amount` is sortable. */
interface InvoiceRow extends LineItem {
  amountCents: number;
}

const CATEGORY_LABEL: Record<LineCategory, string> = {
  design: 'Design',
  development: 'Development',
  content: 'Content',
  project: 'Project management',
};

const LINE_ITEMS: LineItem[] = [
  {
    id: 'li-01',
    description: 'Discovery workshop',
    category: 'design',
    basis: 'fixed',
    quantity: 1,
    unitPriceCents: 240_000,
  },
  {
    id: 'li-02',
    description: 'Stakeholder interviews',
    category: 'design',
    basis: 'hourly',
    quantity: 12,
    unitPriceCents: 14_500,
  },
  {
    id: 'li-03',
    description: 'User research synthesis',
    category: 'design',
    basis: 'hourly',
    quantity: 18,
    unitPriceCents: 14_500,
  },
  {
    id: 'li-04',
    description: 'Wireframes — key templates',
    category: 'design',
    basis: 'hourly',
    quantity: 34,
    unitPriceCents: 14_500,
  },
  {
    id: 'li-05',
    description: 'Visual design system',
    category: 'design',
    basis: 'fixed',
    quantity: 1,
    unitPriceCents: 680_000,
  },
  {
    id: 'li-06',
    description: 'Page designs — 14 templates',
    category: 'design',
    basis: 'hourly',
    quantity: 62,
    unitPriceCents: 14_500,
  },
  {
    id: 'li-07',
    description: 'Prototype & usability testing',
    category: 'design',
    basis: 'hourly',
    quantity: 22,
    unitPriceCents: 14_500,
  },
  {
    id: 'li-08',
    description: 'Frontend build — component library',
    category: 'development',
    basis: 'hourly',
    quantity: 88,
    unitPriceCents: 16_500,
  },
  {
    id: 'li-09',
    description: 'Frontend build — page templates',
    category: 'development',
    basis: 'hourly',
    quantity: 104,
    unitPriceCents: 16_500,
  },
  {
    id: 'li-10',
    description: 'CMS setup & content modelling',
    category: 'development',
    basis: 'hourly',
    quantity: 40,
    unitPriceCents: 16_500,
  },
  {
    id: 'li-11',
    description: 'Search & filtering integration',
    category: 'development',
    basis: 'hourly',
    quantity: 26,
    unitPriceCents: 16_500,
  },
  {
    id: 'li-12',
    description: 'Analytics & tag manager setup',
    category: 'development',
    basis: 'hourly',
    quantity: 10,
    unitPriceCents: 16_500,
  },
  {
    id: 'li-13',
    description: 'Accessibility audit & remediation',
    category: 'development',
    basis: 'fixed',
    quantity: 1,
    unitPriceCents: 320_000,
  },
  {
    id: 'li-14',
    description: 'Cross-browser QA',
    category: 'development',
    basis: 'hourly',
    quantity: 24,
    unitPriceCents: 13_500,
  },
  {
    id: 'li-15',
    description: 'Copywriting — 14 pages',
    category: 'content',
    basis: 'hourly',
    quantity: 36,
    unitPriceCents: 12_500,
  },
  {
    id: 'li-16',
    description: 'Content migration',
    category: 'content',
    basis: 'hourly',
    quantity: 28,
    unitPriceCents: 9_500,
  },
  {
    id: 'li-17',
    description: 'Stock photography licences',
    category: 'content',
    basis: 'fixed',
    quantity: 24,
    unitPriceCents: 1_800,
  },
  {
    id: 'li-18',
    description: 'Project management — 12 weeks',
    category: 'project',
    basis: 'fixed',
    quantity: 12,
    unitPriceCents: 85_000,
  },
  {
    id: 'li-19',
    description: 'Training & handover session',
    category: 'project',
    basis: 'fixed',
    quantity: 2,
    unitPriceCents: 120_000,
  },
];

/** Extended amounts are precomputed so the Amount column has a value to sort. */
const ROWS: InvoiceRow[] = LINE_ITEMS.map(item => ({
  ...item,
  amountCents: item.quantity * item.unitPriceCents,
}));

/** Invoice-wide, so a line's share does not move when the view is filtered. */
const INVOICE_SUBTOTAL_CENTS = ROWS.reduce(
  (sum, item) => sum + item.amountCents,
  0,
);

/**
 * The segmented control answers one question — "which lines are time-based?" —
 * and leaves every other cut to the search and the column filters. Two segments
 * is the ceiling for a control that sits in front of a query builder.
 */
const BASIS_FILTERS: {value: BillingBasis | 'all'; label: string}[] = [
  {value: 'all', label: 'All lines'},
  {value: 'hourly', label: 'Hourly'},
];

/**
 * Field definitions for the column filter popovers.
 *
 * `usePowerSearchConfig` is still the source even though the page no longer
 * renders a `PowerSearch`: `useTableFiltering` resolves each column's control
 * — text box, enum list, number comparator — from a config of this shape, and
 * `toSearchFilters` turns the resulting state back into predicates. The typing
 * here is what decides that Category gets a checklist and Quantity gets a
 * numeric comparison.
 */
const SEARCH_FIELDS = [
  {key: 'description', type: 'string', label: 'Description'},
  {
    key: 'category',
    type: 'enum',
    label: 'Category',
    enumValues: [
      {value: 'design', label: 'Design'},
      {value: 'development', label: 'Development'},
      {value: 'content', label: 'Content'},
      {value: 'project', label: 'Project management'},
    ],
  },
  {key: 'quantity', type: 'number', label: 'Quantity'},
] as const;

const TAX_RATE = 0.0875;

/** Static invoice facts. Rendered as a MetadataList, not as table columns —
 * they describe the whole document, so repeating them per row would be noise. */
const INVOICE_DETAILS: {label: string; value: string}[] = [
  {label: 'Billed to', value: 'Brightwater Coffee Co.'},
  {label: 'Project', value: 'Website redesign'},
  {label: 'Issue date', value: 'Mar 31, 2026'},
  {label: 'Due date', value: 'Apr 30, 2026'},
  {label: 'Payment terms', value: 'Net 30'},
  {label: 'Purchase order', value: 'PO-4471'},
];

// ============= FORMATTING =============

// Pinned locale so the rendered output is identical in every environment.
// A real app resolves this from the viewer instead.
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const decimal = new Intl.NumberFormat('en-US');

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

/** Right-aligned tabular figure. The column's `align` handles the cell; this
 * keeps the digits themselves on a grid so decimal points line up. */
function Figure({
  children,
  weight,
}: {
  children: string;
  weight?: 'normal' | 'semibold';
}) {
  return (
    <Text hasTabularNumbers weight={weight}>
      {children}
    </Text>
  );
}

// ============= ROW DETAIL =============

/**
 * One hover card per row, triggered by the whole row.
 *
 * Three constraints shape this. The `<HoverCard>` wrapper is unusable: it wraps
 * its trigger in a `display: contents` span, and a span between `<tr>` and
 * `<td>` is invalid markup. A column's `renderCell` is a plain function, so the
 * hook has to live in a per-row component like this one. And `Table` has no
 * `rowComponent` escape hatch, so there is no way to hand the row itself a hook.
 *
 * The way through is to let the hook keep its own uncontrolled hover/focus
 * handling and simply point it at the enclosing `<tr>`. Driving `isOpen` from
 * row-level mouse handlers instead — the obvious alternative — produces a card
 * that closes the moment the pointer leaves the row, which makes anything
 * interactive inside it unreachable. Uncontrolled, the hook keeps the card open
 * while the pointer is moving onto it, so the Dispute button is clickable.
 *
 * `tabIndex` and `aria-describedby` are set on the row in the same effect,
 * because the node is already in hand and neither can be expressed through a
 * column definition. That also makes the detail reachable without a pointer —
 * but only alongside `focusTrigger: 'always'`, because the row is not focusable
 * yet at the moment the hook attaches to it.
 */
function DescriptionCell({item}: {item: InvoiceRow}) {
  const anchorRef = useRef<HTMLElement>(null);
  const hoverCard = useHoverCard({
    placement: 'below',
    alignment: 'start',
    label: `${item.description} details`,
    // The row is a plain `<tr>` made focusable in the effect below, and `auto`
    // decides whether to bind focus listeners at attach time — when the row is
    // still a non-focusable element. It would bind nothing, leaving the card
    // reachable by pointer and touch but not by keyboard: tabbing to a row
    // would draw a focus ring and open nothing. Leave nothing to detection.
    focusTrigger: 'always',
  });

  const attach = hoverCard.ref;
  const cardId = hoverCard.id;
  useEffect(() => {
    const row = anchorRef.current?.closest('tr');
    if (row == null) {
      return;
    }
    attach(row);
    row.tabIndex = 0;
    row.setAttribute('aria-describedby', cardId);
    return () => {
      attach(null);
      row.removeAttribute('aria-describedby');
    };
  }, [attach, cardId]);

  const share = (item.amountCents / INVOICE_SUBTOTAL_CENTS) * 100;

  return (
    <>
      <Text maxLines={1} ref={anchorRef}>
        {item.description}
      </Text>
      {hoverCard.renderHoverCard(
        // No padding here — useHoverCard's content wrapper already applies
        // spacing-3 on all four sides. Adding it again doubles it to 24px.
        <VStack gap={3} width={280}>
          {/* h3 sizing, h2 in the outline. The page's only other heading is
              the invoice h1, so a plain level-3 would jump h1 → h3 and read
              as a missing section to anyone navigating by heading. */}
          <Heading level={3} accessibilityLevel={2}>
            {item.description}
          </Heading>
          <MetadataList label={{position: 'start'}}>
            <MetadataListItem label="Category">
              {CATEGORY_LABEL[item.category]}
            </MetadataListItem>
            <MetadataListItem label="Billing">
              {item.basis === 'hourly' ? 'Hourly' : 'Fixed fee'}
            </MetadataListItem>
            <MetadataListItem label="Calculation">
              {`${decimal.format(item.quantity)} \u00d7 ${formatCents(item.unitPriceCents)}`}
            </MetadataListItem>
            <MetadataListItem label="Amount">
              {formatCents(item.amountCents)}
            </MetadataListItem>
            <MetadataListItem label="Share of invoice">
              {`${share.toFixed(1)}%`}
            </MetadataListItem>
          </MetadataList>
          <Button label="Dispute this line" variant="secondary" width="100%" />
        </VStack>,
      )}
    </>
  );
}

// ============= COLUMNS =============

const columns: TableColumn<InvoiceRow>[] = [
  {
    key: 'description',
    header: 'Description',
    width: proportional(3),
    sortable: true,
    filter: 'description',
    renderCell: item => <DescriptionCell item={item} />,
  },
  {
    key: 'category',
    header: 'Category',
    width: pixel(160),
    sortable: true,
    filter: 'category',
    renderCell: item => (
      <Text color="secondary" maxLines={1}>
        {CATEGORY_LABEL[item.category]}
      </Text>
    ),
  },
  {
    key: 'quantity',
    header: 'Qty',
    width: pixel(80),
    align: 'end',
    sortable: true,
    filter: 'quantity',
    renderCell: item => <Figure>{decimal.format(item.quantity)}</Figure>,
  },
  {
    key: 'unitPrice',
    header: 'Rate',
    width: pixel(120),
    align: 'end',
    sortable: true,
    renderCell: item => <Figure>{formatCents(item.unitPriceCents)}</Figure>,
  },
  {
    key: 'amount',
    header: 'Amount',
    width: pixel(132),
    align: 'end',
    sortable: true,
    renderCell: item => <Figure>{formatCents(item.amountCents)}</Figure>,
  },
];

/**
 * Sort keys default to the column key. `unitPrice` and `amount` are display
 * names with no matching field, and the built-in fallback stringifies whatever
 * it finds — so every numeric column subtracts integers here instead.
 */
const COMPARATORS: Partial<Record<string, TableSortComparator<InvoiceRow>>> = {
  description: (a, b) => a.description.localeCompare(b.description),
  category: (a, b) =>
    CATEGORY_LABEL[a.category].localeCompare(CATEGORY_LABEL[b.category]),
  quantity: (a, b) => a.quantity - b.quantity,
  unitPrice: (a, b) => a.unitPriceCents - b.unitPriceCents,
  amount: (a, b) => a.amountCents - b.amountCents,
};

// ============= EDGE ALIGNMENT =============

const FLUSH_START: React.CSSProperties = {paddingInlineStart: 0};
const FLUSH_END: React.CSSProperties = {paddingInlineEnd: 0};

/** Inline padding override for a cell at either end of the row. */
function edgeStyle(
  index: number,
  total: number,
): React.CSSProperties | undefined {
  if (index === 0) {
    return FLUSH_START;
  }
  if (index === total - 1) {
    return FLUSH_END;
  }
  return undefined;
}

/**
 * Zero padding on the outer cells, which is the second half of sitting flush.
 *
 * `LayoutContent padding={0}` already cancelled the bleed (see the page body),
 * but cell padding resolves to
 * `max(var(--container-padding-inline-start), spacing-2)` — a hard floor, so
 * zeroing the variable still leaves the text indented 8px while the
 * MetadataList above it sits at 0. Only the cell can close that gap.
 *
 * Children mode would do it with an inline `style` on the outer cells; this is
 * the data-mode equivalent, and a demonstration that a plugin is nothing more
 * than an object of transforms.
 */
function useFlushEdges(): TablePlugin<InvoiceRow> {
  return useMemo(
    () => ({
      transformHeaderCell: (props, _column, columnIndex, cols) => {
        const style = edgeStyle(columnIndex, cols.length);
        return style == null
          ? props
          : {
              ...props,
              htmlProps: {
                ...props.htmlProps,
                style: {...props.htmlProps.style, ...style},
              },
            };
      },
      transformBodyCell: (props, _column, _item, columnIndex, cols) => {
        const style = edgeStyle(columnIndex, cols.length);
        return style == null
          ? props
          : {
              ...props,
              htmlProps: {
                ...props.htmlProps,
                style: {...props.htmlProps.style, ...style},
              },
            };
      },
    }),
    [],
  );
}

// ============= TOTALS =============

/**
 * The totals are arithmetic *about* the table, not rows *of* it, so they are
 * not a table.
 *
 * The tempting version is a second `<Table>` sharing the first one's
 * `<colgroup>`, since the figures have to land on the Amount column. That works
 * and it costs a hand-written `<colgroup>`, a `<col>` per column, and a border
 * declaration on every cell that needs a rule — because `dividers="none"` turns
 * the divider system off, so each hairline has to be drawn by hand.
 *
 * A right-aligned stack gets the same alignment for none of that: the figure
 * box is the Amount column's width and both are flush to the content line, so
 * they share an edge by construction. `Divider` then draws the rules, and the
 * three of them are the only ones on the page — which is what lets them read as
 * punctuation rather than as a grid.
 */
const AMOUNT_COLUMN_WIDTH = 132;

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: 'muted' | 'strong';
}) {
  const weight = emphasis === 'strong' ? 'semibold' : 'normal';
  return (
    <HStack gap={6} hAlign="end" vAlign="center">
      <Text
        weight={weight}
        color={emphasis === 'muted' ? 'secondary' : 'primary'}>
        {label}
      </Text>
      <VStack width={AMOUNT_COLUMN_WIDTH}>
        <Text justify="end" display="block" hasTabularNumbers weight={weight}>
          {value}
        </Text>
      </VStack>
    </HStack>
  );
}

// ============= PAGE =============

export default function InvoiceLineItemsTemplate() {
  const [query, setQuery] = useState('');
  const [basis, setBasis] = useState<BillingBasis | 'all'>('all');

  // One config drives the query builder, the column popovers, and the predicate.
  const {config, applyFilters} = usePowerSearchConfig(SEARCH_FIELDS, 'Lines');
  const {
    filters: columnFilters,
    onFilterChange,
    clearAll,
  } = useTableFilterState();

  const filterPlugin = useTableFiltering<InvoiceRow>({
    filters: columnFilters,
    onFilterChange,
    searchConfig: config,
    variant: 'popover',
  });

  // Three narrowing steps, one pass, one array. Every figure on the page reads
  // the result, so a second filtered list is a second version of the truth.
  const visible = useMemo(() => {
    const columnPredicates = toSearchFilters(
      columnFilters,
      columns,
      config,
    ) as PowerSearchFilter[];
    const matched = applyFilters(columnPredicates, ROWS);
    const scoped =
      basis === 'all' ? matched : matched.filter(item => item.basis === basis);
    const term = query.trim().toLowerCase();
    return term === ''
      ? scoped
      : scoped.filter(item => item.description.toLowerCase().includes(term));
  }, [applyFilters, columnFilters, config, basis, query]);

  const {sortedData, sortConfig} = useTableSortableState<InvoiceRow>({
    data: visible,
    comparators: COMPARATORS,
  });
  const sortPlugin = useTableSortable<InvoiceRow>(sortConfig);
  const flushPlugin = useFlushEdges();

  // Every figure below reads the same array the body does, so a filter retotals
  // the invoice instead of leaving a stale number under a shortened list.
  const subtotalCents = useMemo(
    () => visible.reduce((sum, item) => sum + item.amountCents, 0),
    [visible],
  );
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  // Filter *presence*, not row count: a filter that happens to match every line
  // still means these totals are a view of the invoice rather than the invoice.
  const activeFilterCount =
    (query.trim() === '' ? 0 : 1) +
    Object.keys(columnFilters).length +
    (basis === 'all' ? 0 : 1);

  const clearEverything = () => {
    setQuery('');
    setBasis('all');
    clearAll();
  };

  return (
    <Layout
      height="fill"
      contentWidth={960}
      content={
        // `padding={0}` is load-bearing, not a style choice. LayoutContent
        // publishes its padding as --container-padding-inline-*, and Table
        // reads those to bleed past it; zeroing them at the source is what
        // holds the table on the same content line as the MetadataList. The
        // padding moves to the VStack, which is a plain flex container and
        // publishes nothing.
        <LayoutContent padding={0}>
          <VStack padding={4} gap={8}>
            {/* Title, actions and document facts are one masthead, and it
                scrolls. The Layout `header` slot would pin it: with
                `height="fill"` the content area is the scroll container, so a
                slotted header stays put while the controls slide underneath
                it. A document's own title is not chrome — it belongs to the
                page it names, and reading down past it is the normal thing to
                do. Keep the slot for what stays useful mid-scroll: an app bar,
                a toolbar, a sticky action row. */}
            <VStack gap={6} paddingBlockEnd={4}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={1}>Invoice INV-2043</Heading>
                </StackItem>
                <Button
                  label="Download PDF"
                  variant="secondary"
                  icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
                />
              </HStack>
              <MetadataList
                columns="multi"
                orientation="vertical"
                label={{position: 'top'}}>
                {INVOICE_DETAILS.map(detail => (
                  <MetadataListItem key={detail.label} label={detail.label}>
                    {detail.value}
                  </MetadataListItem>
                ))}
              </MetadataList>
            </VStack>

            {/* Scope first, then search: the segments narrow what the box is
                searching over, which is the order the sentence reads in.
                The VStack is what makes the input fill its 300px and sit
                flush right — as a bare flex child it shrinks to content. */}
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
              <SegmentedControl
                label="Filter by billing basis"
                value={basis}
                onChange={value => setBasis(value as BillingBasis | 'all')}>
                {BASIS_FILTERS.map(filter => (
                  <SegmentedControlItem
                    key={filter.value}
                    value={filter.value}
                    label={filter.label}
                  />
                ))}
              </SegmentedControl>
              <VStack width={300}>
                <TextInput
                  label="Search line items"
                  isLabelHidden
                  value={query}
                  onChange={setQuery}
                  placeholder="Search…"
                  startIcon={<Icon icon={MagnifyingGlassIcon} size="sm" />}
                />
              </VStack>
            </HStack>

            <VStack gap={6}>
              {visible.length === 0 ? (
                <EmptyState
                  title="No matching line items"
                  description="No line on this invoice matches the current filters."
                  actions={
                    <Button
                      label="Clear filters"
                      variant="secondary"
                      onClick={clearEverything}
                    />
                  }
                />
              ) : (
                <VStack gap={4}>
                  <Table<InvoiceRow>
                    data={sortedData}
                    columns={columns}
                    idKey="id"
                    density="balanced"
                    dividers="none"
                    hasHover
                    textOverflow="truncate"
                    plugins={{
                      sort: sortPlugin,
                      filter: filterPlugin,
                      flush: flushPlugin,
                    }}
                  />

                  <VStack gap={3}>
                    <Divider />
                    <TotalRow
                      label="Subtotal"
                      value={formatCents(subtotalCents)}
                    />
                    <TotalRow
                      label="Tax (8.75%)"
                      value={formatCents(taxCents)}
                      emphasis="muted"
                    />
                    <Divider />
                    <TotalRow
                      label="Total due"
                      value={formatCents(totalCents)}
                      emphasis="strong"
                    />
                    <Divider />
                  </VStack>
                </VStack>
              )}

              {/* Mounted on a filter change rather than at first paint, so the
                  warning role actually announces. */}
              {visible.length > 0 && activeFilterCount > 0 && (
                <Banner
                  status="warning"
                  title="Filtered view — these totals are partial"
                  description={`Showing ${visible.length} of ${ROWS.length} lines. The subtotal, tax, and total due above cover only the lines currently visible.`}
                  endContent={
                    <Button
                      label="Clear all filters"
                      variant="secondary"
                      onClick={clearEverything}
                    />
                  }
                />
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
