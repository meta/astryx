// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentRow.tsx
 * @input Uses React, StyleX, Astryx Card/Section/Link/Timestamp/Badge,
 *   useContainerReveal, useClickableContainer, ChatMessageMetadata,
 *   ChatTypingIndicator, and the Comments family's context and parts
 * @output Exports CommentRow: a thread (its first comment, render-derived open
 *   replies, typing state, hidden seen metadata, and reply composer, on a
 *   selectable Card or Section) at depth 0, or a reply at depth 1
 * @position Internal row renderer shared by Comments and CommentThread
 */

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {ChatMessageMetadata} from '@astryxdesign/core/Chat';
import type {DropdownMenuOption} from '@astryxdesign/core/DropdownMenu';
import {
  useClickableContainer,
  useContainerReveal,
} from '@astryxdesign/core/hooks';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {useTranslator} from '@astryxdesign/core/i18n';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  borderVars,
  colorVars,
  focusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  CommentActions,
  ReactionSummary,
  type ResolveAction,
} from './CommentActions';
import {CommentComposerBase} from './CommentComposer';
import {CommentMarkdown} from './CommentMarkdown';
import {ChatTypingIndicator} from '../Chat/ChatTypingIndicator';
import {
  AuthorName,
  AvatarSpacer,
  ClampedBody,
  CollapsedThreadRail,
  CommentAnchorQuote,
  CommentAvatarFrame,
  CommentProgressStatus,
  ErrorBanner,
  MetadataActionLink,
  MetadataSeparator,
  RESOLVED_TEXT_STYLE,
  ResolvedLabel,
  ThreadRailSegment,
  UnreadBadge,
  partStyles,
} from './CommentParts';
import {useCommentsContext} from './CommentsContext';
import {CommentIcon} from './icons';
import {
  activationSourceOf,
  commentAnchorId,
  replyComposerId,
  type ActivationSource,
  type AnyComment,
} from './utils';
import type {
  CommentComposerContext,
  CommentThreadData,
  CommentUser,
} from './types';

export type ThreadDivider = 'top' | 'bottom';

/** The 28px avatar column (StyleX resolves only same-file constants). */
const AVATAR_SIZE = `calc(${spacingVars['--spacing-6']} + ${spacingVars['--spacing-1']})`;
const TYPING_INDICATOR_STYLE: CSSProperties &
  Record<'--astryx-chat-typing-indicator-dots-column-width', string> = {
  '--astryx-chat-typing-indicator-dots-column-width': AVATAR_SIZE,
};
export const THREAD_DIVIDERS: readonly ThreadDivider[] = ['top', 'bottom'];

const styles = stylex.create({
  threadRows: {
    position: 'relative',
    isolation: 'isolate',
  },
  // The header row is exactly one avatar tall, so revealing its icon buttons
  // on hover never changes the comment's height.
  header: {
    height: AVATAR_SIZE,
    minHeight: AVATAR_SIZE,
  },
  // The header's actions take whatever room the name and time leave.
  metadata: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
  },
  // Leaves the more menu its button however long the name.
  metadataBesideActions: {
    maxWidth: `calc(100% - ${spacingVars['--spacing-6']} - ${spacingVars['--spacing-1']})`,
  },
  // The name gives way when the header is short, so the time, an agent's
  // badge and the actions keep their room.
  authorName: {
    flexShrink: 1,
    minWidth: 0,
  },
  agentBadge: {
    flexShrink: 0,
  },
  actionsReveal: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  typingIndicator: {
    width: '100%',
  },
  // Row controls carry one spacing step of inline padding. Pulling the row
  // back by that step puts their glyphs on the body text line, so only their
  // hover and pressed fills cross it.
  controlRowBleed: {
    marginInlineStart: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  surface: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // The hidden toggle that names the thread has focus: the surface takes the
  // system focus ring.
  surfaceFocused: {
    outlineStyle: focusVars['--focus-outline-style'],
    outlineWidth: focusVars['--focus-outline-width'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },
  // Only Card's default variant draws a border, so a selected Card keeps that
  // variant and takes the muted fill rather than switching variants.
  selectedCardFill: {
    backgroundColor: colorVars['--color-background-muted'],
  },
  // Forced colors replace the muted fill with the system background, so a
  // selected thread keeps a visible outline there.
  selectedForcedColors: {
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineWidth: {
      default: null,
      '@media (forced-colors: active)': `calc(${borderVars['--border-width']} * 2)`,
    },
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'Highlight',
    },
    outlineOffset: {
      default: null,
      '@media (forced-colors: active)': `calc(${borderVars['--border-width']} * -2)`,
    },
  },
});

// The header actions reveal instantly, with no fade or dwell.
const INSTANT_REVEAL_STYLE = {transition: 'none'} as const;

/**
 * A thread surface (a basic Card or Section) made selectable with
 * `useClickableContainer`: surface clicks toggle selection while inner
 * controls keep their own clicks, and a visually hidden toggle button carries
 * the accessible name and pressed state. Selection paints the container's own
 * muted fill, so no selectable component is restyled.
 */
function ThreadSurface({
  children,
  dividers,
  isFilled,
  isSelectable,
  isSelected,
  label,
  onChange,
  revealProps,
  surface,
  threadId,
}: {
  children: ReactNode;
  dividers: readonly ThreadDivider[];
  /** Selected, or called out by the host. */
  isFilled: boolean;
  isSelectable: boolean;
  isSelected: boolean;
  label: string;
  onChange: (isSelected: boolean, source: ActivationSource) => void;
  revealProps: {className?: string; style?: React.CSSProperties};
  surface: 'card' | 'section';
  threadId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const toggle = useCallback(
    (event?: {detail?: number}) =>
      onChange(!isSelected, activationSourceOf(event)),
    [isSelected, onChange],
  );
  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    interactiveRef: controlRef,
    onClick: toggle,
  });
  const control = isSelectable ? (
    <VisuallyHidden>
      <button
        ref={controlRef}
        type="button"
        aria-label={label}
        aria-pressed={isSelected}
        onClick={toggle}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </VisuallyHidden>
  ) : null;
  const interactionProps = isSelectable ? {onClick, onMouseUp} : {};
  const sharedXstyle = [
    isSelectable && styles.surface,
    isSelectable && isFocused && styles.surfaceFocused,
    isFilled && styles.selectedForcedColors,
  ];

  if (surface === 'section') {
    return (
      <Section
        ref={containerRef}
        variant={isFilled ? 'muted' : 'transparent'}
        dividers={[...dividers]}
        padding={3}
        width="100%"
        xstyle={[partStyles.sectionDividerOverlap, ...sharedXstyle]}
        className={revealProps.className}
        style={revealProps.style}
        data-thread-id={threadId}
        data-thread-surface="section"
        data-selected={isSelected ? 'true' : 'false'}
        {...interactionProps}>
        {control}
        {children}
      </Section>
    );
  }

  return (
    <Card
      ref={containerRef}
      variant="default"
      elevation="none"
      padding={3}
      width="100%"
      xstyle={[isFilled && styles.selectedCardFill, ...sharedXstyle]}
      className={revealProps.className}
      style={revealProps.style}
      data-thread-id={threadId}
      data-thread-surface="card"
      data-selected={isSelected ? 'true' : 'false'}
      {...interactionProps}>
      {control}
      {children}
    </Card>
  );
}

function uniqueCommentUsers(users: readonly CommentUser[]): CommentUser[] {
  const ids = new Set<string>();
  return users.filter(user => {
    if (ids.has(user.id)) {
      return false;
    }
    ids.add(user.id);
    return true;
  });
}

/**
 * A comment row. At depth 0 it is the whole thread: its first comment,
 * replies behind View replies, and the reply composer, on a selectable
 * surface. At depth 1 it is one reply inside it.
 */
export function CommentRow({
  comment,
  depth,
  dividers = THREAD_DIVIDERS,
  isParentThreadActive = false,
  isParentThreadResolved = false,
  threadId,
}: {
  comment: AnyComment;
  depth: 0 | 1;
  /** A card-parent thread's rules; an embedded list drops its outer ones. */
  dividers?: readonly ThreadDivider[];
  isParentThreadActive?: boolean;
  /** A reply in a resolved thread takes the thread's muted text. */
  isParentThreadResolved?: boolean;
  /** The thread this row belongs to: its own id at depth 0. */
  threadId: string;
}) {
  const t = useTranslator();
  const scope = useCommentsContext();
  const {
    actionErrors,
    agentCommands,
    can,
    composerPlaceholder,
    composerTriggers,
    container,
    currentUser,
    editTarget,
    hasEmojiPicker,
    highlightColor,
    isComposerActionPending,
    isSubmitting,
    markdownInlinePlugins,
    markdownPlugins,
    mode,
    onUploadImages,
    pendingActionIds,
    reactionOptions,
    renderAdditionalActions,
    renderAnchor,
    renderBody,
    renderComposer,
    replyDraft,
    replyError,
    replyTarget,
    selectedThreadId,
  } = scope;
  const [isMetadataMenuOpen, setIsMetadataMenuOpen] = useState(false);
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  const articleRef = useRef<HTMLElement | null>(null);
  const thread: CommentThreadData | null =
    depth === 0 ? (comment as CommentThreadData) : null;
  const status = comment.status ?? 'sent';
  const isReady = status === 'sent';
  const isInProgress = comment.progress != null;
  const isOwn = currentUser?.id === comment.author.id;
  const canMutate = mode !== 'read-only' && isReady && !isInProgress;
  const canReply = canMutate && can.submit && (comment.canReply ?? true);
  const canReact = canMutate && can.react && (comment.canReact ?? true);
  const canEdit =
    canMutate &&
    can.saveEdit &&
    mode === 'interactive' &&
    (comment.canEdit ?? isOwn);
  const canDelete =
    status !== 'sending' &&
    !isInProgress &&
    can.delete &&
    mode === 'interactive' &&
    (comment.canDelete ?? isOwn);
  const isBusy = pendingActionIds.has(comment.id);
  const rowActionsBusy = isBusy || isSubmitting || isComposerActionPending;
  const isResolved = thread?.isResolved === true;
  const isMuted = isResolved || isParentThreadResolved;
  const resolveAction: ResolveAction | undefined =
    thread == null || thread.canResolve === false || !canMutate
      ? undefined
      : isResolved
        ? can.reopen
          ? {kind: 'reopen', onClick: () => scope.reopen(comment)}
          : undefined
        : can.resolve
          ? {kind: 'resolve', onClick: () => scope.resolve(comment)}
          : undefined;
  const hasHistory =
    comment.isEdited === true &&
    ((comment.previousVersions?.length ?? 0) > 0 || can.loadVersions);
  const actionFailure = actionErrors[comment.id];
  const actionError = actionFailure?.message;
  const editorIsOpen = editTarget?.comment.id === comment.id;
  const replies = thread?.replies ?? [];
  const typingUsers = uniqueCommentUsers(thread?.typingUsers ?? []).filter(
    user => user.id !== currentUser?.id,
  );
  const isThreadSelected = depth === 0 && selectedThreadId === comment.id;
  const hasUnreadReplies = replies.some(reply => reply.isUnread === true);
  const isUnreadReplyReveal = !isThreadSelected && hasUnreadReplies;
  // Selection is the open state. Derive reply visibility from it during render
  // instead of repairing a second expansion state in an Effect (runtime INV1).
  const areRepliesVisible = isUnreadReplyReveal || isThreadSelected;
  const visibleReplies = areRepliesVisible ? replies : [];
  const anchorId = commentAnchorId(comment.id);
  const repliesRegionId = `${anchorId}-replies`;
  const authorNameId = `${anchorId}-author`;
  // An unread reveal is content, not a selected disclosure: it neither opens a
  // composer nor presents a Hide control that cannot clear host-owned unread
  // state. Once the host clears `isUnread`, the ordinary disclosure returns.
  const showReplyDisclosure =
    replies.length > 0 && editTarget == null && !isUnreadReplyReveal;
  const isReplyDisclosureBusy = isComposerActionPending || isSubmitting;
  const replyDisclosureLabel = areRepliesVisible
    ? t('@astryx.comments.hideReplies')
    : t('@astryx.comments.viewReplies', {count: replies.length});

  const isRootReplyComposerOpen =
    replyTarget?.parentId === comment.id &&
    replyTarget.comment.id === comment.id;
  const canOpenRootReplyFromCard = canReply && !isRootReplyComposerOpen;
  const canSelectThread =
    depth === 0 &&
    editTarget == null &&
    !isComposerActionPending &&
    !isSubmitting;
  const isBodyExpanded = depth === 0 ? isThreadSelected : isParentThreadActive;
  // Opening a thread puts the viewer in its reply composer, every time; a
  // composer already open for a reply in it keeps its target and draft.
  const focusThreadReply = () => {
    if (!canReply) {
      return;
    }
    scope.startReply(
      comment.id,
      replyTarget?.parentId === comment.id ? replyTarget.comment : comment,
      {focus: true},
    );
  };
  const activateThread = (source: ActivationSource) => {
    scope.selectThread(comment.id);
    if (source === 'pointer') {
      focusThreadReply();
    } else if (canOpenRootReplyFromCard) {
      scope.startReply(comment.id, comment);
    }
  };
  const changeThreadSelection = (
    isSelected: boolean,
    source: ActivationSource = 'pointer',
  ) => {
    if (isSelected) {
      activateThread(source);
      return;
    }
    if (isThreadSelected) {
      scope.selectThread(null);
    }
    if (replyTarget?.parentId === comment.id) {
      scope.cancelReply();
    }
  };

  const menuItems: DropdownMenuOption[] = [];
  if (canEdit) {
    menuItems.push({
      id: 'edit',
      label: t('@astryx.comments.edit'),
      icon: <CommentIcon name="edit" />,
      onClick: () => scope.startEdit(comment),
    });
  }
  if (canDelete) {
    menuItems.push({
      id: 'delete',
      label: t('@astryx.comments.delete'),
      icon: <CommentIcon name="delete" />,
      onClick: () => scope.requestDelete(comment),
    });
  }

  const metadataStatus = status === 'sending' ? 'sending' : undefined;
  const hasReactions = (comment.reactions?.length ?? 0) > 0;
  const showHeaderActions =
    !editorIsOpen &&
    (isReady || menuItems.length > 0 || renderAdditionalActions != null);
  const hasControlRow = metadataStatus != null || hasReactions;

  const uploaderFor = (context: CommentComposerContext) =>
    onUploadImages == null
      ? undefined
      : (files: readonly File[]) => onUploadImages(files, context);

  // A failed comment's Banner keeps a retry failure as its description, so one
  // Banner carries the whole story.
  const footer =
    status === 'error' ? (
      <ErrorBanner
        content={{
          title: comment.errorMessage ?? t('@astryx.comments.sendFailed'),
          description: actionError,
          actionLabel: can.retry ? t('@astryx.comments.retry') : undefined,
          onAction: can.retry ? () => scope.retry(comment) : undefined,
          isActionDisabled: rowActionsBusy,
          isRetrying: isBusy,
          isAnnounced: actionFailure?.isAnnounced,
        }}
        // The Banner unmounts once the retry starts; keep focus on the comment.
        onBeforeAction={() => articleRef.current?.focus()}
        data-comment-delivery-error="banner"
      />
    ) : hasControlRow || (actionFailure != null && !editorIsOpen) ? (
      <VStack gap={1} align="start" width="100%">
        {hasControlRow && (
          <HStack
            gap={1}
            align="center"
            xstyle={isReady ? styles.controlRowBleed : undefined}>
            {metadataStatus != null && (
              <ChatMessageMetadata status={metadataStatus} />
            )}
            {hasReactions && (
              <ReactionSummary
                comment={comment}
                canReact={canReact}
                isBusy={rowActionsBusy}
                onReact={scope.react}
              />
            )}
          </HStack>
        )}
        {actionFailure != null && !editorIsOpen && (
          <ErrorBanner
            content={{
              title: actionFailure.message,
              actionLabel:
                actionFailure.retry != null
                  ? t('@astryx.comments.retry')
                  : undefined,
              onAction: actionFailure.retry,
              isAnnounced: actionFailure.isAnnounced,
            }}
            onBeforeAction={() => articleRef.current?.focus()}
            data-comment-action-error="banner"
          />
        )}
      </VStack>
    ) : null;

  const anchor = thread?.anchor;
  const defaultAnchor =
    anchor != null ? (
      <CommentAnchorQuote
        anchor={anchor}
        highlightColor={highlightColor}
        isResolved={isResolved}
      />
    ) : null;
  const rows = (
    <VStack gap={8} width="100%">
      <VStack
        gap={2}
        width="100%"
        xstyle={replies.length > 0 ? styles.threadRows : undefined}>
        {visibleReplies.length === 0 && replies.length > 0 && (
          <CollapsedThreadRail />
        )}
        <VStack
          as="article"
          ref={articleRef}
          id={anchorId}
          tabIndex={-1}
          aria-labelledby={authorNameId}
          width="100%"
          xstyle={visibleReplies.length > 0 ? partStyles.railRow : undefined}
          data-comment-id={comment.id}
          data-comment-depth={String(depth)}
          data-author-kind={comment.author.kind ?? 'person'}
          data-comment-resolved={isResolved ? 'true' : undefined}>
          {visibleReplies.length > 0 && (
            <ThreadRailSegment
              from="avatar"
              to={showReplyDisclosure ? 'row' : 'avatar'}
            />
          )}
          <HStack gap={2} align="start" width="100%">
            <CommentAvatarFrame user={comment.author} />
            <StackItem size="fill">
              <VStack gap={1} width="100%">
                <HStack
                  gap={1}
                  align="center"
                  width="100%"
                  xstyle={styles.header}>
                  <HStack
                    gap={1}
                    align="center"
                    xstyle={[
                      styles.metadata,
                      showHeaderActions && styles.metadataBesideActions,
                    ]}
                    style={isMuted ? RESOLVED_TEXT_STYLE : undefined}>
                    <AuthorName
                      author={comment.author}
                      id={authorNameId}
                      xstyle={styles.authorName}
                    />
                    {comment.author.kind === 'agent' && (
                      <HStack align="center" xstyle={styles.agentBadge}>
                        <Badge
                          variant="neutral"
                          label={t('@astryx.comments.agentBadge')}
                        />
                      </HStack>
                    )}
                    <MetadataSeparator />
                    <Timestamp
                      value={comment.createdAt}
                      format="relative_short"
                      type="body"
                      color="secondary"
                      isLive
                    />
                    {comment.isEdited === true && (
                      <>
                        <MetadataSeparator />
                        {hasHistory ? (
                          <MetadataActionLink
                            label={t('@astryx.comments.edited')}
                            accessibleLabel={t('@astryx.comments.viewHistory')}
                            actionRole="history"
                            textType="body"
                            onClick={() => scope.openHistory(comment)}
                          />
                        ) : (
                          <Text
                            type="body"
                            color="secondary"
                            xstyle={partStyles.noWrap}>
                            {t('@astryx.comments.edited')}
                          </Text>
                        )}
                      </>
                    )}
                    {isResolved && (
                      <>
                        <MetadataSeparator />
                        <ResolvedLabel resolvedBy={thread?.resolvedBy} />
                      </>
                    )}
                  </HStack>
                  {showHeaderActions ? (
                    <RevealedActions
                      revealProps={getContentRevealProps({
                        isLayoutPreserved: true,
                        forceVisibility: isMetadataMenuOpen
                          ? 'shown'
                          : undefined,
                      })}>
                      <CommentActions
                        comment={comment}
                        canReact={canReact}
                        canReply={canReply}
                        canCopyLink={isReady && !isInProgress}
                        resolveAction={resolveAction}
                        isBusy={rowActionsBusy}
                        menuItems={menuItems}
                        menuLabel={t('@astryx.comments.actionsLabel', {
                          name: comment.author.name,
                        })}
                        options={reactionOptions}
                        onReact={scope.react}
                        onReply={() =>
                          scope.startReply(threadId, comment, {
                            focus: true,
                          })
                        }
                        onOpenChange={setIsMetadataMenuOpen}
                        additionalActions={renderAdditionalActions?.(comment)}
                      />
                    </RevealedActions>
                  ) : (
                    <StackItem size="fill">{null}</StackItem>
                  )}
                  {comment.isUnread === true && <UnreadBadge />}
                </HStack>
                {thread != null &&
                  defaultAnchor != null &&
                  (renderAnchor == null
                    ? defaultAnchor
                    : renderAnchor(thread, defaultAnchor))}
                {editorIsOpen && editTarget != null ? (
                  <CommentComposerBase
                    context={{kind: 'edit', commentId: comment.id}}
                    value={editTarget.value}
                    onChange={value => scope.changeEdit(comment, value)}
                    onSubmit={value => scope.saveEdit(comment, value)}
                    placeholder={t('@astryx.comments.editPlaceholder')}
                    contextLabel={t('@astryx.comments.editingContext')}
                    onCancel={() => scope.cancelEdit(true)}
                    focusKey={`edit-${comment.id}`}
                    isSubmitting={isBusy}
                    error={actionError}
                    onRetryError={actionFailure?.retry}
                    highlightColor={highlightColor}
                    triggers={composerTriggers ?? []}
                    agentCommands={agentCommands}
                    hasEmojiPicker={hasEmojiPicker}
                    onActionPendingChange={scope.composerActionPendingChange}
                    onUploadImages={uploaderFor({
                      kind: 'edit',
                      commentId: comment.id,
                    })}
                    renderComposer={renderComposer}
                  />
                ) : (
                  <ClampedBody isExpanded={isBodyExpanded} isMuted={isMuted}>
                    {comment.progress != null ? (
                      <CommentProgressStatus progress={comment.progress} />
                    ) : renderBody != null ? (
                      renderBody(comment)
                    ) : (
                      <CommentMarkdown
                        body={comment.body}
                        agentCommands={agentCommands}
                        plugins={markdownPlugins}
                        inlinePlugins={markdownInlinePlugins}
                      />
                    )}
                  </ClampedBody>
                )}
                {footer}
              </VStack>
            </StackItem>
          </HStack>
        </VStack>

        {depth === 0 && replies.length > 0 && (
          <VStack
            id={repliesRegionId}
            gap={2}
            width="100%"
            data-unread-replies-revealed={
              isUnreadReplyReveal ? 'true' : undefined
            }>
            {showReplyDisclosure && (
              <HStack
                gap={2}
                align="center"
                width="100%"
                xstyle={
                  visibleReplies.length > 0 ? partStyles.railRow : undefined
                }>
                {visibleReplies.length > 0 && (
                  <ThreadRailSegment from="row" to="avatar" />
                )}
                <AvatarSpacer />
                <Link
                  type="body"
                  color="secondary"
                  xstyle={partStyles.noWrap}
                  aria-expanded={areRepliesVisible}
                  aria-controls={repliesRegionId}
                  aria-disabled={isReplyDisclosureBusy || undefined}
                  data-reply-disclosure="true"
                  onClick={event => {
                    event.preventDefault();
                    if (!isReplyDisclosureBusy) {
                      changeThreadSelection(
                        !areRepliesVisible,
                        activationSourceOf(event),
                      );
                    }
                  }}>
                  {replyDisclosureLabel}
                </Link>
              </HStack>
            )}
            {visibleReplies.map((reply, index) => (
              <VStack
                key={reply.id}
                gap={2}
                width="100%"
                xstyle={
                  index === visibleReplies.length - 1
                    ? undefined
                    : partStyles.railRow
                }>
                {index < visibleReplies.length - 1 && (
                  <ThreadRailSegment from="avatar" to="avatar" />
                )}
                <CommentRow
                  comment={reply}
                  depth={1}
                  threadId={comment.id}
                  isParentThreadActive={isThreadSelected}
                  isParentThreadResolved={isResolved}
                />
              </VStack>
            ))}
          </VStack>
        )}
        {depth === 0 && isThreadSelected && typingUsers.length > 0 && (
          <HStack width="100%" data-thread-typing-indicator="true">
            <ChatTypingIndicator
              names={typingUsers.map(user => user.name)}
              xstyle={styles.typingIndicator}
              style={TYPING_INDICATOR_STYLE}
            />
          </HStack>
        )}
      </VStack>

      {depth === 0 &&
        isThreadSelected &&
        replyTarget?.parentId === comment.id && (
          <HStack
            id={replyComposerId(comment.id)}
            gap={2}
            align="start"
            width="100%"
            data-reply-composer="true">
            {currentUser != null ? (
              <CommentAvatarFrame user={currentUser} />
            ) : (
              <AvatarSpacer />
            )}
            <StackItem size="fill">
              <CommentComposerBase
                context={{
                  kind: 'reply',
                  parentCommentId: comment.id,
                  repliedToCommentId: replyTarget.comment.id,
                }}
                value={replyDraft}
                onChange={scope.changeReplyDraft}
                onSubmit={value => scope.submitReply(comment.id, value)}
                placeholder={
                  composerPlaceholder ??
                  t('@astryx.comments.replyPlaceholder', {
                    name: replyTarget.comment.author.name,
                  })
                }
                contextLabel={t('@astryx.comments.replyingContext', {
                  name: replyTarget.comment.author.name,
                })}
                focusKey={
                  replyTarget.focusRequestId == null
                    ? undefined
                    : `reply-${replyTarget.comment.id}-${replyTarget.focusRequestId}`
                }
                isSubmitting={isSubmitting}
                error={replyError}
                onRetryError={
                  replyError != null
                    ? () => scope.submitReply(comment.id, replyDraft)
                    : undefined
                }
                highlightColor={highlightColor}
                triggers={composerTriggers ?? []}
                agentCommands={agentCommands}
                hasEmojiPicker={hasEmojiPicker}
                onActionPendingChange={scope.composerActionPendingChange}
                onUploadImages={uploaderFor({
                  kind: 'reply',
                  parentCommentId: comment.id,
                  repliedToCommentId: replyTarget.comment.id,
                })}
                renderComposer={renderComposer}
              />
            </StackItem>
          </HStack>
        )}
    </VStack>
  );

  if (depth !== 0) {
    return rows;
  }

  return (
    <ThreadSurface
      surface={container === 'card' ? 'section' : 'card'}
      dividers={container === 'card' ? dividers : []}
      label={t('@astryx.comments.threadLabel', {name: comment.author.name})}
      isSelectable={canSelectThread}
      isSelected={isThreadSelected}
      isFilled={isThreadSelected || thread?.isHighlighted === true}
      onChange={changeThreadSelection}
      threadId={comment.id}
      // The whole surface drives the reveal, so actions stay visible while
      // the pointer is anywhere on the thread, its replies and composer too.
      revealProps={getContainerProps()}>
      {rows}
    </ThreadSurface>
  );
}

/** The header actions, revealed while the pointer or focus is on the thread. */
function RevealedActions({
  children,
  revealProps,
}: {
  children: ReactNode;
  revealProps: {className?: string; style?: React.CSSProperties};
}) {
  return (
    <HStack
      align="center"
      xstyle={styles.actionsReveal}
      className={revealProps.className}
      style={{...revealProps.style, ...INSTANT_REVEAL_STYLE}}
      data-comment-actions-reveal="hover-focus">
      {children}
    </HStack>
  );
}
