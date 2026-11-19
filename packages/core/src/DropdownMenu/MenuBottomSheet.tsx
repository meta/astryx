// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MenuBottomSheet.tsx
 * @input Uses BottomSheet
 * @output Internal action-sheet host for menu content; nothing of the sheet renders while it is closed
 * @position Shared by DropdownMenu and ContextMenu adaptive presentations
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {BottomSheet} from '../BottomSheet/BottomSheet';

interface MenuBottomSheetProps {
  finalFocusRef?: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  label: string;
  children: ReactNode;
}

/**
 * The sheet renders nothing at rest (architecture:component-style-authoring
 * INV7): it mounts as it opens, and after it closes it stays only until its
 * dialog has closed, so the exit plays out and focus returns to the trigger.
 * The sheet has no content padding: callers inset their content with
 * menuBottomSheetStyles.content, so no wrapper sits between the sheet and it.
 */
export function MenuBottomSheet({
  finalFocusRef,
  isOpen,
  onOpenChange,
  label,
  children,
}: MenuBottomSheetProps) {
  const [isMounted, setIsMounted] = useState(isOpen);
  if (isOpen && !isMounted) {
    setIsMounted(true);
  }
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isOpen || !isMounted) {
      return;
    }
    const dialog = panelRef.current?.closest('dialog');
    if (dialog == null || !dialog.open) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- the native <dialog> has already closed, so the exit is over: unmount the sheet
      setIsMounted(false);
      return;
    }
    const handleClose = () => setIsMounted(false);
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [isMounted, isOpen]);

  if (!isMounted) {
    return null;
  }
  return (
    <BottomSheet
      ref={panelRef}
      finalFocusRef={finalFocusRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      label={label}
      height="hug"
      padding={0}
      purpose="info">
      {children}
    </BottomSheet>
  );
}

MenuBottomSheet.displayName = 'MenuBottomSheet';
