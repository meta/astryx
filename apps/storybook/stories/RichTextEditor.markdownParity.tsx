// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.markdownParity.tsx
 * @input Core Markdown for the read surface; RichTextEditor with its toolbar and
 *   the Lexical plugins available today for the edit surface; the parity
 *   fixture; the Storybook demo Markdown plugins; 16px wide-counter fixtures
 *   with ordered, unordered and pure-task ancestry.
 * @output `MarkdownParitySandbox`: one Markdown document rendered by both
 *   surfaces side by side, swapped in place, or overlaid, with diagnostic
 *   per-block geometry and the scroll anchor across a mode switch.
 *   `WideNumberMarkerParity`, `MixedNumberMarkerParity` and
 *   `TaskParentNumberMarkerParity` compare short and wide outside counters on
 *   Markdown, RichTextView, and RichTextEditor.
 * @position Storybook-only diagnostic for RichTextEditor.stories.tsx. It shows
 *   current behavior and fixes nothing: every difference it reports is a
 *   finding, and none of its numbers is a target.
 *
 * Stable hooks for browser tests: `data-parity-sandbox` (the view),
 * `data-parity-surface` (markdown | richtext | toggle) with
 * `data-parity-mode` on the toggled surface, `data-parity-body` on the
 * measured element inside each surface, `data-parity-block` and
 * `data-parity-copy` on every paired block, `data-parity-row` on each
 * measurement row, and `data-parity-anchor` on the scroll-anchor readout.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Banner} from '@astryxdesign/core/Banner';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Text} from '@astryxdesign/core/Text';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {defineTheme, Theme, useTheme} from '@astryxdesign/core/theme';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  RichTextEditor,
  RichTextView,
  RichTextEditorAutoLinkPlugin,
  RichTextEditorToolbar,
  markdownToEditorStateJSON,
} from '@astryxdesign/richtext';
import {markdownDemoPlugins} from './Markdown.demoPlugins';
import {
  MARKDOWN_PARITY_BLOCKS,
  MARKDOWN_PARITY_SOURCE,
  type MarkdownParityBlock,
} from './RichTextEditor.markdownParityFixture';

/** Copies of the fixture in the long document. */
export const LONG_DOCUMENT_COPIES = 12;

/**
 * Top-level elements the pairing may pass over while looking for a block before
 * deciding the block produced no element of its own. Bounded so that a missing
 * block cannot pair with its twin in a later copy of the document.
 */
const PAIRING_LOOKAHEAD = 4;

export type ParityView = 'side-by-side' | 'toggle' | 'overlay';
export type ParityHostWidth = 'fill' | '680px';

export interface MarkdownParitySandboxProps {
  /** Both surfaces side by side, one column swapped in place, or overlaid. */
  view: ParityView;
  /** Repeat the fixture so the document is long enough to scroll. */
  isLongDocument: boolean;
  /**
   * Render each side with the extensions it has today: Markdown's GFM
   * autolinks and the Storybook demo plugins on the read side, RichText's
   * autolink plugin on the edit side.
   */
  hasPlugins: boolean;
  /** Width of each column, the way a host page might constrain it. */
  hostWidth: ParityHostWidth;
}

type Mode = 'read' | 'edit';

interface Box {
  readonly top: number;
  readonly height: number;
  readonly width: number;
}

interface Geometry {
  readonly surface: Surface;
  /** The whole surface. */
  readonly box: Box;
  /** Paired blocks by `<key>@<copy>`, relative to the surface's top edge. */
  readonly blocks: ReadonlyMap<string, Box>;
}

interface ParityContent {
  readonly source: string;
  readonly copies: number;
  readonly hasPlugins: boolean;
  readonly editorState: string;
}

interface PendingAnchor {
  readonly from: Surface;
  readonly key: string;
  readonly copy: number;
  /** Viewport top of the anchored block before the switch. */
  readonly top: number;
  readonly scrollY: number;
}

interface AnchorShift {
  readonly key: string;
  readonly copy: number;
  /** How far the anchored block moved; `null` when it has no pair. */
  readonly delta: number | null;
  readonly scrollBefore: number;
  readonly scrollAfter: number;
}

const styles = stylex.create({
  sandbox: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
  },
  columns: {
    display: 'grid',
    gap: spacingVars['--spacing-4'],
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    alignItems: 'start',
  },
  stack: {
    display: 'grid',
    alignItems: 'start',
  },
  stackLayer: {
    gridArea: '1 / 1',
  },
  differenceLayer: {
    mixBlendMode: 'difference',
  },
  surface: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
  },
  hostWidth: {
    width: '100%',
    maxWidth: 680,
  },
  controls: {
    position: 'sticky',
    top: 0,
    // Paints over the document scrolling beneath it; local to this story.
    zIndex: 2,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-2'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  tableScroller: {
    overflowX: 'auto',
    maxWidth: '100%',
  },
  table: {
    borderCollapse: 'collapse',
    fontVariantNumeric: 'tabular-nums',
  },
  caption: {
    textAlign: 'start',
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  cell: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderBlockEndWidth: 1,
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
    textAlign: 'end',
    whiteSpace: 'nowrap',
  },
  labelCell: {
    textAlign: 'start',
  },
});

const round = (value: number): number => Math.round(value * 10) / 10;

const boxOf = (rect: DOMRect, origin: DOMRect): Box => ({
  top: round(rect.top - origin.top),
  height: round(rect.height),
  width: round(rect.width),
});

const blockId = (key: string, copy: number | string): string =>
  `${key}@${copy}`;

function normalizedText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function rendersBlock(element: Element, block: MarkdownParityBlock): boolean {
  if (block.probe != null) {
    return normalizedText(element).includes(block.probe);
  }
  return (
    element.matches('hr') ||
    element.querySelector('hr') != null ||
    normalizedText(element) === block.markdown.trim()
  );
}

/**
 * Marks the top-level element each fixture block rendered as. Pairing walks
 * the content root's children in document order and matches by text, so it
 * does not depend on either renderer's markup; a block that produced no
 * element of its own is left unmarked and reported as unpaired.
 */
function pairBlocks(root: Element, copies: number): void {
  const children = Array.from(root.children);
  for (const child of children) {
    child.removeAttribute('data-parity-block');
    child.removeAttribute('data-parity-copy');
  }
  let next = 0;
  for (let copy = 1; copy <= copies; copy += 1) {
    for (const block of MARKDOWN_PARITY_BLOCKS) {
      const end = Math.min(children.length, next + PAIRING_LOOKAHEAD);
      for (let index = next; index < end; index += 1) {
        if (rendersBlock(children[index], block)) {
          children[index].setAttribute('data-parity-block', block.key);
          children[index].setAttribute('data-parity-copy', String(copy));
          next = index + 1;
          break;
        }
      }
    }
  }
}

function measure(body: HTMLElement, surface: Surface): Geometry {
  const origin = body.getBoundingClientRect();
  const blocks = new Map<string, Box>();
  for (const element of body.querySelectorAll<HTMLElement>(
    '[data-parity-block]',
  )) {
    blocks.set(
      blockId(
        element.dataset.parityBlock ?? '',
        element.dataset.parityCopy ?? '',
      ),
      boxOf(element.getBoundingClientRect(), origin),
    );
  }
  return {surface, box: boxOf(origin, origin), blocks};
}

const geometryKey = (geometry: Geometry): string =>
  JSON.stringify([geometry.surface, geometry.box, [...geometry.blocks]]);

/**
 * Keeps one surface's blocks paired and measured. Lexical fills its editable
 * after mount and rewrites blocks as someone types, so pairing reruns on every
 * DOM or size change rather than once.
 */
function useMeasuredSurface(
  surface: Surface,
  copies: number,
  onMeasure: (geometry: Geometry) => void,
): (element: HTMLElement | null) => void {
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (body == null) {
      return undefined;
    }
    let frame = 0;
    let last = '';
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = SURFACES[surface].contentRoot(body);
        if (root == null) {
          return;
        }
        pairBlocks(root, copies);
        const geometry = measure(body, surface);
        const key = geometryKey(geometry);
        if (key !== last) {
          last = key;
          onMeasure(geometry);
        }
      });
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(body);
    // Attributes are deliberately not observed: pairing writes them.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [body, surface, copies, onMeasure]);
  return setBody;
}

/** The first paired block still visible below the sticky controls. */
function captureAnchor(
  body: HTMLElement | null,
  controls: HTMLElement | null,
  from: Surface,
): PendingAnchor | null {
  if (body == null) {
    return null;
  }
  const viewTop = controls?.getBoundingClientRect().bottom ?? 0;
  for (const element of body.querySelectorAll<HTMLElement>(
    '[data-parity-block]',
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > viewTop) {
      return {
        from,
        key: element.dataset.parityBlock ?? '',
        copy: Number(element.dataset.parityCopy),
        top: rect.top,
        scrollY: window.scrollY,
      };
    }
  }
  return null;
}

function resolveAnchor(anchor: PendingAnchor, body: HTMLElement): AnchorShift {
  const element = body.querySelector(
    `[data-parity-block="${anchor.key}"][data-parity-copy="${anchor.copy}"]`,
  );
  return {
    key: anchor.key,
    copy: anchor.copy,
    delta:
      element == null
        ? null
        : round(element.getBoundingClientRect().top - anchor.top),
    scrollBefore: round(anchor.scrollY),
    scrollAfter: round(window.scrollY),
  };
}

const formatPx = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatDelta = (value: number): string =>
  `${value > 0 ? '+' : ''}${formatPx(value)}`;

const labelOf = (key: string): string =>
  MARKDOWN_PARITY_BLOCKS.find(block => block.key === key)?.label ?? key;

function MarkdownRead({content}: {content: ParityContent}) {
  return (
    <Markdown
      autolink={content.hasPlugins ? 'gfm' : undefined}
      plugins={content.hasPlugins ? markdownDemoPlugins : undefined}>
      {content.source}
    </Markdown>
  );
}

function RichTextEdit({content}: {content: ParityContent}) {
  return (
    <RichTextEditor
      label="Document"
      isLabelHidden
      defaultValue={content.editorState}
      toolbar={<RichTextEditorToolbar />}
      plugins={
        content.hasPlugins ? <RichTextEditorAutoLinkPlugin /> : undefined
      }
    />
  );
}

interface SurfaceDefinition {
  /** Accessible name and caption of the surface. */
  readonly label: string;
  /** The element whose children are the document's top-level blocks. */
  readonly contentRoot: (body: HTMLElement) => Element | null;
  readonly render: (content: ParityContent) => ReactNode;
}

/**
 * Every renderer the sandbox can measure. Pairing and measurement only need
 * `contentRoot`, so another surface (a second editor, a compatibility spike)
 * is one more entry here.
 */
const SURFACES = {
  markdown: {
    label: 'Markdown, read mode',
    contentRoot: body => body.firstElementChild,
    render: content => <MarkdownRead content={content} />,
  },
  richtext: {
    label: 'RichText, edit mode',
    contentRoot: body => body.querySelector('[contenteditable]'),
    render: content => <RichTextEdit content={content} />,
  },
} satisfies Record<string, SurfaceDefinition>;

type Surface = keyof typeof SURFACES;

/** The in-place toggle swaps the read renderer for the edit renderer. */
const TOGGLE_SURFACES: Readonly<Record<Mode, Surface>> = {
  read: 'markdown',
  edit: 'richtext',
};

interface SurfaceSectionProps {
  surface: Surface | 'toggle';
  label: string;
  mode?: Mode;
  bodyRef: (element: HTMLElement | null) => void;
  isHosted: boolean;
  /** Set when the surface is one layer of the overlay. */
  layer?: 'base' | 'difference';
  children: ReactNode;
}

function SurfaceSection({
  surface,
  label,
  mode,
  bodyRef,
  isHosted,
  layer,
  children,
}: SurfaceSectionProps) {
  return (
    <section
      aria-label={label}
      data-parity-surface={surface}
      data-parity-mode={mode}
      // The difference layer is a picture of the editor, not a second copy of
      // it: keep it out of the tab order and the accessibility tree.
      inert={layer === 'difference' ? true : undefined}
      {...stylex.props(
        styles.surface,
        isHosted && styles.hostWidth,
        layer != null && styles.stackLayer,
        layer === 'difference' && styles.differenceLayer,
      )}>
      {layer == null ? (
        <Text as="p" type="label">
          {label}
        </Text>
      ) : null}
      <div ref={bodyRef} data-parity-body="">
        {children}
      </div>
    </section>
  );
}

interface MeasurementColumn {
  readonly label: string;
  readonly geometry: Geometry | null;
}

function cellText(geometry: Geometry | null, box: Box | undefined): string {
  if (geometry == null) {
    return 'not measured';
  }
  return box == null
    ? 'not paired'
    : `${formatPx(box.top)} / ${formatPx(box.height)}`;
}

function Measurements({
  left,
  right,
}: {
  left: MeasurementColumn;
  right: MeasurementColumn;
}) {
  const rows = [
    {
      key: 'surface',
      label: 'Whole surface',
      a: left.geometry?.box,
      b: right.geometry?.box,
    },
    ...MARKDOWN_PARITY_BLOCKS.map(block => ({
      key: block.key,
      label: block.label,
      a: left.geometry?.blocks.get(blockId(block.key, 1)),
      b: right.geometry?.blocks.get(blockId(block.key, 1)),
    })),
  ];
  const cell = stylex.props(styles.cell);
  const labelCell = stylex.props(styles.cell, styles.labelCell);
  return (
    <Text as="div" type="supporting">
      <div
        role="region"
        aria-label="Diagnostic measurements"
        // Keyboard users must be able to scroll a table wider than the view.
        tabIndex={0}
        {...stylex.props(styles.tableScroller)}>
        <table data-parity-measurements="" {...stylex.props(styles.table)}>
          <caption {...stylex.props(styles.caption)}>
            Diagnostic measurements, not targets. Border-box top / height in px
            from each surface&apos;s top edge, first copy of the document. Δ is{' '}
            {right.label} minus {left.label}.
          </caption>
          <thead>
            <tr>
              <th scope="col" {...labelCell}>
                Block
              </th>
              <th scope="col" {...cell}>
                {left.label}
              </th>
              <th scope="col" {...cell}>
                {right.label}
              </th>
              <th scope="col" {...cell}>
                Δ top
              </th>
              <th scope="col" {...cell}>
                Δ height
              </th>
              <th scope="col" {...cell}>
                Δ width
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({key, label, a, b}) => {
              const delta = (field: keyof Box) =>
                a != null && b != null
                  ? formatDelta(round(b[field] - a[field]))
                  : '—';
              return (
                <tr
                  key={key}
                  data-parity-row={key}
                  data-parity-left={
                    a == null ? undefined : `${a.top} ${a.height} ${a.width}`
                  }
                  data-parity-right={
                    b == null ? undefined : `${b.top} ${b.height} ${b.width}`
                  }>
                  <th scope="row" {...labelCell}>
                    {label}
                  </th>
                  <td {...cell}>{cellText(left.geometry, a)}</td>
                  <td {...cell}>{cellText(right.geometry, b)}</td>
                  <td {...cell}>{delta('top')}</td>
                  <td {...cell}>{delta('height')}</td>
                  <td {...cell}>{delta('width')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Text>
  );
}

function PairView({
  content,
  hostWidth,
  isOverlay,
}: {
  content: ParityContent;
  hostWidth: ParityHostWidth;
  isOverlay: boolean;
}) {
  const [markdown, setMarkdown] = useState<Geometry | null>(null);
  const [richText, setRichText] = useState<Geometry | null>(null);
  const markdownBody = useMeasuredSurface(
    'markdown',
    content.copies,
    setMarkdown,
  );
  const richTextBody = useMeasuredSurface(
    'richtext',
    content.copies,
    setRichText,
  );
  const isHosted = hostWidth === '680px';
  return (
    <>
      {isOverlay ? (
        <Text as="p" type="supporting">
          RichText (edit) is drawn over Markdown (read) with a difference blend,
          so pixels that match cancel to black. The overlay is a picture only:
          the editor is not interactive in this view.
        </Text>
      ) : null}
      <div
        {...stylex.props(
          isOverlay ? styles.stack : styles.columns,
          isOverlay && isHosted && styles.hostWidth,
        )}>
        <SurfaceSection
          surface="markdown"
          label={SURFACES.markdown.label}
          bodyRef={markdownBody}
          isHosted={isHosted && !isOverlay}
          layer={isOverlay ? 'base' : undefined}>
          {SURFACES.markdown.render(content)}
        </SurfaceSection>
        <SurfaceSection
          surface="richtext"
          label={SURFACES.richtext.label}
          bodyRef={richTextBody}
          isHosted={isHosted && !isOverlay}
          layer={isOverlay ? 'difference' : undefined}>
          {SURFACES.richtext.render(content)}
        </SurfaceSection>
      </div>
      <Measurements
        left={{label: 'Markdown (read)', geometry: markdown}}
        right={{label: 'RichText (edit)', geometry: richText}}
      />
    </>
  );
}

function AnchorReadout({shift}: {shift: AnchorShift | null}) {
  if (shift == null) {
    return (
      <span data-parity-anchor="">
        <Text type="supporting">
          Scroll, then switch modes: this shows how far the block at the top of
          the view moves.
        </Text>
      </span>
    );
  }
  const where = `“${labelOf(shift.key)}” (copy ${shift.copy})`;
  const scroll = `scrollY ${formatPx(shift.scrollBefore)} → ${formatPx(shift.scrollAfter)}`;
  return (
    <span
      data-parity-anchor={shift.key}
      data-parity-anchor-copy={shift.copy}
      data-parity-anchor-delta={shift.delta ?? undefined}
      data-parity-anchor-scroll={`${shift.scrollBefore} ${shift.scrollAfter}`}>
      <Text type="supporting">
        {shift.delta == null
          ? `Anchor ${where} has no paired block in this mode; ${scroll}.`
          : `Anchor ${where} moved ${formatDelta(shift.delta)} px; ${scroll}.`}
      </Text>
    </span>
  );
}

function ToggleView({
  content,
  hostWidth,
}: {
  content: ParityContent;
  hostWidth: ParityHostWidth;
}) {
  const [mode, setMode] = useState<Mode>('read');
  const [read, setRead] = useState<Geometry | null>(null);
  const [edit, setEdit] = useState<Geometry | null>(null);
  const [shift, setShift] = useState<AnchorShift | null>(null);
  const pendingAnchor = useRef<PendingAnchor | null>(null);
  const bodyElement = useRef<HTMLElement | null>(null);
  const controls = useRef<HTMLDivElement | null>(null);

  const onMeasure = useCallback((geometry: Geometry) => {
    if (geometry.surface === TOGGLE_SURFACES.read) {
      setRead(geometry);
    } else {
      setEdit(geometry);
    }
    const anchor = pendingAnchor.current;
    const body = bodyElement.current;
    // Resolve once the new surface has painted its blocks, not on mount.
    if (
      anchor != null &&
      body != null &&
      geometry.surface !== anchor.from &&
      geometry.blocks.size > 0
    ) {
      pendingAnchor.current = null;
      setShift(resolveAnchor(anchor, body));
    }
  }, []);

  const surface = TOGGLE_SURFACES[mode];
  const measuredBody = useMeasuredSurface(surface, content.copies, onMeasure);
  const bodyRef = useCallback(
    (element: HTMLElement | null) => {
      bodyElement.current = element;
      measuredBody(element);
    },
    [measuredBody],
  );

  const onEditingChange = (isEditing: boolean) => {
    const next: Mode = isEditing ? 'edit' : 'read';
    if (next === mode) {
      return;
    }
    pendingAnchor.current = captureAnchor(
      bodyElement.current,
      controls.current,
      surface,
    );
    setShift(null);
    setMode(next);
  };

  return (
    <>
      <div ref={controls} {...stylex.props(styles.controls)}>
        <ToggleButton
          label="Edit mode"
          isPressed={mode === 'edit'}
          onPressedChange={onEditingChange}
        />
        <AnchorReadout shift={shift} />
      </div>
      <Text as="p" type="supporting">
        Edit mode swaps Markdown for a RichTextEditor imported from the same
        source. Read mode always shows the source as authored, so edits are
        discarded when you switch back.
      </Text>
      <SurfaceSection
        surface="toggle"
        mode={mode}
        label={SURFACES[surface].label}
        bodyRef={bodyRef}
        isHosted={hostWidth === '680px'}>
        {SURFACES[surface].render(content)}
      </SurfaceSection>
      <Measurements
        left={{label: 'Read (last measured)', geometry: read}}
        right={{label: 'Edit (last measured)', geometry: edit}}
      />
    </>
  );
}

/**
 * Renders one Markdown document with core Markdown (read) and RichTextEditor
 * (edit), and reports where each block lands on both. It demonstrates current
 * behavior; it does not promise parity.
 */
export function MarkdownParitySandbox({
  view,
  isLongDocument,
  hasPlugins,
  hostWidth,
}: MarkdownParitySandboxProps) {
  const copies = isLongDocument ? LONG_DOCUMENT_COPIES : 1;
  const content = useMemo<ParityContent>(() => {
    const source = Array.from(
      {length: copies},
      () => MARKDOWN_PARITY_SOURCE,
    ).join('\n');
    return {
      source,
      copies,
      hasPlugins,
      editorState: markdownToEditorStateJSON(source),
    };
  }, [copies, hasPlugins]);
  // Remount on a content change: the editor reads its value once, on mount.
  const contentKey = `${copies}:${String(hasPlugins)}`;

  return (
    <div
      data-parity-sandbox={view}
      data-parity-copies={copies}
      {...stylex.props(styles.sandbox)}>
      <Banner
        status="info"
        title="Diagnostic sandbox: current behavior, not a parity promise"
        description="Core Markdown (read) and RichTextEditor (edit) render the same Markdown source. Differences shown here are findings about the components today, and the measurements are diagnostic, not targets."
      />
      {view === 'toggle' ? (
        <ToggleView key={contentKey} content={content} hostWidth={hostWidth} />
      ) : (
        <PairView
          key={contentKey}
          content={content}
          hostWidth={hostWidth}
          isOverlay={view === 'overlay'}
        />
      )}
    </div>
  );
}

// A real Theme override, not a font-size declaration on the story wrapper:
// both document text and generated counters must resolve to 16px.
const wideMarkerTheme = defineTheme({
  name: 'wide-number-marker-parity',
  typography: {scale: {base: 16, ratio: 1.2}},
});

const WIDE_MARKER_SOURCE = [
  'Reference paragraph.',
  '',
  '9. Short decimal',
  '',
  'A paragraph separates lists.',
  '',
  '999. Before four digits',
  '1000. Four digits',
  '      1. Nested under four digits',
  '1001. Sibling after four digits',
  '',
  'Another separate list.',
  '',
  '2024. Year counter',
  '',
  'The widest decimal supported by Markdown source syntax.',
  '',
  '999999999. Nine digits',
  '',
  'Nested counters resolve from their parent text line.',
  '',
  '1. Outer parent',
  '   1. Middle parent',
  '      1. Short roman',
  '2. Other outer parent',
  '   1. Other middle parent',
  '',
  '      27. Before long roman',
  '      28. Long roman',
  '      29. After long roman',
  '',
  'A still wider roman counter.',
  '',
  '1. Last outer parent',
  '   1. Last middle parent',
  '',
  '      1888. Much wider roman',
].join('\n');

const wideMarkerStyles = stylex.create({
  editorFrame: {
    // The field's 8px inset and 1px border offset its document. Give the frame
    // that space outside the common measure, rather than testing unequal widths.
    width: `calc(100% + 2 * (${spacingVars['--spacing-2']} + 1px))`,
    marginInline: `calc(-1 * (${spacingVars['--spacing-2']} + 1px))`,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: spacingVars['--spacing-4'],
  },
  surface: {
    minWidth: 0,
    // Space to photograph outside ink, including nine-digit counters, without
    // the viewport cropping it. The document's ordinary list inset is unchanged.
    paddingInline: 96,
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
});

const MIXED_MARKER_SOURCE = [
  'Reference paragraph.',
  '',
  '- Outer bullet',
  '  - Inner bullet',
  '',
  '    388. Mixed roman counter',
  '    389. Roman sibling',
].join('\n');

const TASK_PARENT_MARKER_SOURCE = [
  'Reference paragraph.',
  '',
  '- [ ] Outer task',
  '  - [x] Inner task',
  '',
  '    388. Task roman counter',
  '    389. Task roman sibling',
].join('\n');

/** Reusable comparison for a numbered list below two pure task ancestors. */
export function TaskParentNumberMarkerParity() {
  return <NumberMarkerParity source={TASK_PARENT_MARKER_SOURCE} />;
}

/** Reusable comparison for a numbered list below two unordered ancestors. */
export function MixedNumberMarkerParity() {
  return <NumberMarkerParity source={MIXED_MARKER_SOURCE} />;
}

/** Reusable short/wide-counter comparison in read and edit mode at 16px. */
export function WideNumberMarkerParity() {
  return <NumberMarkerParity source={WIDE_MARKER_SOURCE} />;
}

function NumberMarkerParity({source}: {source: string}) {
  const {mode} = useTheme();
  const state = useMemo(() => markdownToEditorStateJSON(source), [source]);
  return (
    <Theme theme={wideMarkerTheme} mode={mode}>
      <div {...stylex.props(wideMarkerStyles.columns)}>
        <div
          data-wide-marker-surface="markdown"
          {...stylex.props(wideMarkerStyles.surface)}>
          <Markdown>{source}</Markdown>
        </div>
        <div
          data-wide-marker-surface="view"
          {...stylex.props(wideMarkerStyles.surface)}>
          <RichTextView value={state} />
        </div>
        <div
          data-wide-marker-surface="editor"
          {...stylex.props(wideMarkerStyles.surface)}>
          <RichTextEditor
            label="Wide counters"
            isLabelHidden
            defaultValue={state}
            xstyle={wideMarkerStyles.editorFrame}
          />
        </div>
      </div>
    </Theme>
  );
}
