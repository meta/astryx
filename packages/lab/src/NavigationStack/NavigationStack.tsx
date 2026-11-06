// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file NavigationStack.tsx
 * @input React and StyleX. Core's compositor animator and UIKit tables come
 *   from Core's internal touch entry and navigationMotion.ts. The math is in
 *   navigationTransition.ts, and the back swipes in NavigationStackTouch.ts.
 *   Each screen scrolls through Core's useScrollableArea, under Lab's scroll
 *   edge effect (internal/useScrollEdgeEffect.ts).
 * @output Exports NavigationStack, a push/pop navigator with UIKit's
 *   transitions and back gestures. NavigationScreen is one screen: its bar
 *   title, back title, end content and content. useNavigationStack pushes,
 *   pops and pops to the root from inside a screen.
 * @position Lab component (packages/lab/src/NavigationStack). It is the
 *   phone presentation of drill-down navigation, UINavigationController's
 *   counterpart.
 *
 * SYNC: When modified, update NavigationStack.doc.mjs,
 * NavigationStack.test.tsx and
 * __tests__/NavigationStack.interaction.browser.spec.ts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  focusForLastInput,
  isCoarsePointer,
  isFocusLost,
  isRtlElement,
  resolveMotion,
  solveSpring,
  toSpring,
  useInteractionModalityTracking,
  useTouchPresentation,
  type MotionEngine,
  type SpringDescription,
} from '@astryxdesign/core/internal/touch';
import {useTranslator} from '@astryxdesign/core/i18n';
import {useScrollableArea} from '@astryxdesign/core/hooks';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {Icon} from '@astryxdesign/core/Icon';
import {
  colorVars,
  focusVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  layerVelocities,
  layersAt,
  progressFromScreen,
  programmaticVelocity,
} from './navigationTransition';
import {useBackSwipes, type BackSwipeStack} from './NavigationStackTouch';
import {bars, navigation, springs} from './navigationMotion';
import {useMotionEngine} from '../internal/useMotionEngine';
import {useScrollEdgeEffect} from '../internal/useScrollEdgeEffect';

// =============================================================================
// Types
// =============================================================================

export interface NavigationScreenProps {
  /** The screen's title, shown in the bar and read first on arrival. */
  title: string;
  /**
   * What the back button reads on the screen pushed on top of this one.
   * Defaults to this screen's `title`.
   */
  backTitle?: string;
  /** Content at the end of the bar while this screen is on top. */
  endContent?: ReactNode;
  /**
   * How the title shows: in the bar (`inline`), or `large` above the
   * content. A large title scrolls with the content, as iOS's large titles
   * do. It hands over to the bar's title once it has scrolled under the bar.
   * @default 'inline'
   */
  titleDisplayMode?: 'large' | 'inline';
  /** The screen's content; it scrolls on its own. */
  children?: ReactNode;
}

export interface NavigationStackProps<T> {
  /** The root screen: a NavigationScreen. */
  root: ReactElement<NavigationScreenProps>;
  /** The entries pushed on the root, bottom first. Controlled. */
  path: ReadonlyArray<T>;
  /** Called with the new path when a push, pop or back swipe changes it. */
  onPathChange: (path: T[]) => void;
  /** Renders an entry's screen: a NavigationScreen. */
  renderScreen: (
    entry: T,
    index: number,
  ) => ReactElement<NavigationScreenProps>;
  /**
   * A stable key per entry, so a screen keeps its state while it moves down
   * the stack. Defaults to the entry's position.
   */
  getKey?: (entry: T, index: number) => string | number;
  /** Whether the back swipe pops. @default true */
  isInteractivePopEnabled?: boolean;
  /** Accessible name of the navigator region. */
  label?: string;
  'data-testid'?: string;
}

export interface NavigationStackApi<T = unknown> {
  /**
   * Pushes an entry. The control that started it (the click or key press
   * being handled, or `options.source`) gets focus back when its screen pops.
   */
  push: (entry: T, options?: {source?: Element | null}) => void;
  /** Pops the top screen; nothing at the root. */
  pop: () => void;
  /** Pops back to the root. */
  popToRoot: () => void;
  /** How many screens are pushed on the root. */
  depth: number;
}

// =============================================================================
// Context
// =============================================================================

const NavigationStackContext = createContext<NavigationStackApi | null>(null);

/** The enclosing NavigationStack's push / pop / popToRoot. */
export function useNavigationStack<T = unknown>(): NavigationStackApi<T> {
  const api = useContext(NavigationStackContext);
  if (api == null) {
    throw new Error('useNavigationStack must be used inside a NavigationStack');
  }
  return api as NavigationStackApi<T>;
}

// =============================================================================
// Styles
// =============================================================================

const BAR_HEIGHT = 44;

const styles = stylex.create({
  stack: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: colorVars['--color-background-body'],
  },
  // The bar overlays the screens, which scroll under it, as UIKit's content
  // extends under its bar.
  bar: {
    position: 'absolute',
    top: 0,
    insetInline: 0,
    isolation: 'isolate',
    height: BAR_HEIGHT,
    zIndex: 1,
  },
  // The bar's own background and hairline, under every screen's bar layer,
  // which paints its own background over it. iOS 26.2's bar paints neither:
  // under a finger the content shows through until the screen's scroll edge
  // effect veils it. The literal coarse-pointer key is the resolver's touch
  // constant. A mouse keeps both.
  barBackground: {
    position: 'absolute',
    inset: 0,
    zIndex: -2,
    backgroundColor: {
      default: colorVars['--color-background-surface'],
      '@media (pointer: coarse)': 'transparent',
    },
    borderBottomWidth: {
      default: 1,
      '@media (pointer: coarse)': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  // Each screen's bar moves with its screen, as UIKit's per-screen bar copy
  // does. Under a mouse it has an opaque background of its own
  // (barLayerBackground), so the incoming one covers the outgoing title.
  // Under a finger the bars are clear, so barClip cuts the covered bar at the
  // top card's leading edge.
  barLayer: {
    position: 'absolute',
    inset: 0,
    // Below the back button: WebKit does not promote the static siblings a
    // moving layer crosses, so the moving one goes underneath.
    zIndex: -1,
  },
  // The box that cuts the bar, moved by the stack. The row inside it moves
  // back by as much, so only the cut moves.
  barClip: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
  barRow: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    paddingInline: spacingVars['--spacing-4'],
  },
  // A layer's background, above the bar's hairline. It is clear under a
  // finger, as the bar's own background.
  barLayerBackground: {
    position: 'absolute',
    insetInline: 0,
    top: 0,
    bottom: 1,
    zIndex: -1,
    backgroundColor: {
      default: colorVars['--color-background-surface'],
      '@media (pointer: coarse)': 'transparent',
    },
  },
  // The one back button: it stays put while the bars move under it.
  backControl: {
    position: 'absolute',
    insetInlineStart: spacingVars['--spacing-4'],
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
  },
  barLayerCovered: {
    pointerEvents: 'none',
  },
  barStart: {
    display: 'flex',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  barTitle: {
    margin: 0,
    minWidth: 0,
    fontSize: textSizeVars['--font-size-lg'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  largeTitle: {
    margin: 0,
    paddingInline: spacingVars['--spacing-4'],
    paddingTop: spacingVars['--spacing-1'],
    paddingBottom: spacingVars['--spacing-2'],
    fontSize: textSizeVars['--font-size-4xl'],
    fontWeight: fontWeightVars['--font-weight-bold'],
    lineHeight: typeScaleVars['--text-display-2-leading'],
    // The scroller clips the sides: the ring draws inside the title.
    outlineOffset: {
      default: 0,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
  barEnd: {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  // iOS 26: a 44 pt circle holding only the chevron; the previous title
  // is its accessible name, not a label.
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: '50%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-accent'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  backIcon: {
    transform: {
      default: null,
      ':is([dir="rtl"] *)': 'scaleX(-1)',
    },
  },
  cards: {
    position: 'absolute',
    inset: 0,
  },
  card: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    backgroundColor: colorVars['--color-background-body'],
  },
  scroller: {
    position: 'absolute',
    inset: 0,
    boxSizing: 'border-box',
    paddingTop: BAR_HEIGHT,
    scrollPaddingTop: BAR_HEIGHT,
    // The screen scrolls vertically; a sideways drag is the back swipe's. A
    // horizontal scroller inside the content is its own scroll container
    // and keeps its native sideways scrolling.
    touchAction: 'pan-y pinch-zoom',
    // The card clips anything outside the scroller: the ring draws inside it.
    outlineOffset: {
      default: 0,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
  cardHidden: {
    contentVisibility: 'hidden',
  },
  // The scroll edge sentinel stays at its static position, just above the
  // content. The scroller is its containing block, so it scrolls with the
  // content with no positioned wrapper. On an inline screen it sits outside
  // the content, so the screen's first element keeps :first-child.
  edgeSentinelStatic: {
    insetBlockStart: 'auto',
    insetInlineStart: 'auto',
  },
  // On a large-title screen the sentinel follows the large title in the
  // content and ends where the title ends. So the veil comes on as the bar's
  // title takes over. iOS's veil leaves out an expanded large title. The
  // margin is the sentinel's 10px height.
  edgeSentinelAfterLargeTitle: {
    insetBlockStart: 'auto',
    insetInlineStart: 'auto',
    marginBlockStart: -10,
  },
  dim: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  // A bar's dimming ends above the bar's hairline, as its background does:
  // the covered bar would otherwise darken the hairline under it.
  barDim: {
    bottom: 1,
  },
});

// The dimming's black is the UIKit table's alpha, a runtime value StyleX
// cannot read at compile time.
const dynamicStyles = stylex.create({
  dimColor: (alpha: number) => ({
    // eslint-disable-next-line @astryx/no-raw-color -- UIKit's parallax dimming is black at the table's measured alpha in every appearance; it is not a theme colour
    backgroundColor: `rgba(0, 0, 0, ${alpha})`,
  }),
});

// =============================================================================
// Layers
// =============================================================================

/**
 * One screen's animated layers: its card and the dimming over it, and its
 * bar with the same dimming. The bar moves with the card, title and end
 * content included.
 */
interface ScreenLayers {
  card: MotionEngine;
  dim: MotionEngine;
  bar: MotionEngine;
  barDim: MotionEngine;
  /**
   * The bar's clip box and the row inside it, moved apart: the row moves by
   * the opposite of the box. Under a finger the box's edge cuts a covered
   * bar at the top card's leading edge, and the row holds still. Identity
   * everywhere else.
   */
  barClip: MotionEngine;
  barClipContent: MotionEngine;
  titleElement: HTMLElement | null;
  /** The large title above the content, for `titleDisplayMode="large"`. */
  largeTitleElement: HTMLElement | null;
  /** The bar title's text, hidden while the large title shows. */
  titleText: MotionEngine;
}

type Registry = Map<string, Partial<ScreenLayers>>;

interface ScreenModel {
  key: string;
  element: ReactElement<NavigationScreenProps>;
  /** The control that pushed this screen; focus returns to it on the pop. */
  source: Element | null;
}

function CardLayer({
  model,
  registry,
  isTop,
  isCovered,
  isHidden,
  onLargeTitleCollapse,
}: {
  model: ScreenModel;
  registry: Registry;
  isTop: boolean;
  isCovered: boolean;
  isHidden: boolean;
  onLargeTitleCollapse: (key: string, isCollapsed: boolean) => void;
}) {
  const props = model.element.props;
  const isLarge = props.titleDisplayMode === 'large';
  // The large title has collapsed once it has scrolled entirely under the
  // bar: the bar's own title takes over. The title reads the card's scroll
  // position from the moment it attaches. A card hidden two levels down
  // scrolls no more and keeps its last value. A title that detaches drops its
  // collapse. One that attaches reads the scroll position again.
  const largeTitleCallback = useCallback(
    (title: HTMLHeadingElement | null) => {
      const entry = registry.get(model.key) ?? {};
      entry.largeTitleElement = title;
      registry.set(model.key, entry);
      // The title is first in the scroll content, so a change of its height
      // reaches the scroll area's measure. The scroller holds that content.
      const scroller = title?.parentElement?.parentElement ?? null;
      if (title == null || scroller == null) {
        return undefined;
      }
      // The screen scrolls under the bar: the title has gone once its bottom
      // passes the bar's. A title with no layout has not scrolled away.
      const read = () =>
        onLargeTitleCollapse(
          model.key,
          title.offsetHeight > 0 &&
            scroller.scrollTop >=
              title.offsetTop + title.offsetHeight - BAR_HEIGHT,
        );
      read();
      scroller.addEventListener('scroll', read, {passive: true});
      // React runs this in place of a null call when the title detaches.
      return () => {
        scroller.removeEventListener('scroll', read);
        onLargeTitleCollapse(model.key, false);
        const current = registry.get(model.key);
        if (current?.largeTitleElement === title) {
          current.largeTitleElement = null;
        }
      };
    },
    [registry, model.key, onLargeTitleCollapse],
  );
  const card = useMotionEngine();
  const dim = useMotionEngine();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // iOS 26: each screen's scroll view carries its own edge effect, so a push
  // or a pop carries each screen's veil with its card. It switches on once
  // the content has moved 10px under the bar, which overlays the scroller.
  // The veil is half strength at the bar's bottom. A hidden screen, two or
  // more levels down, has no layout to measure, so it runs no effect. Once
  // revealed it measures and switches at once.
  const edge = useScrollEdgeEffect({
    enabled: !isHidden,
    root: scrollerRef,
    rootInset: BAR_HEIGHT,
    edge: `${BAR_HEIGHT}px`,
    sentinelXstyle: isLarge
      ? styles.edgeSentinelAfterLargeTitle
      : styles.edgeSentinelStatic,
    springs: bars.scrollEdgeEffect,
  });
  // A forward Tab into the scroller moves on to its first plain link or
  // button.
  const {getViewportProps, getContentProps} = useScrollableArea({
    axis: 'block',
    overscroll: 'contain',
    keyboardAccess: {owner: 'contentOrViewport', label: props.title},
  });
  // The screen's animators register as its card attaches. The callback is
  // stable: a new one each render would detach and reattach the animator,
  // and restart a running transition.
  const cardRef = useCallback(
    (element: HTMLDivElement | null) => {
      card.ref(element);
      const entry = registry.get(model.key) ?? {};
      entry.card = card.animator;
      entry.dim = dim.animator;
      registry.set(model.key, entry);
    },
    [card, registry, model.key, dim.animator],
  );
  return (
    <div
      ref={cardRef}
      data-navigation-screen={model.key}
      data-navigation-top={isTop || undefined}
      inert={isCovered || undefined}
      {...stylex.props(styles.card, isHidden && styles.cardHidden)}>
      <div
        {...getViewportProps<HTMLDivElement>({
          ref: scrollerRef,
          xstyle: [focusOutlineStyles.focusVisible, styles.scroller],
        })}>
        {isLarge ? null : (
          <div {...edge.sentinelProps} data-navigation-scroll-edge-sentinel />
        )}
        <div {...getContentProps<HTMLDivElement>({})}>
          {isLarge ? (
            <>
              <h1
                ref={largeTitleCallback}
                tabIndex={-1}
                {...stylex.props(
                  focusOutlineStyles.focusVisible,
                  styles.largeTitle,
                )}>
                {props.title}
              </h1>
              <div
                {...edge.sentinelProps}
                data-navigation-scroll-edge-sentinel
              />
            </>
          ) : null}
          {props.children}
        </div>
      </div>
      <div {...edge.layerProps} data-navigation-scroll-edge />
      <div
        ref={dim.ref}
        aria-hidden
        {...stylex.props(
          styles.dim,
          dynamicStyles.dimColor(navigation.dimmingAlpha),
        )}
      />
    </div>
  );
}

function BarLayer({
  model,
  registry,
  isCovered,
  isLargeTitleShown,
}: {
  model: ScreenModel;
  registry: Registry;
  isCovered: boolean;
  isLargeTitleShown: boolean;
}) {
  const bar = useMotionEngine();
  const barDim = useMotionEngine();
  const clip = useMotionEngine();
  const clipContent = useMotionEngine();
  // The bar's animators register with it as it attaches. Stable, as the
  // card's: a new callback would detach and reattach the animator.
  const barRef = useCallback(
    (element: HTMLDivElement | null) => {
      bar.ref(element);
      const entry = registry.get(model.key) ?? {};
      entry.bar = bar.animator;
      entry.barDim = barDim.animator;
      entry.barClip = clip.animator;
      entry.barClipContent = clipContent.animator;
      registry.set(model.key, entry);
    },
    [
      bar,
      registry,
      model.key,
      barDim.animator,
      clip.animator,
      clipContent.animator,
    ],
  );
  const titleText = useMotionEngine();
  const wasShownRef = useRef<boolean | null>(null);
  // The bar's title hides while the screen's large title shows, and fades in
  // once the large title has scrolled under the bar. This drives the title's
  // compositor animator, the system it syncs.
  useLayoutEffect(() => {
    const target = {
      opacity: isLargeTitleShown ? 0 : 1,
      y: isLargeTitleShown ? navigation.inlineTitleRise : 0,
    };
    if (wasShownRef.current == null) {
      // First layout: the title is in place at once.
      titleText.animator.set(target);
    } else if (wasShownRef.current !== isLargeTitleShown) {
      titleText.animator.animate(target, {
        spring: springs.navigationBarElements,
      });
    }
    wasShownRef.current = isLargeTitleShown;
  }, [titleText.animator, isLargeTitleShown]);
  // The title is one element (its heading role): the stack focuses it, and
  // the animator rises and fades it. Both register as the title attaches.
  const titleRefs = useCallback(
    (element: HTMLHeadingElement | null) => {
      const entry = registry.get(model.key) ?? {};
      entry.titleElement = element;
      entry.titleText = titleText.animator;
      registry.set(model.key, entry);
      titleText.ref(element);
    },
    [registry, model.key, titleText],
  );
  const props = model.element.props;
  return (
    <div
      ref={barRef}
      data-navigation-bar={model.key}
      inert={isCovered || undefined}
      {...stylex.props(styles.barLayer, isCovered && styles.barLayerCovered)}>
      <div ref={clip.ref} {...stylex.props(styles.barClip)}>
        <div ref={clipContent.ref} {...stylex.props(styles.barRow)}>
          <div
            aria-hidden
            data-navigation-bar-background
            {...stylex.props(styles.barLayerBackground)}
          />
          <div {...stylex.props(styles.barStart)} />
          <h2
            ref={titleRefs}
            tabIndex={-1}
            aria-hidden={isLargeTitleShown || undefined}
            {...stylex.props(styles.barTitle, focusOutlineStyles.focusVisible)}>
            {props.title}
          </h2>
          <div {...stylex.props(styles.barEnd)}>{props.endContent}</div>
          <div
            ref={barDim.ref}
            aria-hidden
            data-navigation-bar-dim
            {...stylex.props(
              styles.dim,
              styles.barDim,
              dynamicStyles.dimColor(navigation.dimmingAlpha),
            )}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The back button: one for the stack, over the moving bars. Its glass
 * platter shows from a push's first frame; its chevron fades in and out on
 * its own clock (the stack drives both).
 */
function BackControl({
  label,
  onBack,
  isInert,
  control,
  chevron,
}: {
  label: string;
  onBack: () => void;
  isInert: boolean;
  control: (element: HTMLElement | null) => void;
  chevron: (element: HTMLElement | null) => void;
}) {
  // The motion engine takes an HTML element, and the icon's ref reaches its
  // inner SVG. So the animator binds the icon's wrapper, the button's first
  // child.
  const buttonRef = useCallback(
    (button: HTMLButtonElement | null) => {
      const icon = button?.firstElementChild;
      chevron(isHTMLElement(icon) ? icon : null);
    },
    [chevron],
  );
  return (
    <div
      ref={control}
      inert={isInert || undefined}
      {...stylex.props(styles.backControl)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onBack}
        aria-label={label}
        data-navigation-back
        {...stylex.props(styles.back)}>
        <Icon icon="chevronLeft" color="inherit" xstyle={styles.backIcon} />
      </button>
    </div>
  );
}

// =============================================================================
// Screen
// =============================================================================

/**
 * One screen of a NavigationStack. Its props describe the screen (title,
 * back title, end content, content); the stack lays it out.
 */
export function NavigationScreen(_props: NavigationScreenProps): ReactNode {
  // Rendered by NavigationStack, which reads these props; on its own it is
  // nothing.
  return null;
}
NavigationScreen.displayName = 'NavigationScreen';

// =============================================================================
// Stack
// =============================================================================

interface Transition {
  id: number;
  kind: 'push' | 'pop' | 'none';
  /** The screen on top when the transition ends (push) or leaving (pop). */
  top: string;
  /** The screen under it. */
  under: string | null;
}

/**
 * Whether a value is an element, by its node type. `instanceof` reads the
 * constructors of the window running this module. A stack rendered into
 * another window (an iframe, a picture-in-picture window) does not use them.
 */
function isElement(value: unknown): value is Element {
  return (
    typeof value === 'object' &&
    value != null &&
    (value as Partial<Node>).nodeType === 1
  );
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isElement(value) && value.namespaceURI === 'http://www.w3.org/1999/xhtml'
  );
}

/** What a press on a control's label or icon gives focus back to. */
const FOCUSABLE_CONTROL =
  'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The stack's writing direction, as core reads it. */
function writingDirection(element: HTMLElement | null): 'ltr' | 'rtl' {
  return isRtlElement(element) ? 'rtl' : 'ltr';
}

/**
 * A push/pop navigator: UINavigationController's transitions, back button
 * and back swipes, on the compositor.
 *
 * The app owns the path (`path` + `onPathChange`). The stack renders the
 * root screen and one screen per entry, top last. It animates the change
 * whenever the path gains or loses its top entry.
 *
 * Motion is UIKit's, measured on iOS 26.2 (motion/uikit/navigation.ts). A
 * push is a critically damped spring (response 0.3 s) that starts at 8.773
 * widths per second. The card underneath moves at 0.3 of the top card's
 * speed, under a 10 % black dimming. Each screen's bar moves with it.
 * Every layer runs on the compositor (core's animator), so a busy main thread
 * does not stall a push or a pop. The recognizer tracks the back swipe 1:1,
 * from the leading screen edge or, as on iOS 26, from anywhere in the
 * content. The compositor plays its release. The swipe finishes when
 * progress plus 0.35 s of velocity passes half the width. It finishes on a
 * spring (0.3 s, ζ 0.85) that starts at the finger's speed. Nothing waits
 * for a push. A pop during a push turns it around from where it is, and a
 * finger can grab the moving card.
 *
 * The bar is iOS 26's (measured). Each screen has its own opaque bar that
 * moves with its screen. So a pushed title slides in with its screen and
 * covers the one it replaces, which rides the parallax underneath. Under a
 * finger the revealed bar holds still. Back is one 44 pt circle over the
 * bars. It holds only the chevron and takes its name from the screen it
 * returns to. On a push from the root, its platter is there from the first
 * frame, and the chevron fades in a beat later. On a pop to the root, the
 * chevron fades out at once and the platter leaves with the screen. A back
 * swipe leaves it alone until the pop finishes.
 *
 * Under a finger the bars paint no background and no hairline, as iOS 26's
 * do. Each screen carries a scroll edge effect: a veil of the body colour
 * that comes in once the content has moved 10px under the bar. The veil
 * fades for a finger's scroll and rides the screen's card through a push, a
 * pop or a back swipe. The bar a card covers is cut at that card's leading
 * edge. A mouse keeps the bar's surface and hairline.
 *
 * In a browser tab the screen's leading edge is the browser's own back
 * swipe, which iOS Safari keeps. So the stack's edge swipe runs only in a
 * home-screen web app (`navigator.standalone`). The content swipe ignores
 * touches that start in that edge band.
 *
 * Reduced Motion is the animator's. Under a finger the incoming screen fades
 * in where it lands, and the outgoing one fades out in 200 ms. Nothing
 * travels and nothing dims. Under a mouse the change is immediate. A finger's
 * back swipe still tracks it, and what its release starts fades on any
 * pointer.
 *
 * Accessibility: covered screens are `inert`. A push moves focus to the new
 * screen's title; a pop returns it to the control that pushed the screen.
 * The back button is a real button named by the screen it returns to.
 */
export function NavigationStack<T>({
  root,
  path,
  onPathChange,
  renderScreen,
  getKey,
  isInteractivePopEnabled = true,
  label,
  'data-testid': testId,
}: NavigationStackProps<T>) {
  const t = useTranslator();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [registry] = useState<Registry>(() => new Map());
  // The last input decides whether a moved focus shows its ring.
  const {ref: trackModality, readModality} = useInteractionModalityTracking();
  const containerCallback = useCallback(
    (element: HTMLDivElement | null) => {
      containerRef.current = element;
      const release = trackModality(element);
      return () => {
        release?.();
        containerRef.current = null;
      };
    },
    [trackModality],
  );
  // Screens whose large title has scrolled under the bar. The ref holds the
  // same set for the handlers and effects below; only the handler changes it.
  const [collapsedTitles, setCollapsedTitles] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const collapsedRef = useRef(collapsedTitles);
  const onLargeTitleCollapse = useCallback(
    (key: string, isCollapsed: boolean) => {
      const current = collapsedRef.current;
      if (current.has(key) === isCollapsed) {
        return;
      }
      const next = new Set(current);
      if (isCollapsed) {
        next.add(key);
      } else {
        next.delete(key);
      }
      collapsedRef.current = next;
      setCollapsedTitles(next);
    },
    [],
  );

  // The screens on the path, root first.
  const models = useMemo<ScreenModel[]>(() => {
    const list: ScreenModel[] = [{key: 'root', element: root, source: null}];
    path.forEach((entry, index) => {
      list.push({
        key: `screen-${getKey ? getKey(entry, index) : index}`,
        element: renderScreen(entry, index),
        source: null,
      });
    });
    return list;
  }, [root, path, renderScreen, getKey]);
  const keys = models.map(model => model.key).join('\u0000');

  // Sources of pushes, by screen key (focus returns there on the pop).
  const sourcesRef = useRef(new Map<string, Element | null>());
  // The last control activated inside the stack: what a push it starts came
  // from.
  const lastActivationRef = useRef<{target: Element; at: number} | null>(null);
  // A pending push source handed to push(): applied to the new top.
  const pendingSourceRef = useRef<Element | null | undefined>(undefined);
  // An interactive release in flight: the pop it commits continues from the
  // finger's velocity instead of starting a programmatic pop.
  const releaseRef = useRef<{velocity: number} | null>(null);

  // Derived during render, so a popped screen is still rendered (leaving) in
  // the very commit that drops it from the path.
  const [view, setView] = useState<{
    keys: string;
    models: ScreenModel[];
    leaving: ScreenModel | null;
    transition: Transition;
  }>(() => ({
    keys,
    models,
    leaving: null,
    transition: {
      id: 0,
      kind: 'none',
      top: models.at(-1)?.key ?? 'root',
      under: null,
    },
  }));

  if (view.keys !== keys) {
    const before = view.models;
    const isPrefix = (shorter: ScreenModel[], longer: ScreenModel[]) =>
      shorter.every((model, i) => longer[i]?.key === model.key);
    let transition: Transition;
    let leaving: ScreenModel | null = null;
    if (models.length === before.length + 1 && isPrefix(before, models)) {
      transition = {
        id: view.transition.id + 1,
        kind: 'push',
        top: models[models.length - 1].key,
        under: before[before.length - 1]?.key ?? null,
      };
    } else if (models.length < before.length && isPrefix(models, before)) {
      leaving = before[before.length - 1];
      transition = {
        id: view.transition.id + 1,
        kind: 'pop',
        top: leaving.key,
        under: models[models.length - 1].key,
      };
    } else {
      transition = {
        id: view.transition.id + 1,
        kind: 'none',
        top: models[models.length - 1].key,
        under: null,
      };
    }
    setView({keys, models, leaving, transition});
  } else if (view.models !== models) {
    // Same screens, new elements (the app re-rendered): keep them current.
    setView({...view, models});
  }

  const depth = models.length - 1;
  const rendered = view.leaving ? [...view.models, view.leaving] : view.models;
  const topKey = view.leaving
    ? view.leaving.key
    : (view.models.at(-1)?.key ?? 'root');
  // While a pop runs, the screen it reveals; otherwise the one under the top
  // (a finished pop's `transition.under` is the new top itself).
  const underKey =
    view.leaving != null
      ? view.transition.under
      : (view.models.at(-2)?.key ?? null);

  // ---------------------------------------------------------------------------
  // Transition driver
  // ---------------------------------------------------------------------------

  const runningRef = useRef<{id: number; done: boolean} | null>(null);
  // The clock the last transition's screens run on (their start time), so
  // the back chevron keeps time with them.
  const startedRef = useRef(0);
  // A pop's focus return, waiting for the commit that drops the leaving
  // screen (until then every screen is `inert` and cannot take focus).
  const pendingFocusRef = useRef<{popped: string; revealed: string} | null>(
    null,
  );
  const progressRef = useRef(0);
  // The back button's platter and chevron (one for the stack).
  const backControl = useMotionEngine();
  const backChevron = useMotionEngine();

  const layersOf = useCallback(
    (key: string | null) => (key == null ? null : (registry.get(key) ?? null)),
    [registry],
  );

  // Under a finger the bars are iOS 26's: clear, so a covered bar would show
  // through the card above it. UIKit's covering view cuts the title under it
  // at its leading edge. Here the covered bar's clip box follows the top
  // card's leading edge, and the row inside it holds still. At rest the box
  // is shut. While the cards travel it moves on their spring, or with the
  // finger. The stack reads the touch presentation as each move starts, as
  // the swipes do. A mouse keeps opaque bars and the boxes at identity.
  const clearBarsRef = useRef(false);
  const readClearBars = useCallback(() => {
    clearBarsRef.current = isCoarsePointer(
      containerRef.current?.ownerDocument.defaultView,
    );
    return clearBarsRef.current;
  }, []);
  /**
   * Where the covered bar's box goes so its edge meets the top card's
   * leading edge (the top card at `topX`, the covered bar at `underBarX`).
   */
  const clipXFor = useCallback((topX: number, underBarX: number) => {
    const width = cardsRef.current?.clientWidth ?? 0;
    const sign = writingDirection(containerRef.current) === 'rtl' ? -1 : 1;
    return topX - underBarX - sign * width;
  }, []);
  const setClip = useCallback(
    (key: string | null, x: number) => {
      const layers = layersOf(key);
      layers?.barClip?.set({x});
      layers?.barClipContent?.set({x: -x});
    },
    [layersOf],
  );

  const shownBarsRef = useRef<ReadonlySet<string>>(new Set());
  // A bar that mounts covered parks at the parallax, as `settle` parks a
  // covered screen. A pop that reveals a screen two levels down brings one.
  // Under a finger it is cut away at the top card's leading edge; under a
  // mouse it is whole, under the opaque top bar. A bar that was already shown
  // keeps its place, and the transition moves it. This drives the bars'
  // compositor animators, the system it syncs.
  useLayoutEffect(() => {
    const before = shownBarsRef.current;
    shownBarsRef.current = new Set(
      underKey == null ? [topKey] : [topKey, underKey],
    );
    if (underKey == null || before.has(underKey)) {
      return;
    }
    const values = layersAt(
      0,
      cardsRef.current?.clientWidth ?? 0,
      writingDirection(containerRef.current),
    );
    layersOf(underKey)?.bar?.set({x: values.underX});
    setClip(underKey, readClearBars() ? clipXFor(0, values.underX) : 0);
  }, [topKey, underKey, layersOf, readClearBars, setClip, clipXFor]);

  const {isTouch} = useTouchPresentation();
  const touchSeenRef = useRef(isTouch);
  // The touch presentation can change while a screen is covered (a tablet
  // losing its mouse). The bars' backgrounds follow it at once, so the
  // covered bar's cut follows it too. A running move reads it again as it
  // settles. This drives the bars' compositor animators, the system it syncs.
  useLayoutEffect(() => {
    if (touchSeenRef.current === isTouch) {
      return;
    }
    touchSeenRef.current = isTouch;
    const running = runningRef.current;
    if (underKey == null || (running != null && !running.done)) {
      return;
    }
    const values = layersAt(
      0,
      cardsRef.current?.clientWidth ?? 0,
      writingDirection(containerRef.current),
    );
    setClip(underKey, readClearBars() ? clipXFor(0, values.underX) : 0);
  }, [isTouch, underKey, readClearBars, setClip, clipXFor]);

  /**
   * Writes the layers for progress p (a finger's frame, or a transition's
   * first one; no animation). The top bar moves with its card. Under a
   * finger the revealed bar holds still where it rests, as UIKit's does.
   * `underBar: 'ride'` puts it at its card's parallax instead, where a
   * programmatic pop starts it.
   */
  const setProgress = useCallback(
    (
      p: number,
      top: string,
      under: string | null,
      underBar: 'rest' | 'ride' = 'rest',
    ) => {
      const width = cardsRef.current?.clientWidth ?? 0;
      const direction = writingDirection(containerRef.current);
      const values = layersAt(p, width, direction);
      const topLayers = layersOf(top);
      const underLayers = layersOf(under);
      topLayers?.card?.set({x: values.topX});
      topLayers?.bar?.set({x: values.topX});
      underLayers?.card?.set({x: values.underX});
      const underBarX = underBar === 'ride' ? values.underX : 0;
      underLayers?.bar?.set({x: underBarX});
      underLayers?.dim?.set({opacity: values.dim});
      underLayers?.barDim?.set({opacity: values.dim});
      // Under a finger the covered bar is cut where the top card's leading
      // edge is; under a mouse both bars are whole.
      setClip(top, 0);
      setClip(
        under,
        clearBarsRef.current ? clipXFor(values.topX, underBarX) : 0,
      );
      progressRef.current = p;
    },
    [layersOf, setClip, clipXFor],
  );

  /**
   * Springs the layers to progress `to`. `dp` is the progress velocity to
   * start from (omit it to keep the velocity the layers have on screen).
   */
  const animateProgress = useCallback(
    (
      to: 0 | 1,
      top: string,
      under: string | null,
      spring: SpringDescription,
      dp: number | undefined,
      release: boolean,
      underBar: 'rest' | 'ride',
      startAt?: number,
    ): Promise<boolean> => {
      const width = cardsRef.current?.clientWidth ?? 0;
      const direction = writingDirection(containerRef.current);
      const values = layersAt(to, width, direction);
      const velocity =
        dp == null ? null : layerVelocities(dp, width, direction);
      const at = startAt ?? performance.now();
      const topLayers = layersOf(top);
      const underLayers = layersOf(under);
      const handles = [];
      // Reduced Motion is the animator's; `crossfadeAs` says which card
      // enters (fades in where it lands) and which leaves (fades out in
      // place). A finger's release fades on any pointer (`touchRelease`).
      if (topLayers?.card) {
        handles.push(
          topLayers.card.animate(
            {x: values.topX},
            {spring, velocity: velocity ? {x: velocity.topX} : undefined},
            {
              at,
              touchRelease: release,
              crossfadeAs: to === 0 ? 'entrance' : 'exit',
            },
          ),
        );
        startedRef.current = at;
      }
      // The bars move with their cards (each screen's bar is part of it in
      // UIKit): the incoming one covers the outgoing title.
      if (topLayers?.bar) {
        handles.push(
          topLayers.bar.animate(
            {x: values.topX},
            {spring, velocity: velocity ? {x: velocity.topX} : undefined},
            {at, touchRelease: release},
          ),
        );
      }
      if (underLayers?.bar && underBar === 'ride') {
        handles.push(
          underLayers.bar.animate(
            {x: values.underX},
            {spring, velocity: velocity ? {x: velocity.underX} : undefined},
            {at, touchRelease: release},
          ),
        );
      }
      if (underLayers?.card) {
        handles.push(
          underLayers.card.animate(
            {x: values.underX},
            {spring, velocity: velocity ? {x: velocity.underX} : undefined},
            {
              at,
              touchRelease: release,
              crossfadeAs: to === 1 ? 'entrance' : 'exit',
            },
          ),
        );
      }
      if (clearBarsRef.current) {
        // Under a finger the covered bar's box rides the top card's leading
        // edge on the same spring, from the same start and velocity. The
        // difference of the two bars' curves is the same curve. There is no
        // clamp: an overshoot past rest stays cut. Reduced Motion's
        // cross-fade has no travel: the titles swap at once, as UIKit's do.
        const underBarTo =
          underBar === 'ride'
            ? values.underX
            : (underLayers?.bar?.get('x') ?? 0);
        const clipTo = clipXFor(values.topX, underBarTo);
        setClip(top, 0);
        if (
          (topLayers?.card?.reducedMotion({touchRelease: release}) ?? 'off') !==
          'off'
        ) {
          setClip(under, clipTo);
          if (to === 1) {
            // A pop: the leaving bar goes at once too.
            setClip(top, direction === 'rtl' ? width : -width);
          }
        } else if (underLayers?.barClip && underLayers.barClipContent) {
          const clipVelocity =
            velocity == null
              ? undefined
              : velocity.topX - (underBar === 'ride' ? velocity.underX : 0);
          handles.push(
            underLayers.barClip.animate(
              {x: clipTo},
              {
                spring,
                velocity: clipVelocity == null ? undefined : {x: clipVelocity},
              },
              {at, touchRelease: release},
            ),
            underLayers.barClipContent.animate(
              {x: -clipTo},
              {
                spring,
                velocity: clipVelocity == null ? undefined : {x: -clipVelocity},
              },
              {at, touchRelease: release},
            ),
          );
        }
      } else {
        // Under a mouse both bars are whole, also after a pointer that was
        // coarse left a cut.
        setClip(top, 0);
        setClip(under, 0);
      }
      for (const dim of [underLayers?.dim, underLayers?.barDim]) {
        if (dim == null) {
          continue;
        }
        if (dim.reducedMotion({touchRelease: release}) !== 'off') {
          // A Reduced Motion fade has no dimming: the shade belongs to the
          // slide.
          dim.set({opacity: 0});
        } else {
          handles.push(
            dim.animate(
              {opacity: values.dim},
              {
                spring,
                velocity: velocity ? {opacity: velocity.dim} : undefined,
              },
              {at, touchRelease: release},
            ),
          );
        }
      }
      progressRef.current = to;
      return Promise.all(handles.map(async handle => handle.finished)).then(
        results => results.every(Boolean),
      );
    },
    [layersOf, setClip, clipXFor],
  );

  /**
   * The back button on a push from the root or a pop to it, as UIKit's. On
   * the push the platter is there from the first frame, and the chevron
   * fades in a beat later. On the pop the chevron fades out at once, and the
   * platter leaves with the screen. Both fades are the back-button spring;
   * the push's delay is the navigation table's, as measured.
   */
  const fadeBack = useCallback(
    (kind: 'push' | 'pop', under: string | null, release = false) => {
      const isRoot = under != null && view.models[0]?.key === under;
      const element = containerRef.current;
      const spring = springs.navigationBackButton;
      if (!isRoot) {
        return;
      }
      const delay =
        kind === 'pop'
          ? 0
          : resolveMotion(element, navigation, 'backChevronPushDelayMs');
      if (kind === 'push') {
        backControl.animator.set({opacity: 1});
        backChevron.animator.set({opacity: 0});
      }
      // On the screens' clock, and starting with them. The delay is part of
      // the curve, so the whole fade is one compositor animation. A busy main
      // thread cannot hold it back. In WebKit a start in the future would
      // wait for the main thread.
      const from = kind === 'push' ? 0 : 1;
      const to = kind === 'push' ? 1 : 0;
      const fade = solveSpring(toSpring(resolveMotion(element, spring)), {
        from,
        to,
      });
      const delayS = delay / 1000;
      backChevron.animator.play(
        {
          opacity: {
            duration: delayS + fade.settleTime(0.001),
            at: t => (t < delayS ? from : fade.value(t - delayS)),
            velocity: t => (t < delayS ? 0 : fade.velocity(t - delayS)),
          },
        },
        {at: startedRef.current, touchRelease: release},
      );
    },
    [view.models, backControl.animator, backChevron.animator],
  );

  /** Puts a screen's layers at rest: on top, covered, or off. */
  const settle = useCallback(
    (key: string, role: 'top' | 'covered') => {
      const layers = layersOf(key);
      const width = cardsRef.current?.clientWidth ?? 0;
      const direction = writingDirection(containerRef.current);
      const values = layersAt(0, width, direction);
      if (role === 'top') {
        layers?.card?.set({x: 0, opacity: 1});
        layers?.dim?.set({opacity: 0});
        layers?.bar?.set({x: 0});
        layers?.barDim?.set({opacity: 0});
        // A screen on top shows its whole bar, under any pointer.
        setClip(key, 0);
      } else {
        // Covered: parked at the parallax, under the top screen and its bar.
        layers?.card?.set({x: values.underX, opacity: 1});
        layers?.dim?.set({opacity: 1});
        layers?.bar?.set({x: values.underX});
        layers?.barDim?.set({opacity: 1});
        // Under a finger cut away at the top card's leading edge (the top
        // card at rest); under a mouse whole, parked under the opaque bar.
        // Read again here: the pointer may have changed during the move.
        setClip(key, readClearBars() ? clipXFor(0, values.underX) : 0);
      }
    },
    [layersOf, readClearBars, setClip, clipXFor],
  );

  const focusAfter = useCallback(
    (kind: 'push' | 'pop', key: string, revealed?: string) => {
      const container = containerRef.current;
      // Only move focus when it was in the stack or nowhere: never take it
      // from elsewhere on the page.
      if (container == null || !isFocusLost(container)) {
        return;
      }
      // The moved focus shows its ring by the last input, as Core's overlays
      // do. After a key it shows; after a tap it does not.
      const modality = readModality();
      const focus = (element: HTMLElement) =>
        focusForLastInput(element, {preventScroll: true}, modality);
      if (kind === 'pop') {
        const source = sourcesRef.current.get(key);
        sourcesRef.current.delete(key);
        if (isHTMLElement(source) && source.isConnected) {
          focus(source);
          // A control that can no longer take focus falls through to the
          // title.
          if (source.ownerDocument.activeElement === source) {
            return;
          }
        }
      }
      // Else the screen now on top (the one pushed, or the one revealed): its
      // visible title, the large title while it shows, else the bar's.
      const target = revealed ?? key;
      const layers = layersOf(target);
      const large = layers?.largeTitleElement;
      const title =
        large != null && large.isConnected && !collapsedRef.current.has(target)
          ? large
          : layers?.titleElement;
      if (title != null) {
        focus(title);
      }
    },
    [layersOf, readModality],
  );

  // The committed view, and the back fade that follows it, for the effect
  // below. They sync at each commit, so only a new transition restarts it.
  const transitionInputsRef = useRef({view, fadeBack});
  useLayoutEffect(() => {
    transitionInputsRef.current = {view, fadeBack};
  });
  // Runs the transition the last path change asked for. It drives the
  // screens' and bars' compositor animators, the system it syncs.
  useLayoutEffect(() => {
    const {view, fadeBack} = transitionInputsRef.current;
    const transition = view.transition;
    readClearBars();
    if (transition.kind === 'none') {
      // Settle every screen where it rests.
      view.models.forEach((model, index) => {
        settle(model.key, index === view.models.length - 1 ? 'top' : 'covered');
      });
      backControl.animator.set({opacity: 1});
      backChevron.animator.set({opacity: 1});
      return;
    }
    const {top, under} = transition;
    const id = transition.id;
    const previous = runningRef.current;
    const wasRunning = previous != null && !previous.done;
    runningRef.current = {id, done: false};
    const release = releaseRef.current;
    releaseRef.current = null;
    pendingFocusRef.current = null;
    const at = performance.now();
    let promise: Promise<boolean>;
    if (transition.kind === 'push') {
      if (!wasRunning) {
        setProgress(1, top, under);
      } else {
        // The covered screen continues from where it is; the new one (just
        // mounted, at rest) starts off screen as any push does.
        const values = layersAt(
          1,
          cardsRef.current?.clientWidth ?? 0,
          writingDirection(containerRef.current),
        );
        layersOf(top)?.card?.set({x: values.topX});
        layersOf(top)?.bar?.set({x: values.topX});
      }
      promise = animateProgress(
        0,
        top,
        under,
        springs.navigationPush,
        wasRunning ? undefined : programmaticVelocity('push'),
        false,
        'ride',
      );
      fadeBack('push', under);
    } else if (release != null) {
      promise = animateProgress(
        1,
        top,
        under,
        springs.navigationInteractivePopFinish,
        release.velocity,
        true,
        'rest',
        at,
      );
      fadeBack('pop', under, true);
    } else {
      if (!wasRunning) {
        setProgress(0, top, under, 'ride');
      }
      promise = animateProgress(
        1,
        top,
        under,
        springs.navigationPop,
        wasRunning ? undefined : programmaticVelocity('pop'),
        false,
        'ride',
        at,
      );
      fadeBack('pop', under);
    }
    void promise.then(finished => {
      if (runningRef.current?.id !== id) {
        return;
      }
      runningRef.current = {id, done: true};
      if (!finished) {
        return;
      }
      if (transition.kind === 'pop') {
        setView(current =>
          current.transition.id === id ? {...current, leaving: null} : current,
        );
        if (under != null) {
          settle(under, 'top');
          pendingFocusRef.current = {popped: top, revealed: under};
        }
      } else {
        if (under != null) {
          // The covered screen keeps its place under the top one.
          layersOf(under)?.card?.set({opacity: 1});
        }
        focusAfter('push', top);
      }
    });
    // Only a new transition restarts this; the stack drives the layers
    // imperatively.
  }, [
    view.transition.id,
    animateProgress,
    focusAfter,
    layersOf,
    readClearBars,
    setProgress,
    settle,
    backControl.animator,
    backChevron.animator,
  ]);

  // The pop's focus return, after the commit that dropped the leaving screen
  // (the DOM's focus, the system this effect drives).
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (view.leaving == null && pending != null) {
      pendingFocusRef.current = null;
      focusAfter('pop', pending.popped, pending.revealed);
    }
  }, [view.leaving, focusAfter]);

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  // The committed path and callback, synced at each commit. `push` and `pop`
  // build the next path from what the screen shows, never from a render
  // React discards.
  const pathRef = useRef(path);
  const onPathChangeRef = useRef(onPathChange);
  useLayoutEffect(() => {
    pathRef.current = path;
    onPathChangeRef.current = onPathChange;
  });

  const api = useMemo<NavigationStackApi<T>>(
    () => ({
      push: (entry, options) => {
        const last = lastActivationRef.current;
        const source =
          options?.source !== undefined
            ? options.source
            : last != null && performance.now() - last.at < 1000
              ? last.target
              : null;
        pendingSourceRef.current = source;
        onPathChangeRef.current([...pathRef.current, entry]);
      },
      pop: () => {
        if (pathRef.current.length > 0) {
          onPathChangeRef.current(pathRef.current.slice(0, -1));
        }
      },
      popToRoot: () => {
        if (pathRef.current.length > 0) {
          onPathChangeRef.current([]);
        }
      },
      depth,
    }),
    [depth],
  );

  // Record the source of a push on the screen it pushed.
  useLayoutEffect(() => {
    if (view.transition.kind !== 'push') {
      return;
    }
    if (pendingSourceRef.current !== undefined) {
      sourcesRef.current.set(view.transition.top, pendingSourceRef.current);
      pendingSourceRef.current = undefined;
    }
  }, [view.transition]);

  // The control a push starts from: the last click or key press in the stack,
  // from the container's own capture handlers. A press on a control's label or
  // icon remembers the control itself.
  const rememberActivation = useCallback((event: SyntheticEvent) => {
    const {target} = event;
    if (isElement(target)) {
      // The scroller is focusable while it overflows, but it is not a
      // control. After a push from its plain content, the pop focuses the
      // title.
      const control = target.closest(FOCUSABLE_CONTROL);
      const isScreenScroller =
        control?.parentElement?.hasAttribute('data-navigation-screen') === true;
      lastActivationRef.current = {
        target: control != null && !isScreenScroller ? control : target,
        at: performance.now(),
      };
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Back swipes
  // ---------------------------------------------------------------------------

  const canPop = depth > 0 && view.leaving == null;
  // What the touch layer (NavigationStackTouch.ts) moves: the swipes read
  // and drive the stack through this, each frame's values from the latest
  // render.
  const swipeStackRef = useRef<BackSwipeStack | null>(null);
  const swipeStack: BackSwipeStack = {
    width: () => cardsRef.current?.clientWidth ?? 0,
    direction: () => writingDirection(containerRef.current),
    screens: () => {
      const top = view.models.at(-1)?.key;
      const under = view.models.at(-2)?.key;
      return top == null || under == null ? null : {top, under};
    },
    grab: (top, under) => {
      // Grab whatever is moving: the top card's presentation value is the
      // progress to continue from. A finger's move starts here.
      readClearBars();
      const width = cardsRef.current?.clientWidth ?? 0;
      const x = layersOf(top)?.card?.get('x') ?? 0;
      const direction = writingDirection(containerRef.current);
      for (const key of [top, under]) {
        const layers = layersOf(key);
        layers?.card?.stop();
        layers?.dim?.stop();
        layers?.bar?.stop();
        layers?.barDim?.stop();
        layers?.barClip?.stop();
        layers?.barClipContent?.stop();
      }
      runningRef.current = null;
      return progressFromScreen(x, width, direction);
    },
    setProgress: (p, top, under) => {
      setProgress(p, top, under);
    },
    progress: () => progressRef.current,
    release: (top, under, finish, velocity) => {
      const springBack = (v: number) => {
        const id = (runningRef.current?.id ?? 0) + 0.5;
        runningRef.current = {id, done: false};
        const at = performance.now();
        void animateProgress(
          0,
          top,
          under,
          // Released past its start (rubber-banded), UIKit's return.
          progressRef.current < 0
            ? springs.navigationInteractivePopReturn
            : springs.navigationInteractivePopFinish,
          v,
          true,
          'rest',
          at,
        ).then(finished => {
          if (runningRef.current?.id === id) {
            runningRef.current = {id, done: true};
          }
          if (finished) {
            settle(top, 'top');
            settle(under, 'covered');
          }
        });
      };
      if (!finish) {
        springBack(velocity);
        return;
      }
      // Commit the pop; the transition it triggers continues from here at
      // the finger's speed.
      const release = {velocity};
      const before = pathRef.current;
      releaseRef.current = release;
      onPathChangeRef.current(before.slice(0, -1));
      // An app that keeps its path (guarding unsaved edits, say) gets no
      // pop. By the next frame the release is still waiting, so the cards
      // spring back where they came from.
      const win = containerRef.current?.ownerDocument.defaultView;
      win?.requestAnimationFrame(() => {
        if (releaseRef.current === release && pathRef.current === before) {
          releaseRef.current = null;
          springBack(0);
        }
      });
    },
  };
  useLayoutEffect(() => {
    swipeStackRef.current = swipeStack;
  });
  useBackSwipes(containerRef, cardsRef, swipeStackRef, {
    isEnabled: canPop && isInteractivePopEnabled,
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const backLabelFor = (index: number) => {
    if (index === 0) {
      return null;
    }
    const previous = rendered[index - 1]?.element.props;
    // An empty title names nothing: the catalog's "Back" covers that too.
    return (
      previous?.backTitle ||
      previous?.title ||
      t('@astryx.navigationStack.back')
    );
  };
  // The top screen's back target; while a pop to the root runs, the leaving
  // screen's (its button fades out with it).
  const topBackLabel = backLabelFor(
    rendered.findIndex(model => model.key === topKey),
  );

  return (
    <NavigationStackContext.Provider value={api as NavigationStackApi}>
      <div
        ref={containerCallback}
        role="region"
        aria-label={label}
        data-testid={testId}
        onClickCapture={rememberActivation}
        onKeyDownCapture={rememberActivation}
        {...stylex.props(styles.stack)}>
        <div {...stylex.props(styles.bar)}>
          <div aria-hidden {...stylex.props(styles.barBackground)} />
          {rendered.map(model =>
            model.key === topKey || model.key === underKey ? (
              <BarLayer
                key={model.key}
                model={model}
                registry={registry}
                isCovered={model.key !== topKey || view.leaving != null}
                isLargeTitleShown={
                  model.element.props.titleDisplayMode === 'large' &&
                  !collapsedTitles.has(model.key)
                }
              />
            ) : null,
          )}
          {topBackLabel != null ? (
            <BackControl
              label={topBackLabel}
              onBack={api.pop}
              isInert={view.leaving != null}
              control={backControl.ref}
              chevron={backChevron.ref}
            />
          ) : null}
        </div>
        <div ref={cardsRef} {...stylex.props(styles.cards)}>
          {rendered.map(model => (
            <CardLayer
              key={model.key}
              model={model}
              registry={registry}
              isTop={model.key === topKey && view.leaving == null}
              isCovered={model.key !== topKey || view.leaving != null}
              isHidden={model.key !== topKey && model.key !== underKey}
              onLargeTitleCollapse={onLargeTitleCollapse}
            />
          ))}
        </div>
      </div>
    </NavigationStackContext.Provider>
  );
}

NavigationStack.displayName = 'NavigationStack';
