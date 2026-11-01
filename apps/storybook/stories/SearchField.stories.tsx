// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {SearchField, type SearchFieldHandle} from '@astryxdesign/lab';
import {useTouchPresentation} from '@astryxdesign/core/utils/touchPresentation';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof SearchField> = {
  title: 'Lab/SearchField',
  component: SearchField,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SearchField>;

// =============================================================================
// A screen like the one UIKit's captures were taken on: a large title, the
// field under it, results below
// =============================================================================

const FRUITS = [
  'Apple',
  'Apricot',
  'Banana',
  'Blueberry',
  'Cherry',
  'Grapefruit',
  'Mango',
  'Orange',
  'Peach',
  'Pear',
  'Plum',
  'Raspberry',
  'Strawberry',
  'Watermelon',
];

const page: React.CSSProperties = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  paddingTop: 8,
  fontFamily: 'system-ui, sans-serif',
};
const largeTitle: React.CSSProperties = {
  margin: 0,
  padding: '4px 16px 8px',
  fontSize: 34,
  fontWeight: 700,
  lineHeight: '41px',
};
const list: React.CSSProperties = {
  listStyle: 'none',
  margin: '8px 0 0',
  padding: 0,
};
const row: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid rgba(127, 127, 127, 0.2)',
  fontSize: 17,
};

// UIKit's activation clock and curve, as Core's UIKit tables hold them
// (`search.activationMs` and the `timing.curves.move` role). A story uses no
// Core motion source (architecture:react-component-runtime INV13), so it
// restates them and plays them with the Web Animations API.
const ACTIVATION_MS = 383.3;
const MOVE_EASING = 'cubic-bezier(0.42, 0, 0.58, 1)';
/** Keyframes per curve for the title's fade, which is not a bezier. */
const FADE_STEPS = 40;

/**
 * The large title's opacity at the activation's progress `a` (1 = active),
 * as UIKit fades it: (1 − a / 0.35)² on activation; on cancel it comes back
 * from a = 0.35, that is p = 0.65 of the cancel.
 */
function titleOpacity(a: number, activating: boolean): number {
  return activating
    ? Math.max(0, 1 - a / 0.35) ** 2
    : Math.min(1, Math.max(0, (1 - a - 0.65) / 0.35));
}

/**
 * A cancelled animation's `ready` or `finished` rejects with an AbortError: a
 * change of mind or an unmount stopped it, and the host expects that. Any
 * other rejection is a real error.
 */
function unlessAborted(error: unknown): void {
  if (!(error instanceof DOMException && error.name === 'AbortError')) {
    throw error;
  }
}

/**
 * The host's half of a lift, as a navigation bar does it (NavigationStack
 * runs the real one): the content rises with the field by `lift` on the
 * field's clock, and the large title fades as UIKit's does. Placed at once
 * under a mouse, as the field is. Each animation starts at the field's own
 * start time, so the two move as one; a change of mind adds the change
 * between the targets on top of the motion on screen, as the field does.
 */
function useLiftedHost(
  isActive: boolean,
  lift: number,
  fieldRef: React.RefObject<HTMLDivElement | null>,
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const {isTouch} = useTouchPresentation();
  const settled = useRef<boolean | null>(null);
  const running = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const content = contentRef.current;
    const title = titleRef.current;
    if (content == null || title == null) {
      return;
    }
    const target = isActive && lift > 0;
    const y = target ? -lift : 0;
    const place = () => {
      for (const animation of running.current) {
        animation.cancel();
      }
      running.current = [];
      content.style.translate = `0px ${y}px`;
      title.style.opacity = String(target ? 0 : 1);
    };
    // Placed at once under a mouse, and under Reduce Motion, where the
    // field only cross-fades.
    const reduced =
      content.ownerDocument.defaultView?.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches ?? false;
    if (settled.current === null || !isTouch || lift === 0 || reduced) {
      settled.current = target;
      place();
      return;
    }
    if (settled.current === target) {
      return;
    }
    settled.current = target;
    // From rest, the curves replace what is there; mid-flight they add the
    // change between the targets to the motion on screen. Either way the
    // content's shape is linear in the eased progress p, and the title's
    // value is its fade at p, so both play on the field's easing.
    const additive = running.current.length > 0;
    // The previous target: rest when activating, the lift when cancelling.
    const fromY = target ? 0 : -lift;
    const fade = Array.from({length: FADE_STEPS + 1}, (_, k) => {
      const p = k / FADE_STEPS;
      const value = titleOpacity(target ? p : 1 - p, target);
      return {
        offset: p,
        opacity: additive
          ? value - titleOpacity(target ? 0 : 1, target)
          : value,
      };
    });
    const timing: KeyframeAnimationOptions = {
      duration: ACTIVATION_MS,
      easing: MOVE_EASING,
      fill: 'forwards',
      composite: additive ? 'add' : 'replace',
    };
    const added = [
      content.animate(
        additive
          ? [{translate: '0px 0px'}, {translate: `0px ${y - fromY}px`}]
          : [{translate: `0px ${fromY}px`}, {translate: `0px ${y}px`}],
        timing,
      ),
      title.animate(fade, timing),
    ];
    running.current = [...running.current, ...added];
    // Start on the field's clock. The field starts its motion from the frame
    // that presents it at rest, after this commit, so the story's curves wait
    // (paused at their start) for the field root's new animation and take its
    // start time.
    const before = new Set(fieldRef.current?.getAnimations() ?? []);
    for (const animation of added) {
      animation.pause();
    }
    let frames = 0;
    const startWithField = () => {
      const field = fieldRef.current
        ?.getAnimations()
        .find(animation => !before.has(animation));
      if (field == null) {
        frames += 1;
        if (frames > 30) {
          for (const animation of added) {
            animation.play();
          }
        } else {
          requestAnimationFrame(startWithField);
        }
        return;
      }
      const align = () => {
        for (const animation of added) {
          animation.startTime = field.startTime;
        }
      };
      if (field.startTime != null) {
        align();
      } else {
        void field.ready.then(align, unlessAborted);
      }
    };
    requestAnimationFrame(startWithField);
    let cancelled = false;
    void Promise.all(added.map(animation => animation.finished)).then(() => {
      if (
        !cancelled &&
        running.current.every(a => a.playState === 'finished')
      ) {
        place();
      }
    }, unlessAborted);
    return () => {
      cancelled = true;
    };
  }, [isActive, lift, isTouch, fieldRef]);
  return {contentRef, titleRef};
}

function Screen({
  lift = 0,
  initialQuery = '',
  initiallyActive = false,
  dir,
}: {
  lift?: number;
  initialQuery?: string;
  initiallyActive?: boolean;
  dir?: 'rtl';
}) {
  const [query, setQuery] = useState(initialQuery);
  const [isActive, setIsActive] = useState(initiallyActive);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const results = FRUITS.filter(fruit =>
    fruit.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const fieldRef = useRef<HTMLDivElement>(null);
  const {contentRef, titleRef} = useLiftedHost(isActive, lift, fieldRef);
  return (
    <div style={page} dir={dir}>
      <h1 ref={titleRef} style={largeTitle}>
        Search
      </h1>
      <SearchField
        ref={fieldRef}
        label="Search"
        placeholder="Fruits"
        value={query}
        onChange={setQuery}
        isActive={isActive}
        onActiveChange={setIsActive}
        onSubmit={setSubmitted}
        lift={lift}
      />
      <div ref={contentRef} data-search-story-content="">
        <ul style={list} aria-label="Results">
          {results.map(fruit => (
            <li key={fruit} style={row}>
              {fruit}
            </li>
          ))}
        </ul>
        <p
          data-testid="search-state"
          style={{padding: '0 16px', fontSize: 13, opacity: 0.6}}>
          {isActive ? 'active' : 'inactive'}
          {submitted != null ? ` · submitted "${submitted}"` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * The stacked field under a large title. A tap activates it: the field
 * narrows and the glass close button slides in, on UIKit's 383 ms curve.
 */
export const Default: Story = {
  render: () => <Screen />,
};

/**
 * Active from the start, with a query: the clear button inside the field and
 * the close button beside it.
 */
export const ActiveWithQuery: Story = {
  render: () => <Screen initiallyActive initialQuery="ap" />,
};

/**
 * Lifted as a navigation bar lifts it: the active field rises over the large
 * title (its 53 px here; 99 px from under the title to the bar's row on an
 * iPhone 17 Pro) and the results rise with it, while the title fades. The
 * screen stands in for the bar here (NavigationStack runs the real one), on
 * the field's clock and UIKit's measured title fade.
 */
export const Lifted: Story = {
  render: () => <Screen lift={53} />,
};

/** Right to left: the field narrows from the left; the close button slides in from there. */
export const RightToLeft: Story = {
  render: () => <Screen dir="rtl" />,
};

// The bottom placement's bar: kept at the bottom of the viewport, the field's
// bottom 33 px above it, as iOS 26's toolbar holds its search field.
const bottomBar: React.CSSProperties = {
  position: 'fixed',
  insetInline: 0,
  bottom: 33,
};

function BottomScreen({dir}: {dir?: 'rtl'}) {
  const [query, setQuery] = useState('');
  const [isActive, setIsActive] = useState(false);
  const results = FRUITS.filter(fruit =>
    fruit.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div style={{...page, paddingBottom: 104}} dir={dir}>
      <h1 style={largeTitle}>Search</h1>
      <ul style={list} aria-label="Results">
        {results.map(fruit => (
          <li key={fruit} style={row}>
            {fruit}
          </li>
        ))}
      </ul>
      <p
        data-testid="search-state"
        style={{padding: '0 16px', fontSize: 13, opacity: 0.6}}>
        {isActive ? 'active' : 'inactive'}
      </p>
      <div style={bottomBar}>
        <SearchField
          label="Search"
          placeholder="Fruits"
          placement="bottom"
          value={query}
          onChange={setQuery}
          isActive={isActive}
          onActiveChange={setIsActive}
        />
      </div>
    </div>
  );
}

/**
 * iOS 26's toolbar field at the bottom of the screen. A tap activates it: it
 * keeps above the keyboard (its centre 36 px above the keyboard's top),
 * swells, narrows past its place and grows a 38 px glass close button in
 * beside it; cancelling springs it back out to rest as the keyboard goes
 * down.
 */
export const Bottom: Story = {
  render: () => <BottomScreen />,
};

/** The bottom field right to left: it narrows from the left. */
export const BottomRightToLeft: Story = {
  render: () => <BottomScreen dir="rtl" />,
};

// A tab bar's search tab draws the field's glass and its cancel button (its
// search circle) and moves them above the keyboard; here a plain box and
// button stand in for them, in a bar kept at the bottom of the viewport.
const TAB_BAR_BOTTOM = 33;
const tabBar: React.CSSProperties = {
  position: 'fixed',
  insetInline: 0,
  height: 48,
};
const tabGlass: React.CSSProperties = {
  position: 'absolute',
  insetInlineStart: 8,
  top: 0,
  width: 330,
  height: 48,
  borderRadius: 24,
  background: 'rgba(127, 127, 127, 0.14)',
};
const tabCircle: React.CSSProperties = {
  position: 'absolute',
  insetInlineEnd: 8,
  top: 0,
  width: 48,
  height: 48,
  borderRadius: 24,
  border: 0,
  background: 'rgba(127, 127, 127, 0.14)',
  fontSize: 20,
};

/**
 * The stand-in bar keeps above the software keyboard as a tab bar keeps its
 * search field: by layout, its centre 36 px above the keyboard's top while
 * the keyboard is up (the keyboard's height as spec:AST-099 FR2 defines it:
 * Mobile Safari's cover; 0 where the page has the VirtualKeyboard API),
 * committed on each report with no ride, as a Lab surface does (FR8).
 */
function useStandInTabBarLift() {
  const ref = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  const shown = useRef(0);
  useLayoutEffect(() => {
    shown.current = lift;
  }, [lift]);
  useEffect(() => {
    const element = ref.current;
    const win = element?.ownerDocument.defaultView;
    if (element == null || win == null) {
      return undefined;
    }
    const read = () => {
      const viewport = win.visualViewport;
      const inset =
        viewport == null ||
        'virtualKeyboard' in win.navigator ||
        win !== win.top
          ? 0
          : Math.max(
              0,
              win.innerHeight - viewport.height * (viewport.scale ?? 1),
            );
      const rect = element.getBoundingClientRect();
      // Where layout puts the bar without the lift.
      const restGap =
        win.innerHeight - (rect.top + shown.current + rect.height / 2);
      setLift(inset > 0 ? Math.max(0, inset + 36 - restGap) : 0);
    };
    read();
    win.visualViewport?.addEventListener('resize', read);
    win.addEventListener('resize', read);
    return () => {
      win.visualViewport?.removeEventListener('resize', read);
      win.removeEventListener('resize', read);
    };
  }, []);
  return {ref, lift};
}

function TabScreen() {
  const handle = useRef<SearchFieldHandle>(null);
  const [query, setQuery] = useState('');
  const [isActive, setIsActive] = useState(false);
  const bar = useStandInTabBarLift();
  return (
    <div style={{...page, paddingBottom: 104}}>
      <h1 style={largeTitle}>Search</h1>
      <p
        data-testid="search-state"
        style={{padding: '0 16px', fontSize: 13, opacity: 0.6}}>
        {isActive ? 'active' : 'inactive'}
      </p>
      <div
        ref={bar.ref}
        style={{...tabBar, bottom: TAB_BAR_BOTTOM + bar.lift}}
        data-search-story-tab-bar="">
        <div style={tabGlass}>
          <SearchField
            label="Search"
            placeholder="Fruits"
            placement="tab"
            handleRef={handle}
            value={query}
            onChange={setQuery}
            isActive={isActive}
            onActiveChange={setIsActive}
          />
        </div>
        <button
          type="button"
          aria-label="Cancel"
          style={tabCircle}
          onClick={() => handle.current?.cancel()}>
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * The field as a tab bar's search tab holds it: content only, in the box the
 * tab bar gives it; the tab bar's own cancel button calls `cancel()`, and the
 * stand-in bar keeps above the keyboard as a tab bar does.
 */
export const InTabBar: Story = {
  render: () => <TabScreen />,
};
