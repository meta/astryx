// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Collapsible.tsx
 * @input Uses React, StyleX, useCollapsible hook, CollapsibleGroupPresentationContext, getIcon, theme tokens
 * @output Exports Collapsible component and CollapsibleProps
 * @position Collapsible content primitive — trigger toggles visibility of children
 *
 * Collapsible is a standalone primitive that makes any content collapsible.
 * It renders a trigger area (always visible) and a content area that toggles.
 * Handles state management, accessibility (aria-expanded + aria-controls linking
 * the trigger to its content region), and chevron indicator.
 *
 * Works standalone or coordinated by CollapsibleGroup via the `value` prop.
 * When the surrounding CollapsibleGroup sets `hasDividers`, each Collapsible
 * draws its own row chrome (borderBlockStart suppressed on :first-child, plus
 * density padding) from CollapsibleGroupPresentationContext — StyleX has no
 * child selectors, so the group cannot draw it from outside. The presentation
 * context is reset around children so nested collapsibles stay chrome-free.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Collapsible/index.ts (exports)
 * - /packages/core/src/Collapsible/Collapsible.doc.mjs
 * - /apps/storybook/stories/Collapsible.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Collapsible/ (showcase blocks)
 */

import {
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  typographyVars,
  fontWeightVars,
  spacingVars,
  typeScaleVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';

import {useCollapsible} from './useCollapsible';
import {LayoutChangeSnapshot} from '../motion/LayoutChangeSnapshot';
import {
  applyLayoutChangeTransition,
  holdLayoutExit,
  playLayoutChange,
  releaseLayoutExit,
  reportLayoutChange,
  type AnimatedLayout,
} from '../motion/animatedLayout';
import {CollapsibleGroupPresentationContext} from './CollapsibleGroupContext';
import type {CollapsibleChevronPosition} from './CollapsibleGroupContext';
import {Icon} from '../Icon';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

const styles = stylex.create({
  root: {
    width: '100%',
  },
  // Trigger button — full width, flex row, no browser button styling.
  // Anchors heading-adjacent typography (body family, large size, semibold)
  // so the label reads as a section header regardless of where the
  // Collapsible is placed. External themes retarget it independently from the
  // content via the `astryx-collapsible-trigger` target — e.g. a heading font
  // on the trigger while the content stays on the body font.
  trigger: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-primary'],
    textAlign: 'start',
    paddingBlock: 0,
    // Restore a keyboard-only focus ring using the standard token/offset
    // (WCAG 2.4.7).
  },
  // Capsize: trim leading from text triggers
  triggerLabel: {
    textBoxEdge: 'cap alphabetic',
    textBoxTrim: 'trim-both',
    // Fill the row rather than hug the label. For a text trigger this changes
    // nothing — `space-between` already had it against the start edge and the
    // chevron against the end — but it is what lets a composed trigger put
    // something out at the far edge, next to the chevron, rather than trailing
    // the label with the free space stranded after it.
    //
    // Growing only. The flex floor stays at `auto`, so a label still cannot be
    // squeezed narrower than its own content and nothing that used to fit
    // starts overlapping the chevron.
    flexGrow: 1,
  },
  // Disabled trigger — non-interactive, dimmed. Native `disabled` on the
  // button blocks click + keyboard activation.
  triggerDisabled: {
    cursor: 'default',
    opacity: 0.5,
  },
  // Chevron indicator
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // The chevron is sized off the trigger's own type size (--text-large-size,
    // 17px), which sits between Icon's `sm` (16px) and `md` (20px) boxes.
    // Pinning the box to the token keeps the glyph exactly the size it was
    // when it was a bare 1em SVG inheriting the trigger's font-size, and keeps
    // it tracking the trigger if a theme retunes that step.
    width: typeScaleVars['--text-large-size'],
    height: typeScaleVars['--text-large-size'],
    fontSize: typeScaleVars['--text-large-size'],
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  chevronClosed: {
    transform: 'rotate(0deg)',
  },
  // Leading chevron. `space-between` puts nothing between the arrow and the
  // label — they are adjacent flex children — so the gap is the chevron's own.
  chevronStart: {
    marginInlineEnd: spacingVars['--spacing-2'],
  },
  // A leading arrow rotates a quarter turn rather than a half: it points into
  // the row when closed and turns down when open, which is the disclosure
  // convention TreeList already uses. RTL mirrors it so "into the row" still
  // means towards the content, and the mirror is spelled out per state because
  // a bare `transform` would otherwise overwrite the rotation.
  chevronStartOpen: {
    transform: {
      default: 'rotate(90deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(90deg)',
    },
  },
  chevronStartClosed: {
    transform: {
      default: 'rotate(0deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(0deg)',
    },
  },
  // Content area
  contentHidden: {
    display: 'none',
  },
  // Anchors body typography so revealed text renders at the system's body
  // scale (family/size/weight/leading) instead of inheriting from wherever
  // the Collapsible is placed. External themes override via the
  // `astryx-collapsible-content` target, independently from the trigger.
  content: {
    paddingBlockStart: spacingVars['--spacing-1'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: typeScaleVars['--text-body-weight'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
  },
  // Group divider chrome — a hairline above every item except the first.
  // The group's wrapper (or 'all' mode) owns the outer edges.
  divided: {
    borderBlockStartWidth: {
      default: borderVars['--border-width'],
      ':first-child': '0',
    },
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
  },
});

// Density padding for divided/padded accordion rows. paddingBlock mapping
// follows Table's density scale (spacing-1/2/3); content only pads its end
// so text doesn't sit on the divider below (block-start stays spacing-1).
const densityStyles = stylex.create({
  triggerCompact: {paddingBlock: spacingVars['--spacing-1']},
  triggerBalanced: {paddingBlock: spacingVars['--spacing-2']},
  triggerSpacious: {paddingBlock: spacingVars['--spacing-3']},
  contentCompact: {paddingBlockEnd: spacingVars['--spacing-1']},
  contentBalanced: {paddingBlockEnd: spacingVars['--spacing-2']},
  contentSpacious: {paddingBlockEnd: spacingVars['--spacing-3']},
});

const triggerDensity = {
  compact: densityStyles.triggerCompact,
  balanced: densityStyles.triggerBalanced,
  spacious: densityStyles.triggerSpacious,
} as const;

const contentDensity = {
  compact: densityStyles.contentCompact,
  balanced: densityStyles.contentBalanced,
  spacious: densityStyles.contentSpacious,
} as const;

export interface CollapsibleProps extends BaseProps {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content shown in the trigger area (always visible).
   * Rendered inside a button with aria-expanded and a chevron indicator.
   */
  trigger: ReactNode;

  /**
   * Content that collapses/expands when the trigger is clicked.
   */
  children?: ReactNode;

  /**
   * Default open state for standalone uncontrolled usage. Ignored when `value`
   * binds this item to a surrounding CollapsibleGroup.
   * @default true
   */
  defaultIsOpen?: boolean;

  /**
   * Controlled open state for standalone usage. Ignored when `value` binds this
   * item to a surrounding CollapsibleGroup.
   */
  isOpen?: boolean;

  /**
   * Whether the collapsible is disabled. A disabled item can't be toggled —
   * its trigger is non-interactive and dimmed. Following the system-wide
   * disabled convention, the trigger uses `aria-disabled` (not the native
   * `disabled` attribute) and drops out of the tab order, staying perceivable
   * to assistive tech. The content stays in whatever open state it was;
   * disabling doesn't collapse an already-open item.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Callback when standalone open state changes. A surrounding
   * CollapsibleGroup owns grouped state and calls its `onChange` instead.
   */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * The handle from `useAnimatedLayout({containerRef})`. With it, opening and
   * closing glides the content after this Collapsible, up to that container,
   * instead of jumping, and the chevron turns on the same timing.
   */
  animatedLayout?: AnimatedLayout;

  /**
   * Logical position of the disclosure chevron.
   *
   * - `end` (default): a trailing indicator that points down when collapsed and
   *   up when expanded.
   * - `start`: a leading disclosure arrow ahead of the label. It points inward
   *   toward the content when collapsed, mirrors under RTL, and points down when
   *   expanded.
   *
   * Inside a CollapsibleGroup this defaults to the group's `chevronPosition`.
   *
   * @default 'end'
   */
  chevronPosition?: CollapsibleChevronPosition;

  /**
   * Unique identifier for this collapsible within a CollapsibleGroup. When set
   * inside a group, the group owns open state and its `onChange` is the
   * notification callback.
   */
  value?: string;

  /**
   * Test ID for the collapsible element.
   */
  'data-testid'?: string;
}

/**
 * A primitive that makes any content collapsible.
 *
 * Renders a trigger area (always visible) with a chevron indicator,
 * and a content area that toggles visibility on click.
 * Handles its own state by default, or defers to CollapsibleGroup
 * when a `value` prop is provided and a group is present.
 *
 * Use inside Card for elevated collapsible sections.
 * Wrap multiple instances in CollapsibleGroup for accordion behavior.
 *
 * @example
 * ```
 * <Collapsible trigger="Details">
 *   <Text type="body">Collapsible content</Text>
 * </Collapsible>
 * <Card>
 *   <Collapsible trigger="Settings">
 *     <SettingsForm />
 *   </Collapsible>
 * </Card>
 * <CollapsibleGroup type="single" defaultValue="general">
 *   <VStack gap={2}>
 *     <Card>
 *       <Collapsible trigger="General" value="general">
 *         <GeneralSettings />
 *       </Collapsible>
 *     </Card>
 *     <Card>
 *       <Collapsible trigger="Advanced" value="advanced">
 *         <AdvancedSettings />
 *       </Collapsible>
 *     </Card>
 *   </VStack>
 * </CollapsibleGroup>
 * ```
 */
export function Collapsible({
  trigger,
  children,
  defaultIsOpen,
  isOpen: controlledIsOpen,
  isDisabled = false,
  onOpenChange,
  chevronPosition,
  value,
  animatedLayout,
  ref,
  xstyle,
  className,
  style,
  ...props
}: CollapsibleProps) {
  const pressable = usePressFeedback();
  // Build the config for the hook
  const collapsibleConfig =
    controlledIsOpen !== undefined
      ? {isOpen: controlledIsOpen, onOpenChange}
      : {defaultIsOpen: defaultIsOpen ?? true, onOpenChange};

  const {isOpen, toggle} = useCollapsible({
    isCollapsible: collapsibleConfig,
    value,
  });

  // With an `animatedLayout` handle, the content's size change animates: the
  // content after this Collapsible, up to the handle's container, glides, and
  // the revealed content plays its own entrance on the same timing
  // (`architecture:react-component-runtime` INV12). Without one, nothing
  // changes.
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const layoutChange = useMemo(
    () => reportLayoutChange(animatedLayout, contentRef),
    [animatedLayout],
  );
  // Every open-state change, whatever caused it (a click, an owner-set
  // `isOpen`, a group's value), is measured before it lands (`spec:AST-105`
  // FR1): LayoutChangeSnapshot calls this in the commit, before the DOM
  // changes. The chevron (the trigger's Icon, its `icon` theming target)
  // turns on the glide's motion too.
  const measureChange = useCallback(() => {
    applyLayoutChangeTransition(
      animatedLayout,
      triggerRef.current?.querySelector<HTMLElement>(':scope > .astryx-icon') ??
        null,
    );
    layoutChange.measureBefore();
  }, [animatedLayout, layoutChange]);
  // Without a handle the chevron keeps the theme's own turn: a spring a handle
  // set stays only while it is passed (`spec:AST-105` FR2).
  useLayoutEffect(() => {
    if (animatedLayout == null) {
      applyLayoutChangeTransition(
        null,
        triggerRef.current?.querySelector<HTMLElement>(
          ':scope > .astryx-icon',
        ) ?? null,
      );
    }
  }, [animatedLayout]);
  // A close with a handle keeps the content rendered while it plays its exit
  // (the exit makes it inert and gives up its space), then hides it
  // (`spec:AST-105` FR4). Derived from the open state as it changes, during
  // render, so the closing commit already keeps it.
  const [renderedIsOpen, setRenderedIsOpen] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);
  if (renderedIsOpen !== isOpen) {
    setRenderedIsOpen(isOpen);
    setIsExiting(!isOpen && animatedLayout != null);
  }
  const endExit = useCallback(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- holdLayoutExit decides from layout read in the closing commit (the content's place in the area's visible part, Reduce Motion and the pointer, and whether an end margin frees its space); an exit it does not hold hides the content before the frame paints
    setIsExiting(false);
  }, []);
  const wasOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    if (wasOpenRef.current === isOpen) {
      return;
    }
    wasOpenRef.current = isOpen;
    const content = contentRef.current;
    if (content == null) {
      return;
    }
    // A change that was not measured (no handle) lands at once, entrance and
    // exit included, so the content and what follows stay in step.
    const isMeasured = layoutChange.animate();
    if (isOpen) {
      // Opened again mid-exit: the content takes its place in flow.
      releaseLayoutExit(content);
      if (isMeasured) {
        playLayoutChange(animatedLayout, content);
      }
      return;
    }
    const isHeld =
      isExiting &&
      isMeasured &&
      holdLayoutExit(animatedLayout, content, endExit);
    if (isExiting && !isHeld) {
      // An exit holdLayoutExit did not hold (unmeasured, out of view, Reduce
      // Motion with a fine pointer, or no margin frees its space): hide the
      // content before this frame paints.
      endExit();
    }
  }, [isOpen, isExiting, layoutChange, animatedLayout, endExit]);
  useLayoutEffect(() => {
    if (!isOpen && !isExiting && contentRef.current != null) {
      // Hidden again after its exit: drop the exit's inline values.
      releaseLayoutExit(contentRef.current);
    }
  }, [isOpen, isExiting]);

  // Activation is blocked by this guard rather than the native `disabled`
  // attribute, so the trigger keeps `aria-disabled` semantics and stays
  // discoverable. A native `disabled` button would silently swallow events
  // (e.g. a wrapping tooltip's hover) — the system-wide disabled convention.
  const handleToggle = () => {
    if (isDisabled) {
      return;
    }
    toggle();
  };

  const presentation = use(CollapsibleGroupPresentationContext);
  const isDivided = presentation?.hasDividers ?? false;
  const density = presentation?.density ?? null;
  // The item wins over the group so a single row can differ, but the group is
  // the level this is normally set at — mixed sides in one list read as a bug.
  const position = chevronPosition ?? presentation?.chevronPosition ?? 'end';
  const isChevronAtStart = position === 'start';

  // Links the trigger to the region it shows/hides so assistive tech can move
  // from the button to its controlled content (disclosure pattern).
  const contentId = useId();

  const chevron = (
    <Icon
      // The glyph is part of the placement, not a separate choice: a trailing
      // indicator points down and flips up, a leading one points into the row
      // and turns down. Rotating `chevronDown` by a quarter turn would leave
      // the closed state pointing the wrong way.
      icon={isChevronAtStart ? 'chevronRight' : 'chevronDown'}
      // Nearest size to the trigger's 17px type step; `chevron` re-pins the
      // exact box (see the style) so the glyph does not resize.
      size="sm"
      // Was `--color-icon-secondary` on the old wrapper span; `secondary`
      // is the same token, expressed as an Icon color.
      color="secondary"
      xstyle={[
        styles.chevron,
        isChevronAtStart && styles.chevronStart,
        isChevronAtStart
          ? isOpen
            ? styles.chevronStartOpen
            : styles.chevronStartClosed
          : isOpen
            ? styles.chevronOpen
            : styles.chevronClosed,
      ]}
    />
  );

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('collapsible', {
          density: density ?? undefined,
          divided: isDivided ? 'divided' : null,
        }),
        stylex.props(styles.root, isDivided && styles.divided, xstyle),
        className,
        style,
      )}
      {...props}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-disabled={isDisabled || undefined}
        aria-expanded={isOpen}
        aria-controls={contentId}
        // A disabled trigger drops out of the tab order so it isn't a silently
        // dead tab stop; activation stays blocked by the handleToggle guard,
        // and aria-disabled keeps the state perceivable to assistive tech —
        // the system-wide disabled convention (never native `disabled`, which
        // would swallow events like a wrapping tooltip's hover).
        tabIndex={isDisabled ? -1 : undefined}
        {...(isDisabled ? undefined : pressable)}
        {...mergeProps(
          themeProps('collapsible-trigger', {
            density: density ?? undefined,
            chevronPosition: position,
            open: isOpen ? 'open' : null,
            disabled: isDisabled ? 'disabled' : null,
          }),
          focusOutlineProps.focusVisible(
            styles.trigger,
            density != null && triggerDensity[density],
            // The system's pressed overlay on the disclosure row. The trigger
            // has no hover surface of its own, so this is the one background
            // it paints, and only while it is pressed.
            !isDisabled && interactionOverlayStyles.pressedBackgroundColor,
            isDisabled && styles.triggerDisabled,
          ),
        )}>
        {isChevronAtStart && chevron}
        <span {...stylex.props(styles.triggerLabel)}>{trigger}</span>
        {!isChevronAtStart && chevron}
      </button>
      {animatedLayout != null && (
        <LayoutChangeSnapshot value={isOpen} onBeforeChange={measureChange} />
      )}
      <div
        ref={contentRef}
        id={contentId}
        {...mergeProps(
          themeProps('collapsible-content', {
            density: density ?? undefined,
            open: isOpen ? 'open' : null,
          }),
          stylex.props(
            styles.content,
            density != null && contentDensity[density],
            !isOpen && !isExiting && styles.contentHidden,
          ),
        )}>
        {presentation != null ? (
          <CollapsibleGroupPresentationContext value={null}>
            {children}
          </CollapsibleGroupPresentationContext>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

Collapsible.displayName = 'Collapsible';
