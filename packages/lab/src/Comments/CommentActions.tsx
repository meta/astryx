// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentActions.tsx
 * @input Uses React, React DOM flushSync, StyleX, IconButton, Button, Tooltip,
 *   ToggleButton, OverflowList, DropdownMenu, Popover, Text
 * @output Exports CommentActions (a comment's header actions), ReactionSummary
 *   (its reaction toggles), and the action-lookup helpers rows use for focus
 *   hand-offs
 * @position Internal parts of a comment row in the Comments family
 */

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  type DropdownMenuOption,
} from '@astryxdesign/core/DropdownMenu';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {OverflowList, type OverflowItem} from '@astryxdesign/core/OverflowList';
import {Popover} from '@astryxdesign/core/Popover';
import {Text} from '@astryxdesign/core/Text';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {reactionDescription} from './i18n';
import {CommentIcon} from './icons';
import {commentAnchorId, type AnyComment} from './utils';
import type {CommentReaction, CommentReactionOption} from './types';

const LINK_COPIED_RESET_MS = 2_000;
const MORE_MENU_MIN_WIDTH = `calc(${spacingVars['--spacing-8']} * 5)`;

const styles = stylex.create({
  actionsList: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  // Every reaction-row control carries one spacing step of inline padding.
  reactionToggle: {
    aspectRatio: 'auto',
    paddingInline: spacingVars['--spacing-2'],
  },
});

export type CommentActionId = 'resolve' | 'reopen' | 'react' | 'reply' | 'link';

/** Mark as resolved on an open thread, Reopen on a resolved one. */
export type ResolveAction = {kind: 'resolve' | 'reopen'; onClick: () => void};

/** One of a comment's action buttons, as it shows. OverflowList renders a
 *  hidden copy of every item to measure it; only the copy in the visible list
 *  can take focus. */
export function visibleCommentAction(
  root: HTMLElement | null,
  action: CommentActionId,
): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>(
      `[data-comment-actions-list] [data-comment-action="${action}"]`,
    ) ?? null
  );
}

export function commentMoreMenuTrigger(
  root: HTMLElement | null,
): HTMLElement | null {
  return (
    root?.querySelector<HTMLElement>('[data-comment-more-menu] button') ?? null
  );
}

/** Who reacted, under the emoji and count. */
function ReactionTooltipContent({reaction}: {reaction: CommentReaction}) {
  const t = useTranslator();
  const locale = useLocale();
  const names = (reaction.actors ?? []).map(actor => actor.name);
  const others = reaction.count - names.length;
  const people =
    names.length === 0
      ? reactionDescription(t, reaction)
      : new Intl.ListFormat(locale, {type: 'conjunction'}).format(
          others > 0
            ? [...names, t('@astryx.comments.otherReactors', {count: others})]
            : names,
        );
  return (
    <VStack gap={0.5} align="start">
      <HStack gap={1} align="center">
        <Text as="span" type="body" color="inherit">
          {reaction.label}
        </Text>
        <Text as="span" type="body" color="inherit">
          {reaction.count}
        </Text>
      </HStack>
      <Text type="supporting" color="inherit">
        {people}
      </Text>
    </VStack>
  );
}

/** A comment's reactions: a toggle for each, pressed where the viewer reacted. */
export function ReactionSummary({
  canReact,
  comment,
  isBusy,
  onReact,
}: {
  canReact: boolean;
  comment: AnyComment;
  isBusy: boolean;
  onReact: (comment: AnyComment, key: string) => void;
}) {
  const t = useTranslator();
  const reactions = comment.reactions ?? [];
  if (reactions.length === 0) {
    return null;
  }
  return (
    <HStack gap={1} align="center" data-comment-reactions="true">
      {reactions.map(reaction => (
        <Tooltip
          key={reaction.key}
          content={<ReactionTooltipContent reaction={reaction} />}>
          {/* A pending reaction stays enabled, so focus never drops to <body>
              mid-request; the press is refused instead. */}
          <ToggleButton
            label={t('@astryx.comments.reactionCount', {
              reaction: reactionDescription(t, reaction),
              count: reaction.count,
            })}
            size="sm"
            isPressed={reaction.reactedByViewer === true}
            isDisabled={!canReact}
            data-comment-reaction={reaction.key}
            xstyle={styles.reactionToggle}
            onPressedChange={() => {
              if (!isBusy) {
                onReact(comment, reaction.key);
              }
            }}>
            <HStack gap={1} align="center">
              <Text as="span" type="body" color="primary" weight="normal">
                {reaction.label}
              </Text>
              <Text as="span" type="body" color="primary" weight="normal">
                {reaction.count}
              </Text>
            </HStack>
          </ToggleButton>
        </Tooltip>
      ))}
    </HStack>
  );
}

function ReactionPicker({
  isBusy,
  options,
  onPick,
}: {
  isBusy: boolean;
  options: readonly CommentReactionOption[];
  onPick: (option: CommentReactionOption) => void;
}) {
  const t = useTranslator();
  return (
    <HStack gap={0.5} align="center" data-reaction-picker="true">
      {options.map(option => (
        <IconButton
          key={option.key}
          label={reactionDescription(t, option)}
          tooltip={reactionDescription(t, option)}
          variant="ghost"
          data-reaction-option={option.key}
          icon={
            <Text as="span" type="large">
              {option.label}
            </Text>
          }
          isDisabled={isBusy}
          onClick={() => onPick(option)}
        />
      ))}
    </HStack>
  );
}

const NO_COLLAPSED_ACTIONS: ReadonlySet<CommentActionId> = new Set();

// OverflowList counts each element in its measuring row as an item, but an
// IconButton with a tooltip renders more than one there, so the row read as
// fitting and never collapsed. One HStack per action keeps the count right.
// Its `data-comment-action` names the item for changeOverflow and stays off
// the DOM, where the button itself carries it.
function CommentActionSlot({
  children,
}: {
  readonly 'data-comment-action': CommentActionId;
  readonly children: ReactNode;
}) {
  return <HStack align="center">{children}</HStack>;
}

/**
 * A comment's actions, in its header's top-end corner: Mark as resolved or
 * Reopen, Add reaction, Reply, and Copy link as icon buttons, then the more
 * menu. When the header runs out of room the buttons collapse into the more
 * menu, Copy link first, beside Edit and Delete where the viewer may use them.
 */
export function CommentActions({
  additionalActions,
  canCopyLink,
  canReact,
  canReply,
  comment,
  isBusy,
  menuItems,
  menuLabel,
  onOpenChange,
  onReact,
  onReply,
  options,
  resolveAction,
}: {
  additionalActions?: ReactNode;
  canCopyLink: boolean;
  canReact: boolean;
  canReply: boolean;
  comment: AnyComment;
  isBusy: boolean;
  /** Edit and Delete, where the viewer may use them. */
  menuItems: readonly DropdownMenuOption[];
  menuLabel: string;
  /** Pins the revealed actions while the picker or the menu is open. */
  onOpenChange: (isOpen: boolean) => void;
  onReact: (
    comment: AnyComment,
    key: string,
    option?: CommentReactionOption,
  ) => void;
  onReply: () => void;
  options: readonly CommentReactionOption[];
  resolveAction?: ResolveAction;
}) {
  const t = useTranslator();
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isLinkTooltipOpen, setIsLinkTooltipOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(NO_COLLAPSED_ACTIONS);
  const clusterRef = useRef<HTMLElement | null>(null);
  const href = `#${commentAnchorId(comment.id)}`;
  const linkLabel = isLinkCopied
    ? t('@astryx.comments.linkCopied')
    : t('@astryx.comments.copyLink');
  const resolveLabel = t('@astryx.comments.resolve');
  const reopenLabel = t('@astryx.comments.reopen');
  const replyLabel = t('@astryx.comments.reply');
  const addReactionLabel = t('@astryx.comments.addReaction');
  // A check mark says the copy worked until the label resets.
  const linkIcon = isLinkCopied ? (
    <Icon icon="check" color="secondary" />
  ) : (
    <CommentIcon name="copyLink" />
  );

  const copyCommentLink = async () => {
    if (navigator.clipboard == null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(
        new URL(href, window.location.href).href,
      );
      setIsLinkCopied(true);
    } catch {
      setIsLinkCopied(false);
    }
  };

  useEffect(() => {
    if (!isLinkCopied) {
      return;
    }
    const timer = window.setTimeout(
      () => setIsLinkCopied(false),
      LINK_COPIED_RESET_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isLinkCopied]);

  const changePicker = (isOpen: boolean) => {
    setIsPickerOpen(isOpen);
    onOpenChange(isOpen);
  };
  const pickReaction = (option: CommentReactionOption) => {
    onReact(comment, option.key, option);
    // Closing the picker remounts Add reaction because its tooltip becomes
    // available again. Commit that handler-owned state before restoring focus
    // to the replacement control (architecture:react-component-runtime/INV2).
    flushSync(() => changePicker(false));
    const root = clusterRef.current;
    (
      visibleCommentAction(root, 'react') ?? commentMoreMenuTrigger(root)
    )?.focus();
  };
  const changeOverflow = useCallback((items: OverflowItem[]) => {
    setCollapsed(
      new Set(
        items.flatMap(item => {
          const action = (
            item.child.props as {'data-comment-action'?: CommentActionId}
          )['data-comment-action'];
          return action == null ? [] : [action];
        }),
      ),
    );
  }, []);

  const collapsedItems: DropdownMenuOption[] = [];
  if (resolveAction != null && collapsed.has(resolveAction.kind)) {
    collapsedItems.push({
      id: resolveAction.kind,
      label: resolveAction.kind === 'resolve' ? resolveLabel : reopenLabel,
      icon:
        resolveAction.kind === 'resolve' ? (
          <CommentIcon name="resolve" />
        ) : undefined,
      isDisabled: isBusy,
      onClick: resolveAction.onClick,
    });
  }
  if (canReply && collapsed.has('reply')) {
    collapsedItems.push({
      id: 'reply',
      label: replyLabel,
      icon: <CommentIcon name="reply" />,
      isDisabled: isBusy,
      onClick: onReply,
    });
  }
  // A comment that already has a more menu keeps Copy link in it; elsewhere
  // Copy link is a header button until the header runs out of room.
  const isLinkInMenu = menuItems.length > 0;
  const copyLinkItem: DropdownMenuOption = {
    id: 'copy-link',
    label: linkLabel,
    icon: linkIcon,
    onClick: () => void copyCommentLink(),
  };
  if (canCopyLink && !isLinkInMenu && collapsed.has('link')) {
    collapsedItems.push(copyLinkItem);
  }
  if (canReact && collapsed.has('react')) {
    collapsedItems.push({
      type: 'section',
      id: 'react',
      title: addReactionLabel,
      items: options.map(option => ({
        id: `react-${option.key}`,
        label: reactionDescription(t, option),
        icon: (
          <Text as="span" type="body">
            {option.label}
          </Text>
        ),
        isDisabled: isBusy,
        onClick: () => onReact(comment, option.key, option),
      })),
    });
  }
  const ownItems: DropdownMenuOption[] = [
    ...(canCopyLink && isLinkInMenu ? [copyLinkItem] : []),
    ...menuItems,
  ];
  const items: DropdownMenuOption[] = [
    ...collapsedItems,
    ...(collapsedItems.length > 0 && ownItems.length > 0
      ? [{type: 'divider' as const}]
      : []),
    ...ownItems,
  ];

  const renderCluster = (anchorRef?: (element: HTMLElement | null) => void) => (
    <HStack
      ref={(element: HTMLElement | null) => {
        clusterRef.current = element;
        anchorRef?.(element);
      }}
      gap={0.5}
      align="center"
      width="100%"
      data-comment-actions="header">
      <OverflowList
        gap={0.5}
        collapseFrom="end"
        onOverflowChange={changeOverflow}
        xstyle={styles.actionsList}
        data-comment-actions-list="true">
        {/* First, so it is the last to collapse. */}
        {resolveAction?.kind === 'resolve' ? (
          <CommentActionSlot key="resolve" data-comment-action="resolve">
            <IconButton
              label={resolveLabel}
              tooltip={resolveLabel}
              variant="ghost"
              size="sm"
              data-comment-action="resolve"
              icon={<CommentIcon name="resolve" />}
              isDisabled={isBusy}
              onClick={resolveAction.onClick}
            />
          </CommentActionSlot>
        ) : resolveAction?.kind === 'reopen' ? (
          <CommentActionSlot key="reopen" data-comment-action="reopen">
            <Button
              label={reopenLabel}
              variant="ghost"
              size="sm"
              data-comment-action="reopen"
              isDisabled={isBusy}
              onClick={resolveAction.onClick}
            />
          </CommentActionSlot>
        ) : null}
        {canReact ? (
          <CommentActionSlot key="react" data-comment-action="react">
            <IconButton
              label={addReactionLabel}
              // The Popover returns focus to this button while it hides, and
              // a tooltip shown then collides with it, so the tooltip rests
              // while the picker is open.
              tooltip={isPickerOpen ? undefined : addReactionLabel}
              variant="ghost"
              size="sm"
              data-comment-action="react"
              aria-haspopup="dialog"
              aria-expanded={isPickerOpen}
              icon={<CommentIcon name="addReaction" />}
              isDisabled={isBusy}
              onClick={() => changePicker(!isPickerOpen)}
            />
          </CommentActionSlot>
        ) : null}
        {canReply ? (
          <CommentActionSlot key="reply" data-comment-action="reply">
            <IconButton
              label={replyLabel}
              tooltip={replyLabel}
              variant="ghost"
              size="sm"
              data-comment-action="reply"
              icon={<CommentIcon name="reply" />}
              isDisabled={isBusy}
              onClick={onReply}
            />
          </CommentActionSlot>
        ) : null}
        {canCopyLink && !isLinkInMenu ? (
          <CommentActionSlot key="link" data-comment-action="link">
            <Tooltip
              content={linkLabel}
              // A press hides a hover tooltip; this one stays open while the
              // link reads as copied, so the press visibly worked.
              isOpen={isLinkCopied || isLinkTooltipOpen}
              onOpenChange={setIsLinkTooltipOpen}>
              <IconButton
                label={linkLabel}
                variant="ghost"
                size="sm"
                data-comment-action="link"
                data-link-copied={isLinkCopied ? 'true' : undefined}
                icon={linkIcon}
                onClick={() => void copyCommentLink()}
              />
            </Tooltip>
          </CommentActionSlot>
        ) : null}
      </OverflowList>
      {additionalActions}
      {items.length > 0 && (
        <HStack data-comment-more-menu="true">
          <DropdownMenu
            items={items}
            menuWidth={MORE_MENU_MIN_WIDTH}
            alignment="end"
            presentation="adaptive"
            hasChevron={false}
            button={{
              label: menuLabel,
              variant: 'ghost',
              size: 'sm',
              isIconOnly: true,
              icon: <Icon icon="moreHorizontal" color="secondary" />,
              isDisabled: isBusy,
              tooltip: menuLabel,
            }}
            onOpenChange={onOpenChange}
          />
        </HStack>
      )}
    </HStack>
  );
  if (!canReact) {
    return renderCluster();
  }
  return (
    <Popover
      isOpen={isPickerOpen}
      onOpenChange={changePicker}
      placement="above"
      alignment="end"
      label={t('@astryx.comments.chooseReaction')}
      // Hugs its emoji: without a width the Popover is as wide as its trigger,
      // which here is the header's whole action cluster.
      width="fit-content"
      // Only while open: a closed picker leaves no buttons in the page.
      content={
        isPickerOpen ? (
          <ReactionPicker
            isBusy={isBusy}
            options={options}
            onPick={pickReaction}
          />
        ) : null
      }>
      {triggerProps => renderCluster(triggerProps.ref)}
    </Popover>
  );
}
