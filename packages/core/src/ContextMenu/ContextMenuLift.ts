// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuLift.ts
 * @input The trigger element, the lift module (liftFromTrigger/), the
 *   context-menu constants and springs, the app's layer inset (LayerProvider),
 *   the theme's surface color and container radius
 * @output useContextMenuLift: lift() and drop() for UIKit's lifted preview
 *   over a tinted page, and the menu's entrance beside it. A trigger that
 *   paints no box of its own lifts on the theme's surface
 * @position The lift presentation of ContextMenu's touch invocation, run by
 *   the touch layer (ContextMenuTouchLayer.tsx). ContextMenu.tsx places the
 *   menu beside the lifted trigger.
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {use, useMemo, useRef, type RefObject} from 'react';
import {LayerContext, type LayerInset} from '../Layer/LayerContext';
import type {
  LiftFromTriggerMotion,
  LiftFromTriggerResult,
} from '../liftFromTrigger/liftFromTrigger';
import {useLiftFromTrigger} from '../liftFromTrigger/useLiftFromTrigger';
import type {MorphRect} from '../motion/rectMorph';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  CONTEXT_MENU_DISMISS_SPRING,
  CONTEXT_MENU_LIFT_SPRING,
  CONTEXT_MENU_MORPH_SPRING,
} from '../motion/uikit/springs';
import {liftContextMenuTrigger} from '../privateAttributes/contextMenuLift.stylex';
import {colorVars, radiusVars} from '../theme/tokens.stylex';

/** Whether a computed color paints nothing. */
function isClear(color: string): boolean {
  if (color === '' || color === 'transparent') {
    return true;
  }
  const alpha = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(color)?.[1];
  return alpha != null && Number(alpha) === 0;
}

/**
 * Whether the trigger, or a child that covers it, paints a box of its own: a
 * card, a picture. A row of text paints none, and the tint would show
 * through it.
 */
function paintsOwnBox(trigger: HTMLElement): boolean {
  const box = trigger.getBoundingClientRect();
  return [trigger, ...Array.from(trigger.children)].some(element => {
    const rect = element.getBoundingClientRect();
    if (rect.width < box.width - 1 || rect.height < box.height - 1) {
      return false;
    }
    if (element.matches('img, picture, video, canvas, svg')) {
      return true;
    }
    const style = getComputedStyle(element);
    return style.backgroundImage !== 'none' && style.backgroundImage !== ''
      ? true
      : !isClear(style.backgroundColor);
  });
}

/**
 * UIKit lifts a preview on an opaque rounded platter. A trigger that paints
 * no box of its own lifts on the theme's surface, at the container radius.
 * The lift pins the trigger's own background while it is up, so the platter
 * overrides that pin. The platter goes as the lift hides the trigger's
 * popover, in the task that returns it to the page.
 */
function placePlatter(trigger: HTMLElement): void {
  const {style} = trigger;
  const surface = colorVars['--color-background-surface'];
  const radius = radiusVars['--radius-container'];
  const ownRadius = style.getPropertyValue('border-radius');
  const ownRadiusPriority = style.getPropertyPriority('border-radius');
  style.setProperty('background-color', surface, 'important');
  style.setProperty('border-radius', radius, 'important');
  const remove = () => {
    trigger.removeEventListener('beforetoggle', onBeforeToggle);
    // Only what is still the platter's: the lift can put the trigger's own
    // background back first.
    if (style.getPropertyValue('background-color') === surface) {
      style.removeProperty('background-color');
    }
    if (style.getPropertyValue('border-radius') === radius) {
      if (ownRadius === '') {
        style.removeProperty('border-radius');
      } else {
        style.setProperty('border-radius', ownRadius, ownRadiusPriority);
      }
    }
  };
  const onBeforeToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'closed') {
      remove();
    }
  };
  trigger.addEventListener('beforetoggle', onBeforeToggle);
}

/**
 * The trigger lifts and the tint rises on `springs.contextMenuLift`. The menu
 * enters on `springs.contextMenuMorph`. The return and the tint's clear are
 * part of the exit, on `springs.contextMenuDismiss`.
 */
const MOTION: LiftFromTriggerMotion = {
  lift: CONTEXT_MENU_LIFT_SPRING,
  drop: CONTEXT_MENU_DISMISS_SPRING,
  clear: CONTEXT_MENU_DISMISS_SPRING,
  surfaceIn: CONTEXT_MENU_MORPH_SPRING,
  surfaceOut: CONTEXT_MENU_MORPH_SPRING,
};

export interface ContextMenuLift {
  /**
   * Lifts the trigger from `from`, client px: where the press feedback left
   * it. `release` runs after the lift reads the page and before it writes.
   * Returns where it landed, or null without the popover API.
   */
  lift(from: MorphRect, release: () => void): LiftFromTriggerResult | null;
  /** The menu's entrance beside the lifted trigger: it fades in. */
  enterMenu(menu: HTMLElement): void;
  /** Returns the trigger to its place. */
  drop(): void;
}

export function useContextMenuLift(
  triggerRef: RefObject<HTMLElement | null>,
  onBackdropTap: () => void,
): ContextMenuLift {
  const lift = useLiftFromTrigger();
  const onBackdropTapRef = useRef(onBackdropTap);
  onBackdropTapRef.current = onBackdropTap;
  // The app's declared inset, which the gutter adds.
  const layerInsetRef = useRef<LayerInset | undefined>(undefined);
  layerInsetRef.current = use(LayerContext)?.inset;
  return useMemo(
    () => ({
      lift(from, release) {
        const trigger = triggerRef.current;
        if (trigger == null) {
          return null;
        }
        // Read before the lift writes.
        const needsPlatter = !paintsOwnBox(trigger);
        const lifted = liftContextMenuTrigger(lift, trigger, {
          motion: MOTION,
          scale: {
            maxScale: contextMenu.lift.maxScale,
            scaleUpPoints: contextMenu.lift.scaleUpPoints,
          },
          from,
          release,
          inset: layerInsetRef.current,
          onBackdropTap: () => onBackdropTapRef.current(),
        });
        if (lifted != null && needsPlatter) {
          placePlatter(trigger);
        }
        return lifted;
      },
      enterMenu(menu) {
        lift.presentSurface(menu, null);
      },
      drop() {
        lift.drop();
      },
    }),
    [lift, triggerRef],
  );
}
