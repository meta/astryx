// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file useCollapsible.a11y.test.tsx
 * @input Uses useCollapsible's trigger and content props and the disclosure contract
 * @output DOM evidence that a caller-rendered trigger and content form one disclosure
 * @position Hook binding: a whole-row button and a content element that
 *   mounts its children only while open. Button semantics stay with the caller.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  DISCLOSURE_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
  type DisclosureStateFacts,
} from '@astryxdesign/a11y-spec';
import {useCollapsible} from '../useCollapsible';

interface HookDisclosureState {
  readonly id: string;
  readonly summary: string;
  readonly label: string;
  readonly defaultIsOpen: boolean;
  readonly hasContentAnimation: boolean;
  readonly facts: DisclosureStateFacts;
}

const HOOK_DISCLOSURE_STATES: ReadonlyArray<HookDisclosureState> = [
  {
    id: 'closed',
    summary: 'a closed row whose content element is empty',
    label: 'Build step',
    defaultIsOpen: false,
    hasContentAnimation: false,
    facts: {expanded: false, controls: true, operable: true, focusable: true},
  },
  {
    id: 'open',
    summary: 'an open row whose content holds its children',
    label: 'Test step',
    defaultIsOpen: true,
    hasContentAnimation: false,
    facts: {expanded: true, controls: true, operable: true, focusable: true},
  },
  {
    id: 'closed-animated',
    summary: 'a closed row whose content animates its open and close',
    label: 'Deploy step',
    defaultIsOpen: false,
    hasContentAnimation: true,
    facts: {expanded: false, controls: true, operable: true, focusable: true},
  },
];

function Row({state}: {state: HookDisclosureState}) {
  const row = useCollapsible({
    isCollapsible: {defaultIsOpen: state.defaultIsOpen},
    hasContentAnimation: state.hasContentAnimation,
  });
  return (
    <div>
      {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button" */}
      <button {...row.triggerProps}>
        <span>{state.label}</span> <span>12s</span>
      </button>
      <div {...row.contentProps}>{row.isPresent && <p>Step output</p>}</div>
      <button type="button">After disclosure</button>
    </div>
  );
}

function subjectFor(state: HookDisclosureState): HTMLElement {
  return screen.getByRole('button', {name: new RegExp(state.label)});
}

function contentFor(state: HookDisclosureState): HTMLElement {
  const id = subjectFor(state).getAttribute('aria-controls');
  const content = id == null ? null : document.getElementById(id);
  if (content == null) {
    throw new Error(`state "${state.id}" has no controlled content`);
  }
  return content;
}

describe('useCollapsible.triggerProps — disclosure pattern, jsdom lane', () => {
  it.each(
    HOOK_DISCLOSURE_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: DISCLOSURE_PATTERN,
      binding: 'useCollapsible.triggerProps',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(<Row state={state} />);
      },
      subject: () => subjectFor(state),
      related: () => ({content: contentFor(state)}),
      cleanup,
    });
  });

  it('runs the DOM layer and reports browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of HOOK_DISCLOSURE_STATES) {
      results.push(
        await checkAccessibilitySpec({
          spec: DISCLOSURE_PATTERN,
          binding: 'useCollapsible.triggerProps',
          state: state.id,
          facts: state.facts,
          mount: async () => {
            render(<Row state={state} />);
            return createJsdomHarness({
              subject: subjectFor(state),
              related: {content: contentFor(state)},
            });
          },
          unmount: cleanup,
        }),
      );
    }
    const report = summarize(DISCLOSURE_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});
