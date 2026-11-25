// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tour.tsx
 * @input A `steps` array, the app's `activeId`, usePopover, the layer dismissal stack
 * @output Exports Tour, TourProps, TourStep, TourEndReason, TourMissingAnchorBehavior
 * @position One callout that moves between the steps' anchors, a highlight
 *   ring, and an optional backdrop. The app owns the active step and the words.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /docs/specs/components/Tour/Tour.spec.md
 * - /packages/core/src/Tour/Tour.doc.mjs
 * - /packages/core/src/Tour/Tour.test.tsx
 * - /packages/core/src/Tour/index.ts
 * - /apps/storybook/stories/Tour.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Tour/
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {Button} from '../Button/Button';
import {Heading} from '../Heading/Heading';
import {HStack} from '../HStack/HStack';
import {Icon} from '../Icon/Icon';
import {IconButton} from '../IconButton/IconButton';
import {Text} from '../Text/Text';
import {VStack} from '../VStack/VStack';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {focusRegionAround} from '../hooks/useFocusTrap';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Tour/Tour.generated';
import {layerClickBoundary} from '../Layer/layerClickBoundary';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import {getActiveModalOutlet} from '../Layer/modalOutlet';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {usePopoverInternal} from '../Popover/usePopover';
import {
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {matchesMediaQuery} from '../utils/coarsePointer';
import {devWarn} from '../utils/devWarning';
import {containsAlongFlatTree, deepActiveElement} from '../utils/flatTree';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {takesFocusAsIs} from '../utils/focusReturn';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {
  isHTMLElement,
  isModalDialog,
  isShownAsPopover,
} from '../utils/nodeType';
import {themeProps} from '../utils/themeProps';

registerEnglishFallback(english);

/** Why a tour ended. */
export type TourEndReason =
  'complete' | 'skip' | 'close' | 'escape' | 'backdrop';

/** What a step does when it starts and its anchor is not in the document. */
export type TourMissingAnchorBehavior = 'center' | 'skipStep' | 'endTour';

/** One step of a tour. */
export interface TourStep {
  /** Names the step. Unique in the `steps` array. */
  id: string;
  /** The callout's heading. */
  title: ReactNode;
  /** The callout's body. */
  body?: ReactNode;
  /**
   * The element this step describes. The callout sits beside it and a ring
   * marks it. Without it, the callout shows in the center of the viewport.
   */
  anchorRef?: RefObject<Element | null>;
  /**
   * Which side of the anchor the callout sits on.
   * @default 'below'
   */
  placement?: LayerPlacement;
  /**
   * How the callout aligns along that side.
   * @default 'start'
   */
  alignment?: LayerAlignment;
  /**
   * Runs before the step reads its anchor, for example to open the panel the
   * anchor is in. The step waits for a returned promise. A rejected promise
   * counts as a missing anchor.
   */
  showAction?: () => void | Promise<void>;
}

export interface TourProps extends BaseProps<HTMLDivElement> {
  /** Ref to the callout's dialog element. */
  ref?: Ref<HTMLDivElement>;
  /**
   * The steps, in order. Leave a step out of the array to make it
   * conditional: the step count and Back and Next follow the array.
   */
  steps: ReadonlyArray<TourStep>;
  /** The id of the active step. `null` means the tour is not running. */
  activeId: string | null;
  /**
   * Called with the id of the step that Back, Next or a skip moves to, and
   * with the id of the step that takes the place of an active step that left
   * the array.
   */
  onActiveIdChange: (id: string) => void;
  /**
   * Called when the tour ends, with the reason. Set `activeId` to `null` in
   * response.
   */
  onEnd: (reason: TourEndReason) => void;
  /**
   * What a step does when it starts and its `anchorRef` holds no element in
   * the document: show in the center, move on, or end the tour.
   * @default 'center'
   */
  missingAnchorBehavior?: TourMissingAnchorBehavior;
  /** Called once for each step that starts without its anchor. */
  onMissingAnchor?: (id: string) => void;
  /**
   * Scroll an anchor that is out of view into view when its step shows.
   * @default true
   */
  hasScrollIntoView?: boolean;
  /**
   * Show the step count ("2 of 5").
   * @default false
   */
  hasStepCount?: boolean;
  /**
   * Show a Skip control that ends the tour.
   * @default false
   */
  hasSkipButton?: boolean;
  /**
   * Dim the page around the anchor. A step with a backdrop is modal: Tab
   * stays in the callout and a press outside it ends the tour. Set it before
   * the tour starts; a change while a step shows is not supported.
   * @default false
   */
  hasBackdrop?: boolean;
  /** Words for the Next control, in place of the translated default. */
  nextLabel?: string;
  /** Words for the Done control, in place of the translated default. */
  doneLabel?: string;
  /** Words for the Skip control, in place of the translated default. */
  skipLabel?: string;
}

const RING_GAP = spacingVars['--spacing-1'];
const RING_WIDTH = focusVars['--focus-outline-width'];

const styles = stylex.create({
  // Fills the viewport in the top layer. Presses pass through it unless it
  // is a backdrop.
  overlay: {
    position: 'fixed',
    insetBlockStart: 0,
    insetBlockEnd: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    width: '100%',
    height: '100%',
    marginBlockStart: 0,
    marginBlockEnd: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    paddingBlockStart: 0,
    paddingBlockEnd: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'visible',
    pointerEvents: 'none',
  },
  backdrop: {
    pointerEvents: 'auto',
  },
  // A backdrop with no anchor to light dims the whole page.
  dimmed: {
    backgroundColor: colorVars['--color-overlay'],
  },
  // Without CSS anchor positioning there is no ring to cut the dimming out
  // of, so the backdrop itself dims the page.
  dimmedWithoutRing: {
    backgroundColor: {
      default: colorVars['--color-overlay'],
      '@supports (anchor-name: --a)': 'transparent',
    },
  },
  ring: {
    display: {
      default: 'none',
      '@supports (anchor-name: --a)': 'block',
    },
    position: 'fixed',
    top: `calc(anchor(top) - ${RING_GAP})`,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `anchor(start)` follows the containing block's direction and a logical inset follows the ring's own, so the two disagree in a right-to-left subtree of a left-to-right page; the ring is symmetric.
    left: `calc(anchor(left) - ${RING_GAP})`,
    width: `calc(anchor-size(width) + 2 * ${RING_GAP})`,
    height: `calc(anchor-size(height) + 2 * ${RING_GAP})`,
    pointerEvents: 'none',
    // The ring hides with an anchor that a scrolling panel clips, as the
    // callout does.
    positionVisibility: 'anchors-visible',
    boxShadow: `0 0 0 ${RING_WIDTH} ${colorVars['--color-background-surface']}, 0 0 0 calc(2 * ${RING_WIDTH}) ${colorVars['--color-accent']}`,
    // Forced colors drop box shadows, so the ring is an outline there.
    outlineStyle: {
      default: 'none',
      '@media (forced-colors: active)': 'solid',
    },
    outlineWidth: RING_WIDTH,
    outlineColor: 'Highlight',
  },
  // The spread dims everything but the ring's own box.
  cutout: {
    boxShadow: `0 0 0 ${RING_WIDTH} ${colorVars['--color-background-surface']}, 0 0 0 calc(2 * ${RING_WIDTH}) ${colorVars['--color-accent']}, 0 0 0 9999px ${colorVars['--color-overlay']}`,
  },
  ringAnchor: (anchorName: string, radius: string | null) => ({
    positionAnchor: anchorName,
    borderRadius: radius ?? radiusVars['--radius-element'],
  }),
  // Longhands, so they win over the layer's own zero margins in every
  // style resolution.
  centered: {
    insetBlockStart: 0,
    insetBlockEnd: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    marginBlockStart: 'auto',
    marginBlockEnd: 'auto',
    marginInlineStart: 'auto',
    marginInlineEnd: 'auto',
  },
  // A step that prepares shows no callout. The callout stays in the focus
  // order, so focus inside it stays where it is.
  pending: {
    opacity: 0,
    pointerEvents: 'none',
  },
  callout: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-3'],
    maxWidth: '320px',
  },
  header: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    outlineStyle: 'none',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerWithoutCount: {
    justifyContent: 'flex-end',
  },
});

type Travel = 'forward' | 'back';

/** Where the callout sits for the step that shows. */
type AnchorState = 'anchored' | 'centered' | 'absent';

interface ShownStep {
  id: string;
  /** The step started without its anchor and shows centered until it has one. */
  startedMissing: boolean;
  /** The step as it started, shown if it leaves the array before the next starts. */
  step: TourStep;
  index: number;
  /** Focus stays where the person placed it, so the step is announced. */
  announces: boolean;
}

interface Promotion {
  /** The active id whose step left the array. */
  from: string;
  /** The step that took its place, or `null` when none follows. */
  to: string | null;
}

/** What Tour shows: the step, and where its callout sits. */
interface View {
  shown: ShownStep | null;
  /** The next step prepares; no callout shows. */
  isPending: boolean;
  anchorState: AnchorState;
  ringRadius: string | null;
  /** The top-layer element the tour renders in, or `null` for its own place. */
  host: Element | null;
  /** How many steps have started. Each start is one occasion to announce. */
  starts: number;
}

type ViewAction =
  | {type: 'stop'}
  | {type: 'prepare'}
  | {
      type: 'show';
      shown: ShownStep;
      anchorState: AnchorState;
      host: Element | null;
    }
  | {
      type: 'place';
      anchorState: AnchorState;
      ringRadius: string | null;
      host: Element | null;
    };

const INITIAL_VIEW: View = {
  shown: null,
  isPending: false,
  anchorState: 'centered',
  ringRadius: null,
  host: null,
  starts: 0,
};

function viewReducer(view: View, action: ViewAction): View {
  switch (action.type) {
    case 'stop':
      return view.shown == null && !view.isPending
        ? view
        : {...view, shown: null, isPending: false};
    case 'prepare':
      return view.isPending ? view : {...view, isPending: true};
    case 'show':
      return {
        ...view,
        shown: action.shown,
        isPending: false,
        anchorState: action.anchorState,
        host: action.host,
        // An Effect that runs twice for one start counts once.
        starts:
          view.shown?.id === action.shown.id ? view.starts : view.starts + 1,
      };
    case 'place':
      return view.anchorState === action.anchorState &&
        view.ringRadius === action.ringRadius &&
        view.host === action.host
        ? view
        : {
            ...view,
            anchorState: action.anchorState,
            ringRadius: action.ringRadius,
            host: action.host,
          };
  }
}

function uniqueSteps(steps: ReadonlyArray<TourStep>): TourStep[] {
  const seen = new Set<string>();
  return steps.filter(step => {
    if (seen.has(step.id)) {
      return false;
    }
    seen.add(step.id);
    return true;
  });
}

/**
 * The first step after `id` in `former` that `ids` still has: `null` when
 * none follows, `undefined` when `id` was not a step.
 */
function nextSurvivor(
  former: ReadonlyArray<string>,
  id: string,
  ids: ReadonlyArray<string>,
): string | null | undefined {
  const index = former.indexOf(id);
  if (index < 0) {
    return undefined;
  }
  return former.slice(index + 1).find(item => ids.includes(item)) ?? null;
}

/**
 * The element that a step with an anchor renders in. It is the open modal
 * dialog or the shown popover around the anchor, or the focus region around
 * the anchor in that layer. A callout there paints above the layer and
 * anchors to an element in it. It is not inert under a modal, and the layer's
 * Tab containment reaches it. `null` when no such layer holds the anchor.
 */
function hostAround(anchor: Element): Element | null {
  for (
    let element = anchor.parentElement;
    element != null;
    element = element.parentElement
  ) {
    if (isModalDialog(element) || isShownAsPopover(element)) {
      const region = focusRegionAround(anchor);
      return region != null && element.contains(region) ? region : element;
    }
  }
  return null;
}

/** The dialog or popover element that a host is, or is inside. */
function layerOf(host: Element): Element | null {
  return host.closest('dialog, [popover]');
}

/** Whether the layer of a host that a step keeps is still open. */
function isOpenHost(host: Element): boolean {
  const layer = layerOf(host);
  return (
    layer != null &&
    layer.isConnected &&
    (layer.hasAttribute('open') || isShownAsPopover(layer))
  );
}

/**
 * The ring's corner radius: the anchor's own, grown by the ring's gap, so
 * the two curves stay concentric.
 */
function ringRadiusFor(anchor: Element): string | null {
  const radius = getComputedStyle(anchor).borderRadius;
  if (radius === '' || radius.includes('/')) {
    return null;
  }
  return radius
    .split(' ')
    .map(corner => `calc(${corner} + ${RING_GAP})`)
    .join(' ');
}

function isInDocument(element: Element | null | undefined): element is Element {
  return element != null && element.isConnected;
}

/**
 * A guided tour: one callout that moves from step to step. The app lists the
 * steps as data and names the active one.
 *
 * @example
 * ```
 * const [activeId, setActiveId] = useState<string | null>('save');
 * const saveRef = useRef<HTMLButtonElement>(null);
 * <Button ref={saveRef} label="Save" />
 * <Tour
 *   steps={[
 *     {id: 'save', anchorRef: saveRef, title: 'Save your work', body: 'Changes save to the cloud.'},
 *     {id: 'done', title: 'You are set'},
 *   ]}
 *   activeId={activeId}
 *   onActiveIdChange={setActiveId}
 *   onEnd={() => setActiveId(null)}
 * />
 * ```
 */
export function Tour({
  steps: stepsProp,
  activeId,
  onActiveIdChange,
  onEnd,
  missingAnchorBehavior = 'center',
  onMissingAnchor,
  hasScrollIntoView = true,
  hasStepCount = false,
  hasSkipButton = false,
  hasBackdrop = false,
  nextLabel,
  doneLabel,
  skipLabel,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: TourProps) {
  const t = useComponentTranslator();
  const titleId = useId();
  const bodyId = useId();
  const countId = useId();

  const steps = useMemo(() => uniqueSteps(stepsProp), [stepsProp]);
  const ids = steps.map(step => step.id);
  const idsKey = ids.join('\u0000');

  // The step that takes the place of an active step that left the array
  // shows until the app names it.
  const [known, setKnown] = useState<{
    ids: ReadonlyArray<string>;
    idsKey: string;
    promotion: Promotion | null;
  }>({ids, idsKey, promotion: null});
  let promotion = known.promotion;
  if (activeId == null || ids.includes(activeId)) {
    promotion = null;
  } else if (promotion?.from !== activeId) {
    const next = nextSurvivor(known.ids, activeId, ids);
    promotion = next === undefined ? null : {from: activeId, to: next};
  } else if (promotion.to != null && !ids.includes(promotion.to)) {
    promotion = {
      from: activeId,
      to: nextSurvivor(known.ids, promotion.to, ids) ?? null,
    };
  }
  if (
    known.idsKey !== idsKey ||
    known.promotion?.from !== promotion?.from ||
    known.promotion?.to !== promotion?.to
  ) {
    setKnown({ids, idsKey, promotion});
  }
  const effectiveId =
    activeId == null
      ? null
      : ids.includes(activeId)
        ? activeId
        : (promotion?.to ?? null);
  const promotedTo = promotion?.to;
  const hasPromotion = promotion != null;

  const [view, dispatch] = useReducer(viewReducer, INITIAL_VIEW);
  const {shown, isPending, anchorState, ringRadius, host, starts} = view;

  const liveIndex = shown == null ? -1 : ids.indexOf(shown.id);
  const shownIndex = liveIndex < 0 ? (shown?.index ?? -1) : liveIndex;
  const shownStep =
    shown == null ? null : liveIndex < 0 ? shown.step : steps[liveIndex];

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const latest = useCommittedRef({
    steps,
    shown,
    shownStep,
    hasBackdrop,
    missingAnchorBehavior,
    onActiveIdChange,
    onEnd,
    onMissingAnchor,
    hasScrollIntoView,
  });

  // The callout's anchor: the step's element while it is in the document.
  // A step with no anchor, a step that started without one, and a backdrop
  // step whose anchor left use the overlay, and show centered.
  const calloutAnchorRef = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        const {
          shown: step,
          shownStep: data,
          hasBackdrop: isModal,
        } = latest.current;
        if (step == null || data == null) {
          return null;
        }
        const anchor = data.anchorRef?.current;
        if (isInDocument(anchor)) {
          return anchor;
        }
        return data.anchorRef == null || step.startedMissing || isModal
          ? overlayRef.current
          : null;
      },
      set current(_element) {},
    }),
    [latest],
  );

  const hasBody = isRenderable(shownStep?.body);
  const popover = usePopoverInternal({
    anchorRef: calloutAnchorRef,
    // The surface is the dialog. Its name is the step's title, so the role
    // and the name are set here and not by the hook.
    role: 'none',
    surfaceProps: {
      ...rest,
      role: 'dialog',
      'aria-modal': hasBackdrop ? true : undefined,
      'aria-labelledby': titleId,
      'aria-describedby':
        [hasBody ? bodyId : null, hasStepCount ? countId : null]
          .filter(id => id != null)
          .join(' ') || undefined,
      'aria-busy': isPending ? true : undefined,
    },
    surfaceRef: ref,
    xstyle: [styles.callout, xstyle],
    className,
    style,
    isModal: hasBackdrop,
    tabBehavior: hasBackdrop ? 'contain' : 'pageOrder',
    hasLightDismiss: false,
    hasEscapeDismiss: false,
    hasAutoFocus: false,
    hasCloseButton: false,
    padding: 3,
    surfaceTarget: 'tour',
  });
  const {show: showCallout, hide: hideCallout, isOpen, contentRef} = popover;
  const {isFocusInScope} = popover;
  // `show` gets a new identity when the layer's state changes. Only a new
  // step scrolls its anchor into view and shows the callout.
  const showCalloutRef = useCommittedRef(showCallout);

  // Which way the person was going when a step starts: Back, or anything else.
  const travelRef = useRef<{id: string; travel: Travel} | null>(null);
  const lastShownIdRef = useRef<string | null>(null);
  const reportedMissingRef = useRef<string | null>(null);
  const preparationRef = useRef<{
    id: string;
    hasThrown: boolean;
    pending: Promise<void> | undefined;
    // Whether focus was on the tour before the step's `showAction` ran.
    heldFocus: boolean;
  } | null>(null);
  // What the step that starts next does about focus, decided as it starts.
  const focusPlanRef = useRef<{id: string; movesFocus: boolean} | null>(null);
  const hostSettlesRef = useRef(true);

  // External system: the development console, which names a mistake in the
  // steps or the active id.
  useEffect(() => {
    if (new Set(stepsProp.map(step => step.id)).size !== stepsProp.length) {
      devWarn(
        'Tour',
        'Two steps share an id. The later step is ignored. Give each step a unique id.',
      );
    }
    if (activeId != null && effectiveId == null && !hasPromotion) {
      devWarn(
        'Tour',
        `activeId "${activeId}" matches no step, so nothing shows.`,
      );
    }
  }, [stepsProp, activeId, effectiveId, hasPromotion]);

  // Sync the app with the step that replaces a removed active step.
  useEffect(() => {
    if (!hasPromotion) {
      return;
    }
    if (promotedTo == null) {
      latest.current.onEnd('complete');
    } else {
      latest.current.onActiveIdChange(promotedTo);
    }
  }, [hasPromotion, promotedTo, latest]);

  // Sync the step that shows with the app's active step. It runs the step's
  // `showAction`, reads the step's anchor from the document, and reports a
  // missing anchor, a skipped step or the end of the tour to the app.
  useEffect(() => {
    if (reportedMissingRef.current !== effectiveId) {
      reportedMissingRef.current = null;
    }
    if (preparationRef.current?.id !== effectiveId) {
      preparationRef.current = null;
    }
    if (effectiveId == null) {
      dispatch({type: 'stop'});
      return;
    }
    const step = latest.current.steps.find(item => item.id === effectiveId);
    if (step == null) {
      return;
    }
    const pendingTravel = travelRef.current;
    const travel: Travel =
      pendingTravel?.id === effectiveId ? pendingTravel.travel : 'forward';
    travelRef.current = null;

    // Whether focus is on the tour: in the callout, on the anchor of the step
    // that shows, or on nothing.
    const holdsFocus = (): boolean => {
      const surface = contentRef.current;
      const active = deepActiveElement(surface?.ownerDocument ?? document);
      const formerAnchor = latest.current.shownStep?.anchorRef?.current;
      return (
        active == null ||
        active === active.ownerDocument.body ||
        (surface != null && containsAlongFlatTree(surface, active)) ||
        (formerAnchor != null && containsAlongFlatTree(formerAnchor, active))
      );
    };

    let isStale = false;
    const start = (isRejected: boolean) => {
      if (isStale) {
        return;
      }
      const current = latest.current;
      const isMissing =
        isRejected ||
        (step.anchorRef != null && !isInDocument(step.anchorRef.current));
      if (isMissing) {
        // An Effect that runs twice for one start reports once.
        const isReported = reportedMissingRef.current === step.id;
        reportedMissingRef.current = step.id;
        if (!isReported) {
          current.onMissingAnchor?.(step.id);
          devWarn(
            'Tour',
            `Step "${step.id}" started without its anchor in the document.`,
          );
        }
        if (isReported && current.missingAnchorBehavior !== 'center') {
          return;
        }
        if (current.missingAnchorBehavior === 'endTour') {
          current.onEnd('complete');
          return;
        }
        if (current.missingAnchorBehavior === 'skipStep') {
          const index = current.steps.findIndex(item => item.id === step.id);
          const target =
            current.steps[travel === 'back' ? index - 1 : index + 1];
          if (target != null) {
            travelRef.current = {id: target.id, travel};
            current.onActiveIdChange(target.id);
          } else if (travel === 'forward') {
            current.onEnd('complete');
          } else {
            const former = lastShownIdRef.current;
            if (
              former != null &&
              current.steps.some(item => item.id === former)
            ) {
              current.onActiveIdChange(former);
            } else {
              current.onEnd('complete');
            }
          }
          return;
        }
      }
      const stepAnchor = isMissing ? null : step.anchorRef?.current;
      // A step with no anchor to render beside starts in the latest open
      // modal, where it can be used.
      const host = isInDocument(stepAnchor)
        ? hostAround(stepAnchor)
        : getActiveModalOutlet();
      // Read as the step shows: the person may move focus while a
      // preparation is pending. A layer that the preparation opened takes
      // focus as it opens; focus that the tour held before still follows the
      // tour into that layer.
      const active = deepActiveElement(
        contentRef.current?.ownerDocument ?? document,
      );
      const isFocusInHost =
        host != null &&
        active != null &&
        (layerOf(host) ?? host).contains(active);
      const movesFocus =
        current.hasBackdrop ||
        holdsFocus() ||
        (preparationRef.current?.heldFocus === true && isFocusInHost);
      focusPlanRef.current = {id: step.id, movesFocus};
      lastShownIdRef.current = step.id;
      dispatch({
        type: 'show',
        shown: {
          id: step.id,
          startedMissing: isMissing,
          step,
          index: current.steps.findIndex(item => item.id === step.id),
          announces: !movesFocus,
        },
        anchorState:
          isMissing || step.anchorRef == null ? 'centered' : 'anchored',
        host,
      });
    };

    // An Effect that runs twice for one start prepares the step once.
    let preparation = preparationRef.current;
    if (preparation == null) {
      preparation = {
        id: step.id,
        hasThrown: false,
        pending: undefined,
        heldFocus: holdsFocus(),
      };
      try {
        preparation.pending = step.showAction?.() ?? undefined;
      } catch {
        preparation.hasThrown = true;
      }
      preparationRef.current = preparation;
    }
    if (preparation.pending == null) {
      start(preparation.hasThrown);
    } else {
      dispatch({type: 'prepare'});
      preparation.pending.then(
        () => start(false),
        () => start(true),
      );
    }
    return () => {
      isStale = true;
    };
  }, [effectiveId, latest, contentRef]);

  // Where the callout sits follows the anchor the popover read in this commit.
  useIsomorphicLayoutEffect(() => {
    if (shownStep == null) {
      return;
    }
    const anchor = calloutAnchorRef.current;
    const next: AnchorState =
      anchor == null
        ? 'absent'
        : anchor === overlayRef.current
          ? 'centered'
          : 'anchored';
    const stepAnchor = next === 'anchored' ? anchor : null;
    const nextHost =
      stepAnchor != null
        ? hostAround(stepAnchor)
        : host != null && isOpenHost(host)
          ? host
          : null;
    // The focus effect below waits for the host: a new host mounts the
    // callout again, and focus moves once, to the heading of that mount.
    hostSettlesRef.current = nextHost === host;
    if (nextHost !== host) {
      // The callout mounts again in the new host. Focus that it holds goes
      // to the heading of the new mount.
      const surface = contentRef.current;
      const active = deepActiveElement(surface?.ownerDocument ?? document);
      if (
        surface != null &&
        active != null &&
        containsAlongFlatTree(surface, active)
      ) {
        focusPlanRef.current = {id: shownStep.id, movesFocus: true};
      }
    }
    dispatch({
      type: 'place',
      anchorState: next,
      ringRadius: stepAnchor == null ? null : ringRadiusFor(stepAnchor),
      host: nextHost,
    });
  });

  // A host that closes changes where the tour renders with no render of this
  // component. Its event asks for one, and the layout effect above places
  // the tour.
  const [, requestPlacement] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    // A popover reports `toggle` and a dialog reports `close`, each on the
    // layer element itself; neither event bubbles.
    const layer = host == null ? null : layerOf(host);
    if (layer == null) {
      return;
    }
    layer.addEventListener('toggle', requestPlacement);
    layer.addEventListener('close', requestPlacement);
    return () => {
      layer.removeEventListener('toggle', requestPlacement);
      layer.removeEventListener('close', requestPlacement);
    };
  }, [host]);

  const isActive = effectiveId != null;
  const isMounted = shown != null;
  const isRunning = isActive && isMounted;
  const shownId = shown?.id ?? null;

  // The overlay enters the top layer as it mounts, before the callout shows,
  // so the callout stacks above it. It mounts again in each new host.
  const attachOverlay = useCallback((overlay: HTMLDivElement | null) => {
    overlayRef.current = overlay;
    if (overlay == null || typeof overlay.showPopover !== 'function') {
      return;
    }
    // React attaches a ref twice in development.
    if (!isShownAsPopover(overlay)) {
      overlay.showPopover();
    }
  }, []);

  // Show the callout for each step. A call on an open callout reads the
  // step's anchor again and moves the callout to it.
  useIsomorphicLayoutEffect(() => {
    if (!isRunning) {
      return;
    }
    const anchor = latest.current.shownStep?.anchorRef?.current;
    if (
      latest.current.hasScrollIntoView &&
      isInDocument(anchor) &&
      typeof anchor.scrollIntoView === 'function'
    ) {
      anchor.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: matchesMediaQuery(
          anchor.ownerDocument.defaultView,
          '(prefers-reduced-motion: reduce)',
        )
          ? 'instant'
          : 'smooth',
      });
    }
    showCalloutRef.current({skipAutoFocus: true});
  }, [isRunning, shownId, showCalloutRef, latest]);

  // The app ended the tour. The callout is still in the document here.
  // Focus that the tour holds goes to the last step's anchor if the anchor
  // takes focus. The popover returns focus in every other case.
  useIsomorphicLayoutEffect(() => {
    if (isActive || latest.current.shown == null) {
      return;
    }
    const surface = contentRef.current;
    const doc = surface?.ownerDocument ?? document;
    const active = deepActiveElement(doc);
    const anchor = latest.current.shownStep?.anchorRef?.current;
    const isFocusOnTour =
      active == null ||
      active === doc.body ||
      (surface != null && containsAlongFlatTree(surface, active));
    if (
      isFocusOnTour &&
      isHTMLElement(anchor) &&
      anchor.isConnected &&
      takesFocusAsIs(anchor)
    ) {
      anchor.focus();
    }
    hideCallout();
  }, [isActive, hideCallout, contentRef, latest]);

  // Focus moves to the new step's heading once the callout is open and shows
  // the step. It runs before the paint, so no frame shows focus on the page
  // body after a control of the last step left.
  useIsomorphicLayoutEffect(() => {
    const plan = focusPlanRef.current;
    if (
      !isOpen ||
      isPending ||
      !hostSettlesRef.current ||
      plan == null ||
      plan.id !== shownId
    ) {
      return;
    }
    focusPlanRef.current = null;
    if (plan.movesFocus) {
      headingRef.current?.focus({preventScroll: true});
    }
  }, [isOpen, isPending, shownId, host]);

  useAnnounceRenderedText(
    headingRef,
    isOpen && !isPending && shown?.announces === true,
    String(starts),
    {isOncePerOccasion: true},
  );

  const getSurface = useCallback(() => contentRef.current, [contentRef]);
  useLayerDismissal({
    isActive: isRunning && isOpen,
    onDismiss: () => onEnd('escape'),
    getContainer: getSurface,
    isPresent: hasBackdrop
      ? undefined
      : () => isFocusInScope(contentRef.current),
  });

  if (shown == null || shownStep == null) {
    return null;
  }

  const isFirst = shownIndex === 0;
  const isLast = shownIndex === steps.length - 1;
  const placement = shownStep.placement ?? 'below';
  const hasRing = anchorState === 'anchored' && !isPending;

  // A step that prepares shows no callout, so its controls move no step.
  const goBack = () => {
    const target = steps[shownIndex - 1];
    if (target != null && !isPending) {
      travelRef.current = {id: target.id, travel: 'back'};
      onActiveIdChange(target.id);
    }
  };
  const goNext = () => {
    if (isPending) {
      return;
    }
    const target = steps[shownIndex + 1];
    if (target == null) {
      onEnd('complete');
    } else {
      onActiveIdChange(target.id);
    }
  };

  const callout = (
    <>
      <VStack gap={1}>
        <HStack gap={2} xstyle={styles.header}>
          <Heading
            ref={headingRef}
            id={titleId}
            level={4}
            tabIndex={-1}
            xstyle={[styles.title, focusOutlineStyles.focusVisible]}>
            {shownStep.title}
          </Heading>
          <IconButton
            variant="ghost"
            size="sm"
            label={t('@astryx.tour.close')}
            icon={<Icon icon="close" size="sm" />}
            onClick={() => onEnd('close')}
          />
        </HStack>
        {hasBody && (
          <Text type="body" id={bodyId}>
            {shownStep.body}
          </Text>
        )}
      </VStack>
      <HStack
        gap={2}
        wrap="wrap"
        xstyle={[styles.footer, !hasStepCount && styles.footerWithoutCount]}>
        {hasStepCount && (
          <Text type="supporting" color="secondary" id={countId}>
            {t('@astryx.tour.stepCount', {
              current: shownIndex + 1,
              total: steps.length,
            })}
          </Text>
        )}
        <HStack gap={2} wrap="wrap" justify="end">
          {hasSkipButton && (
            <Button
              variant="ghost"
              size="sm"
              label={skipLabel ?? t('@astryx.tour.skip')}
              onClick={() => onEnd('skip')}
            />
          )}
          {!isFirst && (
            <Button
              variant="ghost"
              size="sm"
              label={t('@astryx.tour.back')}
              aria-disabled={isPending || undefined}
              onClick={goBack}
            />
          )}
          <Button
            variant="primary"
            size="sm"
            label={
              isLast
                ? (doneLabel ?? t('@astryx.tour.done'))
                : (nextLabel ?? t('@astryx.tour.next'))
            }
            aria-disabled={isPending || undefined}
            onClick={goNext}
          />
        </HStack>
      </HStack>
    </>
  );

  // Each step mounts the overlay and the callout again. Both then enter the
  // top layer above every layer that opened before the step. The callout's
  // place in the focus order follows this step's anchor.
  const tour = (
    <Fragment key={shown.id}>
      <div
        ref={attachOverlay}
        popover="manual"
        aria-hidden="true"
        {...mergeProps(
          themeProps('tour-overlay', {
            backdrop: hasBackdrop ? 'backdrop' : null,
          }),
          stylex.props(
            styles.overlay,
            hasBackdrop && styles.backdrop,
            hasBackdrop && !hasRing && styles.dimmed,
            hasBackdrop && hasRing && styles.dimmedWithoutRing,
          ),
        )}
        // A press on the overlay does not reach handlers around where Tour is
        // written.
        {...layerClickBoundary({
          onClick: hasBackdrop ? () => onEnd('backdrop') : undefined,
        })}>
        {hasRing && (
          <div
            {...mergeProps(
              themeProps('tour-highlight', {
                backdrop: hasBackdrop ? 'backdrop' : null,
              }),
              stylex.props(
                styles.ring,
                hasBackdrop && styles.cutout,
                styles.ringAnchor(popover.anchorId, ringRadius),
              ),
            )}
          />
        )}
      </div>
      {popover.render(
        callout,
        anchorState === 'centered'
          ? {
              positioning: 'custom',
              xstyle: [styles.centered, isPending && styles.pending],
            }
          : {
              placement,
              alignment: shownStep.alignment ?? 'start',
              // Clear of the ring, which reaches past the anchor.
              offset: spacingVars['--spacing-3'],
              xstyle: isPending && styles.pending,
            },
      )}
    </Fragment>
  );

  return host == null ? tour : createPortal(tour, host);
}

Tour.displayName = 'Tour';
