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
  source: TriggerSource;
}

const MENU_OFFSET_Y = 8;
const MENU_WIDTH = 180;
// Room for the panel's note and its three actions in every theme. The surface
// is at least this tall, so a panel clamped to the surface always fits.
const MENU_MAX_HEIGHT = 200;

const styles = stylex.create({
  surface: {
    position: 'relative',
    width: '100%',
    maxWidth: 360,
    minHeight: MENU_MAX_HEIGHT,
    // Safari, the browser that starts a text selection on a long press, reads
    // only the prefixed property; Chrome and Firefox read it too.
    WebkitUserSelect: 'none',
  },
  // The card fills the surface, so the area that listens for the press is
  // the area a person sees.
  card: {flexGrow: 1},
  panel: (x: number, y: number) => ({
    position: 'absolute',
    // The point sets the panel's corner; the clamp keeps the whole panel
    // inside the surface, whatever the surface's width.
    left: `clamp(0px, ${x}px, calc(100% - ${MENU_WIDTH}px))`,
    top: `clamp(0px, ${y}px, calc(100% - ${MENU_MAX_HEIGHT}px))`,
    zIndex: 1,
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

  const openMenuAt = (point: {x: number; y: number}, source: TriggerSource) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const rawX = rect ? point.x - rect.left : point.x;
    const rawY = rect ? point.y - rect.top : point.y;
    const x = Math.max(0, Math.round(rawX));
    const y = Math.max(0, Math.round(rawY));
    setMenu({x, y, source});
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
  // the browser's click, so the release does not run the action under it.
  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    if (hasLongPressFiredRef.current) {
      e.preventDefault();
    }
    onTouchEnd(e);
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

  const handleOpenFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = e.currentTarget.getBoundingClientRect();
    const fallbackX = buttonRect.width > 0 ? buttonRect.left : 240;
    const fallbackY =
      buttonRect.height > 0 ? buttonRect.bottom + MENU_OFFSET_Y : 48;
    openMenuAt({x: fallbackX, y: fallbackY}, 'button');
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
        xstyle={styles.surface}
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
            xstyle={styles.panel(menu.x, menu.y)}>
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
