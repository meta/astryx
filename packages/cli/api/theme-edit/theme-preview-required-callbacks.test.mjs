// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The theme editor's preview page gives every callback a part's doc
 * requires, so a part that calls one (a toast's timer calls onDismiss)
 * never calls a missing function while someone edits a theme.
 */

import {describe, expect, it} from 'vitest';
import {withHandlers} from './_preview.mjs';

const NOOP = {__code: '() => {}'};

/** A project whose Toast doc requires onDismiss and offers onShow. */
const project = /** @type {any} */ ({
  components: {
    Toast: {
      props: {
        body: {type: 'ReactNode', required: true},
        onDismiss: {
          type: '(reason: "auto" | "manual") => void',
          required: true,
        },
        onShow: {type: '() => void', required: false},
      },
    },
    Card: {props: {children: {type: 'ReactNode', required: false}}},
  },
});

describe('the preview page gives a part the callbacks its doc requires', () => {
  it('gives a required callback the sample leaves out one that does nothing', () => {
    const out = /** @type {any} */ (
      withHandlers({__element: 'Toast', props: {body: 'Saved'}}, project)
    );
    expect(out.props.onDismiss).toEqual(NOOP);
    expect(out.props.body).toBe('Saved');
  });

  it('leaves an optional callback out', () => {
    const out = /** @type {any} */ (
      withHandlers({__element: 'Toast', props: {body: 'Saved'}}, project)
    );
    expect(out.props).not.toHaveProperty('onShow');
  });

  it('keeps a callback the sample gives', () => {
    const given = {__code: 'handleDismiss'};
    const out = /** @type {any} */ (
      withHandlers(
        {__element: 'Toast', props: {body: 'Saved', onDismiss: given}},
        project,
      )
    );
    expect(out.props.onDismiss).toBe(given);
  });

  it('reaches a part inside another', () => {
    const out = /** @type {any} */ (
      withHandlers(
        {
          __element: 'Card',
          props: {},
          children: [{__element: 'Toast', props: {body: 'Saved'}}],
        },
        project,
      )
    );
    expect(out.children[0].props.onDismiss).toEqual(NOOP);
  });
});
