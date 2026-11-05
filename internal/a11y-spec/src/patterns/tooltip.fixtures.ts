// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltip.fixtures.ts
 * @input Plain HTML tooltips on a trigger between two page buttons, conforming and deliberately violating
 * @output TOOLTIP_FIXTURES, their subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for tooltip.jsdom.test.ts and tooltip.chromium.spec.ts
 */

import type {TooltipStateFacts} from './tooltip';

export const SUBJECT_SELECTOR = '#trigger';

/** The fixture tooltip's show delay on hover, which every fixture declares. */
const SHOW_DELAY_MS = 200;

/**
 * How the fixture tooltip behaves. One script reads these from the trigger's
 * data attributes, so a violating fixture changes exactly one behavior.
 */
interface Behavior {
  /** What keyboard focus on the trigger does: show the tooltip, nothing, or show it and move focus into it. */
  readonly focus?: 'show' | 'ignore' | 'steal';
  /** When Escape hides the tooltip: always, only while the trigger has focus, or never. */
  readonly escape?: 'always' | 'focused-only' | 'never';
  /** Whether focus leaving the trigger hides the tooltip. */
  readonly blurHides?: boolean;
  /** Whether hovering the trigger shows the tooltip. */
  readonly hoverShows?: boolean;
  /** Leaving the trigger: hide after a short bridge, hide at once, or never hide. */
  readonly leave?: 'bridge' | 'no-bridge' | 'stay';
  /** Hide the tooltip on its own after this many milliseconds, hovered or not. */
  readonly autoHideMs?: number | null;
}

/**
 * The smallest tooltip: focus shows it at once, hover after a delay; leaving
 * hides it after a bridge that entering the tooltip cancels; blur and Escape
 * hide it. jsdom does not run it; the jsdom lane reads DOM attributes only.
 */
const SCRIPT = `<script>(() => {
  const trigger = document.getElementById('trigger');
  const tip = document.getElementById('tip');
  const d = trigger.dataset;
  let showTimer = null;
  let hideTimer = null;
  let autoTimer = null;
  const clear = () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  const hide = () => { clear(); clearTimeout(autoTimer); tip.hidden = true; };
  const show = () => {
    clear();
    tip.hidden = false;
    if (d.autoHide !== '') {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(hide, Number(d.autoHide));
    }
  };
  trigger.addEventListener('focus', () => {
    if (d.focus === 'ignore') return;
    show();
    if (d.focus === 'steal') tip.focus();
  });
  trigger.addEventListener('blur', () => { if (d.blurHides === 'true' && d.focus !== 'steal') hide(); });
  trigger.addEventListener('mouseenter', () => {
    if (d.hoverShows !== 'true') return;
    clear();
    showTimer = setTimeout(show, ${SHOW_DELAY_MS});
  });
  trigger.addEventListener('mouseleave', () => {
    clearTimeout(showTimer);
    if (d.leave === 'bridge') hideTimer = setTimeout(hide, 100);
    else if (d.leave === 'no-bridge') hide();
  });
  tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tip.addEventListener('mouseleave', () => { if (d.leave !== 'stay') hideTimer = setTimeout(hide, 100); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || tip.hidden) return;
    if (d.escape === 'always' || (d.escape === 'focused-only' && document.activeElement === trigger)) hide();
  });
})();</script>`;

interface TriggerOptions {
  readonly behavior?: Behavior;
  /** The popup's role; null for none. */
  readonly role?: string | null;
  /** The trigger's aria-describedby; null for none. */
  readonly describedBy?: string | null;
  /** The trigger's own accessible name and visible text. */
  readonly label?: string;
  /** An aria-label that names an icon-only trigger instead of its text. */
  readonly ariaLabel?: string | null;
  /** A visible hint the trigger is already described by, besides the tooltip. */
  readonly hint?: string | null;
}

const TOOLTIP_TEXT = 'Saves your changes to this draft';

function tooltipHtml({
  behavior = {},
  role = 'tooltip',
  describedBy = 'tip',
  label = 'Save',
  ariaLabel = null,
  hint = null,
}: TriggerOptions): string {
  const b: Required<Behavior> = {
    focus: 'show',
    escape: 'always',
    blurHides: true,
    hoverShows: true,
    leave: 'bridge',
    autoHideMs: null,
    ...behavior,
  };
  const data = `data-focus="${b.focus}" data-escape="${b.escape}" data-blur-hides="${b.blurHides}" data-hover-shows="${b.hoverShows}" data-leave="${b.leave}" data-auto-hide="${b.autoHideMs ?? ''}"`;
  const triggerAttributes = [
    'type="button"',
    'id="trigger"',
    ariaLabel == null ? null : `aria-label="${ariaLabel}"`,
    describedBy == null ? null : `aria-describedby="${describedBy}"`,
    data,
  ]
    .filter(attribute => attribute != null)
    .join(' ');
  const tipAttributes = [
    'id="tip"',
    role == null ? null : `role="${role}"`,
    'tabindex="-1"',
    'hidden',
    'style="position:absolute;inset-block-start:100%;inset-inline-start:0;padding:4px 8px;background:#222;color:#fff;white-space:nowrap"',
  ]
    .filter(attribute => attribute != null)
    .join(' ');
  return `<div style="padding:48px"><button type="button" id="before">Before the trigger</button> <span style="position:relative;display:inline-block"><button ${triggerAttributes}>${label}</button><div ${tipAttributes}>${TOOLTIP_TEXT}</div></span>${hint == null ? '' : ` <span id="hint">${hint}</span>`} <button type="button" id="after">After the trigger</button></div>${SCRIPT}`;
}

export interface TooltipFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: TooltipStateFacts;
  /** Relation name → selector inside the fixture. */
  readonly relations: Readonly<Record<string, string>>;
  readonly html: string;
}

const RELATIONS = {
  tooltip: '#tip',
  before: '#before',
  after: '#after',
} as const;

const FACTS: TooltipStateFacts = {
  showsOnHover: true,
  showDelayMs: SHOW_DELAY_MS,
};

function tooltip(
  id: string,
  summary: string,
  {
    facts = FACTS,
    ...options
  }: TriggerOptions & {facts?: TooltipStateFacts} = {},
): TooltipFixture {
  return {
    id,
    summary,
    facts,
    relations: RELATIONS,
    html: tooltipHtml(options),
  };
}

export const TOOLTIP_FIXTURES: readonly TooltipFixture[] = [
  tooltip(
    'conforming-text-trigger',
    'a button described by its tooltip, shown by focus at once and by hover after a delay, kept while hovered, hidden by Escape, blur and leaving',
  ),
  tooltip(
    'conforming-icon-trigger',
    'an icon-only button named by aria-label and described by its tooltip',
    {label: '💾', ariaLabel: 'Save'},
  ),
  tooltip(
    'conforming-existing-description',
    'a button already described by a visible hint, whose aria-describedby names the hint and the tooltip',
    {describedBy: 'hint tip', hint: 'Last saved a minute ago'},
  ),
  tooltip(
    'conforming-focus-only',
    'a tooltip only keyboard focus shows, which claims no hover; the hover rows do not apply',
    {
      behavior: {hoverShows: false},
      facts: {...FACTS, showsOnHover: false},
    },
  ),
  tooltip(
    'violating-status-role',
    'the popup carries role status instead of tooltip',
    {role: 'status'},
  ),
  tooltip('violating-no-role', 'the popup carries no role', {role: null}),
  tooltip(
    'violating-not-described',
    'the trigger has no aria-describedby, so nothing ties the tooltip to it',
    {describedBy: null},
  ),
  tooltip(
    'violating-described-by-other',
    'the trigger is described only by a neighbouring hint, not by the tooltip',
    {describedBy: 'hint', hint: 'Last saved a minute ago'},
  ),
  tooltip(
    'violating-focus-ignored',
    'keyboard focus on the trigger does not show the tooltip',
    {behavior: {focus: 'ignore'}},
  ),
  tooltip(
    'violating-focus-moves-into-tooltip',
    'showing the tooltip on focus moves focus into the tooltip',
    {behavior: {focus: 'steal'}},
  ),
  tooltip('violating-escape-ignored', 'Escape does nothing', {
    behavior: {escape: 'never'},
  }),
  tooltip(
    'violating-escape-needs-focus',
    'Escape hides the tooltip only while the trigger has focus, so a hovered tooltip cannot be dismissed without moving the pointer',
    {behavior: {escape: 'focused-only'}},
  ),
  tooltip(
    'violating-blur-keeps',
    'focus leaving the trigger leaves the tooltip showing',
    {behavior: {blurHides: false}},
  ),
  tooltip(
    'violating-hover-ignored',
    'hovering the trigger does not show the tooltip',
    {behavior: {hoverShows: false}},
  ),
  tooltip(
    'violating-no-hover-bridge',
    'leaving the trigger hides the tooltip at once, even when the pointer moves onto the tooltip',
    {behavior: {leave: 'no-bridge'}},
  ),
  tooltip(
    'violating-times-out',
    'the tooltip hides itself half a second after it appears, though the pointer still rests on the trigger',
    {behavior: {autoHideMs: 500}},
  ),
  tooltip(
    'violating-focus-only-times-out',
    'a tooltip only keyboard focus shows, which hides itself half a second later though focus stays on the trigger',
    {
      behavior: {hoverShows: false, autoHideMs: 500},
      facts: {...FACTS, showsOnHover: false},
    },
  ),
  tooltip(
    'violating-leave-keeps',
    'the tooltip stays after the pointer leaves the trigger and the tooltip',
    {behavior: {leave: 'stay'}},
  ),
];

export function fixture(id: string): TooltipFixture {
  const found = TOOLTIP_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown tooltip fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = TOOLTIP_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const TOOLTIP_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'tooltip.surface.role': ['violating-status-role', 'violating-no-role'],
  'tooltip.trigger.described-by-tooltip': [
    'violating-not-described',
    'violating-described-by-other',
  ],
  'tooltip.trigger.description': [
    'violating-not-described',
    'violating-described-by-other',
  ],
  'tooltip.focus.shows-on-keyboard-focus': [
    'violating-focus-ignored',
    'violating-focus-moves-into-tooltip',
    'violating-focus-only-times-out',
    'violating-times-out',
  ],
  'tooltip.keys.escape-dismisses': [
    'violating-escape-ignored',
    'violating-escape-needs-focus',
  ],
  'tooltip.focus.leaving-hides': ['violating-blur-keeps'],
  'tooltip.hover.shows-on-hover': ['violating-hover-ignored'],
  'tooltip.hover.stays-while-hovered': [
    'violating-no-hover-bridge',
    'violating-times-out',
  ],
  'tooltip.hover.leaving-hides': ['violating-leave-keeps'],
};
