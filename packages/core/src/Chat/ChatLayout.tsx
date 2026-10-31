// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatLayout.tsx
 * @input Uses React, StyleX, theme tokens, useChatStreamScroll, useChatNewMessages
 * @output Exports ChatLayout component and ChatLayoutProps
 * @position Layout shell for full chat interfaces — messages in page flow, composer fixed to bottom
 *
 * Structural layout only — scroll behavior is delegated to hooks.
 * Provides the scroll container ref and content ref, renders the
 * scroll-to-bottom button, frosted glass dock, and message area.
 *
 * Layout contract: the root is a flex column. The message area flexes
 * (grow 1, shrink 0) to fill the space the dock doesn't need; the sticky
 * dock keeps its natural height in flow. Short content therefore fills
 * exactly 100% with no overflow, and long content grows past the root so
 * self-scroll mode scrolls (#2573). In external-scrollRef mode the dock
 * is position: fixed (out of flow) and the message area fills the root.
 *
 * Density (compact/balanced/spacious) is controlled via a prop with
 * 'balanced' as the default. No JS measurement or ResizeObserver needed.
 * The container-type on root enables container queries in child components.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Chat/index.ts (exports)
 * - /apps/storybook/stories/ChatLayout.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ChatLayout/ (block examples)
 */

import {type ReactNode, useMemo, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {useChatStreamScroll} from './useChatStreamScroll';
import {useChatNewMessages} from './useChatNewMessages';
import {ChatLayoutScrollButton} from './ChatLayoutScrollButton';
import {ChatLayoutContext} from './ChatContext';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
// =============================================================================
// Types
// =============================================================================

type Density = 'compact' | 'balanced' | 'spacious';

export interface ChatLayoutProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Message content — flows naturally in the page, scrolls with the page.
   * Typically ChatMessageList with ChatMessage children.
   */
  children: ReactNode;

  /**
   * Composer element — fixed to the bottom with a frosted glass dock.
   * Typically ChatComposer.
   */
  composer: ReactNode;

  /**
   * Content shown when children is empty.
   */
  emptyState?: ReactNode;

  /**
   * Scroll-to-bottom button rendered above the composer in the dock.
   * Defaults to ChatLayoutScrollButton with useChatStreamScroll.
   * Pass a custom ReactNode to override, or `null` to hide.
   */
  scrollButton?: ReactNode | null;

  /**
   * External scroll container ref. When provided, auto-scroll and
   * scroll-to-bottom target this element instead of the layout root.
   *
   * @example
   * ```
   * const scrollRef = useRef(document.documentElement);
   * <ChatLayout scrollRef={scrollRef} composer={...}>...</ChatLayout>
   * ```
   *
   * When omitted, the layout root itself is the scroll container.
   */
  scrollRef?: React.RefObject<HTMLElement | null>;

  /**
   * Layout density. Controls spacing, max-width, and blur layer sizing.
   *
   * @default 'balanced'
   */
  density?: Density;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    position: 'relative',
    containerType: 'inline-size',
    minHeight: 0,
    flex: 1,
    // Flex column so the sticky dock's natural height is part of the 100%:
    // messageArea flexes to fill the leftover space instead of forcing
    // minHeight: 100% on its own. Without this, the in-flow sticky dock
    // adds its full height on top of the 100% message area and the root
    // always overflows by exactly the dock height (#2573).
    display: 'flex',
    flexDirection: 'column',
  },
  rootScrollable: {
    overflowY: 'auto',
    overflowX: 'hidden',
    // Hide scrollbar during programmatic scroll animation
    // to prevent flash. Restored when animation settles.
    scrollbarWidth: {
      default: null,
      ':is([data-astryx-scrolling])': 'none',
    },
  },

  messageArea: {
    display: 'flex',
    flexDirection: 'column',
    marginInline: 'auto',
    // Fill the space the dock doesn't need (grow), but never shrink below
    // content height — long content must overflow the root so it scrolls.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingBlockEnd: spacingVars['--spacing-6'],
    width: '100%',
    maxWidth: '100%',
    paddingInline: 0,
    // Publish the width Markdown prose should span: the message area already
    // caps itself (800px in spacious), and prose reading this var spans the
    // same box as the full-width code blocks and tables below it, so one
    // bubble has one right edge. Markdown's own default stays 680px where
    // nothing publishes.
    '--markdown-content-width': '100%',
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 200,
  },

  // --- Dock container ---
  dockContainer: {
    bottom: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    zIndex: 0,
    isolation: 'isolate',
    pointerEvents: 'none',
    // Keep the sticky dock at its natural height as a flex item.
    // (Inert in fixed mode — position: fixed takes it out of flex layout.)
    flexShrink: 0,
  },
  dockContainerFixed: {
    position: 'fixed',
  },
  dockContainerSticky: {
    position: 'sticky',
  },

  blurLayer: {
    position: 'absolute',
    bottom: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    pointerEvents: 'none',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    height: 100,
    maskImage: 'linear-gradient(to bottom, transparent, black 36px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 36px)',
  },

  dock: {
    position: 'relative',
    zIndex: 1,
    pointerEvents: 'auto',
    paddingInline: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },

  dockInner: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '100%',
  },

  // --- Forced density overrides (disable container queries) ---
  messageAreaCompact: {
    maxWidth: '100%',
    paddingInline: 0,
  },
  messageAreaBalanced: {
    maxWidth: '100%',
    paddingInline: 0,
  },
  messageAreaSpacious: {
    maxWidth: 800,
    paddingInline: spacingVars['--spacing-4'],
  },

  blurLayerCompact: {
    height: 80,
    maskImage: 'linear-gradient(to bottom, transparent, black 24px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 24px)',
  },
  blurLayerBalanced: {
    height: 100,
    maskImage: 'linear-gradient(to bottom, transparent, black 36px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 36px)',
  },
  blurLayerSpacious: {
    height: 120,
    maskImage: 'linear-gradient(to bottom, transparent, black 48px)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 48px)',
  },

  dockCompact: {
    paddingInline: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  dockBalanced: {
    paddingInline: spacingVars['--spacing-3'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  dockSpacious: {
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },

  dockInnerCompact: {
    maxWidth: '100%',
  },
  dockInnerBalanced: {
    maxWidth: '100%',
  },
  dockInnerSpacious: {
    maxWidth: 800,
  },
});

// =============================================================================
// Helpers
// =============================================================================

function hasVisibleContent(children: ReactNode): boolean {
  if (children == null || children === false) {
    return false;
  }
  if (Array.isArray(children) && children.length === 0) {
    return false;
  }
  return true;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Layout shell for a full chat interface: messages in page flow, composer
 * docked to the bottom behind a frosted glass layer, with auto-scroll and a
 * scroll-to-bottom button wired in.
 *
 * @example
 * ```
 * <ChatLayout
 *   density="spacious"
 *   composer={<ChatComposer onSubmit={send} />}
 *   emptyState={<EmptyState title="No messages yet" />}>
 *   <ChatMessageList>
 *     <ChatMessage sender="assistant">
 *       <ChatMessageBubble>How can I help?</ChatMessageBubble>
 *     </ChatMessage>
 *   </ChatMessageList>
 * </ChatLayout>
 * ```
 */
export function ChatLayout({
  children,
  composer,
  density = 'balanced',
  emptyState,
  scrollButton,
  scrollRef: externalScrollRef,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  ...rest
}: ChatLayoutProps) {
  const t = useTranslator();
  const rootRef = useRef<HTMLDivElement>(null);

  const scrollContainerRef = externalScrollRef ?? rootRef;
  const isSelfScrolling = !externalScrollRef;

  // --- Default scroll behavior ---
  const scroll = useChatStreamScroll({scrollRef: scrollContainerRef});
  const newMsgs = useChatNewMessages({
    isLocked: scroll.isLocked,
    onResize: scroll.scrollIfLocked,
  });

  const defaultScrollButton = (
    <ChatLayoutScrollButton
      isVisible={scroll.isScrolledUp || newMsgs.hasNewMessages}
      label={
        newMsgs.hasNewMessages ? t('@astryx.chatLayout.newMessages') : undefined
      }
      onClick={() => {
        newMsgs.dismiss();
        scroll.scrollToBottom();
      }}
    />
  );

  // --- Layout context ---
  const layoutContext = useMemo(
    () => ({scrollContainerRef, contentRef: newMsgs.contentRef}),
    [scrollContainerRef, newMsgs.contentRef],
  );

  // --- Derived styles ---
  const showEmpty = !hasVisibleContent(children);

  const densityStyles = {
    compact: {
      messageArea: styles.messageAreaCompact,
      blurLayer: styles.blurLayerCompact,
      dock: styles.dockCompact,
      dockInner: styles.dockInnerCompact,
    },
    balanced: {
      messageArea: styles.messageAreaBalanced,
      blurLayer: styles.blurLayerBalanced,
      dock: styles.dockBalanced,
      dockInner: styles.dockInnerBalanced,
    },
    spacious: {
      messageArea: styles.messageAreaSpacious,
      blurLayer: styles.blurLayerSpacious,
      dock: styles.dockSpacious,
      dockInner: styles.dockInnerSpacious,
    },
  } as const;

  const currentDensity = densityStyles[density];

  return (
    <ChatLayoutContext value={layoutContext}>
      <div
        {...rest}
        ref={useMergedRefs(ref, rootRef)}
        data-testid={testId}
        {...mergeProps(
          themeProps('chat-layout', {density}),
          stylex.props(
            styles.root,
            isSelfScrolling && styles.rootScrollable,
            xstyle,
          ),
          className,
          style,
        )}>
        {/* Message area */}
        <div {...stylex.props(styles.messageArea, currentDensity.messageArea)}>
          {showEmpty && emptyState ? (
            <div {...stylex.props(styles.emptyState)}>{emptyState}</div>
          ) : (
            children
          )}
        </div>

        {/* Dock container — sticky/fixed, holds blur + scroll button + composer */}
        <div
          {...stylex.props(
            styles.dockContainer,
            isSelfScrolling
              ? styles.dockContainerSticky
              : styles.dockContainerFixed,
          )}>
          {/* Scroll-to-bottom button */}
          {scrollButton === undefined ? defaultScrollButton : scrollButton}

          {/* Frosted glass layer */}
          <div {...stylex.props(styles.blurLayer, currentDensity.blurLayer)} />

          {/* Composer */}
          <div {...stylex.props(styles.dock, currentDensity.dock)}>
            <div {...stylex.props(styles.dockInner, currentDensity.dockInner)}>
              {composer}
            </div>
          </div>
        </div>
      </div>
    </ChatLayoutContext>
  );
}

ChatLayout.displayName = 'ChatLayout';
