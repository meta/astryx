// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import type {CSSProperties} from 'react';
import {VStack, HStack, StackItem, Card} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';

// ─── Paper ──────────────────────────────────────────────────────────────────
// On a wide screen the sheet is the printed page: the same width, and padding
// equal to the @page margin, so lines wrap at the same place on screen and on
// paper. On a narrow screen the padding shrinks; print does not use it.
const PAPER = {
  letter: {label: 'Letter', size: 'letter', width: '8.5in', height: '11in'},
  a4: {label: 'A4', size: 'A4', width: '210mm', height: '297mm'},
} as const;
type PaperKey = keyof typeof PAPER;
const PAGE_MARGIN = '0.6in';

// @page and @media print cannot be written as inline styles or props, so they
// live in a plain <style> element and need no CSS compiler. Print rules:
// - hide the screen toolbar, and drop the sheet's card frame and padding (the
//   @page margin replaces the padding);
// - print light: a dark theme would otherwise print light text on paper;
// - never split a line item or the totals across a page break, and keep a
//   heading with what follows it. Table's <thead> repeats on every page.
// Meaning never rests on a fill: browsers drop backgrounds when printing by
// default. Table row dividers are borders and print. Divider paints a fill, so
// the sheet's separators ask the browser to print their color exactly.
const printCss = (paper: PaperKey) => `
@page {
  size: ${PAPER[paper].size};
  margin: ${PAGE_MARGIN};
}
@media print {
  .estimate-screen-only {
    display: none !important;
  }
  .estimate-backdrop {
    padding: 0 !important;
    background: none !important;
  }
  .estimate-sheet {
    width: auto !important;
    max-width: none !important;
    min-height: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    color-scheme: light;
  }
  .estimate-sheet [role='separator'] {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .estimate-sheet tr,
  .estimate-keep-together {
    break-inside: avoid;
  }
  .estimate-sheet h1,
  .estimate-sheet h2 {
    break-after: avoid;
  }
}
`;

const backdrop: CSSProperties = {
  minHeight: '100%',
  padding: 'clamp(16px, 3vw, 24px)',
  background: 'var(--color-background-muted)',
};

const sheet = (paper: PaperKey): CSSProperties => ({
  width: PAPER[paper].width,
  maxWidth: '100%',
  minHeight: PAPER[paper].height,
  padding: `clamp(16px, 6vw, ${PAGE_MARGIN})`,
});

const toolbar = (paper: PaperKey): CSSProperties => ({
  width: PAPER[paper].width,
  maxWidth: '100%',
});

const totals: CSSProperties = {
  width: 320,
  maxWidth: '100%',
};

const signatureLine: CSSProperties = {
  paddingBlockStart: 40,
};

// ─── Estimate data ──────────────────────────────────────────────────────────
const ESTIMATE = {
  number: 'EST-2041',
  issued: 'November 3, 2026',
  validUntil: 'December 3, 2026',
  preparedBy: 'Morgan Ellis',
  project: 'Kitchen and pantry renovation',
};

const COMPANY = {
  name: 'Harbor & Pine Renovation',
  lines: ['418 Alder Street, Suite 2', 'Portland, OR 97204', '(503) 555-0142'],
};

const CLIENT = {
  name: 'Priya Natarajan',
  lines: ['92 Linden Court', 'Portland, OR 97211'],
};

type LineItem = {
  id: string;
  item: string;
  detail: string;
  qty: number;
  unit: string;
  rate: number;
};

const LINE_ITEMS: LineItem[] = [
  {
    id: 'site-protection',
    item: 'Site protection',
    detail: 'Floor and doorway protection, dust barriers',
    qty: 1,
    unit: 'job',
    rate: 380,
  },
  {
    id: 'demolition',
    item: 'Demolition',
    detail: 'Remove cabinets, counters and tile backsplash',
    qty: 1,
    unit: 'job',
    rate: 1450,
  },
  {
    id: 'debris-haul-away',
    item: 'Debris haul-away',
    detail: '20-yard container, two pickups',
    qty: 2,
    unit: 'load',
    rate: 290,
  },
  {
    id: 'framing',
    item: 'Framing',
    detail: 'Pantry wall and header, 2×4 at 16 in',
    qty: 14,
    unit: 'ft',
    rate: 42,
  },
  {
    id: 'electrical-rough-in',
    item: 'Electrical rough-in',
    detail: 'Six circuits, under-cabinet lighting feed',
    qty: 6,
    unit: 'circuit',
    rate: 265,
  },
  {
    id: 'plumbing-rough-in',
    item: 'Plumbing rough-in',
    detail: 'Relocate sink supply and drain 3 ft',
    qty: 1,
    unit: 'job',
    rate: 1180,
  },
  {
    id: 'drywall',
    item: 'Drywall',
    detail: 'Hang, tape and finish to level 4',
    qty: 220,
    unit: 'sq ft',
    rate: 4.25,
  },
  {
    id: 'primer-and-paint',
    item: 'Primer and paint',
    detail: 'Walls and ceiling, two finish coats',
    qty: 410,
    unit: 'sq ft',
    rate: 2.1,
  },
  {
    id: 'base-cabinets',
    item: 'Base cabinets',
    detail: 'Maple shaker, soft-close, 11 boxes',
    qty: 11,
    unit: 'box',
    rate: 485,
  },
  {
    id: 'wall-cabinets',
    item: 'Wall cabinets',
    detail: 'Maple shaker to ceiling, 9 boxes',
    qty: 9,
    unit: 'box',
    rate: 410,
  },
  {
    id: 'pantry-cabinet',
    item: 'Pantry cabinet',
    detail: '24 in pull-out, full height',
    qty: 1,
    unit: 'each',
    rate: 1320,
  },
  {
    id: 'cabinet-hardware',
    item: 'Cabinet hardware',
    detail: 'Brushed brass pulls, 5 in',
    qty: 38,
    unit: 'each',
    rate: 14,
  },
  {
    id: 'quartz-countertop',
    item: 'Quartz countertop',
    detail: '3 cm, eased edge, fabricated on site',
    qty: 46,
    unit: 'sq ft',
    rate: 92,
  },
  {
    id: 'undermount-sink',
    item: 'Undermount sink',
    detail: 'Stainless, 32 in single bowl',
    qty: 1,
    unit: 'each',
    rate: 640,
  },
  {
    id: 'faucet',
    item: 'Faucet',
    detail: 'Pull-down, client-selected finish',
    qty: 1,
    unit: 'each',
    rate: 385,
  },
  {
    id: 'tile-backsplash',
    item: 'Tile backsplash',
    detail: '3×12 ceramic, herringbone, grout sealed',
    qty: 38,
    unit: 'sq ft',
    rate: 31,
  },
  {
    id: 'lvp-flooring',
    item: 'LVP flooring',
    detail: 'Waterproof plank, underlayment included',
    qty: 180,
    unit: 'sq ft',
    rate: 8.5,
  },
  {
    id: 'baseboard-and-trim',
    item: 'Baseboard and trim',
    detail: 'MDF, primed and painted',
    qty: 64,
    unit: 'ft',
    rate: 7.75,
  },
  {
    id: 'under-cabinet-lighting',
    item: 'Under-cabinet lighting',
    detail: 'LED strip with dimmer, four runs',
    qty: 4,
    unit: 'run',
    rate: 165,
  },
  {
    id: 'pendant-lights',
    item: 'Pendant lights',
    detail: 'Install client-supplied fixtures',
    qty: 3,
    unit: 'each',
    rate: 120,
  },
  {
    id: 'appliance-install',
    item: 'Appliance install',
    detail: 'Range, hood, dishwasher, refrigerator',
    qty: 4,
    unit: 'each',
    rate: 145,
  },
  {
    id: 'range-hood-venting',
    item: 'Range hood venting',
    detail: 'Duct to exterior, roof cap',
    qty: 1,
    unit: 'job',
    rate: 720,
  },
  {
    id: 'permit-and-inspection',
    item: 'Permit and inspection',
    detail: 'City of Portland residential alteration',
    qty: 1,
    unit: 'job',
    rate: 560,
  },
  {
    id: 'final-clean',
    item: 'Final clean',
    detail: 'Post-construction clean, all work areas',
    qty: 1,
    unit: 'job',
    rate: 340,
  },
];

interface LineItemRow extends LineItem, Record<string, unknown> {}

const DISCOUNT_RATE = 0.05;
const TAX_RATE = 0;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const quantity = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});

const lineTotal = (line: LineItem) => line.qty * line.rate;
const SUBTOTAL = LINE_ITEMS.reduce((sum, line) => sum + lineTotal(line), 0);
const DISCOUNT = Math.round(SUBTOTAL * DISCOUNT_RATE * 100) / 100;
const TAX = Math.round((SUBTOTAL - DISCOUNT) * TAX_RATE * 100) / 100;
const TOTAL = SUBTOTAL - DISCOUNT + TAX;
const DEPOSIT = Math.round(TOTAL * 0.3 * 100) / 100;

// ─── Parts ──────────────────────────────────────────────────────────────────
// Fixed widths for the numbers keep them aligned on every printed page; the
// item column takes the rest. Column alignment applies to the header too.
const COLUMNS: TableColumn<LineItemRow>[] = [
  {
    key: 'item',
    header: 'Item',
    width: proportional(1, {minWidth: 200}),
    renderCell: line => (
      <VStack gap={0}>
        <Text weight="medium">{line.item}</Text>
        <Text type="supporting">{line.detail}</Text>
      </VStack>
    ),
  },
  {
    key: 'qty',
    header: 'Quantity',
    width: pixel(104),
    align: 'end',
    renderCell: line => (
      <Text hasTabularNumbers>
        {quantity.format(line.qty)} {line.unit}
      </Text>
    ),
  },
  {
    key: 'rate',
    header: 'Rate',
    width: pixel(104),
    align: 'end',
    renderCell: line => <Amount value={line.rate} />,
  },
  {
    key: 'amount',
    header: 'Amount',
    width: pixel(112),
    align: 'end',
    renderCell: line => <Amount value={lineTotal(line)} />,
  },
];

function Amount({value, isBold}: {value: number; isBold?: boolean}) {
  return (
    <Text
      display="block"
      justify="end"
      hasTabularNumbers
      weight={isBold ? 'bold' : undefined}>
      {money.format(value)}
    </Text>
  );
}

function AddressBlock({
  title,
  name,
  lines,
}: {
  title: string;
  name: string;
  lines: readonly string[];
}) {
  return (
    <VStack gap={1}>
      <Text type="label" color="secondary">
        {title}
      </Text>
      <Text weight="semibold">{name}</Text>
      {lines.map(line => (
        <Text key={line} type="supporting">
          {line}
        </Text>
      ))}
    </VStack>
  );
}

function TotalRow({
  label,
  value,
  isBold,
}: {
  label: string;
  value: number;
  isBold?: boolean;
}) {
  return (
    <HStack gap={4}>
      <StackItem size="fill">
        <Text weight={isBold ? 'bold' : undefined}>{label}</Text>
      </StackItem>
      <Amount value={value} isBold={isBold} />
    </HStack>
  );
}

function SignatureField({label}: {label: string}) {
  return (
    <StackItem size="fill">
      <VStack gap={1} style={signatureLine}>
        <Divider />
        <Text type="supporting">{label}</Text>
      </VStack>
    </StackItem>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function PrintableEstimateTemplate() {
  const [paper, setPaper] = useState<PaperKey>('letter');

  return (
    <VStack
      className="estimate-backdrop"
      style={backdrop}
      gap={4}
      hAlign="center">
      <style>{printCss(paper)}</style>

      {/* Screen only: choosing the paper size also sets the printed @page. */}
      <HStack
        className="estimate-screen-only"
        style={toolbar(paper)}
        gap={3}
        vAlign="center"
        wrap="wrap">
        <StackItem size="fill">
          <Text weight="semibold">Estimate {ESTIMATE.number}</Text>
        </StackItem>
        <SegmentedControl
          label="Paper size"
          value={paper}
          onChange={value => setPaper(value as PaperKey)}>
          {(Object.keys(PAPER) as PaperKey[]).map(key => (
            <SegmentedControlItem
              key={key}
              value={key}
              label={PAPER[key].label}
            />
          ))}
        </SegmentedControl>
        <Button
          label="Print or save as PDF"
          variant="primary"
          onClick={() => window.print()}
        />
      </HStack>

      <Card className="estimate-sheet" style={sheet(paper)} padding={0}>
        <VStack gap={6} role="main">
          <HStack gap={6} vAlign="start" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="large" weight="bold">
                  {COMPANY.name}
                </Text>
                {COMPANY.lines.map(line => (
                  <Text key={line} type="supporting">
                    {line}
                  </Text>
                ))}
              </VStack>
            </StackItem>
            <VStack gap={1} hAlign="end">
              <Heading level={1}>Estimate</Heading>
              <Text hasTabularNumbers>{ESTIMATE.number}</Text>
            </VStack>
          </HStack>

          <Divider />

          <HStack gap={6} vAlign="start" wrap="wrap">
            <StackItem size="fill">
              <AddressBlock title="Prepared for" {...CLIENT} />
            </StackItem>
            <StackItem size="fill">
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Project
                </Text>
                <Text weight="semibold">{ESTIMATE.project}</Text>
              </VStack>
            </StackItem>
            <MetadataList>
              <MetadataListItem label="Issued">
                {ESTIMATE.issued}
              </MetadataListItem>
              <MetadataListItem label="Valid until">
                {ESTIMATE.validUntil}
              </MetadataListItem>
              <MetadataListItem label="Prepared by">
                {ESTIMATE.preparedBy}
              </MetadataListItem>
            </MetadataList>
          </HStack>

          <VStack gap={3}>
            <Heading level={2}>Scope and pricing</Heading>
            <Table<LineItemRow>
              data={LINE_ITEMS as LineItemRow[]}
              columns={COLUMNS}
              idKey="id"
              density="compact"
              dividers="rows"
              verticalAlign="top"
            />
          </VStack>

          {/* Totals sit outside the table: a table footer repeats on every
              printed page. */}
          <VStack className="estimate-keep-together" gap={4} hAlign="end">
            <VStack gap={2} style={totals}>
              <TotalRow label="Subtotal" value={SUBTOTAL} />
              <TotalRow
                label="Returning-client discount (5%)"
                value={-DISCOUNT}
              />
              <TotalRow label="Sales tax (none in Oregon)" value={TAX} />
              <Divider />
              <TotalRow label="Estimate total" value={TOTAL} isBold />
              <TotalRow label="Deposit due at signing (30%)" value={DEPOSIT} />
            </VStack>
          </VStack>

          <VStack gap={1}>
            <Text type="label" color="secondary">
              Notes
            </Text>
            <Text type="supporting">
              Pricing assumes the existing subfloor is sound. Countertop and
              tile prices hold for 30 days. Client-selected fixtures are not
              included.
            </Text>
          </VStack>

          <VStack className="estimate-keep-together" gap={3}>
            <Heading level={2}>Acceptance</Heading>
            <Text type="supporting">
              Signing approves the scope and pricing above. Changes to the scope
              are priced in writing before work on them starts. The balance is
              due in two equal payments, at cabinet installation and at
              completion.
            </Text>
            <HStack gap={6} wrap="wrap">
              <SignatureField label="Client signature" />
              <SignatureField label="Date" />
            </HStack>
          </VStack>
        </VStack>
      </Card>
    </VStack>
  );
}
