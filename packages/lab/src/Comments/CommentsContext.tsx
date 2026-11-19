// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentsContext.tsx
 * @input Uses React state, React DOM flushSync, AlertDialog, Dialog, Markdown
 *   body, and useAnnounce
 * @output Exports the Comments family's shared context, the controller hook
 *   that owns its interaction state (selection, reply and edit targets, draft
 *   lifecycle reporting, pending actions, failures, focus hand-offs, delete
 *   confirmation, and edit history), the dialogs it opens, and its announcer
 * @position Internal state layer shared by Comments and a standalone
 *   CommentThread; comment rows read it instead of taking dozens of props
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import type {ChatComposerTrigger} from '@astryxdesign/core/Chat';
import type {MarkdownInlinePlugin} from '@astryxdesign/core/Markdown';
import type {MarkdownPluginEntry} from '@astryxdesign/core/Markdown/plugins';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {CommentMarkdown} from './CommentMarkdown';
import {commentMoreMenuTrigger, visibleCommentAction} from './CommentActions';
import {HistoryDialog, type HistoryState} from './CommentParts';
import {
  commentAnchorId,
  replyComposerId,
  shouldRestoreFocusFrom,
  type AnyComment,
} from './utils';
import {
  DEFAULT_COMMENT_REACTIONS,
  type CommentAgentCommand,
  type CommentComposerContext,
  type CommentHighlightColor,
  type CommentImageUploader,
  type CommentMode,
  type CommentReactionOption,
  type CommentThreadData,
  type CommentThreadSharedProps,
  type CommentUser,
} from './types';

/** The thread a reply composer is open in, and the comment it answers. */
export type ReplyTarget = {
  parentId: string;
  comment: AnyComment;
  /** Set when the composer should take focus; each request has its own. */
  focusRequestId?: number;
  /** The mention the draft was seeded with, which the viewer did not type. */
  seed?: string;
};

export type EditTarget = {comment: AnyComment; value: string};

function replyComposerContext(target: ReplyTarget): CommentComposerContext {
  return {
    kind: 'reply',
    parentCommentId: target.parentId,
    repliedToCommentId: target.comment.id,
  };
}

function editComposerContext(comment: AnyComment): CommentComposerContext {
  return {kind: 'edit', commentId: comment.id};
}

/** A failed comment action and how to run it again. */
export type ActionFailure = {
  message: string;
  retry?: () => void;
  /** Already spoken by whoever raised it, so the row's Banner stays silent. */
  isAnnounced?: boolean;
};

type FocusTarget = 'reply' | 'actions' | 'history' | 'article' | 'thread';

/** Focus the control that replaces an interaction target after its state commits. */
function focusCommentTarget(
  commentId: string | null,
  target: FocusTarget,
  rootRef: RefObject<HTMLElement | null>,
): void {
  if (target === 'thread' || commentId == null) {
    rootRef.current?.focus();
    return;
  }
  const article = document.getElementById(commentAnchorId(commentId));
  const next =
    target === 'reply'
      ? (visibleCommentAction(article, 'reply') ??
        commentMoreMenuTrigger(article))
      : target === 'actions'
        ? commentMoreMenuTrigger(article)
        : target === 'history'
          ? article?.querySelector<HTMLElement>(
              '[data-metadata-action="history"]',
            )
          : article;
  (next ?? article ?? rootRef.current)?.focus();
}

/** Keep post-action focus in its originating handler (runtime INV2). */
function commitAndFocus(
  update: () => void,
  commentId: string | null,
  target: FocusTarget,
  rootRef: RefObject<HTMLElement | null>,
): void {
  flushSync(update);
  focusCommentTarget(commentId, target, rootRef);
}

type MaybePromise = void | Promise<void>;

const NO_AGENT_COMMANDS: readonly CommentAgentCommand[] = [];

export interface CommentsContextValue {
  currentUser?: CommentUser;
  mode: CommentMode;
  container: 'section' | 'card';
  /** The host's placeholder, or nothing for the localized defaults. */
  composerPlaceholder: string | undefined;
  reactionOptions: readonly CommentReactionOption[];
  highlightColor: CommentHighlightColor;
  agentCommands: readonly CommentAgentCommand[];
  composerTriggers?: readonly ChatComposerTrigger[];
  markdownPlugins?: readonly MarkdownPluginEntry[];
  markdownInlinePlugins?: readonly MarkdownInlinePlugin[];
  hasEmojiPicker: boolean;
  onUploadImages?: CommentImageUploader;
  renderAnchor?: CommentThreadSharedProps['renderAnchor'];
  renderBody?: CommentThreadSharedProps['renderBody'];
  renderAdditionalActions?: CommentThreadSharedProps['renderAdditionalActions'];
  renderComposer?: CommentThreadSharedProps['renderComposer'];
  /** Which actions the host handles. */
  can: {
    submit: boolean;
    saveEdit: boolean;
    delete: boolean;
    react: boolean;
    retry: boolean;
    loadVersions: boolean;
    resolve: boolean;
    reopen: boolean;
  };
  selectedThreadId: string | null;
  replyTarget: ReplyTarget | null;
  replyDraft: string;
  replyError?: string;
  editTarget: EditTarget | null;
  pendingActionIds: ReadonlySet<string>;
  actionErrors: Readonly<Record<string, ActionFailure>>;
  isSubmitting: boolean;
  isComposerActionPending: boolean;
  selectThread: (threadId: string | null) => void;
  startReply: (
    parentId: string,
    target: AnyComment,
    options?: {focus?: boolean},
  ) => void;
  changeReplyDraft: (value: string) => void;
  submitReply: (parentId: string, value: string) => void;
  cancelReply: (restoreFocus?: boolean) => void;
  startEdit: (comment: AnyComment) => void;
  changeEdit: (comment: AnyComment, value: string) => void;
  saveEdit: (comment: AnyComment, value: string) => void;
  cancelEdit: (restoreFocus?: boolean) => void;
  react: (
    comment: AnyComment,
    key: string,
    option?: CommentReactionOption,
  ) => void;
  resolve: (comment: AnyComment) => void;
  reopen: (comment: AnyComment) => void;
  retry: (comment: AnyComment) => void;
  requestDelete: (comment: AnyComment) => void;
  openHistory: (comment: AnyComment) => void;
  composerActionPendingChange: (isPending: boolean) => void;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

export const CommentsContextProvider = CommentsContext.Provider;

/** The nearest Comments or standalone CommentThread scope. */
export function useCommentsContext(): CommentsContextValue {
  const context = useContext(CommentsContext);
  if (context == null) {
    throw new Error(
      'Comment rows render inside a Comments panel or a CommentThread.',
    );
  }
  return context;
}

export interface CommentsControllerOptions extends CommentThreadSharedProps {
  /** Controlled selection by thread id; `undefined` lets the scope own it. */
  selectedThreadId?: string | null;
  onSelectedThreadChange?: (threadId: string | null) => void;
  /** Threads in display order, to find who takes focus after a deletion. */
  roots: readonly CommentThreadData[];
  /** Takes focus when nothing nearer can, such as after the last deletion. */
  rootRef: RefObject<HTMLElement | null>;
}

export type SubmitResult = 'posted' | 'failed' | 'skipped';

/**
 * The interaction state behind a Comments panel or a standalone CommentThread.
 * The host owns the data and every mutation; this owns what the viewer is
 * doing with it.
 */
export function useCommentsController({
  currentUser,
  mode = 'interactive',
  container = 'section',
  composerPlaceholder,
  highlightColor = 'yellow',
  reactionOptions = DEFAULT_COMMENT_REACTIONS,
  agentCommands = NO_AGENT_COMMANDS,
  composerTriggers,
  markdownPlugins,
  markdownInlinePlugins,
  getReplyMention,
  hasEmojiPicker = true,
  isSubmitting = false,
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
  selectedThreadId: selectedThreadIdProp,
  onSelectedThreadChange,
  roots,
  rootRef,
}: CommentsControllerOptions) {
  const [uncontrolledSelectedThreadId, setUncontrolledSelectedThreadId] =
    useState<string | null>(null);
  const isSelectionControlled = selectedThreadIdProp !== undefined;
  const selectedThreadId = isSelectionControlled
    ? selectedThreadIdProp
    : uncontrolledSelectedThreadId;
  // The last selection made by this surface. A different controlled value came
  // from the host and may need to synchronize the browser scroll position.
  const viewerSelectionRef = useRef<string | null>(selectedThreadId ?? null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyError, setReplyError] = useState<string>();
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [localSubmitPending, setLocalSubmitPending] = useState(false);
  const [pendingComposerActionCount, setPendingComposerActionCount] =
    useState(0);
  const [actionErrors, setActionErrors] = useState<
    Record<string, ActionFailure>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<AnyComment | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [history, setHistory] = useState<HistoryState | null>(null);
  const replyFocusRequestRef = useRef(0);
  const announce = useAnnounce();
  const t = useTranslator();

  const reportDraftChange = (
    value: string,
    context: CommentComposerContext,
  ) => {
    onComposerDraftChange?.(value, context);
  };
  const clearReplyDraft = (target: ReplyTarget | null = replyTarget) => {
    if (target != null) {
      reportDraftChange('', replyComposerContext(target));
    }
    setReplyTarget(null);
    setReplyDraft('');
    setReplyError(undefined);
  };
  const clearEditDraft = (target: EditTarget | null = editTarget) => {
    if (target != null) {
      reportDraftChange('', editComposerContext(target.comment));
    }
    setEditTarget(null);
  };

  const setSelectedThreadId = (threadId: string | null) => {
    viewerSelectionRef.current = threadId;
    if (!isSelectionControlled) {
      setUncontrolledSelectedThreadId(threadId);
    }
    if (threadId !== selectedThreadId) {
      onSelectedThreadChange?.(threadId);
    }
  };

  // Synchronize a host-driven selection with the browser's scroll position.
  // Selection/open rendering is derived directly from selectedThreadId; this
  // Effect performs only the idempotent external DOM operation (runtime INV3).
  useEffect(() => {
    if (viewerSelectionRef.current === selectedThreadId) {
      return;
    }
    viewerSelectionRef.current = selectedThreadId;
    if (selectedThreadId != null) {
      document
        .getElementById(commentAnchorId(selectedThreadId))
        ?.scrollIntoView?.({block: 'nearest'});
    }
  }, [selectedThreadId]);

  const composerActionPendingChange = useCallback((isPending: boolean) => {
    setPendingComposerActionCount(count =>
      Math.max(0, count + (isPending ? 1 : -1)),
    );
  }, []);

  const clearActionError = (commentId: string) =>
    setActionErrors(previous => {
      if (!(commentId in previous)) {
        return previous;
      }
      const next = {...previous};
      delete next[commentId];
      return next;
    });

  const runCommentAction = async (
    commentId: string,
    action: () => MaybePromise,
    failureMessage: string,
    retry?: () => void,
    /** True when another owner announces this failure, so the row's banner
     *  stays silent from its first render. */
    isAnnounced?: boolean,
  ): Promise<boolean> => {
    setPendingActionIds(previous => new Set(previous).add(commentId));
    clearActionError(commentId);
    try {
      await action();
      return true;
    } catch {
      setActionErrors(previous => ({
        ...previous,
        [commentId]: {
          message: failureMessage,
          retry:
            retry ??
            (() => void runCommentAction(commentId, action, failureMessage)),
          isAnnounced,
        },
      }));
      return false;
    } finally {
      setPendingActionIds(previous => {
        const next = new Set(previous);
        next.delete(commentId);
        return next;
      });
    }
  };

  /** Posts a comment, or a reply when `parentId` names its thread. */
  const submit = async (
    content: string,
    parentId?: string,
  ): Promise<SubmitResult> => {
    if (onSubmit == null || content.trim() === '') {
      return 'skipped';
    }
    const submitted = content.trim();
    const submittedReplyTarget = parentId != null ? replyTarget : null;
    setLocalSubmitPending(true);
    if (parentId != null) {
      setReplyError(undefined);
    }
    try {
      await onSubmit(submitted, parentId);
      if (parentId != null) {
        const restoreFocus = shouldRestoreFocusFrom(
          document.getElementById(replyComposerId(parentId)),
        );
        if (restoreFocus) {
          commitAndFocus(
            () => clearReplyDraft(submittedReplyTarget),
            parentId,
            'reply',
            rootRef,
          );
        } else {
          clearReplyDraft(submittedReplyTarget);
        }
      }
      return 'posted';
    } catch {
      if (parentId != null) {
        setReplyDraft(submitted);
        if (submittedReplyTarget != null) {
          reportDraftChange(
            submitted,
            replyComposerContext(submittedReplyTarget),
          );
        }
        setReplyError(t('@astryx.comments.replyFailed'));
      }
      return 'failed';
    } finally {
      setLocalSubmitPending(false);
    }
  };

  const saveEdit = async (comment: AnyComment, content: string) => {
    if (onSaveEdit == null || content.trim() === '') {
      return;
    }
    const saved = content.trim();
    const succeeded = await runCommentAction(
      comment.id,
      () => onSaveEdit(comment.id, saved),
      t('@astryx.comments.editFailed'),
      () => void saveEdit(comment, saved),
    );
    if (succeeded) {
      const restoreFocus = shouldRestoreFocusFrom(
        document.getElementById(commentAnchorId(comment.id)),
      );
      if (restoreFocus) {
        commitAndFocus(
          () => clearEditDraft({comment, value: saved}),
          comment.id,
          'actions',
          rootRef,
        );
      } else {
        clearEditDraft({comment, value: saved});
      }
    } else {
      setEditTarget({comment, value: saved});
      reportDraftChange(saved, editComposerContext(comment));
    }
  };

  /** The neighbor that takes focus once `target` is deleted: a reply's
   *  thread, else the next thread, else the previous one. */
  const focusTargetAfterDelete = (target: AnyComment): string | null => {
    const index = roots.findIndex(root => root.id === target.id);
    if (index === -1) {
      return (
        roots.find(root => root.replies?.some(reply => reply.id === target.id))
          ?.id ?? null
      );
    }
    return roots[index + 1]?.id ?? roots[index - 1]?.id ?? null;
  };

  const confirmDelete = async () => {
    if (deleteTarget == null || onDelete == null) {
      return;
    }
    const target = deleteTarget;
    const neighborId = focusTargetAfterDelete(target);
    setDeleteError(undefined);
    const succeeded = await runCommentAction(
      target.id,
      () => onDelete(target.id),
      t('@astryx.comments.deleteFailed'),
      // Retrying a delete asks for confirmation again.
      () => setDeleteTarget(target),
      // The dialog announces a failed delete (AST-086 FR1, FR6), so the stored
      // failure the row shows is marked before it first renders.
      true,
    );
    if (succeeded) {
      commitAndFocus(
        () => setDeleteTarget(null),
        neighborId,
        neighborId == null ? 'thread' : 'article',
        rootRef,
      );
    } else {
      // Announced from the failure itself, once, as the dialog's text changes.
      const message = t('@astryx.comments.deleteFailedRetry');
      setDeleteError(message);
      announce(message, 'assertive');
    }
  };

  const openHistory = async (comment: AnyComment) => {
    setHistory({
      comment,
      versions: comment.previousVersions ?? [],
      isLoading: loadVersions != null,
    });
    if (loadVersions == null) {
      return;
    }
    try {
      const versions = await loadVersions(comment.id);
      setHistory(current =>
        current?.comment.id === comment.id
          ? {...current, versions, isLoading: false}
          : current,
      );
    } catch {
      setHistory(current =>
        current?.comment.id === comment.id
          ? {
              ...current,
              isLoading: false,
              error: t('@astryx.comments.historyLoadFailed'),
            }
          : current,
      );
    }
  };

  const selectThread = (threadId: string | null) => {
    setSelectedThreadId(threadId);
    if (replyTarget != null && replyTarget.parentId !== threadId) {
      clearReplyDraft();
    }
  };

  const value: CommentsContextValue = {
    currentUser,
    mode,
    container,
    composerPlaceholder,
    reactionOptions,
    highlightColor,
    agentCommands,
    composerTriggers,
    markdownPlugins,
    markdownInlinePlugins,
    hasEmojiPicker,
    onUploadImages,
    renderAnchor,
    renderBody,
    renderAdditionalActions,
    renderComposer,
    can: {
      submit: onSubmit != null,
      saveEdit: onSaveEdit != null,
      delete: onDelete != null,
      react: onReact != null,
      retry: onRetryComment != null,
      loadVersions: loadVersions != null,
      resolve: onResolveThread != null,
      reopen: onReopenThread != null,
    },
    selectedThreadId,
    replyTarget,
    replyDraft,
    replyError,
    editTarget,
    pendingActionIds,
    actionErrors,
    isSubmitting: isSubmitting || localSubmitPending,
    isComposerActionPending: pendingComposerActionCount > 0,
    selectThread,
    startReply: (parentId, target, options) => {
      setSelectedThreadId(parentId);
      if (editTarget != null) {
        clearEditDraft();
      }
      const isNewTarget =
        replyTarget?.parentId !== parentId ||
        replyTarget.comment.id !== target.id;
      const seededMention =
        parentId === target.id || target.author.kind === 'agent'
          ? ''
          : (getReplyMention?.(target.author) ?? '');
      const nextTarget: ReplyTarget = {
        parentId,
        comment: target,
        focusRequestId:
          options?.focus === true ? ++replyFocusRequestRef.current : undefined,
        seed: isNewTarget ? seededMention : replyTarget?.seed,
      };
      if (isNewTarget) {
        if (replyTarget != null) {
          clearReplyDraft();
        }
        setReplyDraft(seededMention);
        if (seededMention !== '') {
          reportDraftChange(seededMention, replyComposerContext(nextTarget));
        }
      }
      setReplyError(undefined);
      setReplyTarget(nextTarget);
    },
    changeReplyDraft: value => {
      setReplyDraft(value);
      setReplyError(undefined);
      if (replyTarget != null) {
        reportDraftChange(value, replyComposerContext(replyTarget));
      }
    },
    submitReply: (parentId, value) => void submit(value, parentId),
    cancelReply: restoreFocus => {
      const parentId = replyTarget?.parentId;
      if (restoreFocus === true && parentId != null) {
        commitAndFocus(clearReplyDraft, parentId, 'reply', rootRef);
      } else {
        clearReplyDraft();
      }
    },
    startEdit: comment => {
      if (replyTarget != null) {
        clearReplyDraft();
      }
      if (editTarget != null && editTarget.comment.id !== comment.id) {
        clearEditDraft();
      }
      clearActionError(comment.id);
      setEditTarget({comment, value: comment.body});
      if (editTarget?.comment.id !== comment.id) {
        reportDraftChange(comment.body, editComposerContext(comment));
      }
    },
    changeEdit: (comment, value) => {
      setEditTarget({comment, value});
      clearActionError(comment.id);
      reportDraftChange(value, editComposerContext(comment));
    },
    saveEdit: (comment, value) => void saveEdit(comment, value),
    cancelEdit: restoreFocus => {
      const editedId = editTarget?.comment.id;
      if (restoreFocus === true && editedId != null) {
        commitAndFocus(clearEditDraft, editedId, 'actions', rootRef);
      } else {
        clearEditDraft();
      }
    },
    react: (comment, key, option) => {
      if (onReact == null) {
        return;
      }
      void runCommentAction(
        comment.id,
        () => onReact(comment.id, key, option),
        t('@astryx.comments.reactionFailed'),
      );
    },
    resolve: comment => {
      if (onResolveThread == null) {
        return;
      }
      void runCommentAction(
        comment.id,
        () => onResolveThread(comment.id),
        t('@astryx.comments.resolveFailed'),
      );
    },
    reopen: comment => {
      if (onReopenThread == null) {
        return;
      }
      void runCommentAction(
        comment.id,
        () => onReopenThread(comment.id),
        t('@astryx.comments.reopenFailed'),
      );
    },
    retry: comment => {
      if (onRetryComment == null) {
        return;
      }
      void runCommentAction(
        comment.id,
        () => onRetryComment(comment.id),
        t('@astryx.comments.retryFailed'),
      );
    },
    requestDelete: setDeleteTarget,
    openHistory: comment => void openHistory(comment),
    composerActionPendingChange,
  };

  const dialogs: ReactNode = (
    <>
      {deleteTarget != null && (
        <AlertDialog
          isOpen
          onOpenChange={open => {
            if (!open && !pendingActionIds.has(deleteTarget.id)) {
              const commentId = deleteTarget.id;
              // The dialog unmounts rather than closing, so commit that state
              // and restore focus from this originating handler (runtime INV2).
              commitAndFocus(
                () => {
                  setDeleteTarget(null);
                  setDeleteError(undefined);
                },
                commentId,
                'actions',
                rootRef,
              );
            }
          }}
          title={t('@astryx.comments.deleteTitle')}
          description={
            deleteError ??
            t('@astryx.comments.deleteDescription', {
              name: deleteTarget.author.name,
            })
          }
          actionLabel={t('@astryx.comments.delete')}
          isActionLoading={pendingActionIds.has(deleteTarget.id)}
          onAction={() => void confirmDelete()}
        />
      )}
      <HistoryDialog
        history={history}
        onClose={() => {
          const commentId = history?.comment.id;
          if (commentId != null) {
            commitAndFocus(
              () => setHistory(null),
              commentId,
              'history',
              rootRef,
            );
          } else {
            setHistory(null);
          }
        }}
        renderVersionBody={
          renderVersionBody ??
          (version => (
            <CommentMarkdown
              body={version.body}
              agentCommands={agentCommands}
              plugins={markdownPlugins}
              inlinePlugins={markdownInlinePlugins}
            />
          ))
        }
      />
    </>
  );

  return {value, dialogs, submit, announce};
}
