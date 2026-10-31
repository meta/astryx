// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file previewPlan.ts
 * @input The project brief's coverage table, checked against the generated audit
 * @output What every component's preview has to demonstrate, and what it needs
 * @position Motion Lab data module; no React, no side effects
 *
 * A build plan rather than a gallery. Every row names the HARD case, because
 * a preview that only shows the easy case is worth nothing: a disclosure that
 * expands a paragraph proves nothing about a disclosure inside a table row,
 * and a menu that opens on click proves nothing about one dismissed by moving
 * the pointer away.
 *
 * `dirs` carries the core component directories the row covers, so the page
 * can check each verdict against ANIMATING_COMPONENTS / STATIC_COMPONENTS
 * instead of trusting the brief. Several rows do not survive that check.
 */

import type {MotionCost} from './motionCost';
import {
  ANIMATING_COMPONENTS,
  STATIC_COMPONENTS,
} from './__generated__/motionAudit';

export type Verdict = 'GOOD' | 'PARTIAL' | 'ADD' | 'NONE';

export type PreviewRow = {
  readonly id: string;
  readonly component: string;
  readonly group: string;
  readonly verdict: Verdict;
  /**
   * What this row costs while nothing is happening. `idle` is the default and
   * the overwhelming majority: a one-shot transition stops. Anything else
   * loops, and is judged on idle cost rather than duration. See motionCost.ts.
   */
  readonly motionCost: MotionCost;
  /** Only where the cost is not `idle` — what runs, and what it animates. */
  readonly motionCostWhy?: string;
  /** Core directories this row covers, for the measurement cross-check. */
  readonly dirs: ReadonlyArray<string>;
  readonly today: string;
  readonly gap: string;
  readonly shows: string;
  /** The case that decides the technique. Everything else is decoration. */
  readonly hardCase: string;
  readonly controls: ReadonlyArray<string>;
  readonly status: 'built' | 'specified';
  /** The rig in LabDemos.tsx, when one exists. */
  readonly rig: string | null;
  /** 1 decides an open question, 2 high-frequency, 3 completeness. */
  readonly priority: 1 | 2 | 3;
  /** Why the measurement disagrees, when the generic check cannot say. */
  readonly measurementNote: string | null;
};

export const PREVIEW_GROUPS: ReadonlyArray<string> = [
  'Overlays & layers',
  'Disclosure & expansion',
  'Navigation',
  'Inputs & controls',
  'Feedback & status',
  'Content & data',
];

const LAYER_NOTE =
  'The entry animation lives in Layer/, which the audit counts as its own directory, so per-directory measurement reads this component as static. The brief and the audit are both right about different things.';

export const PREVIEW_PLAN: ReadonlyArray<PreviewRow> = [
  // --- Overlays & layers -----------------------------------------------------
  {
    id: 'tooltip',
    component: 'Tooltip',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Tooltip'],
    today: 'Direction-aware fade and scale in.',
    gap: 'Hard-cuts on every dismiss, on the highest-frequency surface in the system.',
    shows:
      'Enter and exit at four placements, with the exit curve and duration separately tunable from the entry.',
    hardCase:
      'Pointer moves from trigger to trigger. The exit of one overlaps the entry of the next, and the frequency argument says this surface may deserve no exit at all — the preview has to make that case answerable rather than assumed.',
    controls: [
      'enter duration',
      'exit duration',
      'exit curve',
      'placement',
      'reduced motion',
    ],
    status: 'built',
    rig: 'LayerRig',
    priority: 1,
    measurementNote: LAYER_NOTE,
  },
  {
    id: 'hovercard',
    component: 'HoverCard',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['HoverCard'],
    today: 'Fade and scale in.',
    gap: 'No exit; the most visible instance of the gap because the surface is large.',
    shows:
      'A card-sized surface entering and leaving, beside a tooltip-sized one on the same timings.',
    hardCase:
      'Large surfaces need longer than small ones at the same perceived speed. The preview has to show whether one --duration-enter can serve both, or whether size has to scale it.',
    controls: ['enter duration', 'exit duration', 'surface size', 'open delay'],
    status: 'built',
    rig: 'LayerRig',
    priority: 2,
    measurementNote: LAYER_NOTE,
  },
  {
    id: 'popover',
    component: 'Popover',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Popover'],
    today: 'Fade and scale in.',
    gap: 'No exit.',
    shows:
      'Click-triggered presence, with transform-origin anchored to the trigger rather than the centre.',
    hardCase:
      'Dismissal by outside-press while focus is inside the popover. Focus has to leave before the element does, and the preview is where that ordering gets agreed.',
    controls: ['enter duration', 'exit duration', 'origin', 'dismiss method'],
    status: 'built',
    rig: 'LayerRig',
    priority: 1,
    measurementNote: LAYER_NOTE,
  },
  {
    id: 'dropdownmenu',
    component: 'DropdownMenu',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['DropdownMenu'],
    today: 'Fade and scale in, submenus too.',
    gap: 'No exit; menus snap shut.',
    shows:
      'A menu and a submenu, both directions, with the submenu inheriting the parent timing.',
    hardCase:
      'Selecting an item closes the menu and performs the action at the same time. If the exit is not interruptible the action feels late; if it is skipped the menu blinks.',
    controls: [
      'enter duration',
      'exit duration',
      'submenu delay',
      'selection behaviour',
    ],
    status: 'built',
    rig: 'LayerRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'contextmenu',
    component: 'ContextMenu',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['ContextMenu'],
    today: 'Fade and scale in.',
    gap: 'No exit.',
    shows:
      'Pointer-anchored entry, where the origin is a coordinate rather than an element.',
    hardCase:
      'Right-click while a menu is already open. The old one has to leave while the new one arrives, from a different origin.',
    controls: ['enter duration', 'exit duration', 'origin'],
    status: 'built',
    rig: 'LayerRig',
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'selectors',
    component: 'Selector / ComplexSelector / MultiSelector',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Selector', 'ComplexSelector', 'MultiSelector'],
    today: 'Chevron rotate plus layer entry.',
    gap: 'No exit. The brief also claims three dead no-op transition rules here.',
    shows:
      'Chevron and layer on one timeline, so the two do not disagree about how long opening takes.',
    hardCase:
      'Keyboard-driven open and close, which is the frequency band the rubric says gets no motion at all. The preview has to show the pointer path and the keyboard path side by side.',
    controls: [
      'enter duration',
      'exit duration',
      'chevron duration',
      'input method',
    ],
    status: 'built',
    rig: 'LayerRig',
    priority: 2,
    measurementNote:
      'The brief\u2019s three dead no-op transitions are not in the measured data. The only no-op is Lightbox/Lightbox.tsx:192, and it is deliberate.',
  },
  {
    id: 'overflow-layers',
    component: 'PowerSearch / Typeahead / MoreMenu',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['PowerSearch', 'Typeahead', 'MoreMenu'],
    today: 'Layer entry only.',
    gap: 'No exit, and no motion when tokens or results are added and removed.',
    shows:
      'The layer, and separately the list inside it changing as the query changes.',
    hardCase:
      'Results replacing results while the layer stays open. Animating the container is easy; animating a filtered list without making typing feel laggy is the decision.',
    controls: [
      'enter duration',
      'exit duration',
      'list item stagger',
      'filter debounce',
    ],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: LAYER_NOTE,
  },
  {
    id: 'dialog',
    component: 'Dialog',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Dialog'],
    today: 'Directional keyframe entry.',
    gap: 'No exit, and the backdrop has no transition at all, so the scrim hard-cuts.',
    shows:
      'Panel and backdrop as two separately tunable timelines, plus focus return timing.',
    hardCase:
      'Focus return during the exit. Dialog returns focus the moment it closes, so with a real exit the page can scroll to the trigger while the dialog is still on screen.',
    controls: [
      'panel duration',
      'backdrop duration',
      'focus return delay',
      'reduced motion',
    ],
    status: 'built',
    rig: 'DialogRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'alertdialog',
    component: 'AlertDialog',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['AlertDialog'],
    today: 'Inherits the Dialog entry.',
    gap: 'No exit. Destructive confirmation is the one dialog where a slow dismissal is wrong.',
    shows:
      'The same rig as Dialog with the exit deliberately shorter, to test whether one token can serve both.',
    hardCase:
      'Confirming a destructive action. The dialog should be gone before the consequence appears — the clearest case for a shorter exit, and worth contrasting with a dialog the user simply closes, where the dismissal is deliberate and may want the full enter duration.',
    controls: ['panel duration', 'exit duration', 'confirm vs cancel path'],
    status: 'built',
    rig: 'DialogRig',
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'commandpalette',
    component: 'CommandPalette',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['CommandPalette'],
    today: 'Inherits the Dialog entry.',
    gap: 'No exit, and no motion on the result list as it filters.',
    shows: 'Opening, typing, and the list reordering underneath, all at once.',
    hardCase:
      'Keystroke-rate list changes. This is the clearest case in the system for animating nothing: the rubric says 100+/day actions get none, and a palette is used by exactly those people.',
    controls: [
      'enter duration',
      'list stagger',
      'reduced motion',
      'typing speed',
    ],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'lightbox',
    component: 'Lightbox',
    group: 'Overlays & layers',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Lightbox'],
    today: 'Image zoom and pan only.',
    gap: 'A full-screen surface with no open or close at all.',
    shows:
      'Opening from the thumbnail that triggered it, not from the centre of the screen.',
    hardCase:
      'The shared-element case: the image should appear to be the thumbnail growing. Everything else is a crossfade, and a crossfade on a full-screen surface is the thing the brief calls jarring.',
    controls: ['open duration', 'close duration', 'origin', 'backdrop opacity'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'Measured as animating: the zoom and pan are real, but they are not the open and close the row is asking for.',
  },
  {
    id: 'bottomsheet',
    component: 'BottomSheet',
    group: 'Overlays & layers',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['BottomSheet'],
    today: 'Backdrop and panel, drag-aware, with its own exit curve.',
    gap: 'None — this is the reference implementation, and the source of --ease-exit.',
    shows:
      'Its two hardcoded curves beside the proposed tokens, to prove the tokens reproduce them exactly.',
    hardCase:
      'Drag-to-dismiss released mid-gesture. The spring has to carry the velocity the finger had; a keyframe restarts from zero and the sheet stutters.',
    controls: ['panel duration', 'exit curve', 'drag velocity', 'bounce'],
    status: 'specified',
    rig: null,
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'mobilenav',
    component: 'MobileNav',
    group: 'Overlays & layers',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['MobileNav'],
    today:
      'Slide plus backdrop; reads its own computed duration to time the close.',
    gap: 'None — the best-reasoned close timing in the repo, and an argument for the JS mirror.',
    shows:
      'The getComputedStyle read that times the close, and the same thing done through the mirror.',
    hardCase:
      'The close timing has to survive a theme that retunes the duration scale. That is exactly what the JS mirror is for, and this component is the existing proof it is needed.',
    controls: ['slide duration', 'backdrop duration', 'theme scale'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'overlay',
    component: 'Overlay / scrim',
    group: 'Overlays & layers',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Overlay'],
    today: 'Per-edge slide, both directions.',
    gap: 'None — the template the presence primitive should generalise.',
    shows:
      'All four edges, so the primitive\u2019s API is designed against the hardest of them rather than the first.',
    hardCase:
      'Edge-dependent transform origin with a scrim that must not slide with the panel. Two elements, one dismissal, different curves.',
    controls: ['edge', 'panel duration', 'scrim duration', 'scrim curve'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'drawer',
    component: 'Drawer',
    group: 'Overlays & layers',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: [],
    today: 'Slide plus backdrop.',
    gap: 'Closes after a hardcoded 250ms while the slide is 410ms, so the exit is cut at ~60%.',
    shows:
      'The cut, at 1x and slowed down, beside the same close awaiting its transition.',
    hardCase:
      'Proving the bug is visible at 1x. If it is not, the finding is a code-hygiene issue rather than a user-facing one, and it should be scheduled as such.',
    controls: ['slide duration', 'unmount delay', 'slow-mo'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'Measured: lab is a workspace package here, so this row is checked rather than assumed.',
  },

  // --- Disclosure & expansion ------------------------------------------------
  {
    id: 'collapsible',
    component: 'Collapsible',
    group: 'Disclosure & expansion',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Collapsible'],
    today: 'Height interpolation, offset content fade, theme-tunable.',
    gap: 'None, but it is the only component doing it this way.',
    shows:
      'Height interpolation against grid-track expansion on identical content.',
    hardCase:
      'Content whose height is unknown until it renders, and content that changes height while open. Height interpolation needs a measurement; grid tracks do not.',
    controls: ['duration', 'curve', 'content height', 'technique'],
    status: 'built',
    rig: 'DisclosureRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'codeblock',
    component: 'CodeBlock',
    group: 'Disclosure & expansion',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['CodeBlock'],
    today: 'Grid-track expand plus chevron.',
    gap: 'A different technique from Collapsible, for the same job.',
    shows:
      'The same expansion in both techniques, with the chevron on a shared timeline.',
    hardCase:
      'Long content that overflows. Grid tracks animate to a content-derived size; a max-height fallback does not, and the difference only shows on the long case.',
    controls: ['duration', 'curve', 'content length', 'technique'],
    status: 'built',
    rig: 'DisclosureRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'table-row-expansion',
    component: 'Table row expansion',
    group: 'Disclosure & expansion',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Table'],
    today: 'Chevron rotate only.',
    gap: 'The revealed content appears instantly.',
    shows: 'A row expanding inside a real table, in both techniques.',
    hardCase:
      'This is the row that decides the whole disclosure question: a table row cannot be a grid container, so the grid-track technique is unavailable here. If the answer is "one technique everywhere", it has to be height — and this preview is the evidence.',
    controls: ['duration', 'curve', 'technique', 'row count'],
    status: 'specified',
    rig: null,
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'table-tree',
    component: 'Table tree / grouped rows',
    group: 'Disclosure & expansion',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Table'],
    today: 'Chevron rotate only.',
    gap: 'Same as row expansion, plus the hardcoded 150ms values.',
    shows:
      'Expanding a group of rows rather than one, with the 150ms and the token side by side.',
    hardCase:
      'Expanding many rows at once. Per-row stagger is the obvious idea and the wrong one: at 30ms across twenty rows the last row arrives 600ms late.',
    controls: ['duration', 'stagger', 'row count', 'reduced motion'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'The brief\u2019s "nine hardcoded values in Table" and "six in Table tree" are the same set: nine 150ms values across columnResize, groupedRows, rowExpansion, stickyColumns and tree.',
  },
  {
    id: 'treelist',
    component: 'TreeList',
    group: 'Disclosure & expansion',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['TreeList'],
    today: 'Row tint plus chevron.',
    gap: 'The child list reveal is instant.',
    shows: 'Nested reveal, where expanding a child moves everything below it.',
    hardCase:
      'Expanding a deep node near the bottom of the viewport. The reveal and the scroll compensation fight each other, and doing neither is better than doing both badly.',
    controls: ['duration', 'depth', 'scroll compensation'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'chat-disclosure',
    component: 'Chat tool calls / reasoning',
    group: 'Disclosure & expansion',
    verdict: 'PARTIAL',
    motionCost: 'high',
    motionCostWhy:
      'ChatReasoning animates `background-position` — paint-only, 4s per iteration, forever, with no reduced-motion arm and no containment. It fails every axis of the rule at once, behind streaming text the user is already reading. The highest-cost animation in either package.',
    dirs: ['Chat'],
    today: 'Grid-track expand; a 1.5s reasoning shimmer.',
    gap: 'A third disclosure technique, and the shimmer has no reduced-motion escape.',
    shows:
      'The shimmer with and without the reduced-motion branch, and the disclosure in both techniques.',
    hardCase:
      'Content streaming in while the container is animating open. The height target moves during the transition, which is where height interpolation fails and grid tracks do not.',
    controls: ['duration', 'technique', 'stream rate', 'reduced motion'],
    status: 'specified',
    rig: null,
    priority: 1,
    measurementNote: null,
  },

  // --- Navigation ------------------------------------------------------------
  {
    id: 'sidenav',
    component: 'SideNav',
    group: 'Navigation',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['SideNav'],
    today: 'Sub-list expand, chevron, collapse button.',
    gap: 'The rail\u2019s own collapse is not animated; only the chevron rotates.',
    shows: 'The rail collapsing with the labels, at several widths.',
    hardCase:
      'Width is a layout property, so the honest version needs transform or clip-path. The preview has to show whether the cheap version — animating width — is visibly worse, because it is much simpler.',
    controls: ['duration', 'curve', 'technique', 'label fade offset'],
    status: 'built',
    rig: 'RailRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'tablist',
    component: 'TabList',
    group: 'Navigation',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['TabList'],
    today: 'Per-tab indicator cross-fade.',
    gap: 'The indicator does not slide between tabs; each tab owns its own bar.',
    shows:
      'One indicator that travels, against the per-tab cross-fade, on the same tabs.',
    hardCase:
      'Tabs of different widths. The indicator has to change size while it moves, which is a scale on a transform rather than a width, or it thrashes layout on every frame.',
    controls: ['duration', 'curve', 'spring vs curve', 'tab widths'],
    status: 'built',
    rig: 'TabIndicatorRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'segmentedcontrol',
    component: 'SegmentedControl',
    group: 'Navigation',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['SegmentedControl'],
    today: 'Per-item background tint.',
    gap: 'No sliding thumb, so the selected pill jumps.',
    shows:
      'The same travelling-indicator technique as TabList, to confirm one implementation serves both.',
    hardCase:
      'Rapid clicking between segments. The thumb has to retarget mid-flight, which a transition does and a keyframe does not.',
    controls: ['duration', 'spring bounce', 'click rate'],
    status: 'built',
    rig: 'TabIndicatorRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'topnav',
    component: 'TopNav',
    group: 'Navigation',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['TopNav'],
    today: 'Mega-menu with a real exit, sub-lists, chevrons.',
    gap: 'The only component animating a popover exit, and it never checks reduced motion.',
    shows:
      'Its exit as the existing proof the pattern works, plus the missing reduced-motion branch.',
    hardCase:
      'A mega-menu is large and frequently traversed. It is the one place where the published "no exit needed" guidance is most obviously wrong, and this component already disagrees with the docs.',
    controls: [
      'enter duration',
      'exit duration',
      'reduced motion',
      'traverse speed',
    ],
    status: 'specified',
    rig: null,
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'navitem',
    component: 'NavItem / NavMenu',
    group: 'Navigation',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['NavItem', 'NavMenu'],
    today: 'Nothing.',
    gap: 'No hover or active transition, unlike every sibling nav item.',
    shows:
      'A tint transition at the state token (--duration-fast on --ease-standard), gated to fine pointers that hover, beside the untransitioned original.',
    hardCase:
      'Hover on a touch device, where a tap fires a false hover. The rubric requires this to be gated to fine pointers, and this is the cheapest place to prove the gate works.',
    controls: ['duration', 'pointer type', 'reduced motion'],
    status: 'built',
    rig: 'NavTintRig',
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'outline',
    component: 'Outline',
    group: 'Navigation',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Outline'],
    today: 'Marker slide plus item tint.',
    gap: 'Animates top and height, which thrashes layout.',
    shows:
      'The same marker on transform and on top/height, with a paint-cost readout.',
    hardCase:
      'Scroll-linked movement. The marker moves on every scroll frame, so a layout-triggering property here costs more than anywhere else in the audit.',
    controls: ['duration', 'technique', 'scroll rate'],
    status: 'built',
    rig: 'OutlineMarkerRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'breadcrumbs',
    component: 'Breadcrumbs',
    group: 'Navigation',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Breadcrumbs'],
    today: 'Overflow menu entry.',
    gap: 'Crumb collapse on resize is instant.',
    shows: 'Crumbs collapsing into the overflow as the container narrows.',
    hardCase:
      'Resize is continuous, so the collapse can fire many times a second. This is a strong candidate for animating nothing, and the preview should make that easy to conclude.',
    controls: ['container width', 'duration', 'debounce'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: LAYER_NOTE,
  },
  {
    id: 'pagination',
    component: 'Pagination',
    group: 'Navigation',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Pagination'],
    today: 'Cell tint.',
    gap: 'Page change is an instant content swap.',
    shows:
      'Directional content movement: forward goes one way, back goes the other.',
    hardCase:
      'Directionality is a published principle that the rubric drops entirely. This preview and Calendar are the two rows that would be measured against it, so they are the argument for adding the criterion.',
    controls: ['duration', 'direction', 'reduced motion'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },

  // --- Inputs & controls -----------------------------------------------------
  {
    id: 'button',
    component: 'Button',
    group: 'Inputs & controls',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Button'],
    today: 'Tint, press scale, loading swap.',
    gap: 'The brief calls the press transform transition the main Motion conflict.',
    shows:
      'Press feedback on transform, on the independent scale property, and not at all.',
    hardCase:
      'A motion library writing transform every frame while the CSS transition re-eases it. This is the whole of blocker 2, and it is answerable by dragging one button.',
    controls: ['press duration', 'technique', 'library drag'],
    status: 'built',
    rig: 'PressRig',
    priority: 1,
    measurementNote:
      'Button has no transform transition in the measured data. Its only hardcoded value is animationDuration: 1ms at Button/Button.tsx:407 — a reduced-motion escape, not press feedback. The brief\u2019s "Button is the worst case" does not hold.',
  },
  {
    id: 'iconbutton',
    component: 'IconButton / ToggleButton',
    group: 'Inputs & controls',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['IconButton', 'ToggleButton'],
    today: 'Tint and press feedback inherited from Button.',
    gap: 'None named, but the toggle state change is not distinguished from a press.',
    shows:
      'Press feedback and state change as two separate timings on the same control.',
    hardCase:
      'A toggle that is pressed and then changes state. Two animations on one gesture: if they share a duration the state change is invisible.',
    controls: ['press duration', 'state duration', 'toggle rate'],
    status: 'built',
    rig: 'PressRig',
    priority: 3,
    measurementNote:
      'Neither IconButton nor ToggleButton has motion of its own: the press feedback belongs to Button, and per-directory measurement does not follow composition.',
  },
  {
    id: 'switch',
    component: 'Switch',
    group: 'Inputs & controls',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Switch'],
    today: 'Track tint plus thumb travel.',
    gap: 'Animates the thumb width and height, which are layout properties.',
    shows: 'The thumb on width/height against the same thumb on transform.',
    hardCase:
      'Fast repeated toggling. Layout-property animation is cheap on one switch and expensive in a settings list of thirty, which is where this component actually lives.',
    controls: ['duration', 'technique', 'switch count', 'toggle rate'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'checkbox',
    component: 'CheckboxInput / RadioList / Indicator',
    group: 'Inputs & controls',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['CheckboxInput', 'RadioList', 'Indicator'],
    today: 'Box tint and border.',
    gap: 'The tick and the dot never draw or scale in.',
    shows:
      'Three techniques on the tick: hard swap, stroke draw, and scale-in.',
    hardCase:
      'Select-all across twenty checkboxes. A tick that draws in 200ms is charming once and a mess twenty times at once, which is the frequency argument made visible.',
    controls: ['duration', 'technique', 'stagger', 'item count'],
    status: 'built',
    rig: 'CheckTickRig',
    priority: 2,
    measurementNote:
      'Indicator is measured as animating while CheckboxInput and RadioList are not, so the row\u2019s "box tint" is really Indicator\u2019s.',
  },
  {
    id: 'field',
    component: 'Field / TextInput / TextArea / NumberInput',
    group: 'Inputs & controls',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Field', 'TextInput', 'TextArea', 'NumberInput'],
    today: 'Border and focus ring transitions.',
    gap: 'TextArea auto-grow is not animated.',
    shows:
      'Focus ring timing at the state token, and auto-grow with and without a height transition.',
    hardCase:
      'Auto-grow while typing. The height changes on a keystroke, so any duration above about 100ms means the field is still growing when the next character lands.',
    controls: ['state duration', 'grow duration', 'typing speed'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote:
      'Only Field is measured as animating. TextInput, TextArea and NumberInput have no motion of their own — the row\u2019s verdict belongs to the shared Field wrapper.',
  },
  {
    id: 'slider',
    component: 'Slider',
    group: 'Inputs & controls',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Slider'],
    today: 'Thumb tint and shadow.',
    gap: 'The thumb does not transition on keyboard step.',
    shows:
      'Keyboard stepping with and without a transition, beside a pointer drag.',
    hardCase:
      'The same thumb must be transitioned for keyboard and untransitioned for drag, or dragging lags the pointer. One control, two input paths, opposite answers.',
    controls: ['step duration', 'input method', 'step size'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'calendar',
    component: 'Calendar / DateInput',
    group: 'Inputs & controls',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Calendar', 'DateInput'],
    today:
      'Cell tint; the touch wheel is scroll-driven and genuinely advanced.',
    gap: 'No month-change transition.',
    shows: 'Month change with direction, beside the existing instant swap.',
    hardCase:
      'Holding the arrow to move six months. Each step has to be interruptible and the direction has to stay legible, which rules out a keyframe.',
    controls: ['duration', 'direction', 'repeat rate'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'DateInput carries nine of the hardcoded values, all 0.01s reduced-motion escapes in TouchDateField.tsx.',
  },
  {
    id: 'tokenizer',
    component: 'Tokenizer / Token',
    group: 'Inputs & controls',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Tokenizer', 'Token'],
    today: 'Background transition on the token only.',
    gap: 'Chip add and remove, the canonical scale-in case, is instant.',
    shows:
      'Add and remove with the surrounding chips reflowing, not just the chip itself appearing.',
    hardCase:
      'Removing a chip from the middle of a wrapped row. Everything after it moves, and moving them is the animation — the chip leaving is the easy half.',
    controls: [
      'enter duration',
      'exit duration',
      'reflow duration',
      'chip count',
    ],
    status: 'built',
    rig: 'ChipRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'fileinput',
    component: 'FileInput',
    group: 'Inputs & controls',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['FileInput'],
    today: 'Dropzone border and tint.',
    gap: 'File chips add and remove with no motion.',
    shows: 'Chips arriving as files are dropped, with upload progress on each.',
    hardCase:
      'A chip that arrives and then changes state while it is still arriving. Entry and progress on one element, which is the case ChipRig deliberately does not cover.',
    controls: ['enter duration', 'stagger', 'progress rate', 'file count'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'resizable',
    component: 'Resizable',
    group: 'Inputs & controls',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Resizable'],
    today: 'Handle tint and grip.',
    gap: 'Panel snap and collapse are instant.',
    shows:
      'Snap-to-position and collapse animated, with the drag itself left untransitioned.',
    hardCase:
      'The drag must not be transitioned and the release must be. The transition has to be added on release and removed on grab, which is a state machine rather than a style.',
    controls: ['snap duration', 'curve', 'snap points'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },

  // --- Feedback & status -----------------------------------------------------
  {
    id: 'toast',
    component: 'Toast',
    group: 'Feedback & status',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Toast'],
    today: 'Entry, exit, and stack collapse.',
    gap: 'None, though it animates grid tracks and padding.',
    shows:
      'Entry and exit interrupted mid-flight, since this is the most interruptible surface in the system.',
    hardCase:
      'A toast dismissed while another is entering and a third is collapsing the stack. Three animations on one list, and the reference case for the interruptibility criterion.',
    controls: [
      'enter duration',
      'exit duration',
      'collapse duration',
      'toast rate',
    ],
    status: 'built',
    rig: 'InterruptRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'banner',
    component: 'Banner',
    group: 'Feedback & status',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Banner'],
    today: 'Chevron rotate.',
    gap: 'A dismissible banner appearing and leaving is unanimated.',
    shows:
      'Dismissal with the content below closing the gap, rather than snapping up.',
    hardCase:
      'The banner leaving is easy; the page reflowing underneath it is the animation. Height on the container, or transform on everything below.',
    controls: ['exit duration', 'reflow duration', 'technique'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'skeleton',
    component: 'Skeleton',
    group: 'Feedback & status',
    verdict: 'ADD',
    motionCost: 'medium',
    motionCostWhy:
      'An opacity loop: correct property, no containment. The most-multiplied loop in the system — a loading table is dozens of these at once, each able to repaint beyond its own box. Strongest containment candidate in core.',
    dirs: ['Skeleton'],
    today: 'Staggered pulse.',
    gap: 'No skeleton-to-content crossfade; content hard-swaps.',
    shows:
      'The swap at several load times, including one fast enough that the skeleton should never have appeared.',
    hardCase:
      'Content arriving in 80ms. The crossfade makes a fast load look slower than no skeleton at all, so the preview has to expose the minimum-display-time decision, not just the fade.',
    controls: ['crossfade duration', 'load time', 'minimum display time'],
    status: 'built',
    rig: 'SkeletonSwapRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'spinner',
    component: 'Spinner',
    group: 'Feedback & status',
    verdict: 'PARTIAL',
    motionCost: 'low',
    motionCostWhy:
      'A rotation loop on transform, with a deliberate layer and a reduced-motion arm — the best-behaved loop in either package. Not paint-contained, which is the only thing between it and the target shape.',
    dirs: ['Spinner'],
    today: 'Rotation.',
    gap: 'Reduced motion slows the loop to 3s rather than stopping it.',
    shows: 'Today, delete, and degrade as three policies on the same spinner.',
    hardCase:
      'A stopped spinner communicates nothing. Degrading a loop means replacing it with a determinate state, which is a component change rather than a CSS branch — the reason this decision is not free.',
    controls: ['loop duration', 'policy', 'reduced motion'],
    status: 'built',
    rig: 'LoopRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'progressbar',
    component: 'ProgressBar',
    group: 'Feedback & status',
    verdict: 'PARTIAL',
    motionCost: 'medium',
    motionCostWhy:
      'The indeterminate slide is a clean transform loop, uncontained. Separately ProgressBar.tsx:244 transitions `width` on the determinate fill: one-shot per data change, but a bar fed by a fast upload ticks often enough to behave like a layout loop.',
    dirs: ['ProgressBar'],
    today: 'Width fill plus an indeterminate slide.',
    gap: 'Animates width; reduced motion slows rather than stops.',
    shows:
      'Width against transform: scaleX, and the indeterminate loop under all three policies.',
    hardCase:
      'scaleX distorts the bar\u2019s end caps and any label inside it. The compositor-only rule is right in general and needs an exception here, or a different structure.',
    controls: ['fill duration', 'technique', 'policy'],
    status: 'built',
    rig: 'LoopRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'statusdot',
    component: 'StatusDot',
    group: 'Feedback & status',
    verdict: 'PARTIAL',
    motionCost: 'medium',
    motionCostWhy:
      'An opacity loop, uncontained, and it multiplies the way Skeleton does — a status column is one per row, all pulsing at once.',
    dirs: ['StatusDot'],
    today: 'A pulse at a hardcoded 2s with ease-in-out.',
    gap: 'Bypasses the scale entirely, because the scale stops at 1300ms.',
    shows:
      'The pulse at 2s beside the longest token, so the missing band is visible rather than argued.',
    hardCase:
      'Ambient motion is not interface motion. Either the scale grows a band for it or the system says ambient loops are out of scope — this row and Chat reasoning are the only two asking.',
    controls: ['loop duration', 'policy', 'dot count'],
    status: 'built',
    rig: 'LoopRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'fieldstatus',
    component: 'FieldStatus',
    group: 'Feedback & status',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['FieldStatus'],
    today: 'Slide-down entry, via the shared entry hook.',
    gap: 'Error text leaves instantly.',
    shows:
      'Error text arriving and leaving, and text replacing text without leaving first.',
    hardCase:
      'Validation firing on every keystroke. The error message changes while it is still entering, which is the interruptibility criterion on a surface nobody thinks of as animated.',
    controls: ['enter duration', 'exit duration', 'validation rate'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'Measured as static: the entry lives in hooks/containerReveal.stylex.ts, not in the component. That shared hook also holds three of the hardcoded values.',
  },
  {
    id: 'badge',
    component: 'Badge',
    group: 'Feedback & status',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Badge'],
    today: 'Nothing.',
    gap: 'Count changes pop in.',
    shows: 'A count changing with and without a digit transition.',
    hardCase:
      'A count that changes several times a second, which is what a notification badge does. The rubric\u2019s frequency criterion probably says do nothing, and the preview should be allowed to conclude that.',
    controls: ['duration', 'change rate', 'technique'],
    status: 'built',
    rig: 'StatCountRig',
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'avatar',
    component: 'Avatar / AvatarGroup',
    group: 'Feedback & status',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['Avatar', 'AvatarGroup'],
    today: 'Nothing.',
    gap: 'Image load and member enter/leave both pop in.',
    shows:
      'Image fade-in on load, and members joining and leaving a stacked group.',
    hardCase:
      'A cached image loads in the same frame as the component mounts, so a fade-in animates something that was never absent. The preview has to include the cached case or it will ship a flash.',
    controls: ['fade duration', 'stagger', 'cache state', 'group size'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },

  // --- Content & data --------------------------------------------------------
  {
    id: 'markdown',
    component: 'Markdown',
    group: 'Content & data',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Markdown'],
    today: 'Streaming chunk fade-in.',
    gap: 'None — well built, and the only streaming-aware motion in the system.',
    shows:
      'Chunk fade-in at several stream rates, including faster than the fade.',
    hardCase:
      'Chunks arriving faster than the fade duration. Overlapping fades either stack into a flicker or have to be dropped, and the current code has an answer worth documenting.',
    controls: ['fade duration', 'stream rate', 'chunk size'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'thumbnail',
    component: 'Thumbnail',
    group: 'Content & data',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Thumbnail'],
    today: 'Hover-intent reveal for actions.',
    gap: 'None — the only consumer of the most sophisticated motion code in the repo.',
    shows:
      'Hover intent with the delay exposed, and the same interaction on a touch device.',
    hardCase:
      'A tap on touch fires a false hover. Hover-intent logic that is correct with a pointer reveals actions that cannot be dismissed on touch.',
    controls: ['intent delay', 'reveal duration', 'pointer type'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'table-rows',
    component: 'Table rows',
    group: 'Content & data',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Table'],
    today: 'Row tint.',
    gap: 'No reduced-motion handling anywhere in Table, and nine hardcoded 150ms values.',
    shows:
      'The 150ms tint against the state token, over enough rows to feel it.',
    hardCase:
      'Row hover is the published page\u2019s own example of where motion hurts. The preview should make deleting the transition a visible option, not just retokenising it.',
    controls: ['duration', 'row count', 'pointer speed', 'reduced motion'],
    status: 'built',
    rig: 'TintRig',
    priority: 1,
    measurementNote: null,
  },
  {
    id: 'carousel',
    component: 'Carousel',
    group: 'Content & data',
    verdict: 'PARTIAL',
    motionCost: 'idle',
    dirs: ['Carousel'],
    today: 'Edge fade plus control opacity.',
    gap: 'A paint-heavy mask transition, and no explicit slide.',
    shows: "The mask transition's cost beside a transform-based slide.",
    hardCase:
      'Scroll-linked edge fades repaint on every scroll frame. This is the one place in the audit where a mask is animated, and it needs a measurement rather than an opinion.',
    controls: ['slide duration', 'technique', 'scroll rate'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'list',
    component: 'List / OverflowList',
    group: 'Content & data',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['List', 'OverflowList'],
    today: 'Item tint only.',
    gap: 'Add, remove and reorder are all instant.',
    shows:
      'Reorder with FLIP, against reorder with View Transitions, on the same list.',
    hardCase:
      'Reordering while the list is scrolled. Items that move out of view still animate, and the technique that handles that well is the one to standardise on.',
    controls: ['duration', 'technique', 'item count', 'scroll position'],
    status: 'built',
    rig: 'ListReorderRig',
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'emptystate',
    component: 'EmptyState',
    group: 'Content & data',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: ['EmptyState'],
    today: 'Nothing.',
    gap: 'The archetypal content-swap surface, entirely static.',
    shows: 'Empty to populated and back, as a crossfade and as a replace.',
    hardCase:
      'Going from empty to populated after a search. The empty state and the results are different heights, so the container moves — and that movement is the animation people actually notice.',
    controls: ['crossfade duration', 'height technique', 'result count'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote: null,
  },
  {
    id: 'stepper',
    component: 'Stepper',
    group: 'Content & data',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: ['Stepper'],
    today: 'Connector fill and node tint.',
    gap: 'Step content swap is instant.',
    shows:
      'The connector fill with the content swap on the same timeline, and directionality on back.',
    hardCase:
      'Going backwards. The connector has to unfill and the content has to arrive from the other side, or back feels like forward.',
    controls: ['fill duration', 'swap duration', 'direction'],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
  {
    id: 'listinput',
    component: 'ListInput (lab)',
    group: 'Content & data',
    verdict: 'GOOD',
    motionCost: 'idle',
    dirs: [],
    today: 'View Transitions reorder.',
    gap: 'None — the only View Transitions user in the repo.',
    shows:
      'Its View Transitions reorder beside a FLIP implementation of the same thing.',
    hardCase:
      'View Transitions are document-scoped, so two of them cannot run at once. A reorder while a route change is animating is where the technique breaks, and it is the reason not to standardise on it blindly.',
    controls: ['duration', 'technique', 'concurrent transition'],
    status: 'built',
    rig: 'ListReorderRig',
    priority: 2,
    measurementNote:
      'Measured: lab is a workspace package here, so this row is checked rather than assumed.',
  },
  {
    id: 'transferlist',
    component: 'TransferList (lab)',
    group: 'Content & data',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: [],
    today: 'Nothing.',
    gap: 'Moving an item between lists — the whole point of the component — is instant.',
    shows:
      'An item leaving one list and arriving in the other as one continuous movement.',
    hardCase:
      'Moving several items at once. Individually they are a flight; together they are either a stagger or a swarm, and only one of those is legible.',
    controls: ['duration', 'stagger', 'item count', 'curve'],
    status: 'specified',
    rig: null,
    priority: 2,
    measurementNote:
      'Measured: lab is a workspace package here, so this row is checked rather than assumed.',
  },
  {
    id: 'stat',
    component: 'Stat (lab)',
    group: 'Content & data',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: [],
    today: 'Nothing.',
    gap: 'Numeric value changes with no motion.',
    shows:
      'A counting transition against a straight swap, at several magnitudes of change.',
    hardCase:
      'A value that changes while it is still counting, on a live dashboard. Counting animations that cannot retarget end up showing numbers that were never true.',
    controls: ['count duration', 'change rate', 'magnitude'],
    status: 'built',
    rig: 'StatCountRig',
    priority: 3,
    measurementNote:
      'Measured: lab is a workspace package here, so this row is checked rather than assumed.',
  },
  {
    id: 'charts',
    component: 'Chart / Radial / Sankey / Schedule (lab)',
    group: 'Content & data',
    verdict: 'ADD',
    motionCost: 'idle',
    dirs: [],
    today: 'Axis ticks only, via inline styles.',
    gap: 'No transition on data change, and outside the token system entirely.',
    shows:
      'A data change animated through the JS token mirror, since these draw rather than style.',
    hardCase:
      'Chart code cannot read var(--duration-fast). This family is the reason the JS mirror exists, so its preview is the mirror\u2019s acceptance test rather than a motion demo.',
    controls: ['duration', 'curve', 'data change size'],
    status: 'specified',
    rig: null,
    priority: 1,
    measurementNote:
      'Measured: lab is a workspace package here, so this row is checked rather than assumed.',
  },
  {
    id: 'layout-primitives',
    component:
      'Layout primitives (Stack, Grid, Card, Divider, Text, Heading, Kbd + 19 more)',
    group: 'Content & data',
    verdict: 'NONE',
    motionCost: 'idle',
    dirs: ['Stack', 'Grid', 'Card', 'Divider', 'Text', 'Heading', 'Kbd'],
    today: 'Nothing, correctly.',
    gap: 'None. Motion on a layout primitive is motion on everything that uses it.',
    shows:
      'Nothing. This row exists so the rubric can record a deliberate no rather than an omission.',
    hardCase:
      'The only hard case is resisting the request. When someone asks for a Card hover lift, the answer is that Card is used 400 times and the cost is paid 400 times.',
    controls: [],
    status: 'specified',
    rig: null,
    priority: 3,
    measurementNote: null,
  },
];

export type Measurement = {
  readonly kind: 'agrees' | 'contradiction' | 'nuance' | 'unmeasured';
  readonly animating: ReadonlyArray<string>;
  readonly notAnimating: ReadonlyArray<string>;
  readonly note: string;
};

const ANIMATING = new Set(ANIMATING_COMPONENTS);
const STATIC = new Set(STATIC_COMPONENTS);

/**
 * The brief's verdict against the generated audit. A row can disagree in two
 * directions: the brief says it animates and no motion was measured in that
 * directory (usually because the motion is inherited from Layer/ or a shared
 * hook), or the brief says it is static and something was measured.
 */
export function measure(row: PreviewRow): Measurement {
  const animating = row.dirs.filter(dir => ANIMATING.has(dir));
  const notAnimating = row.dirs.filter(dir => STATIC.has(dir));
  const known = animating.length + notAnimating.length;

  if (row.dirs.length === 0 || known === 0) {
    return {
      kind: 'unmeasured',
      animating,
      notAnimating,
      note: row.measurementNote ?? 'Not covered by the generated audit.',
    };
  }

  const saysAnimates = row.verdict === 'GOOD' || row.verdict === 'PARTIAL';

  if (saysAnimates && animating.length === 0) {
    return {
      kind: 'contradiction',
      animating,
      notAnimating,
      note:
        row.measurementNote ??
        `The brief says this animates; the audit found no transition, animation or keyframe in ${notAnimating.join(', ')}.`,
    };
  }

  if (row.verdict === 'NONE' && animating.length > 0) {
    return {
      kind: 'contradiction',
      animating,
      notAnimating,
      note:
        row.measurementNote ??
        `The brief calls this correctly static; the audit measured motion in ${animating.join(', ')}.`,
    };
  }

  if (row.verdict === 'ADD' && animating.length > 0) {
    return {
      kind: 'nuance',
      animating,
      notAnimating,
      note:
        row.measurementNote ??
        `Measured as animating in ${animating.join(', ')} — but the motion it has is not the motion this row is asking for.`,
    };
  }

  if (saysAnimates && notAnimating.length > 0) {
    return {
      kind: 'nuance',
      animating,
      notAnimating,
      note:
        row.measurementNote ??
        `Split: measured motion in ${animating.join(', ')}, none in ${notAnimating.join(', ')}. The verdict belongs to part of the row.`,
    };
  }

  return {
    kind: 'agrees',
    animating,
    notAnimating,
    note: row.measurementNote ?? '',
  };
}
