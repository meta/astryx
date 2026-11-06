// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fastRoleQueries.ts
 * @input Uses @testing-library/react screen, dom-accessibility-api
 * @output getButton/queryButton/getOnlyButton — role+name lookups that stay
 *   O(match) in jsdom
 * @position Shared test helper; imported by component tests that render large
 *   always-mounted button collections (Calendar month grids)
 *
 * RTL's getByRole('button', {name}) computes the accessible name of EVERY
 * role candidate before filtering, and each computation consults jsdom's slow
 * getComputedStyle (~5ms per node). The date components keep a month grid of
 * ~35–85 role=button nodes mounted — visible in Calendar's case, inside the
 * closed popover for the *Input components — so a single trigger lookup cost
 * ~450ms and dominated those suites' runtime (DateRangeInput: 34s for 34
 * tests before this helper existed).
 *
 * These helpers keep RTL's exact name algorithm (dom-accessibility-api is the
 * library RTL uses internally) but:
 *   - collect candidates with {hidden: true}, skipping the per-node
 *     getComputedStyle visibility checks, and
 *   - inject a constant "visible" style stub into the name computation —
 *     names only consult display/visibility, and under {hidden: true}
 *     semantics visibility must not exclude candidates anyway.
 *
 * Trade-off vs getByRole: getButton and queryButton take the first match —
 * no tree-wide uniqueness check. getOnlyButton keeps getByRole's checks. Each
 * button with a matching name must also pass RTL's own role, name and
 * accessibility query, run on its parent alone. Exactly one may.
 *
 * SYNC: When modified, update this header.
 */

import {screen, within} from '@testing-library/react';
import {computeAccessibleName} from 'dom-accessibility-api';

// The name algorithm only reads getPropertyValue (for display/visibility/
// content), so a Pick is all we need to type honestly — no object-literal
// cast. The widening to CSSStyleDeclaration happens at the call site, where
// getComputedStyle's signature demands the full type.
const visibleStyleStub: Pick<CSSStyleDeclaration, 'getPropertyValue'> = {
  getPropertyValue: prop =>
    prop === 'display' ? 'block' : prop === 'visibility' ? 'visible' : '',
};

function matchesName(el: Element, name: string | RegExp): boolean {
  const accessibleName = computeAccessibleName(el, {
    getComputedStyle: () => visibleStyleStub as CSSStyleDeclaration,
  });
  return typeof name === 'string'
    ? accessibleName === name
    : name.test(accessibleName);
}

export function queryButton(name: string | RegExp): HTMLElement | null {
  return (
    screen
      .queryAllByRole('button', {hidden: true})
      .find(el => matchesName(el, name)) ?? null
  );
}

export function getButton(name: string | RegExp): HTMLElement {
  const el = queryButton(name);
  if (!el) {
    throw new Error(`Unable to find a role=button named ${String(name)}`);
  }
  return el;
}

export function getOnlyButton(name: string | RegExp): HTMLElement {
  const matches = screen
    .queryAllByRole('button', {hidden: true})
    .filter(
      el =>
        matchesName(el, name) &&
        el.parentElement != null &&
        within(el.parentElement).queryAllByRole('button', {name}).includes(el),
    );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one accessible role=button named ${String(name)}, found ${matches.length}`,
    );
  }
  return matches[0];
}
