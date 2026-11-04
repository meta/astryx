// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLightbox.tsx
 * @input Uses React, Lightbox
 * @output Exports useLightbox hook
 * @position Utility hook; wraps Lightbox with trigger props + state management
 *
 * Eliminates boilerplate for lightbox usage. Instead of managing isOpen state
 * and index separately, call open() and the hook handles the rest.
 *
 * @example
 * ```
 * const lightbox = useLightbox({ media: photos });
 * <img onClick={() => lightbox.open(2)} />
 * {lightbox.element}
 * ```
 */

import {useState, useCallback, useMemo, type ReactNode} from 'react';
import {Lightbox, type LightboxProps, type LightboxItem} from './Lightbox';

type LightboxOptions = Omit<
  LightboxProps,
  | 'isOpen'
  | 'onOpenChange'
  | 'media'
  | 'index'
  | 'defaultIndex'
  | 'onIndexChange'
>;

export interface UseLightboxOptions extends LightboxOptions {
  /**
   * Items to display in the lightbox — images/videos (`LightboxMedia`) or
   * arbitrary React subtrees (`LightboxCustomItem`), which can be mixed.
   */
  media: LightboxItem | LightboxItem[];
}

export interface UseLightboxReturn {
  /** Open the lightbox, optionally at a specific gallery index. */
  open: (index?: number) => void;
  /** Close the lightbox. */
  close: () => void;
  /** Whether the lightbox is currently open. */
  isOpen: boolean;
  /** Current gallery index. */
  index: number;
  /** Render this in your JSX tree. */
  element: ReactNode;
  /** Props to spread on a trigger element for accessibility. */
  triggerProps: {
    role: 'button';
    tabIndex: 0;
    'aria-haspopup': 'dialog';
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  /** Returns trigger props that open at a specific gallery index. */
  getTriggerProps: (index: number) => {
    role: 'button';
    tabIndex: 0;
    'aria-haspopup': 'dialog';
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

/**
 * Hook for lightbox with trigger props and state management.
 *
 * @example
 * ```
 * const lightbox = useLightbox({ media: photos });
 * {photos.map((photo, i) => (
 *   <img
 *     key={photo.src}
 *     src={photo.src}
 *     alt={photo.alt}
 *     {...lightbox.getTriggerProps(i)}
 *   />
 * ))}
 * {lightbox.element}
 * ```
 */
export function useLightbox(options: UseLightboxOptions): UseLightboxReturn {
  const {media, ...lightboxProps} = options;
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const open = useCallback((i: number = 0) => {
    setIndex(i);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const triggerProps = useMemo(
    () => ({
      role: 'button' as const,
      tabIndex: 0 as const,
      'aria-haspopup': 'dialog' as const,
      onClick: () => open(),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      },
    }),
    [open],
  );

  const getTriggerProps = useCallback(
    (i: number) => ({
      role: 'button' as const,
      tabIndex: 0 as const,
      'aria-haspopup': 'dialog' as const,
      onClick: () => open(i),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      },
    }),
    [open],
  );

  const element = useMemo(
    () => (
      <Lightbox
        isOpen={isOpen}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            setIsOpen(false);
          }
        }}
        media={media}
        index={index}
        onIndexChange={setIndex}
        {...lightboxProps}
      />
    ),
    [isOpen, media, index, lightboxProps],
  );

  return {open, close, isOpen, index, element, triggerProps, getTriggerProps};
}
