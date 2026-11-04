// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ResizeHandle.a11y.states.ts
 * @input ResizeHandle's representative splitter states and the facts WINDOW_SPLITTER_PATTERN reads
 * @output RESIZE_HANDLE_BINDING_STATES and the explicit ownership exclusions for this binding
 * @position Binding inventory shared by the jsdom test, the Chromium spec, and the story (component:Resizable AR1)
 */

import type {WindowSplitterStateFacts} from '@astryxdesign/a11y-spec';

export interface ResizeHandleBindingState {
  readonly id: string;
  readonly summary: string;
  readonly storyId: string;
  /** Which composition renders the handle; SideNav's binding follows separately. */
  readonly component: 'ResizeHandle';
  /** The separator's accessible name. */
  readonly label: string;
  readonly facts: WindowSplitterStateFacts;
  /** Bare-handle configuration. */
  readonly direction?: 'horizontal' | 'vertical';
  readonly isReversed?: boolean;
  readonly rtl?: boolean;
  readonly maxSize?: number | null;
  /** The hook's collapse threshold, when the state sets one. */
  readonly collapsedSize?: number;
  /** Start the pane collapsed (`defaultIsCollapsed`). */
  readonly startsCollapsed?: boolean;
  /** Pass a `containerRef` (a pixel-only region inside a container). */
  readonly inContainer?: boolean;
  /** Snap points for the region (`snaps`). */
  readonly snaps?: ReadonlyArray<number>;
  /** Render the documented minimal usage: no `aria-controls` passed. */
  readonly withoutControls?: boolean;
  readonly disabled?: boolean;
}

function facts(
  overrides: Partial<WindowSplitterStateFacts> = {},
): WindowSplitterStateFacts {
  return {
    valueNow: 200,
    valueMin: 100,
    valueMax: 400,
    orientation: 'vertical',
    increaseKey: 'ArrowRight',
    step: 10,
    operable: true,
    collapsible: false,
    ...overrides,
  };
}

const story = (id: string) => `a11y-windowsplitter--${id}`;

export const RESIZE_HANDLE_BINDING_STATES = [
  {
    id: 'bare-horizontal',
    summary: 'a bare ResizeHandle on the end side of a 200px pane (100–400)',
    storyId: story('bare-horizontal'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts(),
  },
  {
    id: 'bare-vertical',
    summary: 'a bare ResizeHandle below a 200px pane: ArrowDown grows it',
    storyId: story('bare-vertical'),
    component: 'ResizeHandle',
    label: 'Resize log pane',
    facts: facts({orientation: 'horizontal', increaseKey: 'ArrowDown'}),
    direction: 'vertical',
  },
  {
    id: 'bare-reversed',
    summary:
      'a bare ResizeHandle on the start side of its pane: ArrowLeft grows it',
    storyId: story('bare-reversed'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({increaseKey: 'ArrowLeft'}),
    isReversed: true,
  },
  {
    id: 'bare-rtl',
    summary:
      'a bare ResizeHandle on a right-to-left page: the inline arrows follow the reading direction',
    storyId: story('bare-rtl'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({increaseKey: 'ArrowLeft'}),
    rtl: true,
  },
  {
    id: 'bare-collapsible',
    summary:
      'a bare ResizeHandle on a collapsible pane: Enter collapses and restores',
    storyId: story('bare-collapsible'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({collapsible: true}),
  },
  {
    id: 'bare-small-min',
    summary:
      'a bare ResizeHandle on a collapsible pane whose minimum sits below the collapse threshold',
    storyId: story('bare-small-min'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({collapsible: true, valueMin: 20}),
    collapsedSize: 50,
  },
  {
    id: 'bare-start-collapsed',
    summary:
      'a bare ResizeHandle on a pane that starts collapsed: it announces the minimum as its value',
    storyId: story('bare-start-collapsed'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    // Collapsed, the handle announces the minimum (100) as its value.
    facts: facts({collapsible: true, startsCollapsed: true, valueNow: 100}),
    startsCollapsed: true,
  },
  {
    id: 'bare-unbounded',
    summary: 'a bare ResizeHandle whose region sets no maximum',
    storyId: story('bare-unbounded'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({valueMax: null}),
    maxSize: null,
  },
  {
    id: 'bare-unbounded-in-container',
    summary:
      'a bare ResizeHandle whose pixel-only region sets no maximum and passes a containerRef: the first useResizable example',
    storyId: story('bare-unbounded-in-container'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({valueMax: null}),
    maxSize: null,
    inContainer: true,
  },
  {
    id: 'bare-snapped',
    summary:
      'a bare ResizeHandle whose region sets snap points [100, 200, 300, 400]: an arrow moves to the adjacent point',
    storyId: story('bare-snapped'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    // One arrow moves to the adjacent point: 100px apart here.
    facts: facts({step: 100}),
    snaps: [100, 200, 300, 400],
  },
  {
    id: 'bare-documented-usage',
    summary:
      'the documented minimal usage — <ResizeHandle direction resizable={region.props} /> with no aria-controls passed',
    storyId: story('bare-documented-usage'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts(),
    withoutControls: true,
  },
  {
    id: 'bare-disabled',
    summary: 'a disabled ResizeHandle: out of the Tab order and unmoving',
    storyId: story('bare-disabled'),
    component: 'ResizeHandle',
    label: 'Resize details pane',
    facts: facts({operable: false}),
    disabled: true,
  },
] as const satisfies ReadonlyArray<ResizeHandleBindingState>;

export const RESIZE_HANDLE_EXCLUSIONS = [
  {
    id: 'sidenav-binding',
    owner:
      'SideNav.test.tsx until SideNav binds this contract in its own change',
    reason:
      'SideNav renders ResizeHandle in overlay position with its own collapse coupling and translated label, and hides the handle entirely while the nav is collapsed, so the collapse-and-restore row cannot run against it as written; SideNav binds separately with states shaped for that.',
  },
  {
    id: 'pointer-drag-model',
    owner: 'ResizeHandle.test.tsx pointer suites',
    reason:
      "Dragging (pointer capture on the grab zone, ignoring a pointer that does not own the drag, ending on pointercancel or lost capture), double-click collapse and restore, and the grab-zone geometry are pointer behavior outside the keyboard-and-semantics pattern; the component's own jsdom pointer suites prove them. ResizeHandle has no Escape cancel and no Chromium pointer suite.",
  },
  {
    id: 'pane-cycling',
    owner: 'component:Resizable AR1 (not adopted) and the composing page',
    reason:
      "F6 pane cycling is an optional part of the APG pattern that the record does not adopt; which panes exist and how focus cycles among them is the composing page's decision.",
  },
] as const;
