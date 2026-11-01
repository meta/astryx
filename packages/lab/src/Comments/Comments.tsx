// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Comments.tsx
 * @input Uses React, StyleX, ChatLayout, ChatMessageList, Banner, Button,
 *   EmptyState, and the Comments family's controller, rows, and composer
 * @output Exports Comments and CommentsProps
 * @position The comments on one item: its comment threads and activity
 *   events in time order, with a composer for new comments. A pane that fills
 *   its container and scrolls, or an embedded block at its content's height.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Comments/index.ts (exports)
 * - /packages/lab/src/Comments/Comments.doc.mjs
 * - /packages/lab/blocks/CommentsShowcase.tsx
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {ChatLayout, ChatMessageList} from '@astryxdesign/core/Chat';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {VStack} from '@astryxdesign/core/Layout';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';
import {CommentComposerBase} from './CommentComposer';
import {
  ActivityEventRow,
  CommentComposerLoadingSkeleton,
  CommentThreadLoadingSkeleton,
  ErrorBanner,
} from './CommentParts';
import {CommentRow, THREAD_DIVIDERS, type ThreadDivider} from './CommentRow';
import {useStatusAnnouncement} from './useStatusAnnouncement';
import {
  CommentsContextProvider,
  useCommentsController,
} from './CommentsContext';
import {timelineTime} from './utils';
import type {
  CommentAnchor,
  CommentComposerContext,
  CommentThreadData,
  CommentThreadSharedProps,
  CommentActivityEvent,
} from './types';

export interface CommentsProps
  extends
    CommentThreadSharedProps,
    Omit<
      BaseProps<HTMLElement>,
      keyof CommentThreadSharedProps | 'onChange' | 'onSubmit'
    > {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLElement>;
  /**
   * The threads, controlled: each thread's first comment, carrying its
   * replies. Shown in time order with `events`, oldest first unless the list
   * itself runs newest first.
   */
  comments: readonly CommentThreadData[];
  /** Activity on the item, interleaved with the threads by time. */
  events?: readonly CommentActivityEvent[];
  /** Accessible name of the Comments region. Defaults to the localized
   *  "Comments". */
  label?: string;
  /** Where the composer for new comments renders. @default 'bottom' */
  composerPosition?: 'top' | 'bottom' | 'none';
  /** @default 'balanced' */
  density?: 'compact' | 'balanced';
  /**
   * `pane` fills its container and scrolls, with the composer docked at the
   * bottom: a comments panel. `embedded` takes its content's height inside
   * a host surface such as a Card or Popover: no scroll area or dock, and on
   * a card parent no rule above the first thread or below the last.
   * @default 'pane'
   */
  layout?: 'pane' | 'embedded';
  /**
   * The selected thread's id, for hosts that sync selection with a document:
   * highlight the selected thread's passage, or select a thread from its
   * highlight. Host selection opens the body and replies and scrolls the thread
   * into view without moving focus or opening the reply composer. Omit it to
   * let the panel own selection.
   */
  selectedThreadId?: string | null;
  /** Called when the viewer selects (`threadId`) or deselects (`null`) a thread. */
  onSelectedThreadChange?: (threadId: string | null) => void;
  /**
   * The passage a new comment will attach to, such as the viewer's text
   * selection. The composer quotes it and takes focus; the host attaches it
   * on submit and clears it afterwards.
   */
  composerAnchor?: CommentAnchor;
  /** Adds Remove quoted text to the composer's quoted passage. */
  onComposerAnchorDismiss?: () => void;
  /**
   * Product-owned controls in the new-comment composer's footer, after its
   * attach and emoji buttons. Keep it to one short control.
   */
  composerControls?: ReactNode;
  /** Shows comment-shaped placeholders instead of the threads. */
  isLoading?: boolean;
  /** Shows an error Banner; with `onRetryLoad`, a Retry action. */
  loadError?: string;
  onRetryLoad?: () => void | Promise<void>;
  /** Adds Load earlier comments above the threads. */
  hasOlderComments?: boolean;
  isLoadingOlder?: boolean;
  /** Loads the previous page; the host prepends it to `comments`. */
  onLoadOlder?: () => void | Promise<void>;
  /** Host-owned error for the new-comment composer. */
  composerError?: string;
  /** Replaces the default no-comments state. */
  emptyState?: ReactNode;
  /** Replaces the default activity event row. */
  renderEvent?: (event: CommentActivityEvent) => ReactNode;
}

type TimelineEntry =
  | {kind: 'comment'; value: CommentThreadData}
  | {kind: 'event'; value: CommentActivityEvent};

const NO_EVENTS: readonly CommentActivityEvent[] = [];

const styles = stylex.create({
  root: {
    minHeight: 0,
    overflow: 'hidden',
  },
  timeline: {
    position: 'relative',
    zIndex: 0,
    isolation: 'isolate',
  },
  // A card parent's Sections bleed to the panel's edges through the message
  // list's padding.
  bleedCompact: {
    width: `calc(100% + (${spacingVars['--spacing-3']} * 2))`,
    marginInline: `calc(-1 * ${spacingVars['--spacing-3']})`,
    marginBlockStart: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  bleedBalanced: {
    width: `calc(100% + (${spacingVars['--spacing-4']} * 2))`,
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    marginBlockStart: `calc(-1 * ${spacingVars['--spacing-4']})`,
  },
  // ChatLayout's dock pads one spacing step less than ChatMessageList, so a
  // docked composer would stick out past the threads' edge. One step of
  // inset restores it.
  composerDock: {
    paddingInline: spacingVars['--spacing-1'],
  },
});

/**
 * The comments on one item: comment threads with one level of replies,
 * reactions, edit history, inline-comment quotes, and activity events, with
 * a composer for new comments. Controlled: the host owns the data and every
 * mutation; the panel owns presentation, selection, and focus.
 *
 * @example
 * ```
 * <Comments
 *   comments={comments}
 *   events={events}
 *   currentUser={viewer}
 *   onSubmit={post}
 *   onReact={toggleReaction}
 * />
 * ```
 */
export function Comments({
  comments,
  events = NO_EVENTS,
  label: labelProp,
  composerPosition = 'bottom',
  density = 'balanced',
  layout = 'pane',
  selectedThreadId,
  onSelectedThreadChange,
  composerAnchor,
  onComposerAnchorDismiss,
  composerControls,
  isLoading = false,
  loadError,
  onRetryLoad,
  hasOlderComments = false,
  isLoadingOlder = false,
  onLoadOlder,
  composerError,
  emptyState,
  renderEvent,
  currentUser,
  mode = 'interactive',
  container = 'section',
  composerPlaceholder,
  highlightColor = 'yellow',
  reactionOptions,
  agentCommands,
  composerTriggers,
  markdownPlugins,
  markdownInlinePlugins,
  getReplyMention,
  hasEmojiPicker = true,
  isSubmitting,
  onComposerDraftChange,
  onSubmit,
  onSaveEdit,
  onDelete,
  onReact,
  onRetryComment,
  onResolveThread,
  onReopenThread,
  loadVersions,
  onUploadImages,
  renderAnchor,
  renderBody,
  renderVersionBody,
  renderAdditionalActions,
  renderComposer,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: CommentsProps) {
  const t = useTranslator();
  const label = labelProp ?? t('@astryx.comments.label');
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [topComposerError, setTopComposerError] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string>();
  const [olderFailureCount, setOlderFailureCount] = useState(0);
  const loadingOlderRef = useRef(false);
  const loadOlderButtonRef = useRef<HTMLButtonElement>(null);
  const olderRetryRef = useRef<HTMLButtonElement>(null);
  // The load-failure Banner carries no live role: it mounts already holding
  // its text. It is announced once, assertively, through the shared channel
  // (spec:AST-086 FR2, FR5).
  const loadErrorRef = useRef<HTMLDivElement>(null);
  useStatusAnnouncement(
    loadErrorRef,
    loadError != null
      ? t('@astryx.comments.errorAnnouncement', {
          title: t('@astryx.comments.loadFailed'),
          description: loadError,
        })
      : null,
    'assertive',
  );
  const rootRef = useRef<HTMLElement | null>(null);
  const setRootRef = useCallback(
    (element: HTMLElement | null) => {
      rootRef.current = element;
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref != null) {
        ref.current = element;
      }
    },
    [ref],
  );

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const direction =
      comments.length > 1 &&
      timelineTime(comments[0].createdAt) >
        timelineTime(comments[comments.length - 1].createdAt)
        ? -1
        : 1;
    return [
      ...comments.map(value => ({kind: 'comment' as const, value})),
      ...events.map(value => ({kind: 'event' as const, value})),
    ].sort(
      (first, second) =>
        direction *
        (timelineTime(first.value.createdAt) -
          timelineTime(second.value.createdAt)),
    );
  }, [comments, events]);
  const roots = useMemo(
    () =>
      timelineEntries.flatMap(entry =>
        entry.kind === 'comment' ? [entry.value] : [],
      ),
    [timelineEntries],
  );
  const topComposerContext: CommentComposerContext =
    composerAnchor != null
      ? {kind: 'comment', anchor: composerAnchor}
      : {kind: 'comment'};

  const {value, dialogs, submit} = useCommentsController({
    currentUser,
    mode,
    container,
    composerPlaceholder,
    highlightColor,
    reactionOptions,
    agentCommands,
    composerTriggers,
    markdownPlugins,
    markdownInlinePlugins,
    getReplyMention,
    hasEmojiPicker,
    isSubmitting,
    onComposerDraftChange,
    onSubmit,
    onSaveEdit,
    onDelete,
    onReact,
    onRetryComment,
    onResolveThread,
    onReopenThread,
    loadVersions,
    onUploadImages,
    renderAnchor,
    renderBody,
    renderVersionBody,
    renderAdditionalActions,
    renderComposer,
    selectedThreadId,
    onSelectedThreadChange,
    roots,
    rootRef,
  });

  // An anchor the panel mounts with is restored state, not a selection
  // the viewer just made, so it shows without moving focus; an anchor that
  // arrives while the panel is on screen takes focus.
  const [mountedAnchorQuote, setMountedAnchorQuote] = useState(
    composerAnchor?.quote,
  );
  if (
    mountedAnchorQuote != null &&
    composerAnchor?.quote !== mountedAnchorQuote
  ) {
    setMountedAnchorQuote(undefined);
  }
  const anchorFocusKey =
    composerAnchor != null && composerAnchor.quote !== mountedAnchorQuote
      ? `anchor:${composerAnchor.quote}`
      : undefined;

  const submitComment = async (
    content: string,
    context: CommentComposerContext,
  ) => {
    const submitted = content.trim();
    setTopComposerError(undefined);
    const result = await submit(content);
    if (result === 'posted') {
      // Text typed while the post was in flight stays in the draft.
      if (draftRef.current.trim() === submitted) {
        draftRef.current = '';
        setDraft('');
        onComposerDraftChange?.('', context);
      }
    } else if (result === 'failed') {
      draftRef.current = submitted;
      setDraft(submitted);
      onComposerDraftChange?.(submitted, context);
      setTopComposerError(t('@astryx.comments.postFailed'));
    }
  };

  const loadOlder = async () => {
    if (onLoadOlder == null || loadingOlderRef.current) {
      return;
    }
    // The button and the failure Banner's Retry swap places; focus follows
    // whichever is showing so it never drops to <body>.
    const active = document.activeElement;
    const hadFocus =
      active != null &&
      (active === loadOlderButtonRef.current ||
        active === olderRetryRef.current);
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    let focusTarget: 'load' | 'retry' = 'load';
    try {
      await onLoadOlder();
      // Commit now, so the control that replaced the old one can take focus.
      flushSync(() => {
        setOlderError(undefined);
        setLoadingOlder(false);
      });
    } catch {
      focusTarget = 'retry';
      flushSync(() => {
        setOlderError(t('@astryx.comments.olderFailed'));
        // A new Banner per failure, so a failed retry announces again.
        setOlderFailureCount(count => count + 1);
        setLoadingOlder(false);
      });
    } finally {
      loadingOlderRef.current = false;
    }
    if (hadFocus) {
      const control =
        focusTarget === 'retry'
          ? olderRetryRef.current
          : loadOlderButtonRef.current;
      // With no earlier page left the button is gone; the region keeps focus.
      (control ?? rootRef.current)?.focus();
    }
  };

  const canCompose =
    mode !== 'read-only' && composerPosition !== 'none' && onSubmit != null;
  const composer = canCompose ? (
    <CommentComposerBase
      context={topComposerContext}
      anchor={composerAnchor}
      onAnchorDismiss={onComposerAnchorDismiss}
      focusKey={anchorFocusKey}
      value={draft}
      onChange={next => {
        draftRef.current = next;
        setDraft(next);
        setTopComposerError(undefined);
        onComposerDraftChange?.(next, topComposerContext);
      }}
      onSubmit={next => void submitComment(next, topComposerContext)}
      placeholder={
        composerPlaceholder ?? t('@astryx.commentComposer.placeholder')
      }
      isSubmitting={value.isSubmitting}
      error={topComposerError ?? composerError}
      onRetryError={
        topComposerError != null
          ? () => void submitComment(draft, topComposerContext)
          : undefined
      }
      highlightColor={highlightColor}
      triggers={composerTriggers ?? []}
      agentCommands={value.agentCommands}
      hasEmojiPicker={hasEmojiPicker}
      controls={composerControls}
      onActionPendingChange={value.composerActionPendingChange}
      onUploadImages={
        onUploadImages == null
          ? undefined
          : files => onUploadImages(files, topComposerContext)
      }
      renderComposer={renderComposer}
    />
  ) : null;
  const loadingComposer =
    isLoading && mode !== 'read-only' && composerPosition !== 'none' ? (
      <CommentComposerLoadingSkeleton
        actionCount={
          (onUploadImages == null ? 0 : 1) + (hasEmojiPicker ? 1 : 0)
        }
      />
    ) : null;
  const visibleComposer = isLoading ? loadingComposer : composer;

  const isEmbedded = layout === 'embedded';
  // A pane bleeds a card parent's Sections to the panel edge through the
  // message list's padding; an embedded list has no list padding to cross.
  const bleedsToPanelEdge = container === 'card' && !isEmbedded;
  // Inside a host's Card or Popover, its border bounds the list, so the first
  // and last threads drop their outer rules.
  const dividersAt = (index: number): readonly ThreadDivider[] =>
    isEmbedded && container === 'card'
      ? THREAD_DIVIDERS.filter(
          divider =>
            !(divider === 'top' && index === 0 && !hasOlderComments) &&
            !(divider === 'bottom' && index === timelineEntries.length - 1),
        )
      : THREAD_DIVIDERS;
  const renderedEmptyState =
    emptyState === undefined ? (
      <EmptyState
        title={t('@astryx.comments.emptyTitle')}
        description={
          canCompose
            ? t('@astryx.comments.emptyDescription')
            : t('@astryx.comments.emptyReadOnlyDescription')
        }
        isCompact
      />
    ) : (
      emptyState
    );
  const timelineXstyle = [
    styles.timeline,
    bleedsToPanelEdge &&
      (density === 'compact' ? styles.bleedCompact : styles.bleedBalanced),
  ];

  const loadingStack = (
    <VStack
      width={bleedsToPanelEdge ? undefined : '100%'}
      xstyle={timelineXstyle}>
      <CommentThreadLoadingSkeleton container={container} />
    </VStack>
  );
  const timelineStack = (
    <VStack
      width={bleedsToPanelEdge ? undefined : '100%'}
      gap={container === 'card' ? 0 : density === 'compact' ? 2 : 4}
      xstyle={timelineXstyle}>
      {hasOlderComments && (
        <VStack gap={1} align="center" width="100%">
          {olderError != null ? (
            <ErrorBanner
              key={olderFailureCount}
              actionRef={olderRetryRef}
              content={{
                title: olderError,
                actionLabel: t('@astryx.comments.retry'),
                onAction: () => void loadOlder(),
              }}
              data-comments-older-error="banner"
            />
          ) : (
            <Button
              ref={loadOlderButtonRef}
              label={t('@astryx.comments.loadOlder')}
              variant="ghost"
              size="sm"
              isLoading={isLoadingOlder || loadingOlder}
              isDisabled={onLoadOlder == null}
              onClick={() => void loadOlder()}
            />
          )}
        </VStack>
      )}
      {timelineEntries.map((entry, index) =>
        entry.kind === 'event' ? (
          <ActivityEventRow
            key={`event-${entry.value.id}`}
            event={entry.value}
            renderEvent={renderEvent}
          />
        ) : (
          <CommentRow
            key={`comment-${entry.value.id}`}
            comment={entry.value}
            depth={0}
            threadId={entry.value.id}
            dividers={dividersAt(index)}
          />
        ),
      )}
    </VStack>
  );
  const listDensity = density === 'compact' ? 'compact' : 'balanced';
  const isEmpty = timelineEntries.length === 0 && !hasOlderComments;

  return (
    <CommentsContextProvider value={value}>
      <VStack
        as="section"
        ref={setRootRef}
        tabIndex={-1}
        aria-label={label}
        aria-busy={isLoading || undefined}
        gap={3}
        width="100%"
        height={isEmbedded ? undefined : '100%'}
        {...rest}
        {...mergeProps(
          themeProps('comments', {layout, density, container}),
          stylex.props(!isEmbedded && styles.root, xstyle),
          className,
          style,
        )}>
        {loadError != null && (
          <Banner
            ref={loadErrorRef}
            status="error"
            title={t('@astryx.comments.loadFailed')}
            description={loadError}
            container="section"
            endContent={
              onRetryLoad != null ? (
                <Button
                  label={t('@astryx.comments.retry')}
                  variant="ghost"
                  size="sm"
                  clickAction={onRetryLoad}
                />
              ) : undefined
            }
          />
        )}

        {composerPosition === 'top' && visibleComposer}

        {isEmbedded ? (
          <>
            {isLoading
              ? loadingStack
              : isEmpty
                ? loadError != null
                  ? null
                  : renderedEmptyState
                : timelineStack}
            {composerPosition === 'bottom' && visibleComposer}
          </>
        ) : (
          <ChatLayout
            composer={
              composerPosition === 'bottom' && visibleComposer != null ? (
                <VStack width="100%" xstyle={styles.composerDock}>
                  {visibleComposer}
                </VStack>
              ) : null
            }
            density={listDensity}
            emptyState={loadError != null ? null : renderedEmptyState}>
            {isLoading ? (
              <ChatMessageList
                align="top"
                density={listDensity}
                gap={0}
                isStreaming
                aria-label={t('@astryx.comments.commentsLabel', {label})}>
                {loadingStack}
              </ChatMessageList>
            ) : isEmpty ? null : (
              <ChatMessageList
                align="top"
                density={listDensity}
                gap={0}
                aria-label={t('@astryx.comments.commentsLabel', {label})}>
                {timelineStack}
              </ChatMessageList>
            )}
          </ChatLayout>
        )}

        {dialogs}
      </VStack>
    </CommentsContextProvider>
  );
}

Comments.displayName = 'Comments';
