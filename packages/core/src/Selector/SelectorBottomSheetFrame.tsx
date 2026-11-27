// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectorBottomSheetFrame.tsx
 * @input Uses BottomSheet, Section, and Heading
 * @output Mobile listbox sheet frame for Selector and MultiSelector
 * @position Internal presentation frame loaded on demand by SelectorBottomSheet
 */

import {useEffect, type ReactNode, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Heading} from '../Heading/Heading';
import {Section} from '../Section/Section';
import {spacingVars} from '../theme/tokens.stylex';

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
  label: string;
  onOpenChange: (isOpen: boolean) => void;
}

function SelectorBottomSheetInitialFocus({
  isOpen,
  targetRef,
}: {
  isOpen: boolean;
  targetRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      targetRef.current?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, targetRef]);

  return null;
}

export function SelectorBottomSheetFrame({
  children,
  finalFocusRef,
  initialFocusRef,
  isOpen,
  label,
  onOpenChange,
}: SelectorBottomSheetProps) {
  return (
    <BottomSheet
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
          <SelectorBottomSheetInitialFocus
            isOpen={isOpen}
            targetRef={initialFocusRef}
          />
        </div>
      </Section>
    </BottomSheet>
  );
}

SelectorBottomSheetFrame.displayName = 'SelectorBottomSheetFrame';
