// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe replacements for the two registry axes: icons and indicators.
 *
 * A registry swap is not verifiable by looking at pixels. `defineTheme({icons})`
 * and `defineTheme({indicators})` replace a COMPONENT by name, and a
 * replacement can easily paint something a diff cannot distinguish from the
 * default. So each replacement announces itself with a `data-*` marker, and the
 * check asks whether the marker is in the DOM.
 *
 * That makes the assertion exact: the marker can only be there if the registry
 * entry was consulted and the replacement was chosen. `defineTheme({indicators})`
 * is the swap that reaches furthest — replace `check` and every component that
 * renders a selection mark follows — and until this file nothing tested it.
 *
 * Not a design. These render as visible labelled boxes on purpose: a probe that
 * looked plausible would be a probe you could not tell had failed.
 */

import * as React from 'react';
import {getIconRegistry} from '@astryxdesign/core/Icon';
import type {IconName, IconRegistry} from '@astryxdesign/core/Icon';
import type {
  IndicatorProps,
  IndicatorRegistry,
} from '@astryxdesign/core/Indicator';

/** Keep in sync with .github/scripts/visual-gate/lib/probe-axes.mjs. */
const SWAP_ATTR = 'data-astryx-probe-swap';

/**
 * The glyph every themed icon becomes under the probe theme.
 *
 * `aria-hidden` because it is decorative, and because the components that host
 * icons already own the accessible name — a probe that injected one would be
 * testing itself rather than the swap.
 */
function ProbeGlyph(props: {size?: number | string}) {
  const {size = '1em'} = props;
  return (
    <svg
      {...{[SWAP_ATTR]: 'icon'}}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none">
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        fill="#ff0080"
        stroke="#00e0ff"
        strokeWidth="2"
      />
      <path d="M4 8h8M8 4v8" stroke="#f0ff00" strokeWidth="2" />
    </svg>
  );
}

/**
 * Every icon the default registry serves, replaced.
 *
 * Reflects over the live registry rather than listing names: a hand-written
 * list silently stops covering an icon the day someone adds one, which is
 * exactly the drift this fixture exists to prevent. An `IconRegistry` maps a
 * name to a rendered node, not to a component, so these are elements.
 */
export const probeIconRegistry: IconRegistry = Object.fromEntries(
  (Object.keys(getIconRegistry()) as IconName[]).map(name => [
    name,
    <ProbeGlyph key={name} />,
  ]),
) as IconRegistry;

/**
 * An indicator replacement that draws its state as a letter.
 *
 * The state is rendered as text so the check can tell WHICH state was passed,
 * not merely that something replaced the default — an indicator that swapped
 * correctly but was handed the wrong state is a real bug and would otherwise
 * look identical.
 */
function makeProbeIndicator(kind: string) {
  return function ProbeIndicator({
    state,
    size = 'md',
    isDisabled,
    ...rest
  }: IndicatorProps) {
    return (
      <span
        {...rest}
        {...{[SWAP_ATTR]: 'indicator'}}
        data-probe-indicator={kind}
        data-probe-state={String(state)}
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size === 'sm' ? 12 : 16,
          height: size === 'sm' ? 12 : 16,
          background: '#ff0080',
          color: '#f0ff00',
          border: '2px solid #00e0ff',
          fontSize: 9,
          lineHeight: 1,
          opacity: isDisabled ? 0.4 : 1,
        }}>
        {String(state).charAt(0).toUpperCase()}
      </span>
    );
  };
}

/**
 * Every indicator the theme contract can swap.
 * <!-- SYNC: packages/core/src/Indicator/types.ts (IndicatorMap) -->
 */
export const probeIndicatorRegistry: IndicatorRegistry = {
  check: makeProbeIndicator('check'),
  radio: makeProbeIndicator('radio'),
  checkbox: makeProbeIndicator('checkbox'),
};
