// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file analytics.ts
 * @position src/lib — typed analytics helpers wrapping @vercel/analytics.
 *
 * Convention: small fixed set of event names, context pushed into properties.
 * See https://github.com/meta/astryx/issues/2607 for the full spec.
 */

import {track} from '@vercel/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Page =
  | 'templates'
  | 'themes'
  | 'components'
  | 'playground'
  | 'docs'
  | 'landing';

type CopyTarget =
  | 'cli_command'
  | 'import_path'
  | 'code_block'
  | 'share_url'
  | 'install_command';

type CtaTarget =
  | 'install'
  | 'get_started'
  | 'github'
  | 'community'
  | 'customize';

type NavigateTarget = 'prev_next' | 'tab' | 'view';

type ToggleTarget = 'mode' | 'viewport';

interface BaseProps {
  page?: Page;
  item?: string;
  category?: string;
}

/** Collapse typed props into a plain Record that track() accepts. */
function props(obj: object): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

/** Something was viewed (dialog opened, detail page loaded). */
export function trackView(
  p: BaseProps & {package?: string; has_shared_code?: boolean},
) {
  track('view', props(p));
}

/** User copied something to clipboard. */
export function trackCopy(
  p: BaseProps & {target: CopyTarget; example?: string},
) {
  track('copy', props(p));
}

/** Navigated to playground with code. */
export function trackOpenPlayground(
  p: BaseProps & {example?: string; source?: string},
) {
  track('open_playground', props(p));
}

/** Moved between items (prev/next, tab switch). */
export function trackNavigate(
  p: BaseProps & {
    target: NavigateTarget;
    direction?: 'next' | 'prev';
    tab?: string;
    view?: string;
  },
) {
  track('navigate', props(p));
}

/** Search palette interaction. */
export function trackSearch(p: {
  target: 'open' | 'select';
  item?: string;
  type?: string;
}) {
  track('search', props(p));
}

/** CTA button clicked. */
export function trackClickCta(p: BaseProps & {target: CtaTarget}) {
  track('click_cta', props(p));
}

/** Mode/setting toggled. */
export function trackToggle(
  p: BaseProps & {target: ToggleTarget; value: string},
) {
  track('toggle', props(p));
}
