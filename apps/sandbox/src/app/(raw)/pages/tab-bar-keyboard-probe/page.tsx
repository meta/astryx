// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input A finger on a phone: a tap on the text field opens the on-screen
 *   keyboard, and a tap on a row closes it. `?interactive-widget=` sets the
 *   viewport's keyboard mode (resizes-visual by default, resizes-content,
 *   overlays-content). `?claim=1` focuses the field on the press without
 *   letting the browser scroll to it
 * @output A bare page with Lab's TabBar at the bottom and a text field among
 *   long scrolling rows. A readout at the top of the visual viewport shows the
 *   display mode, the keyboard mode, whether focus is claimed, both viewports,
 *   the document's scroll, the visual viewport's pan and its largest value, the
 *   bar's box, and how much of the bar the visual viewport shows, as they change
 * @position A raw page, with no sandbox chrome, for checking on a real phone
 *   where the bar sits while the keyboard is up
 */

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  BookOpenIcon as BookOpenOutline,
  HomeIcon as HomeOutline,
  Squares2X2Icon as GridOutline,
  UserCircleIcon as UserOutline,
} from '@heroicons/react/24/outline';
import {
  BookOpenIcon as BookOpenSolid,
  HomeIcon as HomeSolid,
  Squares2X2Icon as GridSolid,
  UserCircleIcon as UserSolid,
} from '@heroicons/react/24/solid';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {TabBar, TabBarItem} from '@astryxdesign/lab';

const SECTIONS = [
  {value: 'home', label: 'Home', icon: HomeOutline, selectedIcon: HomeSolid},
  {
    value: 'browse',
    label: 'Browse',
    icon: GridOutline,
    selectedIcon: GridSolid,
  },
  {
    value: 'library',
    label: 'Library',
    icon: BookOpenOutline,
    selectedIcon: BookOpenSolid,
  },
  {
    value: 'profile',
    label: 'Profile',
    icon: UserOutline,
    selectedIcon: UserSolid,
  },
];

const styles = stylex.create({
  // The readout follows the visual viewport's top, so it stays in view while
  // the keyboard is up.
  readout: {
    position: 'fixed',
    insetBlockStart: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    zIndex: 1,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-body'],
  },
  follow: (offset: number) => ({
    transform: `translateY(${offset}px)`,
  }),
  // A zero-size box at the layout viewport's top: its client top tells which
  // viewport the browser measures client rects from.
  frame: {
    position: 'fixed',
    insetBlockStart: 0,
    insetInlineStart: 0,
    width: 0,
    height: 0,
    pointerEvents: 'none',
  },
  content: {
    // Clears the readout above and the bar below.
    paddingBlockStart: `calc(${spacingVars['--spacing-12']} * 2)`,
    paddingBlockEnd: `calc(${spacingVars['--spacing-12']} * 2)`,
  },
});

/** The keyboard modes a viewport meta tag can name. */
const KEYBOARD_MODES = [
  'resizes-visual',
  'resizes-content',
  'overlays-content',
] as const;

interface Reading {
  displayMode: string;
  keyboardMode: string;
  scrollY: number;
  layoutHeight: number;
  visualHeight: number;
  visualTop: number;
  panLargest: number;
  panLimit: number;
  frameOffset: number;
  barTop: number;
  barBottom: number;
  barShown: number;
  focused: string;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Chrome measures client rects from the layout viewport, and WebKit from the
 * visual viewport. The frame box's client top is that difference: 0, or minus
 * the pan. So the bar's box moves into layout coordinates first. The visual
 * viewport sits `offsetTop` below the layout viewport's top, so the shown part
 * of the bar is the overlap of the two ranges.
 */
function read(
  bar: HTMLElement | null,
  frame: HTMLElement | null,
  panLargest: number,
): Reading {
  const visual = window.visualViewport;
  const visualTop = visual?.offsetTop ?? 0;
  const visualHeight = visual?.height ?? window.innerHeight;
  const frameOffset = frame?.getBoundingClientRect().top ?? 0;
  const box = bar?.getBoundingClientRect();
  const barTop = (box?.top ?? 0) - frameOffset;
  const barBottom = (box?.bottom ?? 0) - frameOffset;
  const overlap = Math.max(
    0,
    Math.min(barBottom, visualTop + visualHeight) - Math.max(barTop, visualTop),
  );
  const barHeight = barBottom - barTop;
  const active = document.activeElement;
  const viewport = document.querySelector('meta[name="viewport"]');
  const mode = /interactive-widget=([a-z-]+)/.exec(
    viewport?.getAttribute('content') ?? '',
  );
  return {
    keyboardMode: mode?.[1] ?? 'resizes-visual (default)',
    // An iOS Home Screen app without a web manifest reports itself only
    // through `navigator.standalone`.
    displayMode:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & {standalone?: boolean}).standalone === true
        ? 'standalone (Home Screen app)'
        : 'browser',
    layoutHeight: round(window.innerHeight),
    scrollY: round(window.scrollY),
    visualHeight: round(visualHeight),
    visualTop: round(visualTop),
    panLargest: round(panLargest),
    panLimit: round(window.innerHeight - visualHeight),
    frameOffset: round(frameOffset),
    barTop: round(barTop),
    barBottom: round(barBottom),
    barShown: barHeight > 0 ? Math.round((overlap / barHeight) * 100) : 0,
    focused:
      active instanceof HTMLInputElement
        ? 'the text field'
        : (active?.tagName.toLowerCase() ?? 'none'),
  };
}

export default function TabBarKeyboardProbePage() {
  const barRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLElement | null>(null);
  const [isClaim, setIsClaim] = useState(false);
  const panLargestRef = useRef(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const [tab, setTab] = useState('home');
  const [text, setText] = useState('');

  useEffect(() => {
    // A page or a WebView shell that shrinks its window when the keyboard
    // opens moves fixed content above the keys. resizes-content does that in
    // a browser.
    const requested = new URLSearchParams(window.location.search).get(
      'interactive-widget',
    );
    const viewport = document.querySelector('meta[name="viewport"]');
    if (
      viewport == null ||
      requested == null ||
      !(KEYBOARD_MODES as ReadonlyArray<string>).includes(requested)
    ) {
      return;
    }
    const original = viewport.getAttribute('content') ?? '';
    viewport.setAttribute(
      'content',
      `${original.replace(/,?\s*interactive-widget=[a-z-]+/, '')}, interactive-widget=${requested}`,
    );
    return () => viewport.setAttribute('content', original);
  }, []);

  useEffect(() => {
    // An app can focus its field from the press itself, with `preventScroll`,
    // so the browser does not pan to reveal it.
    if (new URLSearchParams(window.location.search).get('claim') !== '1') {
      return;
    }
    setIsClaim(true);
    const field = document.querySelector('[data-testid="text-field"]');
    const input = field?.matches('input')
      ? field
      : field?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const claim = () => {
      if (input.ownerDocument.activeElement !== input) {
        input.focus({preventScroll: true});
      }
    };
    input.addEventListener('pointerdown', claim, {capture: true});
    return () =>
      input.removeEventListener('pointerdown', claim, {capture: true});
  }, []);

  useEffect(() => {
    const update = () => {
      panLargestRef.current = Math.max(
        panLargestRef.current,
        window.visualViewport?.offsetTop ?? 0,
      );
      setReading(read(barRef.current, frameRef.current, panLargestRef.current));
    };
    update();
    const visual = window.visualViewport;
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, {passive: true});
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    // The keyboard slides in over a few hundred milliseconds, and no event
    // reports every step, so a slow poll fills the gaps.
    const timer = window.setInterval(update, 250);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.clearInterval(timer);
    };
  }, []);

  const title = SECTIONS.find(section => section.value === tab)?.label ?? '';
  const row = (index: number) => (
    <Text key={index}>
      {title} row {index + 1}
    </Text>
  );

  return (
    <>
      <VStack ref={frameRef} gap={0} aria-hidden xstyle={styles.frame} />
      <VStack
        gap={0}
        data-testid="readout"
        xstyle={[styles.readout, styles.follow(reading?.visualTop ?? 0)]}>
        {reading == null ? (
          <Text size="sm">Reading…</Text>
        ) : (
          <>
            <Text size="sm">display: {reading.displayMode}</Text>
            <Text size="sm">
              keyboard mode (viewport meta): {reading.keyboardMode} · focus
              claim: {isClaim ? 'on' : 'off'}
            </Text>
            <Text size="sm">
              layout viewport h {reading.layoutHeight} · visual viewport h{' '}
              {reading.visualHeight} top {reading.visualTop} · scrollY{' '}
              {reading.scrollY}
            </Text>
            <Text size="sm">
              pan {reading.visualTop}, largest {reading.panLargest} of{' '}
              {reading.panLimit} · rect offset {reading.frameOffset}
            </Text>
            <Text size="sm">
              bar top {reading.barTop} bottom {reading.barBottom} (layout) ·
              shown {reading.barShown}%
            </Text>
            <Text size="sm">focus: {reading.focused}</Text>
          </>
        )}
      </VStack>
      <VStack gap={4} padding={4} xstyle={styles.content}>
        <Heading level={1}>{title}</Heading>
        {Array.from({length: 6}, (_, index) => row(index))}
        <TextInput
          label="Message"
          value={text}
          onChange={next => setText(next)}
          data-testid="text-field"
        />
        {Array.from({length: 30}, (_, index) => row(index + 6))}
      </VStack>
      <TabBar
        ref={barRef}
        value={tab}
        onChange={setTab}
        label="Sections"
        data-testid="tab-bar">
        {SECTIONS.map(section => (
          <TabBarItem
            key={section.value}
            value={section.value}
            label={section.label}
            icon={<Icon icon={section.icon} size="lg" />}
            selectedIcon={<Icon icon={section.selectedIcon} size="lg" />}
          />
        ))}
      </TabBar>
    </>
  );
}
