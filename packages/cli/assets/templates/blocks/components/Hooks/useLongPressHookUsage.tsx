// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useLongPress} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

type TriggerSource = 'long press' | 'right-click' | 'button';

interface MenuPosition {
  x: number;
  y: number;
  // The surface's height when the panel opened, so CSS can keep the panel in it.
  surfaceHeight: number;
  source: TriggerSource;
  // Set when the panel opens below the Actions button: its distance from the
  // surface's inline-start edge. Such a panel never moves up over the button.
  inlineStart: number | null;
}

const MENU_GAP = 8;
const MENU_WIDTH = 180;
// Room for the panel's note and its three actions in every theme (the tallest
// theme's panel is about 202px), so the panel stays inside the surface.
const SURFACE_MIN_HEIGHT = 216;

const styles = stylex.create({
  surface: {
    position: 'relative',
    width: '100%',
    maxWidth: 360,
    minHeight: SURFACE_MIN_HEIGHT,
    // Safari, the browser that starts a text selection on a long press, reads
    // only the prefixed property; Chrome and Firefox read it too.
    WebkitUserSelect: 'none',
  },
  // A panel below the button can reach past the surface's bottom. The surface
  // then scrolls instead of growing, so the layout around it does not move.
  surfaceScrollsPanel: {overflowY: 'auto'},
  // The card fills the surface, so the area that listens for the press is
  // the area a person sees.
  card: {flexGrow: 1},
  panel: (x: number, y: number, surfaceHeight: number) => ({
    position: 'absolute',
    // The point sets the panel's top-left corner. The clamp keeps the panel's
    // width inside the surface. A translate percentage is of the panel's own
    // height, so near the bottom the panel moves up just enough to fit, and
    // never above the surface's top.
    left: `clamp(0px, ${x}px, calc(100% - ${MENU_WIDTH}px))`,
    top: `${y}px`,
    transform: `translateY(min(0px, max(-${y}px, calc(${surfaceHeight - y}px - 100%))))`,
    zIndex: 1,
  }),
  // The inline-start edge alone places the panel, so a scrollbar on either
  // side of the scrolling surface cannot move it away from the button. The
  // physical left edge is removed, because it applies after a logical edge.
  panelBelowButton: {left: null, transform: 'none'},
  panelInlineStart: (inlineStart: number) => ({
    insetInlineStart: `${inlineStart}px`,
  }),
});

export default function UseLongPressHookUsage() {
  const surfaceRef = useRef<HTMLElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const hasLongPressFiredRef = useRef(false);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [lastAction, setLastAction] = useState(
    'Hold on touch, right-click, or use Actions.',
  );

  const openMenuAt = (
    point: {x: number; y: number},
    source: TriggerSource,
    inlineStart: number | null = null,
  ) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.round(point.x - rect.left));
    const y = Math.max(0, Math.round(point.y - rect.top));
    setMenu({
      x,
      y,
      surfaceHeight: Math.round(rect.height),
      source,
      inlineStart,
    });
  };

  // Only the four touch handlers belong on the DOM element; start, moveTo, and
  // cancel are the imperative API for custom pointer state machines.
  const {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel} = useLongPress({
    onLongPress: point => {
      hasLongPressFiredRef.current = true;
      openMenuAt(point, 'long press');
    },
  });

  const handleTouchStart = (e: TouchEvent<HTMLElement>) => {
    hasLongPressFiredRef.current = false;
    onTouchStart(e);
  };

  // The finger that opened the panel lifts over it. Canceling that lift stops
  // the browser's click, so the release does not run the action under it. The
  // hook runs first: on a busy page it can report the long press in this lift.
  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    onTouchEnd(e);
    if (hasLongPressFiredRef.current) {
      e.preventDefault();
    }
  };

  const closeMenu = () => {
    setMenu(null);
    actionsButtonRef.current?.focus();
  };

  const handleContextMenu = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    // Chromium emits a synthetic contextmenu event with pointerType 'touch'
    // after a long press; keep the original 'long press' trigger source.
    if ((e.nativeEvent as PointerEvent).pointerType === 'touch') {
      return;
    }
    openMenuAt({x: e.clientX, y: e.clientY}, 'right-click');
  };

  // The panel opens beside the Actions button when a side has room. On a
  // narrower card it opens below the button, so it never covers the trigger.
  const handleOpenFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = e.currentTarget.getBoundingClientRect();
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    const surfaceLeft = surfaceRect?.left ?? 0;
    const surfaceRight = surfaceRect?.right ?? 0;
    const hasRoomBefore =
      buttonRect.left - surfaceLeft >= MENU_WIDTH + MENU_GAP;
    const hasRoomAfter =
      surfaceRight - buttonRect.right >= MENU_WIDTH + MENU_GAP;
    if (hasRoomBefore) {
      openMenuAt(
        {x: buttonRect.left - MENU_WIDTH - MENU_GAP, y: buttonRect.top},
        'button',
      );
      return;
    }
    if (hasRoomAfter) {
      openMenuAt({x: buttonRect.right + MENU_GAP, y: buttonRect.top}, 'button');
      return;
    }
    const surface = surfaceRef.current;
    const isRtl =
      surface != null && getComputedStyle(surface).direction === 'rtl';
    // Distances from the surface's inline-start edge.
    const surfaceWidth = surfaceRight - surfaceLeft;
    const buttonStart = isRtl
      ? surfaceRight - buttonRect.right
      : buttonRect.left - surfaceLeft;
    const buttonEnd = isRtl
      ? surfaceRight - buttonRect.left
      : buttonRect.right - surfaceLeft;
    const inlineStart = Math.max(
      0,
      buttonStart + MENU_WIDTH <= surfaceWidth
        ? buttonStart
        : buttonEnd - MENU_WIDTH,
    );
    const x =
      surfaceLeft +
      (isRtl ? surfaceWidth - inlineStart - MENU_WIDTH : inlineStart);
    // The surface can already be scrolled to reach an open panel.
    const y = buttonRect.bottom + MENU_GAP + (surface?.scrollTop ?? 0);
    openMenuAt({x, y}, 'button', Math.round(inlineStart));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && menu) {
      closeMenu();
    }
  };

  const runAction = (action: 'copy' | 'pin') => {
    if (!menu) {
      return;
    }
    if (action === 'pin') {
      const nextPinned = !isPinned;
      setIsPinned(nextPinned);
      setLastAction(
        `${nextPinned ? 'Pinned' : 'Unpinned'} via ${menu.source} (${menu.x}, ${menu.y}).`,
      );
    } else {
      setLastAction(`Copied link via ${menu.source} (${menu.x}, ${menu.y}).`);
    }
    closeMenu();
  };

  return (
    <VStack gap={3}>
      <VStack
        ref={surfaceRef}
        data-testid="long-press-surface"
        xstyle={[
          styles.surface,
          menu?.inlineStart != null && styles.surfaceScrollsPanel,
        ]}
        onTouchStart={handleTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={onTouchCancel}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}>
        <Card padding={4} xstyle={styles.card}>
          <VStack gap={2}>
            <HStack gap={2} justify="between" vAlign="center" wrap="wrap">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Q3 launch brief.pdf</Heading>
                {isPinned && <Badge variant="success" label="Pinned" />}
              </HStack>
              <Button
                ref={actionsButtonRef}
                label="Actions"
                variant="secondary"
                aria-expanded={menu !== null}
                onClick={handleOpenFromButton}
              />
            </HStack>
            <Text type="body" color="secondary">
              Touch press-and-hold or right-click anywhere on this card to open
              actions under your finger or cursor.
            </Text>
          </VStack>
        </Card>

        {menu && (
          <Card
            role="group"
            aria-label="Document actions"
            padding={2}
            width={MENU_WIDTH}
            xstyle={[
              styles.panel(menu.x, menu.y, menu.surfaceHeight),
              menu.inlineStart != null && styles.panelBelowButton,
              menu.inlineStart != null &&
                styles.panelInlineStart(menu.inlineStart),
            ]}>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">
                Opened by {menu.source} at ({menu.x}, {menu.y})
              </Text>
              <Button
                label="Copy link"
                variant="ghost"
                onClick={() => runAction('copy')}
              />
              <Button
                label={isPinned ? 'Unpin' : 'Pin draft'}
                variant="ghost"
                onClick={() => runAction('pin')}
              />
              <Button label="Dismiss" variant="ghost" onClick={closeMenu} />
            </VStack>
          </Card>
        )}
      </VStack>
      <Text type="supporting" color="secondary">
        {lastAction}
      </Text>
    </VStack>
  );
}
