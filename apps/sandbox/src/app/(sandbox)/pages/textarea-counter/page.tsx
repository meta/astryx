// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as React from 'react';
import * as stylex from '@stylexjs/stylex';

import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Card} from '@astryxdesign/core/Card';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {TextArea} from '@astryxdesign/core/TextArea';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {
  colorVars,
  spacingVars,
  radiusVars,
  borderVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  pageContainer: {
    maxWidth: 1040,
    paddingInline: spacingVars['--spacing-6'],
    paddingBlock: spacingVars['--spacing-6'],
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: spacingVars['--spacing-4'],
  },
  // Counter renders as real supporting <Text>; this only keeps the ratio from
  // breaking across lines. Font/size/leading/color come from Text itself.
  counterText: {
    whiteSpace: 'nowrap',
  },
  counterError: {
    color: colorVars['--color-text-error'],
  },
  counterPinned: {
    flexShrink: 0,
  },
  // Lets the FieldStatus box grow to fill the footer row (and wrap) while the
  // counter stays pinned; marginTop 0 defers spacing to the parent VStack gap.
  footerMessage: {
    flexGrow: 1,
    minWidth: 0,
    marginTop: 0,
  },
  rowRight: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  rowLeft: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  labelRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
  },
  footerRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-3'],
  },
  // Footer where the message may wrap to multiple lines: keep the counter
  // pinned to the top-right so an error message is never truncated.
  footerRowTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-3'],
  },
  overlayContainer: {
    position: 'relative',
  },
  // Reserve a strip below the textarea (inside the border) so the overlaid
  // counter clears the text and the resize handle.
  overlayTextareaPad: {
    paddingBottom: spacingVars['--spacing-6'],
  },
  overlayCounter: {
    // Sit 4px below the textarea's resize handle. Box right edge sits at the
    // input content-right (border + input paddingInline); with paddingInlineEnd
    // 0 the VISIBLE text right edge lines up with the status icon above it.
    // Left padding keeps the opaque surface background masking scrolled text.
    position: 'absolute',
    bottom: spacingVars['--spacing-1'],
    insetInlineEnd: `calc(${borderVars['--border-width']} + ${spacingVars['--spacing-2']})`,
    backgroundColor: colorVars['--color-background-surface'],
    paddingInlineStart: spacingVars['--spacing-1'],
    paddingInlineEnd: 0,
    borderRadius: radiusVars['--radius-element'],
    zIndex: 2,
    pointerEvents: 'none',
  },
  // Opaque footer band on the input's bottom line, matching the field surface
  // so it masks scrolled text without reading as a separate gray block. Right
  // edge is inset to leave the native resize grip exposed so the counter and
  // grip read on the same line.
  footerBand: {
    position: 'absolute',
    insetInlineStart: borderVars['--border-width'],
    insetInlineEnd: `calc(${borderVars['--border-width']} + ${spacingVars['--spacing-6']})`,
    bottom: borderVars['--border-width'],
    height: spacingVars['--spacing-6'],
    backgroundColor: colorVars['--color-background-surface'],
    borderBottomLeftRadius: radiusVars['--radius-element'],
    borderBottomRightRadius: radiusVars['--radius-element'],
    zIndex: 1,
    pointerEvents: 'none',
  },
  // Counter riding the band on the input's bottom line — vertically inline with
  // the resize grip, left edge at the textarea content-text inset.
  bandCounter: {
    position: 'absolute',
    bottom: spacingVars['--spacing-1'],
    insetInlineStart: `calc(${borderVars['--border-width']} + ${spacingVars['--spacing-2']})`,
    zIndex: 2,
    pointerEvents: 'none',
  },
  cardBody: {
    minWidth: 0,
  },
});

// =============================================================================
// Shared helpers
// =============================================================================

const LOREM =
  'Sharing a quick note with the team about the latest changes and what to ' +
  'expect in the next release, plus a couple of open questions. ';

function makeText(length: number): string {
  let out = '';
  while (out.length < length) {
    out += LOREM;
  }
  return out.slice(0, length);
}

function Counter({
  length,
  max,
  xstyle,
}: {
  length: number;
  max: number;
  xstyle?: stylex.StyleXStyles;
}) {
  const isOver = length > max;
  return (
    <Text
      type="supporting"
      color="secondary"
      xstyle={[styles.counterText, isOver && styles.counterError, xstyle]}>
      {length}/{max}
    </Text>
  );
}

type StatusType = 'warning' | 'error' | 'success';

interface StatusInput {
  type: StatusType;
  message: string;
}

interface VariantProps {
  value: string;
  onChange: (v: string) => void;
  max: number;
  status?: StatusInput;
}

// =============================================================================
// Position variants
// =============================================================================

/** The current shipped behavior: counter below the field, right-aligned. */
function BelowRight({value, onChange, max, status}: VariantProps) {
  return (
    <TextArea
      label="Description"
      value={value}
      onChange={onChange}
      maxLength={max}
      status={status}
      rows={3}
      width="100%"
      placeholder="Write a description..."
    />
  );
}

function BelowLeft({value, onChange, max, status}: VariantProps) {
  return (
    <VStack gap={1}>
      <TextArea
        label="Description"
        value={value}
        onChange={onChange}
        status={status}
        rows={3}
        width="100%"
        placeholder="Write a description..."
      />
      <div {...stylex.props(styles.rowLeft)}>
        <Counter length={value.length} max={max} />
      </div>
    </VStack>
  );
}

function LabelInline({value, onChange, max, status}: VariantProps) {
  return (
    <VStack gap={1}>
      <div {...stylex.props(styles.labelRow)}>
        <Text type="label">Description</Text>
        <Counter length={value.length} max={max} />
      </div>
      <TextArea
        label="Description"
        isLabelHidden
        value={value}
        onChange={onChange}
        status={status}
        rows={3}
        width="100%"
        placeholder="Write a description..."
      />
    </VStack>
  );
}

function InsideBottomRight({value, onChange, max, status}: VariantProps) {
  // Pass the status TYPE (no message) so the input keeps the native colored
  // border + status icon, but renders no native message box — that keeps the
  // overlayContainer's bottom equal to the input box, so the absolutely
  // positioned counter stays anchored inside it. The message is appended below.
  return (
    <div>
      <div {...stylex.props(styles.overlayContainer)}>
        <TextArea
          label="Description"
          value={value}
          onChange={onChange}
          status={status ? {type: status.type} : undefined}
          rows={3}
          width="100%"
          placeholder="Write a description..."
          controlXstyle={styles.overlayTextareaPad}
        />
        <div {...stylex.props(styles.overlayCounter)}>
          <Counter length={value.length} max={max} />
        </div>
      </div>
      {status && <FieldStatus type={status.type} message={status.message} />}
    </div>
  );
}

/**
 * Counter inline with the resize grip: it sits at the textarea's bottom-left,
 * on the same line as the drag handle in the bottom-right (no reserved strip),
 * so the two read as a matched pair. Message renders below.
 */
function BesideHandle({value, onChange, max, status}: VariantProps) {
  // Status TYPE only → keeps the colored border + icon, no native message box.
  // No reserved strip: the counter sits in the input's own bottom padding on
  // the same line as the resize grip, over a subtly-visible muted band.
  return (
    <div>
      <div {...stylex.props(styles.overlayContainer)}>
        <TextArea
          label="Description"
          value={value}
          onChange={onChange}
          status={status ? {type: status.type} : undefined}
          rows={3}
          width="100%"
          placeholder="Write a description..."
        />
        <div {...stylex.props(styles.footerBand)} />
        <div {...stylex.props(styles.bandCounter)}>
          <Counter length={value.length} max={max} />
        </div>
      </div>
      {status && <FieldStatus type={status.type} message={status.message} />}
    </div>
  );
}

/**
 * Recommended when a field needs both a message and a counter: they share one
 * footer row (message left, counter right) instead of stacking. Renders the
 * message inline so it never pushes the counter down or gets buried under it.
 */
function FooterSplit({value, onChange, max, status}: VariantProps) {
  // Status TYPE only on the input (border + icon); the message renders as the
  // real muted FieldStatus box, sharing the footer row with the pinned counter.
  return (
    <VStack gap={1}>
      <TextArea
        label="Description"
        value={value}
        onChange={onChange}
        status={status ? {type: status.type} : undefined}
        rows={3}
        width="100%"
        placeholder="Write a description..."
      />
      <div {...stylex.props(styles.footerRowTop)}>
        {status ? (
          <FieldStatus
            type={status.type}
            message={status.message}
            variant="detached"
            xstyle={styles.footerMessage}
          />
        ) : (
          <Text type="supporting" color="secondary">
            Markdown supported
          </Text>
        )}
        <Counter
          length={value.length}
          max={max}
          xstyle={styles.counterPinned}
        />
      </div>
    </VStack>
  );
}

interface VariantSpec {
  id: string;
  title: string;
  note: string;
  Demo: React.ComponentType<VariantProps>;
}

const VARIANTS: VariantSpec[] = [
  {
    id: 'below-right',
    title: 'Below · right (current default)',
    note: 'Where TextArea ships today. The native counter sits between the input and the status message — so with a message present the counter and message stack, pushing the message down and adding two lines of chrome below the field.',
    Demo: BelowRight,
  },
  {
    id: 'below-left',
    title: 'Below · left',
    note: 'Left-aligns the counter under the field. With a status message the message renders first (attached under the input) and the counter drops below it — three stacked rows below the field.',
    Demo: BelowLeft,
  },
  {
    id: 'label-inline',
    title: 'Top · inline with label',
    note: 'Counter rides the label row, top-right. Visible before typing and never competes with the status message below the field — the cleanest pairing with a validation message.',
    Demo: LabelInline,
  },
  {
    id: 'inside-bottom-right',
    title: 'Inside · bottom-right overlay',
    note: 'Overlaid in the input corner (chat/compose pattern). Keeps the counter clear of the status message below, but reserves bottom padding and sits near the resize handle.',
    Demo: InsideBottomRight,
  },
  {
    id: 'beside-handle',
    title: 'Inside · inline with the drag handle',
    note: 'A full-width footer band spans the input\u2019s bottom strip: the counter rides it at the content-text inset (left) with the resize grip at the right end. The opaque band blends with the field surface and masks any text scrolled behind it. Pairs cleanly with the status message below.',
    Demo: BesideHandle,
  },
  {
    id: 'footer-split',
    title: 'Below · split footer (message + counter)',
    note: 'Recommended when a field shows both. Message (left) and counter (right) share the footer row; the counter is pinned top-right and the message wraps beneath it as needed — it is never truncated.',
    Demo: FooterSplit,
  },
];

// =============================================================================
// Page
// =============================================================================

const MAX_OPTIONS = [50, 100, 200] as const;

const STATUS_OPTIONS: {id: 'none' | StatusType; label: string}[] = [
  {id: 'none', label: 'None'},
  {id: 'warning', label: 'Warning'},
  {id: 'error', label: 'Error'},
  {id: 'success', label: 'Success'},
];

const STATUS_MESSAGES: Record<StatusType, string> = {
  warning: 'This description is visible to everyone on the team.',
  error: 'Description is required before you can publish.',
  success: 'Looks good — this reads clearly.',
};

export default function TextAreaCounterPage() {
  const [value, setValue] = React.useState(makeText(64));
  const [max, setMax] = React.useState<number>(100);
  const [statusType, setStatusType] = React.useState<'none' | StatusType>(
    'error',
  );

  const isOver = value.length > max;
  const status: StatusInput | undefined =
    statusType === 'none'
      ? undefined
      : {type: statusType, message: STATUS_MESSAGES[statusType]};

  return (
    <VStack gap={6} xstyle={styles.pageContainer}>
      <VStack gap={2}>
        <Heading level={1}>TextArea Counter Position</Heading>
        <Text type="body" color="secondary">
          Exploring where the character counter can live on the TextArea. All
          fields below share one value and limit — type in any of them, or use
          the controls to push over the limit, and compare how each position
          behaves at once.
        </Text>
      </VStack>

      <Card>
        <VStack gap={3}>
          <Text type="label" display="block">
            Controls
          </Text>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <HStack gap={2} vAlign="center">
              <Text type="supporting" color="secondary">
                Max length
              </Text>
              {MAX_OPTIONS.map(opt => (
                <Button
                  key={opt}
                  label={String(opt)}
                  size="sm"
                  variant={opt === max ? 'primary' : 'ghost'}
                  onClick={() => setMax(opt)}
                />
              ))}
            </HStack>
            <Divider orientation="vertical" />
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label="Clear"
                size="sm"
                variant="secondary"
                onClick={() => setValue('')}
              />
              <Button
                label="Near limit"
                size="sm"
                variant="secondary"
                onClick={() => setValue(makeText(Math.round(max * 0.9)))}
              />
              <Button
                label="Over limit"
                size="sm"
                variant="secondary"
                onClick={() => setValue(makeText(max + 18))}
              />
            </HStack>
          </HStack>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              Status message
            </Text>
            {STATUS_OPTIONS.map(opt => (
              <Button
                key={opt.id}
                label={opt.label}
                size="sm"
                variant={opt.id === statusType ? 'primary' : 'ghost'}
                onClick={() => setStatusType(opt.id)}
              />
            ))}
          </HStack>
          <Text
            type="supporting"
            color="secondary"
            display="block"
            xstyle={isOver ? styles.counterError : undefined}>
            {value.length}/{max} characters
            {isOver ? ` · ${value.length - max} over limit` : ''}
          </Text>
        </VStack>
      </Card>

      <div {...stylex.props(styles.grid)}>
        {VARIANTS.map(({id, title, note, Demo}) => (
          <Card key={id} xstyle={styles.cardBody}>
            <VStack gap={3}>
              <Text type="label" display="block">
                {title}
              </Text>
              <Demo
                value={value}
                onChange={setValue}
                max={max}
                status={status}
              />
              <Divider />
              <Text type="supporting" color="secondary" display="block">
                {note}
              </Text>
            </VStack>
          </Card>
        ))}
      </div>
    </VStack>
  );
}
