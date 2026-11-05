// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file Template preview selection and transition regressions.
 * @input Mounted TemplatePreviewDialog with real React scheduling and mocked header, content, and footer UI.
 * @output Records every committed visible preview and verifies close stays responsive.
 * @position Docsite regression coverage for gallery preview selection and navigation.
 */

import {
  createElement,
  Suspense,
  startTransition,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {TemplatePreviewDialog} from '../components/TemplatePreviewDialog';

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: unknown) => styles,
  props: () => ({}),
}));
vi.mock('@astryxdesign/core/Icon', () => ({Icon: () => null}));
vi.mock('@astryxdesign/core/Text', () => ({Text: Box, Heading: Box}));
vi.mock('@astryxdesign/core/Code', () => ({Code: Box}));
vi.mock('@astryxdesign/core/Tooltip', () => ({Tooltip: Box}));
vi.mock('@astryxdesign/core/Layout', () => ({
  VStack: Box,
  HStack: Box,
  LayoutHeader: Box,
  LayoutContent: Box,
  LayoutFooter: Box,
  Layout: ({
    header,
    content,
    footer,
  }: {
    header: ReactNode;
    content: ReactNode;
    footer: ReactNode;
  }) => createElement('div', null, header, content, footer),
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({
    label,
    onClick,
    href,
  }: {
    label: string;
    onClick?: () => void;
    href?: string;
  }) =>
    href
      ? createElement('a', {href, onClick}, label)
      : createElement('button', {onClick}, label),
}));
vi.mock('@astryxdesign/core/Skeleton', () => ({
  Skeleton: () => createElement('div', {'data-testid': 'pending-preview'}),
}));
// Keep children mounted while closed without modeling native dialog teardown.
// React's actual deferred-value and transition hooks are deliberately not mocked.
vi.mock('@astryxdesign/core/Dialog', () => ({
  Dialog: ({
    isOpen,
    children,
    variant,
  }: {
    isOpen: boolean;
    children: ReactNode;
    variant?: string;
  }) =>
    createElement(
      'div',
      {role: 'dialog', hidden: !isOpen, 'data-variant': variant},
      children,
    ),
}));
vi.mock('../lib/analytics', () => ({
  trackCopy: vi.fn(),
  trackOpenPlayground: vi.fn(),
  trackNavigate: vi.fn(),
}));
vi.mock('../components/TemplatePreviewSurface', () => ({
  TemplatePreviewSurface: PreviewProbe,
}));

const commits: {slug: string; covered: boolean}[] = [];
const items = [
  {slug: 'template-a', name: 'Template A'},
  {slug: 'template-b', name: 'Template B'},
  {slug: 'template-c', name: 'Template C'},
];

function Box({children}: {children?: ReactNode}) {
  return createElement('div', null, children);
}

function PreviewProbe({slug}: {slug: string}) {
  const ref = useRef<HTMLDivElement>(null);
  // Observe commits, not speculative renders that React may discard. Every
  // layout effect runs before RTL's act can flush the deferred follow-up.
  useLayoutEffect(() => {
    const dialog = ref.current?.closest<HTMLElement>('[role="dialog"]');
    if (dialog && !dialog.hidden) {
      commits.push({
        slug,
        covered:
          dialog.querySelector('[data-testid="pending-preview"]') !== null,
      });
    }
  });
  return createElement('div', {ref, 'data-testid': 'preview'}, slug);
}

function preview(index: number, isOpen = true, variant?: 'fullscreen') {
  return createElement(TemplatePreviewDialog, {
    items,
    index,
    isOpen,
    variant,
    onOpenChange: vi.fn(),
    onIndexChange: vi.fn(),
  });
}

function expectOnlyVisible(slug: string) {
  const visible = commits
    .filter(commit => !commit.covered)
    .map(commit => commit.slug);
  expect(visible[0]).toBe(slug);
  expect(new Set(visible)).toEqual(new Set([slug]));
}

beforeEach(() => {
  commits.length = 0;
});

afterEach(cleanup);

describe('template preview selection', () => {
  it.each([undefined, 'fullscreen'] as const)(
    'opens the selected template immediately (variant: %s)',
    variant => {
      const view = render(preview(0, false, variant));
      expect(commits).toEqual([]);
      view.rerender(preview(1, true, variant));
      expectOnlyVisible('template-b');
      expect(
        screen.getByTestId('preview').closest<HTMLElement>('[role="dialog"]')
          ?.dataset.variant,
      ).toBe(variant);
    },
  );

  it('opens a different template after closing without unmounting', () => {
    const view = render(preview(1));
    view.rerender(preview(0, false));
    commits.length = 0;
    view.rerender(preview(2));
    expectOnlyVisible('template-c');
  });

  it('immediately follows direct index updates from URL synchronization', () => {
    const view = render(preview(0));
    for (const index of [2, 1, 0]) {
      commits.length = 0;
      view.rerender(preview(index));
      expectOnlyVisible(items[index].slug);
    }
  });

  it('opens an initial deep-linked index', () => {
    render(preview(2));
    expectOnlyVisible('template-c');
  });

  it('navigates both directions and covers the old preview while pending', () => {
    function Gallery() {
      const [index, setIndex] = useState(0);
      return createElement(TemplatePreviewDialog, {
        items,
        index,
        isOpen: true,
        onIndexChange: setIndex,
        onOpenChange: vi.fn(),
      });
    }
    render(createElement(Gallery));
    for (const [label, oldSlug, nextSlug] of [
      ['Next template', 'template-a', 'template-b'],
      ['Previous template', 'template-b', 'template-a'],
      ['Previous template', 'template-a', 'template-c'],
    ]) {
      commits.length = 0;
      fireEvent.click(screen.getByRole('button', {name: label}));
      expect(commits).toContainEqual({slug: oldSlug, covered: true});
      expectOnlyVisible(nextSlug);
      expect(screen.queryByTestId('pending-preview')).toBeNull();
    }
  });

  it('keeps close responsive during a suspended navigation', async () => {
    let resolve!: () => void;
    let ready = false;
    const navigation = new Promise<void>(done => {
      resolve = done;
    });
    function Navigation({index}: {index: number}) {
      if (index === 1 && !ready) {
        throw navigation;
      }
      return null;
    }
    function Gallery() {
      const [index, setIndex] = useState(0);
      const [isOpen, setOpen] = useState(true);
      return createElement(
        Suspense,
        {fallback: 'Navigating'},
        createElement(TemplatePreviewDialog, {
          items,
          index,
          isOpen,
          onIndexChange: setIndex,
          onOpenChange: setOpen,
        }),
        createElement(Navigation, {index}),
      );
    }
    render(createElement(Gallery));
    fireEvent.click(screen.getByRole('button', {name: 'Next template'}));
    expect(screen.getByTestId('pending-preview')).not.toBeNull();
    expect(screen.getByTestId('preview').textContent).toBe('template-a');
    fireEvent.click(screen.getByRole('button', {name: 'Close preview'}));
    expect(screen.getByRole('dialog', {hidden: true}).hidden).toBe(true);
    expect(screen.queryByTestId('preview')).toBeNull();
    await act(async () => {
      ready = true;
      resolve();
      await navigation;
    });
    expect(screen.getByRole('dialog', {hidden: true}).hidden).toBe(true);
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('opens C after closing a pending A-to-B navigation', async () => {
    let resolve!: () => void;
    let ready = false;
    const navigation = new Promise<void>(done => {
      resolve = done;
    });
    function Navigation({index}: {index: number | null}) {
      if (index !== 0 && !ready) {
        throw navigation;
      }
      return null;
    }
    function Gallery() {
      const [selection, setSelection] = useState<number | null>(0);
      const [routeSelection, setRouteSelection] = useState<number | null>(0);
      // Match the gallery: selection updates immediately, while router.replace
      // schedules separate transition work that can remain suspended.
      const select = (index: number | null) => {
        setSelection(index);
        startTransition(() => setRouteSelection(index));
      };
      return createElement(
        Suspense,
        {fallback: 'Navigating'},
        createElement('button', {onClick: () => select(2)}, 'Open C'),
        createElement(TemplatePreviewDialog, {
          items,
          index: selection ?? 0,
          isOpen: selection !== null,
          onIndexChange: select,
          onOpenChange: (open: boolean) => {
            if (!open) {
              select(null);
            }
          },
        }),
        createElement(Navigation, {index: routeSelection}),
      );
    }
    render(createElement(Gallery));
    fireEvent.click(screen.getByRole('button', {name: 'Next template'}));
    expect(screen.getByTestId('pending-preview')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Close preview'}));
    commits.length = 0;
    fireEvent.click(screen.getByRole('button', {name: 'Open C'}));
    expectOnlyVisible('template-c');
    expect(commits.every(commit => commit.slug === 'template-c')).toBe(true);
    expect(screen.queryByTestId('pending-preview')).toBeNull();
    await act(async () => {
      ready = true;
      resolve();
      await navigation;
    });
    expectOnlyVisible('template-c');
  });
});
