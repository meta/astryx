// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Renders and scrolls to a stable component-example deep-link target.
 * @input An optional generated anchor id and the rendered example content.
 * @output A header-aware target that works after lazy client rendering.
 * @position Wraps showcase and example cards on component detail pages.
 */

'use client';

import {useEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  root: {
    width: '100%',
    scrollMarginTop: 'calc(var(--appshell-header-height, 0px) + 16px)',
  },
});

function hashTarget(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return window.location.hash.slice(1);
  }
}

/** Gives a lazily rendered example a stable deep-link target. */
export function ExampleAnchor({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {return;}
    const scrollIfTarget = () => {
      if (hashTarget() !== id) {return;}
      requestAnimationFrame(() =>
        ref.current?.scrollIntoView({block: 'start'}),
      );
    };
    scrollIfTarget();
    window.addEventListener('hashchange', scrollIfTarget);
    return () => window.removeEventListener('hashchange', scrollIfTarget);
  }, [id]);

  return (
    <div ref={ref} id={id} {...stylex.props(styles.root)}>
      {children}
    </div>
  );
}
