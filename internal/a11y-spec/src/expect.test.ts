// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file expect.test.ts
 * @input Uses one minimal accessibility spec and the jsdom assertion helper
 * @output Proof that component-facing tests pass render and subject explicitly,
 *   and that required failures reject with a reader-legible message
 * @position Public test-API contract for expectAccessibilitySpec
 */

import {describe, expect, it, vi} from 'vitest';
import {definePattern} from './contract';
import {expectAccessibilitySpec} from './expect';

interface Facts {
  readonly present: boolean;
}

const SPEC = definePattern<Facts>({
  pattern: 'probe',
  url: 'https://example.invalid/probe',
  scope: 'A minimal pattern for testing the assertion API.',
  exemptions: {},
  expectations: [
    {
      id: 'probe.name.present',
      outcome: 'The probe has a name.',
      sources: [
        {
          standard: 'wcag',
          id: '4.1.2',
          name: 'Name, Role, Value',
          level: 'A',
          url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
        },
      ],
      covers: ['4.1.2-name-role-value'],
      appliesWhen: {
        condition: 'the probe is present',
        test: facts => facts.present,
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({subject}) => {
        if ((await subject.attribute('aria-label')) !== 'Save') {
          throw new Error('the probe has no accessible name');
        }
      },
    },
  ],
});

describe('expectAccessibilitySpec', () => {
  it('accepts render and subject directly and resolves when the spec passes', async () => {
    const render = vi.fn(() => {
      document.body.innerHTML = '<button aria-label="Save">Save</button>';
    });

    await expectAccessibilitySpec({
      spec: SPEC,
      binding: 'Button',
      state: 'default',
      facts: {present: true},
      render,
      subject: () => document.querySelector('button')!,
      cleanup: () => {
        document.body.innerHTML = '';
      },
    });

    expect(render).toHaveBeenCalledOnce();
  });

  it('rejects with the binding and failed outcome when a required check fails', async () => {
    await expect(
      expectAccessibilitySpec({
        spec: SPEC,
        binding: 'Button',
        state: 'unnamed',
        facts: {present: true},
        render: () => {
          document.body.innerHTML = '<button>Save</button>';
        },
        subject: () => document.querySelector('button')!,
        cleanup: () => {
          document.body.innerHTML = '';
        },
      }),
    ).rejects.toThrow(/Button \[unnamed\].*probe\.name\.present/s);
  });
});
