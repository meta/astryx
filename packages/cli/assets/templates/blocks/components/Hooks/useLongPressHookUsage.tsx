// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState, type KeyboardEvent, type MouseEvent} from 'react';
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
const MENU_ESTIMATED_WIDTH = 180;
const MENU_ESTIMATED_HEIGHT = 140;

export default function UseLongPressHookUsage() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [lastAction, setLastAction] = useState(
    'Hold on touch, right-click, or use Actions.',
  );

  const openMenuAt = (point: {x: number; y: number}, source: TriggerSource) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const rawX = rect ? point.x - rect.left : point.x;
    const rawY = rect ? point.y - rect.top : point.y;
    const x =
      rect && rect.width > MENU_ESTIMATED_WIDTH
        ? Math.min(
            Math.max(8, Math.round(rawX)),
            Math.round(rect.width - MENU_ESTIMATED_WIDTH),
          )
        : Math.max(0, Math.round(rawX));
    const y =
      rect && rect.height > MENU_ESTIMATED_HEIGHT
        ? Math.min(
            Math.max(8, Math.round(rawY)),
            Math.round(rect.height - MENU_ESTIMATED_HEIGHT),
          )
        : Math.max(0, Math.round(rawY));
    setMenu({x, y, source});
  };

  // Only the four touch handlers belong on the DOM element; start, moveTo, and
  // cancel are the imperative API for custom pointer state machines.
  const {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel} = useLongPress({
    onLongPress: point => {
      openMenuAt(point, 'long press');
    },
  });

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    openMenuAt({x: e.clientX, y: e.clientY}, 'right-click');
  };

  const handleOpenFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    const buttonRect = e.currentTarget.getBoundingClientRect();
    const fallbackX = buttonRect.width > 0 ? buttonRect.left : 240;
    const fallbackY =
      buttonRect.height > 0 ? buttonRect.bottom + MENU_OFFSET_Y : 48;
    openMenuAt({x: fallbackX, y: fallbackY}, 'button');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && menu) {
      setMenu(null);
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
    setMenu(null);
  };

  return (
    <VStack gap={3}>
      <div
        ref={surfaceRef}
        data-testid="long-press-surface"
        style={{position: 'relative', userSelect: 'none', width: 360}}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}>
        <Card width={360} padding={4}>
          <VStack gap={2}>
            <HStack gap={2} justify="between" vAlign="center">
              <HStack gap={2} vAlign="center">
                <Heading level={3}>Q3 launch brief.pdf</Heading>
                {isPinned && <Badge variant="success" label="Pinned" />}
              </HStack>
              <Button
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
          <div
            role="menu"
            aria-label="Document actions"
            style={{
              position: 'absolute',
              left: menu.x,
              top: menu.y,
              zIndex: 1,
            }}>
            <Card padding={2} width={180}>
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
                <Button
                  label="Dismiss"
                  variant="ghost"
                  onClick={() => setMenu(null)}
                />
              </VStack>
            </Card>
          </div>
        )}
      </div>
      <Text type="supporting" color="secondary">
        {lastAction}
      </Text>
    </VStack>
  );
}
