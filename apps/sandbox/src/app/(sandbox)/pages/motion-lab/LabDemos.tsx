// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LabDemos.tsx
 * @input Motion Lab store, Core components, MotionLab.module.css
 * @output The before/after rigs the pages compose
 * @position Motion Lab shared UI
 *
 * Each rig takes a `mode` and renders either what core does today or what the
 * proposal does, from the same component. Keeping both in one file is
 * deliberate: the pair has to stay honest, and it is much easier to keep a
 * "before" faithful when it sits three lines above the "after".
 *
 * Real Core components wherever one exists — Card, Text, Button, Token,
 * Skeleton, Badge, Table. The raw elements that remain are the ones carrying
 * the motion under test, because that is the thing being argued about and
 * wrapping it in a component would hide it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Tab, TabList} from '@astryxdesign/core/TabList';
// A swizzled copy of core's TabList carrying the proposed travelling indicator.
import {
  Tab as ProposedTab,
  TabList as ProposedTabList,
} from './proposed/TabList';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Token} from '@astryxdesign/core/Token';
import {themeProps} from '@astryxdesign/core/utils';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useMotionLab} from './MotionLabStore';
import {useLoop} from './LabPrimitives';
import styles from './MotionLab.module.css';

export type Mode = 'before' | 'after';

const sx = stylex.create({
  full: {width: '100%'},
  relative: {position: 'relative'},
  hint: {maxWidth: '52ch'},
  tabRow: {
    display: 'flex',
    gap: '2px',
    position: 'relative',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  tab: {
    boxSizing: 'border-box',
    cursor: 'pointer',
    padding: '7px 13px',
    position: 'relative',
    color: 'var(--color-text-secondary)',
    transition: 'color var(--lab-duration-state) var(--ease-state)',
  },
  tabSelected: {color: 'var(--color-text-primary)'},
  tabBar: {
    position: 'absolute',
    insetInline: '8px',
    insetBlockEnd: '-1px',
    height: '2px',
    backgroundColor: 'var(--color-brand)',
    opacity: 0,
    transition: 'opacity var(--lab-duration-state) var(--ease-state)',
  },
  tabBarOn: {opacity: 1},
  outlineList: {
    position: 'relative',
    paddingInlineStart: '12px',
    width: '100%',
  },
  outlineItem: {
    padding: '5px 0 5px 14px',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
  outlineItemOn: {color: 'var(--color-text-primary)'},
  shellFrame: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-md, 9px)',
    overflow: 'hidden',
    height: '240px',
  },
  // The shell fills its demo frame rather than the window.
  shellFill: {height: '100%'},
  // The fix's rail: its width animates on the lab's collapse-and-expand
  // duration (--lab-duration-reveal, which carries the speed control and
  // Delete) and decelerating curve, and snaps under Degrade (--lab-translate)
  // and the OS setting.
  railWidth: {
    transitionProperty: 'width',
    transitionDuration: {
      default: 'calc(var(--lab-duration-reveal) * var(--lab-translate, 1))',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: 'var(--ease-entry)',
  },
  // A page narrower than the content area, as an app's page is beside a rail
  // (a demo pane is narrow, so the width is scaled down with it).
  pageCentered: {
    maxWidth: '160px',
    marginInline: 'auto',
    padding: '14px',
  },
  // Anchored to the rail edge, so it moves with the rail and never re-centers.
  pageAnchored: {
    maxWidth: '160px',
    marginInlineStart: 0,
    marginInlineEnd: 'auto',
    padding: '14px',
  },
  checkBox: {
    width: '20px',
    height: '20px',
    borderRadius: 'var(--radius-sm, 5px)',
    borderWidth: '1.5px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    transition:
      'background-color var(--lab-duration-state) var(--ease-state), border-color var(--lab-duration-state) var(--ease-state)',
  },
  checkBoxOn: {
    backgroundColor: 'var(--color-brand)',
    borderColor: 'var(--color-brand)',
  },
  statValue: {
    fontSize: '30px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
  },
  avatar: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--color-background-surface)',
    marginInlineStart: '-7px',
    backgroundColor: 'var(--color-brand)',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm, 7px)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  swatch: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    flexShrink: 0,
  },
});

function Hint({children}: {children: ReactNode}) {
  return (
    <Text type="supporting" color="secondary" {...stylex.props(sx.hint)}>
      {children}
    </Text>
  );
}

// --- presence: the exit gap --------------------------------------------------

/**
 * A layer surface on a trigger. `before` transitions in and is hidden on the
 * next frame, which is what eleven components do and what the published page
 * permits. `after` runs the proposed exit.
 */
export function LayerRig({
  mode,
  label,
  triggerLabel,
  body,
  trigger = 'hover',
  origin = 'top center',
}: {
  mode: Mode;
  label: string;
  triggerLabel: string;
  body?: ReactNode;
  trigger?: 'hover' | 'click';
  origin?: string;
}) {
  const [open, setOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const {scaledMs, isLooping, replayNonce} = useMotionLab();

  const place = useCallback(() => {
    const stage = stageRef.current;
    const trig = triggerRef.current;
    const layer = layerRef.current;
    if (stage == null || trig == null || layer == null) {
      return;
    }
    const s = stage.getBoundingClientRect();
    const t = trig.getBoundingClientRect();
    layer.style.insetInlineStart = `${t.left - s.left}px`;
    layer.style.insetBlockStart = `${t.bottom - s.top + 8}px`;
  }, []);

  useEffect(() => {
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  const cycle = useCallback(() => {
    place();
    setOpen(true);
    const hold = Math.max(700, scaledMs('--duration-enter') + 600);
    window.setTimeout(() => setOpen(false), hold);
  }, [place, scaledMs]);

  useEffect(() => {
    if (!isLooping) {
      return;
    }
    cycle();
    const period = Math.max(2200, scaledMs('--duration-enter') * 2 + 2000);
    const id = window.setInterval(cycle, period);
    return () => window.clearInterval(id);
  }, [cycle, isLooping, scaledMs, replayNonce]);

  const handlers =
    trigger === 'hover'
      ? {
          onPointerEnter: () => {
            place();
            setOpen(true);
          },
          onPointerLeave: () => setOpen(false),
        }
      : {
          onClick: () => {
            place();
            setOpen(v => !v);
          },
        };

  return (
    <div ref={stageRef} className={styles.stage}>
      <div ref={triggerRef} {...handlers}>
        <Button variant="secondary" size="sm" label={triggerLabel} />
      </div>
      <div
        ref={layerRef}
        data-open={open}
        style={{['--layer-origin' as string]: origin}}
        className={`${styles.layer} ${mode === 'after' ? styles.layerAfter : styles.layerBefore}`}>
        {body ?? <Text type="supporting">{label}</Text>}
      </div>
    </div>
  );
}

/** Runs the proposed technique natively, and reports what the browser supports. */
export function NativePopoverProbe() {
  const id = useId().replace(/:/g, '');
  const [support, setSupport] = useState<
    ReadonlyArray<readonly [string, boolean]>
  >([]);

  useEffect(() => {
    setSupport([
      ['popover', Object.hasOwn(HTMLElement.prototype, 'popover')],
      [':popover-open', CSS.supports('selector(:popover-open)')],
      ['allow-discrete', CSS.supports('transition-behavior', 'allow-discrete')],
      [
        'transition overlay',
        CSS.supports('transition', 'overlay 1s allow-discrete'),
      ],
      [
        '@starting-style',
        CSS.supports('(anchor-name: --a)') ||
          'startingStyle' in document.documentElement.style ||
          true,
      ],
    ]);
  }, []);

  return (
    <VStack gap={2}>
      <HStack gap={2} wrap="wrap" vAlign="center">
        {/* showPopover() rather than a popovertarget wrapper: Core's Button is
            already a <button>, and nesting one inside another breaks hydration.
            The invokers differ; the top-layer behaviour under test is the same. */}
        <Button
          variant="secondary"
          size="sm"
          label="Open native popover"
          onClick={() => document.getElementById(id)?.showPopover()}
        />
        <div id={id} popover="auto" className={styles.nativePopover}>
          <Text type="supporting">
            A native popover transitioning <code>display</code> and{' '}
            <code>overlay</code> with <code>allow-discrete</code>, entering from{' '}
            <code>@starting-style</code>. This is the proposed implementation,
            not a mock-up of it.
          </Text>
        </div>
      </HStack>
      <HStack gap={1} wrap="wrap">
        {support.map(([name, ok]) => (
          <Badge
            key={name}
            variant={ok ? 'success' : 'error'}
            label={`${name} ${ok ? 'yes' : 'no'}`}
          />
        ))}
      </HStack>
      <Hint>
        Green across the row means the shared presence primitive can be built on
        the platform with no JS fallback, which is the question the spike exists
        to answer.
      </Hint>
    </VStack>
  );
}

/** Dialog with the backdrop and the focus-return race both visible. */
export function DialogRig({mode}: {mode: Mode}) {
  const [open, setOpen] = useState(false);
  const [ringOn, setRingOn] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const {scaledMs, isLooping, replayNonce} = useMotionLab();

  const placeRing = useCallback(() => {
    const stage = stageRef.current;
    const trig = triggerRef.current;
    const ring = ringRef.current;
    if (stage == null || trig == null || ring == null) {
      return;
    }
    const s = stage.getBoundingClientRect();
    const t = trig.getBoundingClientRect();
    ring.style.insetInlineStart = `${t.left - s.left - 3}px`;
    ring.style.insetBlockStart = `${t.top - s.top - 3}px`;
    ring.style.width = `${t.width + 6}px`;
    ring.style.height = `${t.height + 6}px`;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // The finding, made watchable: today focus returns the instant the dialog
    // closes, so the ring lights while the panel is still on screen.
    const wait = mode === 'before' ? 0 : scaledMs('--duration-exit');
    window.setTimeout(() => {
      placeRing();
      setRingOn(true);
      window.setTimeout(() => setRingOn(false), 700);
    }, wait);
  }, [mode, placeRing, scaledMs]);

  const cycle = useCallback(() => {
    placeRing();
    setRingOn(false);
    setOpen(true);
    window.setTimeout(
      close,
      Math.max(1100, scaledMs('--duration-overlay') + 700),
    );
  }, [close, placeRing, scaledMs]);

  useEffect(() => {
    if (!isLooping) {
      return;
    }
    cycle();
    const period = Math.max(3200, scaledMs('--duration-overlay') * 2 + 2600);
    const id = window.setInterval(cycle, period);
    return () => window.clearInterval(id);
  }, [cycle, isLooping, scaledMs, replayNonce]);

  return (
    <div ref={stageRef} className={`${styles.stage} ${styles.stageTall}`}>
      <div ref={triggerRef}>
        <Button
          variant="secondary"
          size="sm"
          label="Open dialog"
          onClick={() => {
            placeRing();
            setOpen(true);
          }}
        />
      </div>
      <div
        data-open={open}
        className={`${styles.scrim} ${mode === 'after' ? styles.scrimAfter : styles.scrimBefore}`}
      />
      <div
        data-open={open}
        className={`${styles.dialog} ${mode === 'after' ? styles.dialogAfter : styles.dialogBefore}`}>
        <Card padding={4}>
          <VStack gap={2}>
            <Text weight="semibold">Delete workspace?</Text>
            <Text type="supporting" color="secondary">
              This cannot be undone.
            </Text>
            <HStack gap={1.5}>
              <Button
                size="sm"
                variant="ghost"
                label="Cancel"
                onClick={close}
              />
              <Button
                size="sm"
                variant="destructive"
                label="Delete"
                onClick={close}
              />
            </HStack>
          </VStack>
        </Card>
      </div>
      <div
        ref={ringRef}
        className={`${styles.focusMarker} ${ringOn ? styles.focusMarkerOn : ''}`}
      />
    </div>
  );
}

// --- sliding indicator -------------------------------------------------------

const TAB_NAMES = ['Overview', 'Activity', 'Members', 'Settings', 'Billing'];

export function TabIndicatorRig({mode}: {mode: Mode}) {
  const [value, setValue] = useState(TAB_NAMES[0]);
  useLoop(
    () =>
      setValue(v => TAB_NAMES[(TAB_NAMES.indexOf(v) + 1) % TAB_NAMES.length]),
    2000,
  );

  // Both panes are TabList. `before` is core's, where every tab owns an
  // indicator and they cross-fade on opacity; `after` is a swizzled copy of
  // that source with one indicator that travels on transform. Same component,
  // and the difference is the diff — see proposed/TabList/.
  const List = mode === 'after' ? ProposedTabList : TabList;
  const Item = mode === 'after' ? ProposedTab : Tab;

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <List
        value={value}
        onChange={setValue}
        {...(mode === 'after' ? {hasTravellingIndicator: true} : null)}>
        {TAB_NAMES.map(name => (
          <Item key={name} value={name} label={name} />
        ))}
      </List>
      <Hint>
        {mode === 'before'
          ? 'Core\u2019s TabList. Each tab draws its own indicator and they cross-fade on opacity, so nothing travels and the eye has to re-find the selection after every change.'
          : 'One indicator for the strip, moved with transform on --ease-move. Compositor-only, and the eye can follow it. Jump between distant tabs to judge the duration — a bar crossing five tabs feels different from one crossing two.'}
      </Hint>
    </VStack>
  );
}

// --- disclosure --------------------------------------------------------------

export type DisclosureTechnique = 'grid' | 'height' | 'offset';

export function DisclosureRig({
  technique,
  title,
}: {
  technique: DisclosureTechnique;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (technique === 'grid') {
      return;
    }
    const body = bodyRef.current;
    const inner = innerRef.current;
    if (body == null || inner == null) {
      return;
    }
    body.style.height = open ? `${inner.scrollHeight}px` : '0px';
  }, [open, technique]);

  useLoop(() => setOpen(v => !v), 2600);

  const content = (
    <VStack gap={1}>
      <Text type="supporting" color="secondary">
        Astryx ships nine duration tokens and one easing token.
      </Text>
      <Text type="supporting" color="secondary">
        Nine surfaces disclose content, using three different techniques.
      </Text>
    </VStack>
  );

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{all: 'unset', cursor: 'pointer', width: '100%'}}>
        <HStack gap={1.5} vAlign="center">
          <span
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>
            <Text color="secondary">›</Text>
          </span>
          <Text weight="semibold">{title}</Text>
        </HStack>
      </button>
      {technique === 'grid' ? (
        <div data-open={open} className={styles.gridBody}>
          <div>
            <div style={{paddingBlockStart: 6}}>{content}</div>
          </div>
        </div>
      ) : (
        <div ref={bodyRef} className={styles.heightBody}>
          <div ref={innerRef} style={{paddingBlockStart: 6}}>
            {technique === 'offset' ? (
              <div data-open={open} className={styles.offsetFade}>
                {content}
              </div>
            ) : (
              content
            )}
          </div>
        </div>
      )}
      <Hint>
        {technique === 'grid'
          ? 'No measurement needed, and it survives content changing mid-transition. Cannot be used on a table row, which is why this may not be the single winner.'
          : technique === 'height'
            ? 'Needs a scrollHeight measurement on every open, so streaming content fights it. Works anywhere, including a table row.'
            : 'Height plus a delayed content fade. The newest component uses this, and it is the only one that does.'}
      </Hint>
    </VStack>
  );
}

// --- sidenav rail ------------------------------------------------------------

const RAIL_ITEMS = ['Home', 'Projects', 'Components', 'Tokens', 'Settings'];

function RailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden {...props}>
      <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}

/**
 * The real AppShell and SideNav, collapsing on a loop through SideNav's own
 * controlled `collapsible` config. Today the rail snaps between its widths.
 * The fix animates the rail's width (the lab's reveal duration and entry
 * curve, decelerating), so the content,
 * AppShell's flex sibling, follows the rail edge in the same frame with no
 * script per frame, and the page is anchored to the rail edge rather than
 * centered in its own widening space, so it never re-centers. Reduce Motion
 * (the OS setting, or the lab's) snaps.
 */
export function RailRig({mode}: {mode: Mode}) {
  const [collapsed, setCollapsed] = useState(false);
  useLoop(() => setCollapsed(v => !v), 2800);
  const isFix = mode === 'after';

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      {/* A demo, not part of the page: inert keeps its shell's main landmark,
          skip link and items out of the page's accessibility tree and tab
          order. */}
      <div inert {...stylex.props(sx.shellFrame)}>
        <AppShell
          height="fill"
          xstyle={sx.shellFill}
          sideNav={
            <SideNav
              collapsible={{
                isCollapsed: collapsed,
                onCollapsedChange: setCollapsed,
              }}
              xstyle={isFix ? sx.railWidth : undefined}>
              <SideNavSection title="Pages" isHeaderHidden>
                {RAIL_ITEMS.map((item, index) => (
                  <SideNavItem
                    key={item}
                    label={item}
                    icon={RailIcon}
                    isSelected={index === 1}
                  />
                ))}
              </SideNavSection>
            </SideNav>
          }>
          <div {...stylex.props(isFix ? sx.pageAnchored : sx.pageCentered)}>
            <VStack gap={1}>
              <Text weight="semibold">Projects</Text>
              <Text type="supporting" color="secondary">
                The page beside the rail.
              </Text>
            </VStack>
          </div>
        </AppShell>
      </div>
      <Hint>
        {isFix
          ? 'The rail\u2019s width animates on the lab\u2019s collapse-and-expand duration and decelerating curve. The content is AppShell\u2019s flex sibling, so its edge follows the rail in the same frame, and the page is anchored to that edge, so it moves with the rail instead of half as far. Reduce Motion snaps.'
          : 'Today: the real SideNav snaps between its widths, so the page beside it jumps.'}
      </Hint>
    </VStack>
  );
}

// --- skeleton -> content -----------------------------------------------------

// The skeleton stays up long enough to read as a loading state: a 420 ms
// flash in a 3 s loop looked like static content with a blink, so the swap
// itself was easy to miss.
const SKELETON_MS = 1400;
const SKELETON_LOOP_MS = 3600;

export function SkeletonSwapRig({mode}: {mode: Mode}) {
  const [loaded, setLoaded] = useState(false);
  const arrivalRef = useRef<number | undefined>(undefined);
  useLoop(() => {
    window.clearTimeout(arrivalRef.current);
    setLoaded(false);
    arrivalRef.current = window.setTimeout(() => setLoaded(true), SKELETON_MS);
  }, SKELETON_LOOP_MS);
  useEffect(() => () => window.clearTimeout(arrivalRef.current), []);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div
        data-loaded={loaded}
        className={`${styles.swap} ${mode === 'before' ? styles.swapHard : ''}`}>
        <div className={styles.swapContent}>
          <VStack gap={1}>
            <Text weight="semibold">Astryx Motion</Text>
            <Text type="supporting" color="secondary">
              48 of 104 core components animate something.
            </Text>
            <Text type="supporting" color="secondary">
              Audited against core@0.5.0.
            </Text>
          </VStack>
        </div>
        <div className={styles.swapSkeleton}>
          <VStack gap={1.5}>
            <Skeleton width="70%" height={12} />
            <Skeleton width="90%" height={12} />
            <Skeleton width="55%" height={12} />
          </VStack>
        </div>
      </div>
      <Hint>
        {mode === 'before'
          ? 'Content hard-swaps the instant it arrives, at a moment the user cannot predict.'
          : 'Skeleton fades out while content fades in, overlapping just enough that the box is never empty.'}
      </Hint>
    </VStack>
  );
}

// --- chips -------------------------------------------------------------------

const CHIP_POOL = ['design', 'motion', 'tokens', 'a11y', 'core', 'docs'];

export function ChipRig({mode}: {mode: Mode}) {
  const [chips, setChips] = useState(() => CHIP_POOL.slice(0, 3));
  const [leaving, setLeaving] = useState<string | null>(null);
  const {scaledMs} = useMotionLab();

  const remove = useCallback(
    (name: string) => {
      if (mode === 'before') {
        setChips(cs => cs.filter(c => c !== name));
        return;
      }
      setLeaving(name);
      window.setTimeout(
        () => {
          setChips(cs => cs.filter(c => c !== name));
          setLeaving(null);
        },
        scaledMs('--duration-exit') + 30,
      );
    },
    [mode, scaledMs],
  );

  useLoop(() => {
    setChips(cs => {
      if (cs.length >= 5) {
        return CHIP_POOL.slice(0, 3);
      }
      const next = CHIP_POOL.find(c => !cs.includes(c));
      return next == null ? cs : [...cs, next];
    });
  }, 1800);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <HStack gap={1.5} wrap="wrap" style={{minHeight: 62}}>
        {chips.map(name => (
          <span
            key={name}
            className={
              mode === 'after'
                ? leaving === name
                  ? styles.leave
                  : styles.enter
                : undefined
            }>
            <Token label={name} onRemove={() => remove(name)} />
          </span>
        ))}
      </HStack>
      <Hint>
        {mode === 'before'
          ? 'Chips appear and disappear on a frame. The canonical scale-in case, unanimated.'
          : 'Scale-in with opacity; removal accelerates away and the neighbours close the gap.'}
      </Hint>
    </VStack>
  );
}

// --- compositor: Outline marker ----------------------------------------------

const OUTLINE_ITEMS = [
  'Overview',
  'Where motion stands',
  'Semantic tokens',
  'The rubric',
  'Library compatibility',
  'Risks',
];

export function OutlineMarkerRig({mode}: {mode: Mode}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[index];
    const marker = markerRef.current;
    if (list == null || item == null || marker == null) {
      return;
    }
    const r = item.getBoundingClientRect();
    const p = list.getBoundingClientRect();
    if (mode === 'before') {
      marker.style.top = `${r.top - p.top}px`;
      marker.style.height = `${r.height}px`;
    } else {
      marker.style.transform = `translateY(${r.top - p.top}px) scaleY(${r.height})`;
    }
  }, [index, mode]);

  useLoop(() => setIndex(i => (i + 1) % OUTLINE_ITEMS.length), 1700);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div ref={listRef} {...stylex.props(sx.outlineList)}>
        <span
          ref={markerRef}
          className={`${styles.marker} ${mode === 'before' ? styles.markerLayout : styles.markerComposited}`}
        />
        {OUTLINE_ITEMS.map((item, i) => (
          <button
            key={item}
            ref={el => {
              itemRefs.current[i] = el;
            }}
            type="button"
            onClick={() => setIndex(i)}
            {...stylex.props(sx.outlineItem, i === index && sx.outlineItemOn)}>
            <Text type="supporting">{item}</Text>
          </button>
        ))}
      </div>
      <Hint>
        {mode === 'before'
          ? 'Animates top and height, so every frame runs layout, paint and composite for the whole list.'
          : 'Animates transform only, using scaleY on a 1px marker. Compositor-only, so the list never re-lays-out.'}
      </Hint>
    </VStack>
  );
}

// --- interruptibility --------------------------------------------------------

export function InterruptRig({mode}: {mode: Mode}) {
  const [, setOut] = useState(false);
  const ballRef = useRef<HTMLSpanElement | null>(null);

  const toggle = useCallback(() => {
    setOut(prev => {
      const next = !prev;
      const ball = ballRef.current;
      if (ball != null && mode === 'before') {
        // A keyframe cannot retarget: restarting it is the whole finding.
        ball.classList.remove(styles.ballGo, styles.ballBack);
        void ball.offsetWidth;
        ball.classList.add(next ? styles.ballGo : styles.ballBack);
      } else if (ball != null) {
        ball.style.transform = next ? 'translateX(170px)' : 'translateX(0)';
      }
      return next;
    });
  }, [mode]);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div
        className={`${styles.stage} ${styles.stageStart}`}
        style={{minHeight: 96}}>
        <span
          ref={ballRef}
          style={{['--ball-distance' as string]: '170px'}}
          className={`${styles.ball} ${mode === 'before' ? styles.ballKeyframe : styles.ballTransition}`}
        />
      </div>
      <Button
        size="sm"
        variant="secondary"
        label="Toggle — press it twice, fast"
        onClick={toggle}
      />
      <Hint>
        {mode === 'before'
          ? 'A keyframe restarts from zero. Interrupt it mid-flight and the box teleports back to the start before running again.'
          : 'A transition retargets from wherever the box currently is, so an interruption is continuous. Springs behave the same way and also carry velocity through.'}
      </Hint>
    </VStack>
  );
}

// --- origin ------------------------------------------------------------------

export function OriginRig({kind}: {kind: 'zero' | 'centre' | 'anchored'}) {
  const [open, setOpen] = useState(false);
  useLoop(() => {
    setOpen(false);
    window.setTimeout(() => setOpen(true), 60);
  }, 2200);

  const cls =
    kind === 'zero'
      ? styles.originZero
      : kind === 'centre'
        ? styles.originCentre
        : styles.originAnchored;

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div
        className={`${styles.stage} ${styles.stageBlock}`}
        style={{minHeight: 132}}>
        <div
          style={{
            position: 'absolute',
            insetInlineStart: 14,
            insetBlockStart: 14,
          }}>
          <Button
            size="sm"
            variant="secondary"
            label="Trigger"
            onClick={() => setOpen(v => !v)}
          />
        </div>
        <div
          data-open={open}
          className={`${styles.originSurface} ${cls}`}
          style={{insetInlineStart: 14, insetBlockStart: 56}}>
          <Text type="supporting">
            {kind === 'zero'
              ? 'scale(0) — appears from nothing'
              : kind === 'centre'
                ? 'Scales from its own centre'
                : 'Scales from the trigger corner'}
          </Text>
        </div>
      </div>
      <Hint>
        {kind === 'zero'
          ? 'Nothing in the real world appears from nothing. Start from 0.9–0.97 with opacity instead.'
          : kind === 'centre'
            ? 'Right scale value, wrong origin: the surface grows out of its own middle rather than out of the control that opened it.'
            : 'Anchored to the trigger corner, which is what the published page already asks for.'}
      </Hint>
    </VStack>
  );
}

// --- progress fill -----------------------------------------------------------

/** The values a fast upload might report, one per tick. */
const FILL_STEPS = [12, 58, 34, 86] as const;

/**
 * The determinate fill on a data change. Before is the real ProgressBar,
 * which transitions `width` (a layout property, every frame of every tick).
 * After is a sandbox copy of its track and fill that moves the same fill with
 * `transform: scaleX()` on the same token and curve, so only the technique
 * differs. It carries ProgressBar's theming targets (root, track and fill),
 * so the theme paints it as it paints the real bar.
 */
export function ProgressFillRig({mode}: {mode: Mode}) {
  const [step, setStep] = useState(0);
  useLoop(() => setStep(current => (current + 1) % FILL_STEPS.length), 1600);
  const value = FILL_STEPS[step];

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      {mode === 'before' ? (
        <ProgressBar label="Uploading" value={value} hasValueLabel />
      ) : (
        <div {...themeProps('progress-bar', {variant: 'accent'})}>
          <VStack gap={1}>
            <HStack gap={2} hAlign="between">
              <Text>Uploading</Text>
              <Text color="secondary">{value}%</Text>
            </HStack>
            <div
              {...themeProps('progress-bar-track')}
              className={`astryx-progress-bar-track ${styles.fillTrack}`}
              role="progressbar"
              aria-label="Uploading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}>
              <div
                {...themeProps('progress-bar-fill', {variant: 'accent'})}
                className={`astryx-progress-bar-fill ${styles.fillScale}`}
                style={{transform: `scaleX(${value / 100})`}}
              />
            </div>
          </VStack>
        </div>
      )}
      <Hint>
        {mode === 'before'
          ? 'Width is a layout property: every frame of every tick re-lays out the bar. A fast upload ticks often enough to behave like a layout loop.'
          : 'The same fill on transform: scaleX, so it runs on the compositor. The cost shows at the ends: the rounded caps squash at small values, which is why this needs an exception or a different structure before it ships.'}
      </Hint>
    </VStack>
  );
}

// --- loops -------------------------------------------------------------------

export function LoopRig({policy}: {policy: 'today' | 'delete' | 'degrade'}) {
  const stopped = policy !== 'today';
  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <HStack gap={4} vAlign="center">
        <span
          className={styles.spinner}
          style={{
            ['--loop-duration' as string]: policy === 'today' ? '3s' : '975ms',
            animationPlayState: stopped ? 'paused' : 'running',
            ...(policy === 'delete' ? {animation: 'none'} : null),
            ...(policy === 'degrade' ? {animation: 'none'} : null),
          }}
        />
        <span
          className={styles.pulseDot}
          style={{
            ['--loop-duration' as string]: policy === 'today' ? '3s' : '2s',
            ...(stopped ? {animation: 'none'} : null),
          }}
        />
        <span style={{flex: 1, minWidth: 90}}>
          <span className={styles.progressTrack}>
            <span
              className={styles.progressFillTransform}
              style={{
                ['--loop-duration' as string]:
                  policy === 'today' ? '3s' : '1.4s',
                ...(stopped ? {animation: 'none', width: '62%'} : null),
              }}
            />
          </span>
        </span>
      </HStack>
      <Hint>
        {policy === 'today'
          ? 'Today the loop slows to 3s rather than stopping. Slower vestibular motion is still vestibular motion, and it reads as a hung interface.'
          : policy === 'delete'
            ? 'Delete: every loop stops. What the published page instructs — and a spinner that does not spin says nothing at all unless it is replaced with a determinate state.'
            : 'Degrade: loops stop and are replaced with a static determinate state. Opacity and colour feedback survive; movement does not.'}
      </Hint>
    </VStack>
  );
}

// --- table tint (the 150ms rows) ---------------------------------------------

export function TintRig({mode}: {mode: Mode}) {
  return (
    <VStack gap={1} {...stylex.props(sx.full)}>
      {['Row one', 'Row two', 'Row three'].map(row => (
        <div
          key={row}
          className={styles.tintRow}
          style={
            mode === 'after'
              ? {
                  ['--tint-duration' as string]: 'var(--lab-duration-state)',
                  ['--tint-ease' as string]: 'var(--ease-state)',
                }
              : undefined
          }>
          <Text type="supporting">{row}</Text>
        </div>
      ))}
      <Hint>
        {mode === 'before'
          ? 'Hardcoded 150ms with the CSS default curve.'
          : 'The state token, at 175ms with --ease-state.'}
      </Hint>
    </VStack>
  );
}

// --- nav item hover tint ----------------------------------------------------

const NAV_ITEMS = ['Overview', 'Projects', 'Settings'];
const FINE_HOVER = '(hover: hover) and (pointer: fine)';

/** Whether this device hovers with a fine pointer, as the gate reads it. */
function useFineHover(): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia(FINE_HOVER);
    setMatches(query.matches);
    const update = () => setMatches(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return matches;
}

/**
 * NavItem's hover tint. Before: today's item, which tints at once wherever
 * the device hovers, as shipped nav items paint it. After: the tint
 * fades on Astryx's state token (`--duration-fast`, whatever the theme sets,
 * on the shipped `--ease-standard` curve), and only where the device hovers
 * with a fine pointer, so a tap leaves no tint behind.
 */
export function NavTintRig({mode}: {mode: Mode}) {
  const {speed, reducedMotion} = useMotionLab();
  const isFineHover = useFineHover();
  const after =
    mode === 'after'
      ? {
          // The system token, stretched by the rail's slow motion; the
          // Delete policy removes the fade, Degrade keeps it (colour is not
          // movement).
          ['--tint-duration' as string]:
            reducedMotion === 'delete'
              ? '0ms'
              : `calc(var(--duration-fast) * ${speed})`,
          ['--tint-ease' as string]: 'var(--ease-standard-today)',
        }
      : {['--tint-duration' as string]: '0ms'};
  return (
    <VStack gap={1} {...stylex.props(sx.full)}>
      {NAV_ITEMS.map(item => (
        <div
          key={item}
          className={mode === 'after' ? styles.navTintFine : styles.navTint}
          style={after}>
          <Text type="supporting">{item}</Text>
        </div>
      ))}
      <Hint>
        {mode === 'before'
          ? 'Today: the tint snaps on at once wherever the device hovers.'
          : "The theme's state token (--duration-fast on --ease-standard), only on a fine pointer that hovers."}
      </Hint>
      {mode === 'after' && isFineHover != null && (
        <Hint>
          {isFineHover
            ? 'This device hovers with a fine pointer: the tint is on.'
            : 'This device has no fine hover: a tap leaves no tint.'}
        </Hint>
      )}
    </VStack>
  );
}

// --- press / library compatibility -------------------------------------------

export function PressRig({
  technique,
}: {
  technique: 'transform' | 'scale' | 'none';
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const raf = useRef<number | null>(null);

  const simulateLibraryDrag = useCallback(() => {
    const el = ref.current;
    if (el == null) {
      return;
    }
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
    }
    const start = performance.now();
    const step = (now: number) => {
      const k = (now - start) / 900;
      if (k >= 1) {
        el.style.removeProperty('transform');
        return;
      }
      // What a motion library does: writes transform on every frame.
      el.style.transform = `translateX(${Math.sin(k * Math.PI * 2) * 40}px)`;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
      }
    },
    [],
  );

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <span
          ref={ref}
          className={
            technique === 'transform'
              ? styles.pressTransform
              : technique === 'scale'
                ? styles.pressScale
                : undefined
          }
          style={{display: 'inline-flex'}}>
          <Button
            variant="secondary"
            label={
              technique === 'transform'
                ? 'transition: transform'
                : technique === 'scale'
                  ? 'transition: scale'
                  : 'no transition'
            }
          />
        </span>
        <Button
          size="sm"
          variant="ghost"
          label="Simulate a library drag"
          onClick={simulateLibraryDrag}
        />
      </HStack>
      <Hint>
        {technique === 'transform'
          ? 'Press it, then run the drag. The CSS transition re-eases every transform the library writes, so the drag lags the pointer and a spring never settles.'
          : technique === 'scale'
            ? 'Press feedback on the independent scale property, so it no longer collides with the library\u2019s transform writes. Both work — this is the middle path worth prototyping.'
            : 'No press feedback at all. The library is happy, and every consumer who never installs one loses the affordance.'}
      </Hint>
    </VStack>
  );
}

// --- misc small rigs ---------------------------------------------------------

export function CheckTickRig({
  technique,
}: {
  technique: 'hard' | 'draw' | 'scale';
}) {
  const [checked, setChecked] = useState(false);
  useLoop(() => setChecked(v => !v), 2000);

  // The "today" pane is the real component. Core's CheckboxInput tints its box
  // and border on change and the tick simply appears; drawing that by hand
  // would be asserting the finding rather than showing it. The other two are
  // hand-built because they are the proposals — core has no drawn or scaled
  // tick to demonstrate.
  if (technique === 'hard') {
    return (
      <HStack gap={2} vAlign="center">
        <CheckboxInput
          label="Real CheckboxInput"
          isLabelHidden
          value={checked}
          onChange={setChecked}
        />
        <Text type="supporting" color="secondary">
          Real CheckboxInput — the tick appears instantly
        </Text>
      </HStack>
    );
  }

  const cls = technique === 'draw' ? styles.checkDraw : styles.checkScale;

  return (
    <HStack gap={2} vAlign="center">
      <button
        type="button"
        aria-pressed={checked}
        data-checked={checked}
        onClick={() => setChecked(v => !v)}
        {...stylex.props(sx.checkBox, checked && sx.checkBoxOn)}
        className={cls}>
        <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden>
          <path d="M3 8.5l3.2 3.2L13 4.8" className={styles.checkTick} />
        </svg>
      </button>
      <Text type="supporting" color="secondary">
        {technique === 'draw' ? 'Draws along its path' : 'Scales in'}
      </Text>
    </HStack>
  );
}

export function StatCountRig({mode}: {mode: Mode}) {
  const [value, setValue] = useState(1247);
  const raf = useRef<number | null>(null);
  const {scaledMs, rawToken} = useMotionLab();

  const to = useCallback(
    (target: number) => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
      }
      if (mode === 'before') {
        setValue(target);
        return;
      }
      const from = value;
      const duration = scaledMs('--duration-reveal');
      const start = performance.now();
      const ease = rawToken('--ease-move');
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / duration);
        // Simple ease-out sample; the curve token is shown for parity with CSS.
        const eased = 1 - Math.pow(1 - k, 3);
        setValue(Math.round(from + (target - from) * eased));
        if (k < 1) {
          raf.current = requestAnimationFrame(step);
        }
      };
      void ease;
      raf.current = requestAnimationFrame(step);
    },
    [mode, rawToken, scaledMs, value],
  );

  useLoop(() => to(Math.floor(200 + Math.random() * 9000)), 2600);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <span {...stylex.props(sx.statValue)}>{value.toLocaleString()}</span>
      <Hint>
        {mode === 'before'
          ? 'The number replaces itself, so a change of 4 and a change of 4,000 look identical.'
          : 'Counts to the new value. Needs a delta threshold so a jump from 12 to 1,300,000 does not spin for a second.'}
      </Hint>
    </VStack>
  );
}

export function ListReorderRig({mode}: {mode: Mode}) {
  const [items, setItems] = useState([0, 1, 2, 3]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const {scaledMs, rawToken} = useMotionLab();

  const shuffle = useCallback(() => {
    const list = listRef.current;
    const before = new Map<Element, DOMRect>();
    if (list != null && mode === 'after') {
      for (const child of Array.from(list.children)) {
        before.set(child, child.getBoundingClientRect());
      }
    }
    setItems(prev => [...prev].sort(() => Math.random() - 0.5));
    if (list == null || mode !== 'after') {
      return;
    }
    // FLIP: measure, move, invert, play.
    requestAnimationFrame(() => {
      for (const child of Array.from(list.children)) {
        const first = before.get(child);
        if (first == null) {
          continue;
        }
        const last = child.getBoundingClientRect();
        const dy = first.top - last.top;
        if (dy === 0) {
          continue;
        }
        child.animate(
          [{transform: `translateY(${dy}px)`}, {transform: 'none'}],
          {
            duration: scaledMs('--duration-reveal'),
            easing: rawToken('--ease-move'),
          },
        );
      }
    });
  }, [mode, rawToken, scaledMs]);

  useLoop(shuffle, 2600);

  return (
    <VStack gap={2} {...stylex.props(sx.full)}>
      <div
        ref={listRef}
        style={{display: 'flex', flexDirection: 'column', gap: 6}}>
        {items.map(n => (
          <span key={n} {...stylex.props(sx.listRow)}>
            <span
              {...stylex.props(sx.swatch)}
              style={{backgroundColor: `hsl(${200 + n * 34} 55% 55%)`}}
            />
            <Text type="supporting">Item {n + 1}</Text>
          </span>
        ))}
      </div>
      <Hint>
        {mode === 'before'
          ? 'Reorder is instant, so the user has to re-read the list to find out what changed.'
          : 'FLIP: measure, move, invert, play. Rows travel on --ease-move, so a change the user did not initiate stays followable.'}
      </Hint>
    </VStack>
  );
}
