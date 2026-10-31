// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatToolCalls.tsx
 * @input Uses React, StyleX, semantic icon registry, theme tokens
 * @output Exports ChatToolCalls component
 * @position Chat component — displays tool/function call invocations
 *
 * Single component that handles both individual and grouped tool calls.
 * Accepts an array of call data matching the shape LLM APIs already return.
 * Single call renders inline; multiple calls get a collapsible summary.
 *
 * Design rationale: every LLM API (Vercel AI SDK, Anthropic, OpenAI)
 * returns tool calls as an array on the message. One component with a
 * data prop matches that shape directly — no nested compound components
 * for builders to wire up.
 */

import React, {useState, useCallback, useId, type ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
  fontWeightVars,
  radiusVars,
  durationVars,
  easeVars,
  focusVars,
} from '../theme/tokens.stylex';
import {getKey, mergeProps} from '../utils';
import {Badge} from '../Badge';
import {Icon, type IconName} from '../Icon';
import {Spinner} from '../Spinner';
import {VisuallyHidden} from '../VisuallyHidden';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useTranslator} from '../i18n';

// =============================================================================
// Types
// =============================================================================

export type ChatToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

export interface ChatToolCallItem {
  /** Tool/function name. */
  name: string;
  /** Current execution status. @default 'complete' */
  status?: ChatToolCallStatus;
  /** The target of the action (e.g. "Button.tsx", "yarn test", "CSS anchor positioning"). */
  target?: string;
  /** Duration string (e.g. "1.2s", "340ms"). Shown when complete. */
  duration?: string;
  /** Sandbox/node name (e.g. "navi", "xds"). Shown as a pill badge. */
  node?: string;
  /** Lines/characters added. Rendered in green (e.g. "+12"). */
  additions?: number;
  /** Lines/characters removed. Rendered in red (e.g. "-3"). */
  deletions?: number;
  /** Additional info rendered after the label. Free-form ReactNode. */
  stats?: ReactNode;
  /**
   * Error message when status is 'error'. Exposed as visually hidden text in
   * the row for assistive technology and echoed in a hover tooltip on the
   * status icon.
   */
  errorMessage?: string;
  /** Unique key for React list rendering. Derived from stable metadata if omitted. */
  key?: string;
  /** Arbitrary caller data retained with the call item. */
  data?: unknown;
  /** Inline detail content shown when the row is expanded (e.g. code diff, command output). */
  resultDetail?: ReactNode;
}

export interface ChatToolCallsProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /** Array of tool call data. */
  calls: ChatToolCallItem[];
  /** Custom summary label shown for an expanded group. */
  label?: string;
  /** Whether the group is expanded. Uncontrolled by default. */
  isExpanded?: boolean;
  /** Default expanded state when uncontrolled. @default false */
  defaultIsExpanded?: boolean;
  /** Callback when expanded state changes. */
  onExpandedChange?: (isExpanded: boolean) => void;
}

// =============================================================================
// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    marginBlockStart: spacingVars['--spacing-2'],
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1-5'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
    minHeight: '24px',
    paddingBlock: spacingVars['--spacing-0-5'],
  },
  groupIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '16px',
    height: '16px',
    color: colorVars['--color-text-secondary'],
  },
  groupLabel: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
    color: colorVars['--color-text-secondary'],
  },
  // Rides on the chevron <Icon> (via `xstyle`), next to the rotation it
  // animates, so one element carries both the transform and the theme target.
  chevronTransition: {
    transition: {
      default: `transform ${durationVars['--duration-fast']} ${easeVars['--ease-standard']}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  chevronExpanded: {
    transform: 'rotate(180deg)',
  },
  groupContent: {
    display: 'grid',
    gridTemplateRows: '0fr',
    transition: {
      default: `grid-template-rows ${durationVars['--duration-medium']} ${easeVars['--ease-standard']}`,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  groupContentExpanded: {
    gridTemplateRows: '1fr',
  },
  groupContentInner: {
    overflow: 'hidden',
    minHeight: 0,
    // `list` (and, within it, each `callRowClickable` row) overhangs its own
    // content box by `--spacing-1` on each inline edge via a negative margin,
    // so its hover background can extend past the text column without
    // widening the layout — `list`'s own matching paddingInline absorbs the
    // row-level overhang, but `list`'s negative margin then overhangs *this*
    // element's box by the same amount, and this is the clip boundary the
    // grid height animation needs `overflow: hidden` for. Mirror the same
    // padding/negative-margin pair here so that overhang is absorbed too,
    // instead of clipped — matching the ungrouped single-call row, which has
    // no such wrapper to clip it.
    paddingInline: spacingVars['--spacing-1'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-1']})`,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    paddingInline: spacingVars['--spacing-1'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-1']})`,
  },
  listIndented: {
    paddingInlineStart: 0,
  },

  // Individual call row
  callRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1-5'],
    minHeight: '24px',
    paddingBlock: spacingVars['--spacing-0-5'],
  },
  callRowFocusInset: {
    outlineOffset: {
      default: null,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
  callRowClickable: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-element'],
    paddingInline: spacingVars['--spacing-1'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-1']})`,
    '@media (hover: hover)': {
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        backgroundColor: colorVars['--color-overlay-hover'],
      },
    },
  },
  callRowToggle: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  statusIcon: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderRadius: radiusVars['--radius-full'],
  },
  callName: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-code'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 1,
    minWidth: '4ch',
  },
  callLabel: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexShrink: 10,
    minWidth: 0,
  },
  callDuration: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  nodePill: {
    flexShrink: 0,
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
    flexShrink: 0,
  },
  statsAdditions: {
    color: colorVars['--color-text-success'],
  },
  statsDeletions: {
    color: colorVars['--color-text-error'],
  },
  errorText: {
    color: colorVars['--color-text-error'],
  },

  // Inline result detail
  callDetailChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
    color: colorVars['--color-text-secondary'],
    marginInlineStart: 'auto',
  },
  callDetailContent: {
    paddingInlineStart: `calc(16px + ${spacingVars['--spacing-1-5']})`,
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  callCount: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-0-5'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontFamily: typographyVars['--font-family-body'],
    color: colorVars['--color-text-secondary'],
    flexShrink: 0,
  },

  // Pile effect for grouped tool calls
  pileWrapper: {
    position: 'relative',
  },
  pileCard: {
    position: 'absolute',
    insetInline: 0,
    top: 0,
    height: '100%',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
    opacity: 0.5,
  },
  pileCard1: {
    transform: 'translateY(-3px) scale(0.985)',
    opacity: 0.3,
  },
  pileCard2: {
    transform: 'translateY(-6px) scale(0.97)',
    opacity: 0.15,
  },

  // Status colors
  colorPending: {color: colorVars['--color-text-disabled']},
  colorRunning: {color: colorVars['--color-accent']},
  colorComplete: {color: colorVars['--color-icon-success']},
  colorError: {color: colorVars['--color-icon-error']},
});

// =============================================================================
// Status Icons
// =============================================================================

const STATUS_ICON_NAMES: Record<ChatToolCallStatus, IconName | null> = {
  pending: 'clock',
  running: null,
  complete: 'success',
  error: 'error',
};

const STATUS_STYLES: Record<
  ChatToolCallStatus,
  ReturnType<typeof stylex.create>[string]
> = {
  pending: styles.colorPending,
  running: styles.colorRunning,
  complete: styles.colorComplete,
  error: styles.colorError,
};

function getStatusAnnouncement(
  t: ReturnType<typeof useTranslator>,
  status: ChatToolCallStatus,
  errorMessage?: string,
): string {
  if (status === 'error' && errorMessage != null) {
    return t('@astryx.chatToolCalls.error', {message: errorMessage});
  }
  switch (status) {
    case 'pending':
      return t('@astryx.chatToolCalls.status.pending');
    case 'running':
      return t('@astryx.chatToolCalls.status.running');
    case 'complete':
      return t('@astryx.chatToolCalls.status.complete');
    case 'error':
      return t('@astryx.chatToolCalls.status.error');
  }
}

function getToolCallKey(call: ChatToolCallItem): string {
  return getKey(call.key, () =>
    [
      call.name,
      call.status ?? 'complete',
      call.target ?? '',
      call.node ?? '',
      call.duration ?? '',
      call.additions?.toString() ?? '',
      call.deletions?.toString() ?? '',
      call.errorMessage ?? '',
    ].join('\u001F'),
  );
}

// =============================================================================
// Internal: single call row
// =============================================================================

function CallRow({
  call,
  hasClippedFocusRing = false,
}: {
  call: ChatToolCallItem;
  hasClippedFocusRing?: boolean;
}) {
  const t = useTranslator();
  const status = call.status ?? 'complete';
  const hasDetail = call.resultDetail != null;
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const detailId = useId();
  const statusAnnouncement = getStatusAnnouncement(
    t,
    status,
    call.errorMessage,
  );

  const toggleDetail = hasDetail
    ? () => setIsDetailOpen(prev => !prev)
    : undefined;

  const row = (
    <div
      role={hasDetail ? 'button' : undefined}
      tabIndex={hasDetail ? 0 : undefined}
      aria-expanded={hasDetail ? isDetailOpen : undefined}
      aria-controls={hasDetail && isDetailOpen ? detailId : undefined}
      onClick={toggleDetail}
      onKeyDown={
        hasDetail
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleDetail?.();
              }
            }
          : undefined
      }
      {...focusOutlineProps.focusVisible(
        styles.callRow,
        hasDetail && styles.callRowClickable,
        hasDetail && hasClippedFocusRing && styles.callRowFocusInset,
      )}>
      <span
        title={status === 'error' ? call.errorMessage : undefined}
        {...stylex.props(styles.statusIcon, STATUS_STYLES[status])}>
        {status === 'running' ? (
          <Spinner size="sm" shade="subtle" aria-hidden="true" />
        ) : status === 'pending' ? (
          <Spinner size="sm" shade="subtle" aria-hidden="true" />
        ) : (
          <Icon
            icon={STATUS_ICON_NAMES[status] ?? 'success'}
            size="xsm"
            color="inherit"
          />
        )}
        <VisuallyHidden>{statusAnnouncement}</VisuallyHidden>
      </span>
      <span {...stylex.props(styles.callName)}>{call.name}</span>
      {call.node != null && (
        <Badge label={call.node} variant="neutral" xstyle={styles.nodePill} />
      )}
      {call.target != null && (
        <span {...stylex.props(styles.callLabel)}>{call.target}</span>
      )}
      {(call.additions != null ||
        call.deletions != null ||
        call.stats != null) && (
        <span {...stylex.props(styles.stats)}>
          {call.additions != null && (
            <span {...stylex.props(styles.statsAdditions)}>
              +{call.additions}
            </span>
          )}
          {call.deletions != null && (
            <span {...stylex.props(styles.statsDeletions)}>
              -{call.deletions}
            </span>
          )}
          {call.stats}
        </span>
      )}
      {call.duration != null && status === 'complete' && (
        <span {...stylex.props(styles.callDuration)}>{call.duration}</span>
      )}
      {hasDetail && (
        <span {...stylex.props(styles.callDetailChevron)}>
          <Icon
            icon="chevronDown"
            size="xsm"
            color="inherit"
            xstyle={[
              styles.chevronTransition,
              isDetailOpen && styles.chevronExpanded,
            ]}
          />
        </span>
      )}
    </div>
  );

  if (!hasDetail) {
    return row;
  }

  return (
    <div>
      {row}
      {isDetailOpen && (
        <div id={detailId} {...stylex.props(styles.callDetailContent)}>
          {call.resultDetail}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Displays tool/function call invocations from an LLM response.
 *
 * Accepts a `calls` array matching the shape LLM APIs return. Single call
 * renders inline without group chrome. Multiple calls get a collapsible
 * summary header.
 *
 * @example
 * ```
 * <ChatToolCalls
 *   calls={message.toolCalls.map(tc => ({
 *     name: tc.toolName,
 *     status: tc.state,
 *     duration: tc.duration,
 *     resultDetail: <CodeBlock code={tc.args} language="json" />,
 *   }))}
 * />
 * ```
 */
export function ChatToolCalls(props: ChatToolCallsProps) {
  const t = useTranslator();
  const {
    calls,
    label: customLabel,
    isExpanded: controlledExpanded,
    defaultIsExpanded,
    onExpandedChange,
    xstyle,
    className,
    style,
    ref,
    ...rest
  } = props;

  const autoDefault = defaultIsExpanded ?? false;
  const [internalExpanded, setInternalExpanded] = useState(autoDefault);
  const contentId = useId();
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  const toggle = useCallback(() => {
    const next = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  }, [isExpanded, isControlled, onExpandedChange]);

  if (calls.length === 0) {
    return null;
  }

  // Single call: render inline, no group chrome
  if (calls.length === 1) {
    return (
      <div
        ref={ref}
        {...mergeProps(
          themeProps('chat-tool-calls'),
          stylex.props(styles.root, xstyle),
          className,
          style,
        )}
        {...rest}>
        <CallRow call={calls[0]} />
      </div>
    );
  }

  // Multiple calls: latest call at surface with chevron to expand all
  const latestCall = calls[calls.length - 1];
  const latestStatus = latestCall.status ?? 'complete';
  const latestStatusAnnouncement = getStatusAnnouncement(
    t,
    latestStatus,
    latestCall.errorMessage,
  );

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('chat-tool-calls'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...rest}>
      {/* Header: collapsed shows latest call + count, expanded shows summary label */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        {...focusOutlineProps.focusVisible(
          styles.callRow,
          styles.callRowToggle,
        )}>
        {isExpanded ? (
          <>
            <span {...stylex.props(styles.groupIcon)}>
              <Icon icon="wrench" size="sm" color="inherit" />
            </span>
            <span {...stylex.props(styles.groupLabel)}>
              {customLabel ??
                t('@astryx.chatToolCalls.groupLabel', {count: calls.length})}
            </span>
          </>
        ) : (
          <>
            <span
              {...stylex.props(styles.statusIcon, STATUS_STYLES[latestStatus])}>
              {latestStatus === 'running' ? (
                <Spinner size="sm" shade="subtle" aria-hidden="true" />
              ) : latestStatus === 'pending' ? (
                <Spinner size="sm" shade="subtle" aria-hidden="true" />
              ) : (
                <Icon
                  icon={STATUS_ICON_NAMES[latestStatus] ?? 'success'}
                  size="xsm"
                  color="inherit"
                />
              )}
              <VisuallyHidden>{latestStatusAnnouncement}</VisuallyHidden>
            </span>
            <span {...stylex.props(styles.callName)}>{latestCall.name}</span>
            {latestCall.target != null && (
              <span {...stylex.props(styles.callLabel)}>
                {latestCall.target}
              </span>
            )}
          </>
        )}
        <span {...stylex.props(styles.callCount)}>
          {!isExpanded && (
            <>
              <Icon icon="wrench" size="xsm" color="inherit" />
              {calls.length}
            </>
          )}
        </span>
        <span {...stylex.props(styles.chevron)}>
          <Icon
            icon="chevronDown"
            size="xsm"
            color="inherit"
            xstyle={[
              styles.chevronTransition,
              isExpanded && styles.chevronExpanded,
            ]}
          />
        </span>
      </div>

      {/* Expanded: all calls with full metadata */}
      <div
        id={contentId}
        inert={isExpanded ? undefined : true}
        {...stylex.props(
          styles.groupContent,
          isExpanded && styles.groupContentExpanded,
        )}>
        <div {...stylex.props(styles.groupContentInner)}>
          <div {...stylex.props(styles.list)}>
            {calls.map(call => (
              <CallRow
                key={getToolCallKey(call)}
                call={call}
                hasClippedFocusRing
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ChatToolCalls.displayName = 'ChatToolCalls';
