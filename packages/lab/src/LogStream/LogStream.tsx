// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LogStream.tsx
 * @input Uses React, StyleX, theme tokens (color/spacing/radius/typography vars)
 * @output Exports LogStream component, LogStreamProps, LogEntry, LogStreamLevel
 * @position Lab implementation; experimental streaming log viewer
 *
 * Mono grid rows (timestamp | level | source? | message) with level color
 * accents, expandable detail panels, a follow-scroll live-tail mode, and an
 * always-dark "terminal" variant.
 *
 * Known limit: rows are plain DOM (content-visibility: auto for offscreen
 * skip) — there is NO virtualization. Streams beyond a few thousand rows
 * should be windowed by the caller.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/LogStream/LogStream.doc.mjs (props table, notes)
 * - /packages/lab/src/LogStream/LogStream.test.tsx (behavior tests)
 * - /packages/lab/src/LogStream/index.ts (exports if types change)
 * - /apps/storybook/stories/LogStream.stories.tsx (examples and visual coverage)
 */

'use client';

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '@astryxdesign/core';
import {
  focusOutlineStyles,
  mergeProps,
  themeProps,
} from '@astryxdesign/core/utils';
import {
  borderVars,
  colorVars,
  durationVars,
  fontWeightVars,
  radiusVars,
  shadowVars,
  spacingVars,
  textSizeVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

/** Severity of one log entry. */
export type LogStreamLevel = 'info' | 'warn' | 'error' | 'debug';

/** One row in the stream; all strings are pre-formatted by the caller. */
export interface LogEntry {
  /** Stable unique key, e.g. `"req-1042"`. */
  id: string;
  /** Pre-formatted timestamp, e.g. `"14:02:11.482"`. Deterministic. */
  timestamp: string;
  level: LogStreamLevel;
  message: string;
  /** Emitting service/component, e.g. `"api-gateway"`. */
  source?: string;
  /** When set, the row becomes a disclosure button for this panel. */
  detail?: ReactNode;
}

export interface LogStreamProps extends Omit<
  BaseProps<HTMLDivElement>,
  'children'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /** Log rows, oldest first (live tails append at the end). */
  entries: LogEntry[];
  /**
   * Visual treatment. `'terminal'` renders dark chrome regardless of the
   * active color scheme (terminal output is a brand surface, like a real
   * shell — light-mode terminals read as broken builds).
   * @default 'default'
   */
  variant?: 'default' | 'terminal';
  /**
   * Pin scroll to the newest entry as entries append. Unpins when the user
   * scrolls up; re-pin via the "Jump to latest" affordance. Controlled when
   * provided; uncontrolled (initially unpinned) otherwise.
   */
  isFollowing?: boolean;
  /** Called when follow-pinning changes (user scroll-up or "Jump to latest"). */
  onFollowChange?: (following: boolean) => void;
  /** Max height of the scroll area before it scrolls. */
  maxHeight?: number | string;
  /** Show the timestamp column. @default true */
  hasTimestamps?: boolean;
  /** Accessible label for the log region. @default 'Log stream' */
  label?: string;
  /** Escape hatch: fully replace the default row for an entry. */
  renderEntry?: (entry: LogEntry) => ReactNode;
}

/** User counts as "scrolled away" beyond this distance from the bottom. */
const FOLLOW_THRESHOLD_PX = 24;

const REDUCE = '@media (prefers-reduced-motion: reduce)';
const HOVER = '@media (hover: hover)';

// The terminal variant is intentionally always-dark (terminal chrome is a
// brand surface, mirroring real shells), so it uses fixed near-black grays
// rather than light-dark() theme tokens, which would flip with the scheme.
const TERM = {
  surface: '#0a0a0a',
  surfaceRaised: '#141417',
  border: '#26262a',
  textDim: '#8b8b94',
  text: '#b9b9c0',
  textBright: '#e8e8ea',
  warn: '#f2c00b',
  error: '#ff6166',
};

const styles = stylex.create({
  root: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: radiusVars['--radius-element'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-surface'],
    overflow: 'hidden',
    fontFamily: typographyVars['--font-family-code'],
    fontSize: textSizeVars['--font-size-sm'],
  },
  rootTerminal: {
    borderColor: TERM.border,
    backgroundColor: TERM.surface,
  },
  scroller: (maxHeight: number | string | null) => ({
    overflowY: 'auto',
    maxHeight,
    scrollbarWidth: 'thin',
    overscrollBehavior: 'contain',
  }),
  row: {
    display: 'grid',
    alignItems: 'baseline',
    columnGap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    lineHeight: 1.7,
    color: colorVars['--color-text-primary'],
    borderBottomWidth: {
      default: borderVars['--border-width'],
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
    // Offscreen rows skip layout/paint; the intrinsic size keeps the
    // scrollbar stable. No virtualization — see the file header.
    contentVisibility: 'auto',
    containIntrinsicBlockSize: 'auto 28px',
    // Appended tail lines fade in; opacity-only, instant under reduced motion.
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast-min'],
      [REDUCE]: '0.01ms',
    },
    transitionTimingFunction: 'ease-out',
    '@starting-style': {opacity: 0},
  },
  rowTerminal: {
    color: TERM.text,
    borderBottomWidth: 0,
    paddingBlock: 1,
  },
  // Grid templates per visible column set (timestamp / source optional).
  colsFull: {gridTemplateColumns: '96px 52px 128px minmax(0, 1fr)'},
  colsNoSource: {gridTemplateColumns: '96px 52px minmax(0, 1fr)'},
  colsNoTimestamp: {gridTemplateColumns: '52px 128px minmax(0, 1fr)'},
  colsMessageOnly: {gridTemplateColumns: '52px minmax(0, 1fr)'},
  rowButton: {
    width: '100%',
    textAlign: 'left',
    borderTopWidth: 0,
    borderInlineWidth: 0,
    fontFamily: typographyVars['--font-family-code'],
    fontSize: textSizeVars['--font-size-sm'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        [HOVER]: colorVars['--color-overlay-hover'],
      },
    },
  },
  rowButtonTerminal: {
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        [HOVER]: TERM.surfaceRaised,
      },
    },
  },
  // Level tints: faint full-row wash for error/warn (color-mix keeps the
  // tint derived from the theme token instead of a parallel palette).
  rowError: {
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-error']} 6%, transparent)`,
  },
  rowWarn: {
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-warning']} 5%, transparent)`,
  },
  timestamp: {
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  timestampTerminal: {
    color: TERM.textDim,
  },
  level: {
    fontSize: textSizeVars['--font-size-xs'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  levelInfo: {color: colorVars['--color-text-secondary']},
  levelDebug: {color: colorVars['--color-text-disabled']},
  // Plain-surface warning/error labels use the dedicated foreground roles.
  levelWarn: {
    color: colorVars['--color-text-warning'],
  },
  levelError: {
    color: colorVars['--color-text-error'],
  },
  levelInfoTerminal: {color: TERM.text},
  levelDebugTerminal: {color: TERM.textDim},
  levelWarnTerminal: {color: TERM.warn},
  levelErrorTerminal: {color: TERM.error},
  source: {
    color: colorVars['--color-text-secondary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  sourceTerminal: {
    color: TERM.textDim,
  },
  message: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  messageTerminal: {
    color: TERM.text,
  },
  messageErrorTerminal: {color: TERM.error},
  messageWarnTerminal: {color: TERM.warn},
  detail: {
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: colorVars['--color-background-muted'],
    borderBottomWidth: borderVars['--border-width'],
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  detailTerminal: {
    backgroundColor: '#0e0e10',
    borderBottomColor: TERM.border,
    color: TERM.text,
  },
  jumpToLatest: {
    position: 'absolute',
    bottom: spacingVars['--spacing-3'],
    insetInlineEnd: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-full'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    backgroundColor: {
      default: colorVars['--color-background-surface'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        [HOVER]: colorVars['--color-background-muted'],
      },
    },
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-code'],
    fontSize: textSizeVars['--font-size-sm'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    boxShadow: shadowVars['--shadow-med'],
  },
  jumpToLatestTerminal: {
    borderColor: TERM.border,
    backgroundColor: {
      default: TERM.surfaceRaised,
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        [HOVER]: '#1d1d21',
      },
    },
    color: TERM.textBright,
  },
});

const LEVEL_STYLE: Record<LogStreamLevel, stylex.StyleXStyles> = {
  info: styles.levelInfo,
  warn: styles.levelWarn,
  error: styles.levelError,
  debug: styles.levelDebug,
};

const LEVEL_STYLE_TERMINAL: Record<LogStreamLevel, stylex.StyleXStyles> = {
  info: styles.levelInfoTerminal,
  warn: styles.levelWarnTerminal,
  error: styles.levelErrorTerminal,
  debug: styles.levelDebugTerminal,
};

/**
 * Experimental streaming log viewer: mono grid rows
 * (timestamp | level | source | message) with token-derived level accents,
 * expandable per-row detail panels, follow-scroll live tailing with a
 * "Jump to latest" affordance, and an always-dark terminal variant.
 *
 * Appended rows fade in via `@starting-style` (instant under
 * prefers-reduced-motion). Follow pinning uses a scroll listener — no
 * polling; rows use `content-visibility: auto` for offscreen skip but are
 * NOT virtualized (window large streams in the caller).
 *
 * Live announcements are tied to follow pinning: the `role="log"` region is
 * `aria-live="polite"` only while following the tail and `aria-live="off"`
 * while unfollowed, so appends never flood assistive tech.
 *
 * @example
 * ```
 * <LogStream
 *   entries={entries}
 *   maxHeight={480}
 *   isFollowing={isFollowing}
 *   onFollowChange={setIsFollowing}
 * />
 * ```
 */
export function LogStream({
  entries,
  variant = 'default',
  isFollowing,
  onFollowChange,
  maxHeight,
  hasTimestamps = true,
  label = 'Log stream',
  renderEntry,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: LogStreamProps) {
  const isTerminal = variant === 'terminal';
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Follow pinning: controlled when the prop is provided, else internal.
  const [internalFollowing, setInternalFollowing] = useState(
    isFollowing ?? false,
  );
  const following = isFollowing ?? internalFollowing;
  const setFollowing = (next: boolean) => {
    if (next === following) {
      return;
    }
    if (isFollowing == null) {
      setInternalFollowing(next);
    }
    onFollowChange?.(next);
  };

  // Whether the viewport currently sits at the bottom; drives the
  // "Jump to latest" affordance. Updated from scroll events only.
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasSource = useMemo(
    () => entries.some(entry => entry.source != null),
    [entries],
  );

  // Pin to the newest row while following. Direct scrollTop assignment (not
  // smooth scrollTo) so rapid appends never queue competing animations.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!following || el == null) {
      return;
    }
    el.scrollTop = el.scrollHeight;
    setIsAtBottom(true);
  }, [following, entries.length]);

  // No programmatic-scroll guard is needed: pinning always lands the
  // viewport at the bottom, and the unpin branch below only fires when the
  // viewport is AWAY from the bottom — a programmatic echo is a no-op.
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= FOLLOW_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    // User scrolled away from the tail: unpin. Re-pinning is explicit via
    // the "Jump to latest" affordance (never implicit on scroll-down).
    if (following && !atBottom) {
      setFollowing(false);
    }
  };

  const handleJumpToLatest = () => {
    setFollowing(true);
    const el = scrollerRef.current;
    if (el != null) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
    }
  };

  const colsStyle = hasTimestamps
    ? hasSource
      ? styles.colsFull
      : styles.colsNoSource
    : hasSource
      ? styles.colsNoTimestamp
      : styles.colsMessageOnly;

  const renderDefaultRow = (entry: LogEntry) => {
    const isExpandable = entry.detail != null;
    const isExpanded = isExpandable && expandedIds.has(entry.id);
    const cells = (
      <>
        {hasTimestamps && (
          <span
            {...stylex.props(
              styles.timestamp,
              isTerminal && styles.timestampTerminal,
            )}>
            {entry.timestamp}
          </span>
        )}
        <span
          {...stylex.props(
            styles.level,
            (isTerminal ? LEVEL_STYLE_TERMINAL : LEVEL_STYLE)[entry.level],
          )}>
          {entry.level}
        </span>
        {hasSource && (
          <span
            {...stylex.props(
              styles.source,
              isTerminal && styles.sourceTerminal,
            )}
            title={entry.source}>
            {entry.source}
          </span>
        )}
        <span
          {...stylex.props(
            styles.message,
            isTerminal && styles.messageTerminal,
            isTerminal &&
              entry.level === 'error' &&
              styles.messageErrorTerminal,
            isTerminal && entry.level === 'warn' && styles.messageWarnTerminal,
          )}>
          {entry.message}
        </span>
      </>
    );
    const rowStyles = [
      styles.row,
      colsStyle,
      isTerminal && styles.rowTerminal,
      !isTerminal && entry.level === 'error' && styles.rowError,
      !isTerminal && entry.level === 'warn' && styles.rowWarn,
    ] as const;
    if (!isExpandable) {
      return (
        <div data-level={entry.level} {...stylex.props(...rowStyles)}>
          {cells}
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          aria-expanded={isExpanded}
          data-level={entry.level}
          onClick={() => toggleExpanded(entry.id)}
          {...stylex.props(
            ...rowStyles,
            styles.rowButton,
            isTerminal && styles.rowButtonTerminal,
          )}>
          {cells}
        </button>
        {isExpanded && (
          <div
            {...stylex.props(
              styles.detail,
              isTerminal && styles.detailTerminal,
            )}>
            {entry.detail}
          </div>
        )}
      </>
    );
  };

  return (
    <div
      ref={ref}
      {...rest}
      {...mergeProps(
        themeProps('log-stream', {variant}),
        stylex.props(styles.root, isTerminal && styles.rootTerminal, xstyle),
        className,
        style,
      )}>
      <div
        ref={scrollerRef}
        role="log"
        aria-label={label}
        // role="log" is implicitly aria-live="polite" — on a busy stream that
        // floods assistive tech with every appended row (WCAG 2.2.2 / 4.1.3).
        // Follow-pinning doubles as the mute switch: while the user is away
        // from the tail (unfollowed), the region is aria-live="off"; resuming
        // follow ("Jump to latest") restores polite announcements.
        aria-live={following ? 'polite' : 'off'}
        onScroll={handleScroll}
        {...stylex.props(styles.scroller(maxHeight ?? null))}>
        {entries.map(entry => (
          <Fragment key={entry.id}>
            {renderEntry != null ? renderEntry(entry) : renderDefaultRow(entry)}
          </Fragment>
        ))}
      </div>
      {!following && !isAtBottom && entries.length > 0 && (
        <button
          type="button"
          onClick={handleJumpToLatest}
          {...stylex.props(
            focusOutlineStyles.focusVisible,
            styles.jumpToLatest,
            isTerminal && styles.jumpToLatestTerminal,
          )}>
          Jump to latest ↓
        </button>
      )}
    </div>
  );
}

LogStream.displayName = 'LogStream';
