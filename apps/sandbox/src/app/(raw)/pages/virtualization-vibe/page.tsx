// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?case=` (table | chat | selector), `?text=` (100 | 200)
 * @output A throwaway vibe test of the proposed virtualization vocabulary:
 *   each case shows its callsite in the proposed names and a long list that
 *   behaves the way those names describe, on today's engines (Table's
 *   windowing for exact row heights, ChatVirtualizer for measured ones)
 * @position Scratch branch only; never merged. Correctness is secondary to
 *   feel. Document scroll, so it reads like a phone page.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, useTableRowsVirtualization} from '@astryxdesign/core';
import {Heading, Text} from '@astryxdesign/core/Text';
import {ChatVirtualizer, type ChatVirtualizerHandle} from '@astryxdesign/lab';
import {calculateListWindow} from '../../../../../../../packages/core/src/utils/listWindow';
import {FenwickOffsets} from './fenwick';

type CaseId = 'table' | 'chat' | 'selector';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  'order shipped warehouse pending review refund invoice carrier delayed priority customer note address update returned partial backorder confirmed'.split(
    ' ',
  );
function sentence(random: () => number, min: number, max: number): string {
  const n = min + Math.floor(random() * (max - min + 1));
  return Array.from(
    {length: n},
    () => WORDS[Math.floor(random() * WORDS.length)],
  ).join(' ');
}

interface Order extends Record<string, unknown> {
  id: string;
  order: string;
  status: string;
  note: string;
}

function makeOrders(count: number): Order[] {
  const random = mulberry32(7);
  const statuses = ['Shipped', 'Pending', 'Delayed', 'Returned'];
  return Array.from({length: count}, (_, i) => ({
    id: String(i),
    order: `Order ${i + 1}`,
    status: statuses[Math.floor(random() * statuses.length)] ?? 'Shipped',
    note: sentence(random, 3, 40),
  }));
}

const cell: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--color-border, #ddd)',
};
const gridRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7rem 6rem 1fr',
  alignItems: 'start',
};

function OrderRow({
  order,
  wrap,
  height,
}: {
  order: Order;
  wrap: boolean;
  height?: number;
}) {
  return (
    <div
      style={{
        ...gridRow,
        ...(height != null ? {height, overflow: 'hidden'} : null),
      }}>
      <span style={cell}>{order.order}</span>
      <span style={cell}>{order.status}</span>
      <span
        style={{
          ...cell,
          whiteSpace: wrap ? 'normal' : 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
        {order.note}
      </span>
    </div>
  );
}

function OrderHeader() {
  return (
    <div
      style={{
        ...gridRow,
        fontWeight: 600,
        background: 'var(--color-background-muted, #f4f4f4)',
      }}>
      <span style={cell}>Order</span>
      <span style={cell}>Status</span>
      <span style={cell}>Note</span>
    </div>
  );
}

/** Exact row height on page scroll, windowed with Table's listWindow. */
function PageWindowedRows({
  rows,
  rowHeight,
}: {
  rows: Order[];
  rowHeight: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onScroll = () => setTick(t => t + 1);
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  const top = listRef.current
    ? listRef.current.getBoundingClientRect().top + window.scrollY
    : 0;
  const plan = calculateListWindow({
    rowCount: rows.length,
    rowHeight,
    viewportHeight: typeof window === 'undefined' ? 800 : window.innerHeight,
    scrollTop: Math.max(
      0,
      (typeof window === 'undefined' ? 0 : window.scrollY) - top,
    ),
    startOffset: 0,
    isMeasured: true,
  });
  const start = plan?.start ?? 0;
  const end = plan?.end ?? Math.min(rows.length, 30);
  return (
    <div
      ref={listRef}
      style={{position: 'relative', height: rows.length * rowHeight}}>
      {rows.slice(start, end).map((row, i) => (
        <div
          key={row.id}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (start + i) * rowHeight,
          }}>
          <OrderRow order={row} wrap={false} height={rowHeight} />
        </div>
      ))}
    </div>
  );
}

/** Measured (estimated) rows through ChatVirtualizer's engine, held at the top. */
function MeasuredRows({
  rows,
  scrollElement,
}: {
  rows: Order[];
  scrollElement: HTMLElement | null;
}) {
  const handle = useRef<ChatVirtualizerHandle | null>(null);
  useEffect(() => {
    if (!scrollElement) {
      return;
    }
    requestAnimationFrame(() =>
      handle.current?.anchorToKey(rows[0]?.id ?? '0', 0),
    );
  }, [rows, scrollElement]);
  if (!scrollElement) {
    return null;
  }
  return (
    <ChatVirtualizer
      data={rows}
      getRowKey={row => row.id}
      renderItem={({item}) => <OrderRow order={item} wrap />}
      estimatedItemSize={56}
      scrollElement={scrollElement}
      handleRef={handle}
      label="Orders"
    />
  );
}

/**
 * Measured rows on page scroll: a prefix-sum offset model with an estimate,
 * corrected as rows render. ChatVirtualizer opened this case about 574,000 px
 * down the page with an empty viewport, so this case runs on the prototype.
 */
function MeasuredPageRows({
  rows,
  textScale,
}: {
  rows: Order[];
  textScale: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const estimate = 56 * textScale;
  const modelRef = useRef<FenwickOffsets | null>(null);
  if (modelRef.current == null) {
    modelRef.current = new FenwickOffsets(rows.length, estimate);
  }
  const model = modelRef.current;
  const [, setTick] = useState(0);
  const pending = useRef(0);
  useEffect(() => {
    const onScroll = () => setTick(t => t + 1);
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  const observer = useMemo(
    () =>
      new ResizeObserver((entries, self) => {
        const listTop = listRef.current
          ? listRef.current.getBoundingClientRect().top + window.scrollY
          : 0;
        const firstVisible = model.indexAt(
          Math.max(0, window.scrollY - listTop),
        );
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          // A row that left the page reports a zero size. It keeps its last
          // measured size, and the observer lets it go.
          const size = entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight;
          if (!el.isConnected || size <= 0) {
            self.unobserve(el);
            continue;
          }
          const index = Number(el.dataset.index);
          const delta = model.set(
            index,
            entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight,
          );
          // Rows above the first visible row change size out of sight. The
          // page scrolls by the same amount, so the rows on screen stay still.
          if (delta !== 0 && index < firstVisible) {
            pending.current += delta;
          }
        }
        setTick(t => t + 1);
      }),
    [model],
  );
  useEffect(() => () => observer.disconnect(), [observer]);
  useLayoutEffect(() => {
    if (pending.current !== 0) {
      window.scrollBy(0, pending.current);
      pending.current = 0;
    }
  });
  const listTop = listRef.current
    ? listRef.current.getBoundingClientRect().top + window.scrollY
    : 0;
  const top = Math.max(0, window.scrollY - listTop - 400);
  const bottom = window.scrollY - listTop + window.innerHeight + 400;
  const start = model.indexAt(top);
  const indexes: number[] = [];
  for (let i = start; i < rows.length && model.offsetOf(i) < bottom; i++) {
    indexes.push(i);
  }
  return (
    <div ref={listRef} style={{position: 'relative', height: model.total()}}>
      {indexes.map(i => {
        const row = rows[i];
        if (!row) {
          return null;
        }
        return (
          <div
            key={row.id}
            data-index={i}
            ref={el => {
              if (el) {
                observer.observe(el);
              }
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              transform: `translateY(${model.offsetOf(i)}px)`,
            }}>
            <OrderRow order={row} wrap />
          </div>
        );
      })}
    </div>
  );
}

function TableCase({textScale}: {textScale: number}) {
  const rows = useMemo(() => makeOrders(10_000), []);
  const [sizing, setSizing] = useState<'exact' | 'estimate'>('exact');
  const [scroll, setScroll] = useState<'box' | 'page'>('box');
  const [hint, setHint] = useState<'on' | 'off'>('on');
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const virtualization = useTableRowsVirtualization({
    rowHeight: 48,
    viewportHeight: hint === 'on' ? 480 : 360,
  });
  const code = [
    'const virtualization = useTableRowsVirtualization({',
    sizing === 'exact'
      ? '  rowHeight: 48,              // exact: every row is 48 px'
      : '  estimatedRowHeight: 56,     // hint: rows wrap and are measured',
    ...(hint === 'on'
      ? ['  initialViewportHeight: 480,  // first frame only']
      : []),
    ...(scroll === 'page'
      ? ["  scrollRef: 'page',           // the page scrolls, not a box"]
      : []),
    '});',
    '<Table data={orders} columns={columns} idKey="id" virtualization={virtualization} />',
  ].join('\n');
  return (
    <VStack gap={3}>
      <HStack gap={2} wrap="wrap">
        <SegmentedControl
          label="Row size"
          size="sm"
          value={sizing}
          onChange={v => setSizing(v as never)}>
          <SegmentedControlItem value="exact" label="rowHeight" />
          <SegmentedControlItem value="estimate" label="estimatedRowHeight" />
        </SegmentedControl>
        <SegmentedControl
          label="Scroller"
          size="sm"
          value={scroll}
          onChange={v => setScroll(v as never)}>
          <SegmentedControlItem value="box" label="Own box" />
          <SegmentedControlItem value="page" label="scrollRef: page" />
        </SegmentedControl>
        <SegmentedControl
          label="Viewport hint"
          size="sm"
          value={hint}
          onChange={v => setHint(v as never)}>
          <SegmentedControlItem value="on" label="hint 480" />
          <SegmentedControlItem value="off" label="no hint" />
        </SegmentedControl>
      </HStack>
      <CodeBlock code={code} language="tsx" />
      <Text color="secondary">
        10,000 orders.{' '}
        {sizing === 'estimate'
          ? 'Notes wrap, so rows differ in height.'
          : 'Every row is 48 px; long notes are cut.'}
      </Text>
      {sizing === 'exact' && scroll === 'box' && textScale > 1 ? (
        <Text weight="bold">
          Finding: at {Math.round(textScale * 100)}% text the rows are taller
          than rowHeight (48 px), so today&apos;s Table engine turns windowing
          off and renders all 10,000 rows. It may be slow here. The card&apos;s
          proposed guard would switch to measured rows instead.
        </Text>
      ) : null}
      {sizing === 'exact' && scroll === 'box' ? (
        <Table
          data={rows}
          columns={[
            {key: 'order', header: 'Order'},
            {key: 'status', header: 'Status'},
            {key: 'note', header: 'Note'},
          ]}
          idKey="id"
          virtualization={virtualization}
          dividers="grid"
        />
      ) : sizing === 'exact' ? (
        <div>
          <OrderHeader />
          <PageWindowedRows rows={rows} rowHeight={48} />
        </div>
      ) : scroll === 'box' ? (
        <div>
          <OrderHeader />
          <div
            ref={setBox}
            style={{height: hint === 'on' ? 480 : 360, overflowY: 'auto'}}>
            <MeasuredRows rows={rows} scrollElement={box} />
          </div>
        </div>
      ) : (
        <div>
          <Text color="secondary">
            Finding: ChatVirtualizer, given the page as its scroller, opened
            this list about 574,000 px down with an empty screen. This case runs
            on a measured prefix-sum prototype instead.
          </Text>
          <OrderHeader />
          <MeasuredPageRows rows={rows} textScale={textScale} />
        </div>
      )}
    </VStack>
  );
}

interface Message {
  id: string;
  author: string;
  text: string;
}

function ChatCase() {
  const random = useMemo(() => mulberry32(11), []);
  const nextId = useRef(0);
  const olderId = useRef(0);
  const make = (author?: string): Message => ({
    id: `m${nextId.current++}`,
    author: author ?? (random() < 0.5 ? 'You' : 'Assistant'),
    text: sentence(random, 4, 60),
  });
  const [messages, setMessages] = useState<Message[]>(() =>
    Array.from({length: 200}, () => make()),
  );
  const [streaming, setStreaming] = useState(false);
  const handle = useRef<ChatVirtualizerHandle | null>(null);

  useEffect(() => {
    if (!streaming) {
      return;
    }
    // The last message grows while it streams, then a new one starts.
    let words = 0;
    const timer = setInterval(() => {
      setMessages(prev => {
        if (words === 0 || words > 40) {
          words = 1;
          return [...prev, {...make('Assistant'), text: WORDS[0] ?? 'order'}];
        }
        words += 3;
        const last = prev[prev.length - 1];
        if (!last) {
          return prev;
        }
        return [
          ...prev.slice(0, -1),
          {...last, text: `${last.text} ${sentence(random, 3, 3)}`},
        ];
      });
    }, 150);
    return () => clearInterval(timer);
  }, [streaming]);

  const prependOlder = () =>
    setMessages(prev => [
      ...Array.from({length: 30}, () => ({
        id: `o${olderId.current++}`,
        author: 'Earlier',
        text: sentence(random, 4, 50),
      })),
      ...prev,
    ]);

  const code = [
    '<ChatVirtualizer',
    '  data={messages}',
    '  getRowKey={m => m.id}',
    '  renderItem={renderMessage}',
    '  estimatedItemSize={120}',
    '  overscan={{before: 1600, after: 600}}',
    "  scrollRef={'page'}          // the page scrolls",
    '  handleRef={handle}',
    '/>',
    '',
    "// anchor defaults to 'end': new messages keep you at the bottom",
    'handle.current?.anchorToEnd();',
  ].join('\n');

  return (
    <VStack gap={3}>
      <HStack gap={2} wrap="wrap">
        <Button
          label={streaming ? 'Stop streaming' : 'Start streaming'}
          size="sm"
          onClick={() => setStreaming(s => !s)}
        />
        <Button
          label="Load older (prepend 30)"
          size="sm"
          variant="secondary"
          onClick={prependOlder}
        />
        <Button
          label="anchorToEnd()"
          size="sm"
          variant="secondary"
          onClick={() => handle.current?.scrollToDistanceFromBottomPx(0)}
        />
      </HStack>
      <CodeBlock code={code} language="tsx" />
      <Text color="secondary">
        Try: start streaming at the bottom (it follows), scroll up and read
        while it streams (it holds still), load older history (your place
        stays).
      </Text>
      <ChatVirtualizer
        data={messages}
        getRowKey={m => m.id}
        renderItem={({item}) => (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid var(--color-border, #ddd)',
            }}>
            <strong>{item.author}</strong>
            <div>{item.text}</div>
          </div>
        )}
        estimatedItemSize={120}
        scrollElement={
          typeof document === 'undefined'
            ? null
            : (document.scrollingElement as HTMLElement)
        }
        handleRef={handle}
        label="Conversation"
      />
    </VStack>
  );
}

/** A windowed listbox prototype opened at the selected option. */
function WindowedListbox({
  options,
  value,
  onPick,
}: {
  options: {value: string; label: string}[];
  value: string;
  onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 36;
  const height = 320;
  useLayoutEffect(() => {
    const index = options.findIndex(o => o.value === value);
    const top = Math.max(0, index * rowHeight - height / 2 + rowHeight / 2);
    if (ref.current) {
      ref.current.scrollTop = top;
    }
    setScrollTop(top);
  }, [options, value]);
  const plan = calculateListWindow({
    rowCount: options.length,
    rowHeight,
    viewportHeight: height,
    scrollTop,
    startOffset: 0,
    isMeasured: true,
  });
  const start = plan?.start ?? 0;
  const end = plan?.end ?? 20;
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Options"
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      style={{
        height,
        overflowY: 'auto',
        border: '1px solid var(--color-border, #ccc)',
        borderRadius: 8,
      }}>
      <div style={{position: 'relative', height: options.length * rowHeight}}>
        {options.slice(start, end).map((o, i) => (
          <div
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            aria-posinset={start + i + 1}
            aria-setsize={options.length}
            onClick={() => onPick(o.value)}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (start + i) * rowHeight,
              height: rowHeight,
              lineHeight: `${rowHeight}px`,
              padding: '0 0.75rem',
              cursor: 'pointer',
              fontWeight: o.value === value ? 600 : 400,
              background:
                o.value === value
                  ? 'var(--color-background-muted, #eef)'
                  : undefined,
            }}>
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectorCase() {
  const options = useMemo(
    () =>
      Array.from({length: 2000}, (_, i) => ({
        value: `opt-${i}`,
        label: `Warehouse ${String(i + 1).padStart(4, '0')}`,
      })),
    [],
  );
  const [value, setValue] = useState('opt-1500');
  const [variant, setVariant] = useState<'today' | 'windowed'>('today');
  const [open, setOpen] = useState(false);
  const code =
    variant === 'today'
      ? '<Selector label="Warehouse" options={warehouses} value={value} onChange={setValue} />\n// today: all 2,000 options render when it opens'
      : '<Selector label="Warehouse" options={warehouses} value={value} onChange={setValue} />\n// same callsite; Selector windows its list internally\n// and opens at the selected key (reserved: anchor, overscan)';
  return (
    <VStack gap={3}>
      <SegmentedControl
        label="Variant"
        size="sm"
        value={variant}
        onChange={v => setVariant(v as never)}>
        <SegmentedControlItem value="today" label="Today (all options)" />
        <SegmentedControlItem value="windowed" label="Windowed prototype" />
      </SegmentedControl>
      <CodeBlock code={code} language="tsx" />
      <Text color="secondary">
        2,000 options; the selected one is Warehouse 1501. Open it and feel how
        fast it opens and whether it lands on the selection.
      </Text>
      {variant === 'today' ? (
        <Selector
          label="Warehouse"
          options={options}
          value={value}
          onChange={setValue}
        />
      ) : (
        <VStack gap={2}>
          <Button
            label={`Warehouse: ${options.find(o => o.value === value)?.label ?? ''}`}
            variant="secondary"
            onClick={() => setOpen(o => !o)}
          />
          {open ? (
            <WindowedListbox
              options={options}
              value={value}
              onPick={v => {
                setValue(v);
                setOpen(false);
              }}
            />
          ) : null}
        </VStack>
      )}
    </VStack>
  );
}

const CASES: Record<CaseId, {title: string; tryThis: string}> = {
  table: {
    title: 'Table · 10,000 rows',
    tryThis:
      'Switch rowHeight ↔ estimatedRowHeight and own box ↔ page; fling to the end; flip text to 200%.',
  },
  chat: {
    title: 'Chat · streaming',
    tryThis:
      'Start streaming at the bottom, then scroll up mid-stream, then load older history.',
  },
  selector: {
    title: 'Selector · 2,000 options',
    tryThis: 'Open it in both variants; it should land on Warehouse 1501.',
  },
};

export default function VirtualizationVibePage() {
  const [state, setState] = useState<{c: CaseId; text: number} | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = (q.get('case') ?? 'table') as CaseId;
    setState({c: c in CASES ? c : 'table', text: Number(q.get('text') ?? 100)});
  }, []);
  useLayoutEffect(() => {
    if (state) {
      document.documentElement.style.fontSize =
        state.text === 100 ? '' : `${state.text}%`;
    }
  }, [state]);
  if (!state) {
    return null;
  }
  const go = (c: CaseId, text = state.text) => {
    const q = new URLSearchParams({case: c, text: String(text)});
    window.history.replaceState(null, '', `?${q.toString()}`);
    setState({c, text});
  };
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Virtualization vibe test</Heading>
        <Text color="secondary">
          Throwaway prototype of the proposed names on today's engines. Feel,
          not correctness.
        </Text>
      </VStack>
      <HStack gap={2} wrap="wrap">
        {(Object.keys(CASES) as CaseId[]).map(c => (
          <Button
            key={c}
            label={CASES[c].title}
            size="sm"
            variant={c === state.c ? 'primary' : 'secondary'}
            onClick={() => go(c)}
          />
        ))}
        <Button
          label={`Text ${state.text === 100 ? '100%' : '200%'} → ${state.text === 100 ? '200%' : '100%'}`}
          size="sm"
          variant="secondary"
          onClick={() => go(state.c, state.text === 100 ? 200 : 100)}
        />
      </HStack>
      <Text weight="bold">Try this: {CASES[state.c].tryThis}</Text>
      {state.c === 'table' ? (
        <TableCase key={`t${state.text}`} textScale={state.text / 100} />
      ) : state.c === 'chat' ? (
        <ChatCase key={`c${state.text}`} />
      ) : (
        <SelectorCase key={`s${state.text}`} />
      )}
    </VStack>
  );
}
