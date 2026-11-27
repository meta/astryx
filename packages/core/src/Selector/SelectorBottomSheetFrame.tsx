// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorBottomSheetFrame.tsx
 * @input Uses BottomSheet, Section, and Heading
 * @output Mobile listbox sheet frame for Selector and MultiSelector
 * @position Internal presentation frame loaded on demand by SelectorBottomSheet
 */

import {useCallback, type ReactNode, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Heading} from '../Heading/Heading';
import {Section} from '../Section/Section';
import {spacingVars} from '../theme/tokens.stylex';
import {isCoarsePointer} from '../utils/coarsePointer';

const styles = stylex.create({
  content: {
    width: '100%',
  },
  heading: {
    marginBlockEnd: spacingVars['--spacing-2'],
    marginInline: spacingVars['--spacing-3'],
  },
});

export interface SelectorBottomSheetProps {
  children: ReactNode;
  finalFocusRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  isSearchRequested?: boolean;
  label: string;
  onOpenChange: (isOpen: boolean) => void;
}

export function SelectorBottomSheetFrame({
  children,
  finalFocusRef,
  initialFocusRef,
  isOpen,
  isSearchRequested = false,
  label,
  onOpenChange,
}: SelectorBottomSheetProps) {
  const setPanelRef = useCallback(
    (panel: HTMLDivElement | null) => {
      if (!isOpen || panel == null) {
        return;
      }
      const view = panel.ownerDocument.defaultView;
      const hasTouchSearch =
        initialFocusRef.current?.tagName === 'INPUT' &&
        view != null &&
        isCoarsePointer(view);
      const defersSearch = hasTouchSearch && !isSearchRequested;
      const focusAtOpen = panel.ownerDocument.activeElement;
      if (hasTouchSearch) {
        // The panel ref attaches before showModal runs. Native focusing must
        // not reach search, even before a deferred focus move could correct it.
        // A typed opener already seeds its key; native search focus would
        // insert it twice.
        panel.setAttribute('autofocus', '');
      }
      const frame = requestAnimationFrame(() => {
        // A reopen during exit keeps the native dialog open, so its focusing
        // steps do not run again. Keep any focus the person has already moved
        // into the panel.
        const active = panel.ownerDocument.activeElement;
        if (defersSearch && active !== focusAtOpen && panel.contains(active)) {
          return;
        }
        (defersSearch ? panel : initialFocusRef.current)?.focus({
          preventScroll: true,
        });
      });
      return () => {
        cancelAnimationFrame(frame);
        if (hasTouchSearch) {
          panel.removeAttribute('autofocus');
        }
      };
    },
    [initialFocusRef, isOpen, isSearchRequested],
  );
  return (
    <BottomSheet
      ref={setPanelRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      finalFocusRef={finalFocusRef}
      label={label}
      height="hug"
      purpose="info">
      <Section paddingBlockStart={4} paddingBlockEnd={0} paddingInline={1}>
        <div {...stylex.props(styles.content)}>
          <Heading level={3} xstyle={styles.heading}>
            {label}
          </Heading>
          {children}
        </div>
      </Section>
    </BottomSheet>
  );
}

SelectorBottomSheetFrame.displayName = 'SelectorBottomSheetFrame';
