// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Stepper.tsx
 * @input Uses React, stylex, theme tokens, StepperContext
 * @output Exports Stepper component and StepperProps
 * @position Core container component; consumed by index.ts
 *
 * Besides the props it is given, this component tracks the `activeStep` it
 * last rendered with and publishes it on the context. Steps need the distance
 * and direction of a change to choreograph their connector fill; see the
 * CONNECTOR FILL block in Step.tsx. A horizontal Stepper applies public layout
 * styling to the frame that contains both the list and compact summary, while
 * the semantic `<ol>` remains the measured ref and DOM pass-through target.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Stepper/Stepper.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Stepper/Stepper.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Stepper/index.ts (exports if types change)
 * - /apps/storybook/stories/Stepper.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Stepper/ (showcase blocks)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import {spacingVars} from '../theme/tokens.stylex';
import {mergeProps, rtlStyles} from '../utils';
import {observeResize} from '../utils/sharedResizeObserver';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import {
  StepperContext,
  StepperInternalContext,
  type StepperContextValue,
  type StepperOrientation,
  type StepperIndicatorPosition,
  type StepperInternalContextValue,
  type StepperRegistrationOptions,
} from './StepperContext';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Stepper/Stepper.generated';

registerEnglishFallback(english);

/**
 * Default width below which a step can no longer hold its own label. Under
 * about this much a one-word label starts breaking mid-word and a two-word one
 * stacks, which costs more vertical space than the row that replaces all of
 * them — and reads worse, because every step pays for text only one of them
 * needs now. Consumers can replace it through
 * `horizontalOptions.minimumStepWidth` when their labels or layout need a
 * different threshold.
 *
 * Applied per step rather than to the stepper, so where the collapse happens
 * follows the count: four steps hold out to 448px, seven need 784px.
 */
const DEFAULT_MIN_STEP_WIDTH = 112;
const DEFAULT_COLLAPSED_VARIANT = 'withLabelAndControls';

export type StepperCollapsedVariant =
  'withLabelAndControls' | 'withLabel' | 'hiddenLabel';

export interface StepperHorizontalOptions {
  /**
   * Minimum width in pixels allocated to each step before a horizontal Stepper
   * collapses.
   * @default 112
   */
  minimumStepWidth: number;
  /**
   * Presentation used when the horizontal Stepper collapses.
   * - `withLabelAndControls`: current-step label and navigation controls.
   * - `withLabel`: current-step label without controls.
   * - `hiddenLabel`: bare progress track with no compact row.
   * `withLabelAndControls` renders its controls only when `onStepClick` is set.
   * @default 'withLabelAndControls'
   */
  collapsedVariant: StepperCollapsedVariant;
}

export interface StepperProps extends BaseProps<HTMLOListElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLOListElement>;
  /**
   * Zero-based index of the active step.
   */
  activeStep: number;
  /**
   * Step elements to render.
   */
  children: ReactNode;
  /**
   * Layout direction of the stepper.
   * @default 'horizontal'
   */
  orientation?: StepperOrientation;
  /**
   * Called when a step is clicked, or when a compact summary control is used.
   * Enables non-linear navigation. At compact horizontal widths, individual
   * track nodes are presentational; when the collapsed variant includes
   * summary controls, those controls skip disabled steps.
   */
  onStepClick?: (index: number) => void;
  /**
   * Accessible label describing the set of steps. Defaults to a translated
   * "Progress" when unset.
   */
  label?: string;
  /**
   * Controls density (padding) of all steps.
   * @default 'balanced'
   */
  density?: 'compact' | 'balanced' | 'spacious';
  /**
   * Controls where each step's indicator sits relative to the connector track.
   * - 'separated': indicator lives in the label row, distinct from the progress
   *   bar (the original Astryx layout).
   * - 'on-track': indicator is slotted into the connector line as a node on the
   *   track (the on-track indicator design).
   * @default 'separated'
   */
  indicatorPosition?: StepperIndicatorPosition;
  /**
   * Options specific to the horizontal layout. `minimumStepWidth` controls the
   * per-step collapse threshold; `collapsedVariant` selects a label with
   * controls, a label alone, or a bare progress track.
   * @default {minimumStepWidth: 112, collapsedVariant: 'withLabelAndControls'}
   */
  horizontalOptions?: StepperHorizontalOptions;
}

const styles = stylex.create({
  root: {
    // Horizontal consumer styles live on the frame. Explicit inheritance keeps
    // the public variable discoverable on this theme target without masking a
    // frame value; the connector use site supplies the 0px default.
    '--step-connector-gap': 'inherit',
    display: 'flex',
    width: '100%',
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  // The gap between steps is the break between connector segments, so it is
  // sized to match the connector's own thickness (BAR_WIDTH, the same token).
  // That keeps the track reading as one dashed line rather than as bars with
  // an arbitrary space between them, and holds at any theme scale.
  horizontal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-1'],
  },
  vertical: {
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  // On-track: steps must abut so their connector segments form one continuous
  // line, so the inter-step gap collapses to zero.
  horizontalOnTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 0,
  },
  verticalOnTrack: {
    flexDirection: 'column',
    gap: 0,
  },
  // The horizontal component's public layout box: consumer styling sizes and
  // places the track and compact summary together. The list fills this frame,
  // so observing its width still measures the complete component constraint.
  frame: {
    '--step-connector-gap': '0px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    width: '100%',
  },
  // Laid out as a row so the controls can bracket the step: they belong at the
  // edges the flow moves between, and the name reads between them.
  summary: {
    alignItems: 'center',
    display: 'flex',
    gap: spacingVars['--spacing-2'],
    justifyContent: 'space-between',
    minWidth: 0,
  },
  // Centred, so the name sits under the middle of the track rather than
  // drifting toward whichever control happens to be enabled.
  summaryBody: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    textAlign: 'center',
  },
});

/**
 * A stepper component for multi-step workflows. Displays numbered steps
 * with visual indicators for completed, active, and upcoming states.
 *
 * Each Step child must provide a `step` prop (zero-based index) so it
 * can derive its state from the parent's activeStep. The on-track layout
 * hides the leading connector on the first step and the trailing connector
 * on the last step structurally, from each step's own `<li>` position, so
 * it works regardless of how the steps are grouped.
 *
 * Rendered as an ordered list (`<ol>`/`<li>`) rather than a `nav`
 * landmark: a stepper communicates *progress through a sequence*, not a
 * set of site navigation links. The active step is marked with
 * `aria-current="step"` (handled per-step) and the list carries an
 * accessible `label`. This follows the WAI-ARIA pattern for steppers /
 * progress sequences and avoids polluting the page's landmark map.
 *
 * @example
 * ```
 * <Stepper activeStep={1}>
 *   <Step step={0} label="Account" />
 *   <Step step={1} label="Profile" />
 *   <Step step={2} label="Review" />
 * </Stepper>
 * ```
 */
export function Stepper({
  activeStep,
  children,
  orientation = 'horizontal',
  onStepClick,
  label: labelFromProps,
  density = 'balanced',
  indicatorPosition = 'separated',
  horizontalOptions,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: StepperProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.stepper.label');
  const minimumStepWidth =
    horizontalOptions?.minimumStepWidth ?? DEFAULT_MIN_STEP_WIDTH;
  const collapsedVariant =
    horizontalOptions?.collapsedVariant ?? DEFAULT_COLLAPSED_VARIANT;

  // Dev-mode duplicate step index detection. Steps register on mount and
  // deregister on unmount; a Map tracks count per index so we can warn when
  // two Steps share the same `step` value (which breaks aria-current).
  const stepCountsRef = useRef<Map<number, number>>(new Map());
  // Compact navigation reads each Step's disabled state through the getter it
  // registered, so the registry does not copy state that belongs to the Step.
  // A Set keeps cleanup correct even for the invalid duplicate-index case.
  const disabledGettersRef = useRef<
    Map<number, Set<NonNullable<StepperRegistrationOptions['getIsDisabled']>>>
  >(new Map());
  // Registration changes can leave the total step count unchanged (for example
  // when a Step's disabled state changes), so this revision still prompts the
  // parent to refresh compact control availability.
  const [, setRegistrationRevision] = useState(0);
  // How many steps there are, which the stepper needs for real and not only
  // for the warning: the width each step is getting is this divided into the
  // width the stepper got. Counted from what registers rather than from the
  // children, so grouping steps in a fragment or an array cannot change the
  // answer.
  const [stepCount, setStepCount] = useState(0);
  const registerStep = useCallback(
    (index: number, options?: StepperRegistrationOptions) => {
      const counts = stepCountsRef.current;
      const prev = counts.get(index) ?? 0;
      counts.set(index, prev + 1);
      if (process.env.NODE_ENV !== 'production' && prev + 1 > 1) {
        console.warn(
          `[Stepper] Duplicate step index ${index}: two <Step> elements share the same \`step\` value. ` +
            `This breaks \`aria-current="step"\` and causes both to show as active simultaneously.`,
        );
      }

      const getIsDisabled = options?.getIsDisabled;
      if (getIsDisabled) {
        const getters = disabledGettersRef.current.get(index) ?? new Set();
        getters.add(getIsDisabled);
        disabledGettersRef.current.set(index, getters);
      }

      setStepCount(c => c + 1);
      setRegistrationRevision(revision => revision + 1);
      return () => {
        const cur = counts.get(index) ?? 1;
        if (cur <= 1) {
          counts.delete(index);
        } else {
          counts.set(index, cur - 1);
        }

        if (getIsDisabled) {
          const getters = disabledGettersRef.current.get(index);
          getters?.delete(getIsDisabled);
          if (getters?.size === 0) {
            disabledGettersRef.current.delete(index);
          }
        }

        setStepCount(c => c - 1);
        setRegistrationRevision(revision => revision + 1);
      };
    },
    [],
  );

  // The step we came *from*. Steps need it to stagger their connector fill:
  // the distance and direction of the change decide which segment moves first
  // and how long the whole sweep may take (see Step.tsx's CONNECTOR FILL).
  //
  // Derived during render from state rather than written in an effect. An
  // effect runs after paint, so the browser would already have committed the
  // new fill states with last render's delays — the first frame of the sweep
  // would be wrong, and on a jump of one that is the entire animation. React
  // discards and re-runs a render that sets its own state before committing,
  // so this costs a re-render but never a wrong frame.
  //
  // Seeding both halves from the current `activeStep` is what suppresses the
  // cascade on mount: a stepper that opens on step 3 has no previous step to
  // have travelled from, so its completed segments paint filled at once. That
  // also makes the first render pure and identical on the server, so there is
  // nothing for hydration to disagree about. Storing the pair in one state
  // object keeps the update idempotent under StrictMode's double render — both
  // invocations read the same `seen` and queue the same successor.
  const [seen, setSeen] = useState(() => ({
    current: activeStep,
    previous: activeStep,
  }));
  if (seen.current !== activeStep) {
    setSeen({current: activeStep, previous: seen.current});
  }
  const previousActiveStep =
    seen.current === activeStep ? seen.previous : seen.current;

  const isHorizontal = orientation === 'horizontal';

  // A vertical stepper gives every label a row of its own and can never run
  // out of width for them, so it opts out of all of this and renders exactly
  // the DOM it always has. A horizontal Stepper's public layout styles live on
  // its frame so they size the list and summary together; the semantic list
  // still owns the ref and DOM pass-throughs and fills that frame, so its width
  // is the effective component width to observe.
  const [rootWidth, setRootWidth] = useState(0);
  const stopObservingRootRef = useRef<(() => void) | null>(null);
  const attachRoot = useCallback(
    (el: HTMLOListElement | null) => {
      stopObservingRootRef.current?.();
      stopObservingRootRef.current = null;
      if (el && isHorizontal) {
        // observeResize calls back once, synchronously, as it subscribes. That
        // is what keeps the collapse off the screen: a ref callback runs during
        // commit, so the width lands and the re-render happens before the
        // browser has painted the uncollapsed stepper it would otherwise show
        // first.
        stopObservingRootRef.current = observeResize(el, entry =>
          setRootWidth(entry.target.clientWidth),
        );
      }
    },
    [isHorizontal],
  );
  const rootRef = useMergedRefs(ref, attachRoot);
  useEffect(
    () => () => {
      stopObservingRootRef.current?.();
      stopObservingRootRef.current = null;
    },
    [],
  );

  // Width is measured rather than asked of a container query because the
  // answer changes what is *rendered*, not just how it looks: the labels and
  // their click targets leave the DOM entirely. A query could only have hidden
  // them, which would leave every step's text in the tree for a consumer's
  // `getByText` to trip over and every collapsed step still holding a focus
  // stop with nothing visible to show for it. Step content is the exception:
  // it stays mounted and is hidden so local state survives a resize.
  //
  // Either value being zero means the stepper has not been told something it
  // needs yet — on the server, and for the one commit before the observer
  // fires and the steps register — and until it has, it renders whole.
  const isCompact =
    isHorizontal &&
    rootWidth > 0 &&
    stepCount > 0 &&
    rootWidth / stepCount < minimumStepWidth;

  const [summarySlot, setSummarySlot] = useState<HTMLElement | null>(null);

  const publicCtxValue = useMemo<StepperContextValue>(
    () => ({
      activeStep,
      previousActiveStep,
      orientation,
      isNonLinear: onStepClick != null,
      onStepClick: onStepClick ?? null,
      density,
      indicatorPosition,
      registerStep,
    }),
    [
      activeStep,
      previousActiveStep,
      orientation,
      onStepClick,
      density,
      indicatorPosition,
      registerStep,
    ],
  );
  const internalCtxValue = useMemo<StepperInternalContextValue>(
    () => ({
      ...publicCtxValue,
      stepCount,
      isCompact,
      summarySlot,
    }),
    [publicCtxValue, stepCount, isCompact, summarySlot],
  );

  const isOnTrack = indicatorPosition === 'on-track';
  const orientationStyle =
    orientation === 'horizontal'
      ? isOnTrack
        ? styles.horizontalOnTrack
        : styles.horizontal
      : isOnTrack
        ? styles.verticalOnTrack
        : styles.vertical;

  // Horizontal Stepper has two roots with separate contracts: the frame owns
  // public layout styling because it contains the complete visual component,
  // while the ordered list keeps its theme target, ref, and native DOM props.
  // Vertical Stepper has no frame, so its list remains both roots as before.
  const listXstyle = isHorizontal ? undefined : xstyle;
  const listClassName = isHorizontal ? undefined : className;
  const listStyle = isHorizontal ? undefined : style;
  const list = (
    <ol
      ref={rootRef}
      aria-label={label}
      {...rest}
      {...mergeProps(
        themeProps('stepper', {orientation, indicatorPosition}),
        stylex.props(styles.root, orientationStyle, listXstyle),
        listClassName,
        listStyle,
      )}>
      {/* Each step renders its own progress bar segment; no child
          introspection needed — steps derive state from context. */}
      {children}
    </ol>
  );

  if (!isHorizontal) {
    return (
      <StepperContext value={publicCtxValue}>
        <StepperInternalContext value={internalCtxValue}>
          {list}
        </StepperInternalContext>
      </StepperContext>
    );
  }

  // Controls appear only in the variant that asks for them and where there is
  // something for them to do. `onStepClick` answers whether the steps are
  // navigable at all; `collapsedVariant` answers whether this stepper should be
  // the thing that navigates them once collapsed. They come apart in the common
  // wizard — clickable steps at full width, the form's own Back and Continue on
  // a phone — which is why the handler alone cannot decide it.
  //
  // Unlike TabList's scroll arrows — decorative, aria-hidden, skipped by the
  // keyboard because every tab can still be reached by arrowing the strip —
  // these are the way through a collapsed stepper wherever they appear. So
  // they are real controls with real names, and they take focus. Disabled
  // steps are omitted exactly as they are from the full-width set of clickable
  // steps.
  const showsControls =
    collapsedVariant === 'withLabelAndControls' && onStepClick != null;

  // hiddenLabel deliberately renders only the progress track. Omitting the
  // whole row also avoids spending the frame's gap on empty layout.
  const showsSummary = isCompact && collapsedVariant !== 'hiddenLabel';

  const adjacentEnabledStep = (delta: -1 | 1): number | null => {
    let target: number | null = null;
    for (const index of stepCountsRef.current.keys()) {
      if (
        [...(disabledGettersRef.current.get(index) ?? [])].some(getIsDisabled =>
          getIsDisabled(),
        )
      ) {
        continue;
      }
      if (
        delta === -1
          ? index < activeStep && (target == null || index > target)
          : index > activeStep && (target == null || index < target)
      ) {
        target = index;
      }
    }
    return target;
  };

  const control = (delta: -1 | 1) => {
    if (!showsControls || onStepClick == null) {
      return null;
    }
    const targetAtRender = adjacentEnabledStep(delta);
    const name =
      delta === -1
        ? t('@astryx.stepper.previousStep')
        : t('@astryx.stepper.nextStep');
    return (
      <IconButton
        variant="ghost"
        label={name}
        tooltip={name}
        icon={
          <Icon
            icon={delta === -1 ? 'chevronLeft' : 'chevronRight'}
            xstyle={rtlStyles.mirror}
          />
        }
        isDisabled={targetAtRender == null}
        onClick={() => {
          // A custom registration may read state that changed without causing
          // Stepper to render. Resolve again at activation so a target that
          // became disabled cannot be selected from the render-time snapshot.
          const currentTarget = adjacentEnabledStep(delta);
          if (currentTarget != null) {
            onStepClick(currentTarget);
          }
        }}
      />
    );
  };

  return (
    <StepperContext value={publicCtxValue}>
      <StepperInternalContext value={internalCtxValue}>
        <div
          {...mergeProps(
            themeProps('stepper-frame'),
            stylex.props(styles.frame, xstyle),
            className,
            style,
          )}>
          {list}
          {showsSummary && (
            <div
              {...mergeProps(
                themeProps('stepper-summary'),
                stylex.props(styles.summary),
              )}>
              {control(-1)}
              {/* The list above still carries every step's name and status, so
                this visual row is hidden from assistive technology to avoid
                announcing the current step twice. hiddenLabel withholds the
                entire row above, leaving the accessible list as a bare track. */}
              <div
                ref={setSummarySlot}
                aria-hidden="true"
                {...stylex.props(styles.summaryBody)}
              />
              {control(1)}
            </div>
          )}
        </div>
      </StepperInternalContext>
    </StepperContext>
  );
}

Stepper.displayName = 'Stepper';
