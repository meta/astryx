// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input Four parents for a windowed Table of 10,000 rows
 * @output Each Table with a live readout of its scroll area: height,
 *   scrollHeight, the rows in the DOM, and whether it scrolls
 * @position A raw preview page that shows what a windowed Table does when its
 *   parent gives it no height. The page scrolls with the document.
 */

import {useCallback, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {
  Table,
  useTableRowsVirtualization,
  type TableColumn,
} from '@astryxdesign/core/Table';
import {Heading, Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
}

const ROW_COUNT = 10_000;
const rows: Row[] = Array.from({length: ROW_COUNT}, (_, index) => ({
  id: String(index),
  name: `Item ${index + 1}`,
  status: index % 3 === 0 ? 'Ready' : 'Queued',
}));
const columns: TableColumn<Row>[] = [
  {key: 'name', header: 'Name'},
  {key: 'status', header: 'Status'},
];

const styles = stylex.create({
  page: {
    paddingBlock: spacingVars['--spacing-6'],
    paddingInline: spacingVars['--spacing-4'],
    maxWidth: 960,
    marginInline: 'auto',
  },
  // (a) A block parent that sets no height.
  plainBlock: {
    display: 'block',
  },
  // (b) A 400px flex column; the Table is its child, with no min-height: 0
  // from the caller.
  flexColumn: {
    display: 'flex',
    flexDirection: 'column',
    height: 400,
  },
  // (c) A grid cell in an auto-sized row.
  gridAuto: {
    display: 'grid',
    gridAutoRows: 'auto',
  },
  // (d) Control: a block parent 400px tall.
  sized: {
    display: 'block',
    height: 400,
  },
  readout: {
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
  },
});

interface Reading {
  height: number;
  scrollHeight: number;
  mountedRows: number;
  scrolls: boolean;
}

/** Reads the scroll area that wraps the Table inside `section`. */
function read(section: HTMLElement): Reading | null {
  const table = section.querySelector('table');
  const area = table?.closest('[role="group"]');
  if (!(area instanceof HTMLElement) || table == null) {
    return null;
  }
  const mountedRows = Array.from(table.querySelectorAll('tbody > tr')).filter(
    row => row.getAttribute('aria-hidden') !== 'true',
  ).length;
  return {
    height: Math.round(area.clientHeight),
    scrollHeight: Math.round(area.scrollHeight),
    mountedRows,
    scrolls: area.scrollHeight > area.clientHeight + 1,
  };
}

function Case({
  id,
  title,
  description,
  parentStyle,
}: {
  id: string;
  title: string;
  description: string;
  parentStyle: stylex.StyleXStyles;
}) {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 400,
  });
  const [reading, setReading] = useState<Reading | null>(null);
  // The readout updates on the Table's own scrolls and on a slow timer, so a
  // page scroll or a resize also shows.
  const sectionRef = useCallback((node: HTMLElement | null) => {
    if (node == null) {
      return;
    }
    const update = () => setReading(read(node));
    const timer = window.setInterval(update, 500);
    node.addEventListener('scroll', update, {capture: true, passive: true});
    update();
    return () => {
      window.clearInterval(timer);
      node.removeEventListener('scroll', update, {capture: true});
    };
  }, []);
  return (
    <section id={id} ref={sectionRef}>
      <VStack gap={2}>
        <Heading level={2}>{title}</Heading>
        <Text color="secondary">{description}</Text>
        <Readout reading={reading} />
        <div {...stylex.props(parentStyle)}>
          <Table
            data={rows}
            columns={columns}
            idKey="id"
            virtualization={virtualization}
            aria-label={title}
          />
        </div>
      </VStack>
    </section>
  );
}

function Readout({reading}: {reading: Reading | null}): ReactNode {
  if (reading == null) {
    return <Text {...stylex.props(styles.readout)}>measuring…</Text>;
  }
  return (
    <Text>
      <span {...stylex.props(styles.readout)} data-readout="">
        scroll area {reading.height}px · scrollHeight {reading.scrollHeight}px ·
        rows in DOM {reading.mountedRows} of {ROW_COUNT} · scrolls{' '}
        {reading.scrolls ? 'yes' : 'no'}
      </span>
    </Text>
  );
}

export default function TableUnsizedParentPage() {
  return (
    <main {...stylex.props(styles.page)}>
      <VStack gap={8}>
        <VStack gap={2}>
          <Heading level={1}>Windowed Table parents</Heading>
          <Text color="secondary">
            Each section holds a windowed Table of 10,000 rows at a 56px row
            height, with initialViewportHeight 400. The readout shows the
            Table&apos;s scroll area. Open the console for development warnings.
          </Text>
        </VStack>
        <Case
          id="plain-block"
          title="(a) Plain block parent, no height"
          description="The parent is a block that sets no height."
          parentStyle={styles.plainBlock}
        />
        <Case
          id="flex-column"
          title="(b) Flex column, 400px, no min-height: 0"
          description="The parent is a 400px flex column; the Table is its only child."
          parentStyle={styles.flexColumn}
        />
        <Case
          id="grid-auto"
          title="(c) Grid cell, auto rows"
          description="The parent is a grid whose rows size to their content."
          parentStyle={styles.gridAuto}
        />
        <Case
          id="sized"
          title="(d) Control: sized parent, 400px"
          description="The parent is a block 400px tall."
          parentStyle={styles.sized}
        />
      </VStack>
    </main>
  );
}
