// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentComposer.tsx
 * @input Uses React, StyleX, ChatComposer, ChatComposerInput, ChatSendButton,
 *   Popover, IconButton, Card, EmojiPicker, Typeahead's static source
 * @output Exports CommentComposer and CommentComposerProps, and the internal
 *   CommentComposerBase the Comments family's threads use
 * @position A comment's two-row composer: the input (growing to five lines,
 *   with typeahead triggers and pasted or dropped images) above small attach
 *   and emoji buttons and Post. Used standalone, by Comments for new
 *   comments, and by CommentThread for replies and edits.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Comments/index.ts (exports)
 * - /packages/lab/src/Comments/CommentComposer.doc.mjs
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Card} from '@astryxdesign/core/Card';
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
  type ChatComposerTriggerItem,
} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {radiusVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';
import {EmojiPicker} from '../EmojiPicker';
import {agentToken} from './CommentMarkdown';
import {
  ErrorBanner,
  MetadataActionLink,
  MetadataSeparator,
  QuotedPassage,
  type ErrorBannerContent,
} from './CommentParts';
import {CommentIcon} from './icons';
import {appendDraftBlock, appendDraftInline, imagesToMarkdown} from './utils';
import type {
  CommentAgentCommand,
  CommentAnchor,
  CommentComposerContext,
  CommentComposerRenderProps,
  CommentHighlightColor,
  CommentUploadedImage,
} from './types';

const styles = stylex.create({
  // Concentric with the composer: its container radius less its compact
  // padding is the inner radius.
  quoteCard: {
    borderRadius: radiusVars['--radius-inner'],
  },
});

// ChatComposer's themeable radius variable, set on its frame so the body and
// its concentric inner radius both follow: comment composers use the
// container radius instead of the rounder chat radius.
const COMPOSER_RADIUS_STYLE: CSSProperties & Record<`--${string}`, string> = {
  '--_chat-composer-radius': radiusVars['--radius-container'],
};

/* The picker's width is the Popover's, which the Popover clamps to the room
   beside its trigger; the picker fills whatever it gets. */
const PICKER_WIDTH = `calc(${spacingVars['--spacing-8']} * 11)`;

/* Clicks on these keep their own meaning inside the composer; a click anywhere
   else in it focuses the input. */
const COMPOSER_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'label',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="textbox"]',
].join(', ');
/* A layer the composer opens (the picker, a tooltip) renders inside it but is
   not part of its typing surface. */
const COMPOSER_LAYER_SELECTOR = '[popover], [role="dialog"]';

const NO_TRIGGERS: readonly ChatComposerTrigger[] = [];
const NO_AGENT_COMMANDS: readonly CommentAgentCommand[] = [];

type AgentCommandItem = ChatComposerTriggerItem & {
  auxiliaryData: CommentAgentCommand;
};

function renderAgentCommandItem(item: ChatComposerTriggerItem): ReactNode {
  const agent = (item as AgentCommandItem).auxiliaryData;
  return (
    <HStack gap={2} align="center">
      <Avatar
        name={agent.name}
        src={agent.logoUrl}
        size="sm"
        shape="rounded"
        tooltip={false}
      />
      <VStack gap={0.5}>
        <Text weight="semibold">{`/${agent.command} <prompt>`}</Text>
        <Text type="supporting" color="secondary">
          {`${agent.name} · ${agent.description}`}
        </Text>
      </VStack>
    </HStack>
  );
}

/** The `/` menu of the agents a comment can address, or null for none. */
function useAgentCommandTrigger(
  agents: readonly CommentAgentCommand[],
): ChatComposerTrigger | null {
  const t = useTranslator();
  const noAgentsText = t('@astryx.commentComposer.noAgents');
  const agentsLabel = t('@astryx.commentComposer.agents');
  return useMemo(() => {
    if (agents.length === 0) {
      return null;
    }
    const items: AgentCommandItem[] = agents.map(agent => ({
      id: agent.command,
      label: `/${agent.command}`,
      auxiliaryData: agent,
    }));
    return {
      character: '/',
      searchSource: createStaticSource(items, {
        keywords: item => [item.auxiliaryData.command, item.auxiliaryData.name],
      }),
      renderItem: renderAgentCommandItem,
      onSelect: item => agentToken((item as AgentCommandItem).auxiliaryData),
      emptySearchResultsText: noAgentsText,
      menuLabel: agentsLabel,
    };
  }, [agents, agentsLabel, noAgentsText]);
}

/** Props the family's threads pass to their composers. */
export interface CommentComposerBaseProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  label?: string;
  isSubmitting: boolean;
  error?: string;
  /** Adds a Retry action to `error`'s Banner. */
  onRetryError?: () => void;
  onCancel?: () => void;
  contextLabel?: string;
  context: CommentComposerContext;
  anchor?: CommentAnchor;
  onAnchorDismiss?: () => void;
  highlightColor: CommentHighlightColor;
  onUploadImages?: (
    files: readonly File[],
  ) =>
    readonly CommentUploadedImage[] | Promise<readonly CommentUploadedImage[]>;
  triggers: readonly ChatComposerTrigger[];
  agentCommands: readonly CommentAgentCommand[];
  hasEmojiPicker: boolean;
  controls?: ReactNode;
  /** Focuses the input whenever it changes, e.g. when Reply opens it. */
  focusKey?: string;
  /** Reports an upload in flight, so a thread can hold its other actions. */
  onActionPendingChange?: (isPending: boolean) => void;
  renderComposer?: (props: CommentComposerRenderProps) => ReactNode;
  rootRef?: Ref<HTMLElement>;
  rootProps?: Omit<BaseProps<HTMLElement>, 'onChange' | 'onSubmit'>;
}

/** The composer every Comments surface shares. */
export function CommentComposerBase({
  anchor,
  agentCommands,
  context,
  contextLabel,
  controls,
  error,
  focusKey,
  hasEmojiPicker,
  highlightColor,
  isSubmitting,
  label,
  onActionPendingChange,
  onAnchorDismiss,
  onCancel,
  onChange,
  onRetryError,
  onSubmit,
  onUploadImages,
  placeholder,
  renderComposer,
  rootProps,
  rootRef,
  triggers: hostTriggers,
  value,
}: CommentComposerBaseProps) {
  const t = useTranslator();
  const agentCommandTrigger = useAgentCommandTrigger(agentCommands);
  const triggers = useMemo(
    () =>
      agentCommandTrigger == null
        ? [...hostTriggers]
        : [...hostTriggers, agentCommandTrigger],
    [agentCommandTrigger, hostTriggers],
  );
  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  const isMountedRef = useRef(true);
  const actionPendingRef = useRef(false);
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<ChatComposerInputHandle | null>(null);
  // Focus lands once per `focusKey`, when the input attaches: the handle ref
  // re-attaches on commits, and the last key focused guards against a repeat.
  const focusedKeyRef = useRef<string | undefined>(undefined);
  const attachInput = useCallback(
    (handle: ChatComposerInputHandle | null) => {
      inputRef.current = handle;
      if (focusKey == null) {
        focusedKeyRef.current = undefined;
      } else if (handle != null && focusedKeyRef.current !== focusKey) {
        focusedKeyRef.current = focusKey;
        handle.focus();
      }
    },
    [focusKey],
  );
  const [actionError, setActionError] = useState<ErrorBannerContent>();
  // Counts action failures so each one mounts its own Banner: a second failure
  // with the same words is a new occasion and is announced again (AST-086 FR6).
  const [actionErrorSerial, setActionErrorSerial] = useState(0);
  const reportActionError = (content: ErrorBannerContent) => {
    setActionError(content);
    setActionErrorSerial(serial => serial + 1);
  };
  const [isActionPending, setIsActionPending] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const updateActionPending = useCallback(
    (nextPending: boolean) => {
      if (actionPendingRef.current === nextPending) {
        return;
      }
      actionPendingRef.current = nextPending;
      setIsActionPending(nextPending);
      onActionPendingChange?.(nextPending);
    },
    [onActionPendingChange],
  );
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (actionPendingRef.current) {
        actionPendingRef.current = false;
        onActionPendingChange?.(false);
      }
    };
  }, [onActionPendingChange]);

  const uploadImages = async (files: readonly File[]) => {
    if (onUploadImages == null || files.length === 0) {
      return;
    }
    setActionError(undefined);
    try {
      const uploaded = await onUploadImages(files);
      if (!isMountedRef.current) {
        return;
      }
      const markdown = imagesToMarkdown(
        uploaded,
        t('@astryx.commentComposer.imageAlt'),
      );
      if (markdown !== '') {
        onChange(appendDraftBlock(latestValueRef.current, markdown));
      }
    } catch {
      if (isMountedRef.current) {
        reportActionError({
          title: t('@astryx.commentComposer.uploadFailed'),
          actionLabel: t('@astryx.comments.retry'),
          onAction: () => beginImageUpload(files),
        });
      }
    } finally {
      if (isMountedRef.current) {
        updateActionPending(false);
      }
    }
  };

  const beginImageUpload = (files: readonly File[]) => {
    if (onUploadImages == null || files.length === 0) {
      return;
    }
    const images = files.filter(file => file.type.startsWith('image/'));
    if (images.length !== files.length) {
      reportActionError({
        title: t('@astryx.commentComposer.imagesOnly'),
        actionLabel: t('@astryx.commentComposer.chooseImages'),
        onAction: () => {
          // The picker input is never natively disabled, so its click() would
          // open the file chooser while busy and the busy guard would drop
          // the pick.
          if (isSubmittingRef.current || actionPendingRef.current) {
            return;
          }
          imageInputRef.current?.click();
        },
      });
      return;
    }
    updateActionPending(true);
    void uploadImages(images);
  };

  // Busy states never disable the input: a disabled contenteditable drops
  // focus to <body> mid-submit. Duplicate submits are refused here instead.
  const isBusy = isSubmitting || isActionPending;
  const submitInput = (nextValue: string) => {
    if (isBusy || nextValue.trim() === '') {
      return;
    }
    onSubmit(nextValue);
  };

  const errorBanner: ErrorBannerContent | undefined =
    error != null
      ? {
          title: error,
          actionLabel:
            onRetryError != null ? t('@astryx.comments.retry') : undefined,
          onAction: onRetryError,
        }
      : actionError;

  const composer =
    renderComposer != null ? (
      renderComposer({
        value,
        onChange,
        onSubmit,
        placeholder,
        isSubmitting,
        error,
        contextLabel,
        context,
        onCancel,
      })
    ) : (
      <VStack gap={1} width="100%" aria-busy={isBusy || undefined}>
        {errorBanner != null && (
          <ErrorBanner
            key={error != null ? 'error' : `action-${actionErrorSerial}`}
            content={errorBanner}
            // The Banner unmounts once the retry starts; keep focus in the input.
            onBeforeAction={() => inputRef.current?.focus()}
            data-composer-error="banner"
          />
        )}
        <ChatComposer
          value={value}
          onChange={onChange}
          onSubmit={submitInput}
          placeholder={placeholder}
          density="compact"
          elevation="none"
          style={COMPOSER_RADIUS_STYLE}
          input={
            <VStack gap={1} width="100%">
              {/* The quoted passage leads the new comment, in a muted card. */}
              {anchor != null && (
                <Card
                  variant="muted"
                  elevation="none"
                  padding={2}
                  width="100%"
                  xstyle={styles.quoteCard}
                  data-composer-anchor="quote">
                  <HStack gap={1} align="start" width="100%">
                    <StackItem size="fill">
                      <QuotedPassage
                        quote={anchor.quote}
                        highlightColor={highlightColor}
                      />
                    </StackItem>
                    {onAnchorDismiss != null && (
                      <IconButton
                        label={t('@astryx.commentComposer.removeQuote')}
                        tooltip={t('@astryx.commentComposer.removeQuote')}
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon="close" />}
                        onClick={onAnchorDismiss}
                      />
                    )}
                  </HStack>
                </Card>
              )}
              <ChatComposerInput
                handleRef={attachInput}
                value={value}
                onChange={onChange}
                onSubmit={submitInput}
                placeholder={placeholder}
                triggers={triggers}
                hasHistory={false}
                pasteAsToken={false}
                maxRows={5}
                onFiles={onUploadImages != null ? beginImageUpload : undefined}
                label={label ?? placeholder}
              />
            </VStack>
          }
          footerActions={
            <HStack gap={0.5} align="center">
              {onUploadImages != null && (
                <>
                  {/* FileInput has no icon-only trigger. */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={event => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = '';
                      if (isBusy) {
                        return;
                      }
                      beginImageUpload(files);
                    }}
                  />
                  <IconButton
                    label={t('@astryx.commentComposer.attachImages')}
                    tooltip={t('@astryx.commentComposer.attachImages')}
                    variant="ghost"
                    size="sm"
                    icon={<CommentIcon name="attach" color="inherit" />}
                    isDisabled={isBusy}
                    onClick={() => imageInputRef.current?.click()}
                  />
                </>
              )}
              {hasEmojiPicker && (
                <Popover
                  isOpen={isPickerOpen}
                  onOpenChange={setIsPickerOpen}
                  placement="above"
                  alignment="start"
                  label={t('@astryx.commentComposer.addEmoji')}
                  // The Popover's own autofocus lands on the picker's search
                  // field, its first control, once the Popover shows.
                  width={PICKER_WIDTH}
                  // The picker's headings run edge to edge.
                  padding={0}
                  content={
                    isPickerOpen ? (
                      <EmojiPicker
                        onSelect={emoji => {
                          onChange(
                            appendDraftInline(latestValueRef.current, emoji),
                          );
                          setIsPickerOpen(false);
                          inputRef.current?.focus();
                        }}
                      />
                    ) : null
                  }>
                  {triggerProps => (
                    <IconButton
                      ref={element => triggerProps.ref(element)}
                      label={t('@astryx.commentComposer.addEmoji')}
                      tooltip={t('@astryx.commentComposer.addEmoji')}
                      variant="ghost"
                      size="sm"
                      icon={<CommentIcon name="emoji" color="inherit" />}
                      isDisabled={isBusy}
                      aria-haspopup={triggerProps['aria-haspopup']}
                      aria-expanded={triggerProps['aria-expanded']}
                      aria-controls={triggerProps['aria-controls']}
                      onClick={event => {
                        if (!isBusy) {
                          triggerProps.onClick(event);
                        }
                      }}
                    />
                  )}
                </Popover>
              )}
              {controls}
            </HStack>
          }
          sendButton={
            <ChatSendButton
              size="sm"
              // While a post is in flight Post stays focusable and refuses a
              // second press (submitInput guards it); the composer reports
              // busy. It disables only for an empty draft.
              isDisabled={value.trim() === ''}
              onSend={() => {
                // Post disables once the draft clears; keep focus in the input.
                inputRef.current?.focus();
                submitInput(latestValueRef.current);
              }}
            />
          }
        />
      </VStack>
    );

  const {xstyle, className, style, ...restRootProps} = rootProps ?? {};
  return (
    <VStack
      ref={rootRef}
      gap={2}
      width="100%"
      aria-busy={isBusy || undefined}
      {...restRootProps}
      {...mergeProps(
        themeProps('comment-composer'),
        stylex.props(xstyle),
        className,
        style,
      )}
      onClick={event => {
        // The composer keeps its clicks: in a thread, a press on its empty
        // space would otherwise reach the thread and collapse it.
        event.stopPropagation();
        const target = event.target as Element;
        if (
          target.closest(COMPOSER_CONTROL_SELECTOR) == null &&
          target.closest(COMPOSER_LAYER_SELECTOR) == null
        ) {
          inputRef.current?.focus();
        }
      }}>
      {context.kind === 'edit' && contextLabel != null && (
        <HStack gap={1} align="center" wrap="wrap">
          <Text type="supporting" color="secondary">
            {contextLabel}
          </Text>
          {onCancel != null && (
            <>
              <MetadataSeparator type="supporting" />
              <MetadataActionLink
                label={t('@astryx.commentComposer.cancel')}
                isDisabled={isBusy}
                onClick={onCancel}
              />
            </>
          )}
        </HStack>
      )}
      {composer}
    </VStack>
  );
}

export interface CommentComposerProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange' | 'onSubmit'
> {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLElement>;
  /** The draft, controlled. */
  value: string;
  onChange: (value: string) => void;
  /** Posts the draft: Enter, or the Post button. Empty drafts never post. */
  onSubmit: (value: string) => void;
  /** Placeholder of the input. Defaults to the localized "Write a comment…". */
  placeholder?: string;
  /** Accessible name of the input. Defaults to the placeholder. */
  label?: string;
  /** Holds Post and the attach and emoji buttons while a post is in flight. */
  isSubmitting?: boolean;
  /** Shows an error Banner above the composer. */
  error?: string;
  /** Adds Retry to the error Banner. */
  onRetry?: () => void;
  /** The passage a new inline comment attaches to, quoted above the input. */
  anchor?: CommentAnchor;
  /** Adds Remove quoted text to the quoted passage. */
  onAnchorDismiss?: () => void;
  /** The palette color the host highlights passages in. @default 'yellow' */
  highlightColor?: CommentHighlightColor;
  /**
   * Uploads images attached, pasted, or dropped in the input, and appends the
   * stored images to the draft as Markdown. Adds the attach button.
   */
  onUploadImages?: (
    files: readonly File[],
  ) =>
    readonly CommentUploadedImage[] | Promise<readonly CommentUploadedImage[]>;
  /** Typeahead triggers, such as an `@` people search. */
  triggers?: readonly ChatComposerTrigger[];
  /** Agents the comment can address: typing `/` lists them. */
  agentCommands?: readonly CommentAgentCommand[];
  /** Whether the emoji picker button shows. @default true */
  hasEmojiPicker?: boolean;
  /**
   * Product-owned controls after the attach and emoji buttons, such as a
   * choice the host reads when the comment posts. Keep it to one short
   * control: the footer does not wrap.
   */
  controls?: ReactNode;
}

/**
 * A comment composer: a growing input with typeahead triggers and image
 * paste, above attach and emoji buttons and Post. Controlled: the host owns
 * the draft and clears it once the comment posts.
 *
 * @example
 * ```
 * <CommentComposer value={draft} onChange={setDraft} onSubmit={post} />
 * ```
 */
export function CommentComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  isSubmitting = false,
  error,
  onRetry,
  anchor,
  onAnchorDismiss,
  highlightColor = 'yellow',
  onUploadImages,
  triggers = NO_TRIGGERS,
  agentCommands = NO_AGENT_COMMANDS,
  hasEmojiPicker = true,
  controls,
  ref,
  ...rootProps
}: CommentComposerProps) {
  const t = useTranslator();
  return (
    <CommentComposerBase
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder={placeholder ?? t('@astryx.commentComposer.placeholder')}
      label={label}
      isSubmitting={isSubmitting}
      error={error}
      onRetryError={onRetry}
      context={anchor != null ? {kind: 'comment', anchor} : {kind: 'comment'}}
      anchor={anchor}
      onAnchorDismiss={onAnchorDismiss}
      highlightColor={highlightColor}
      onUploadImages={onUploadImages}
      triggers={triggers}
      agentCommands={agentCommands}
      hasEmojiPicker={hasEmojiPicker}
      controls={controls}
      rootRef={ref}
      rootProps={rootProps}
    />
  );
}

CommentComposer.displayName = 'CommentComposer';
