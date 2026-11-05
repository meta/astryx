// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {IOS_SUPPORTS_QUERY as STYLE_GATE_QUERY} from './touchPresentation';
import {IOS_SUPPORTS_QUERY, isIosWebKit} from './touchQueries';

/** A view whose `CSS.supports` answers like an engine that knows `known`. */
function viewSupporting(known: string): {CSS: Pick<typeof CSS, 'supports'>} {
  return {
    CSS: {
      supports: (condition: string) => condition === known,
    },
  };
}

describe('the iOS WebKit engine check', () => {
  it('is the touch callout query, the one the iOS style gate spells', () => {
    expect(IOS_SUPPORTS_QUERY).toBe('(-webkit-touch-callout: none)');
    expect(STYLE_GATE_QUERY).toBe(IOS_SUPPORTS_QUERY);
  });

  it('reads iOS WebKit from a view that supports the touch callout', () => {
    expect(isIosWebKit(viewSupporting(IOS_SUPPORTS_QUERY))).toBe(true);
  });

  it('reads any other engine as not iOS WebKit', () => {
    expect(isIosWebKit(viewSupporting('(display: grid)'))).toBe(false);
  });

  it('reads a view without CSS.supports, or no view, as not iOS WebKit', () => {
    expect(isIosWebKit({CSS: {}})).toBe(false);
    expect(isIosWebKit({})).toBe(false);
    expect(isIosWebKit(null)).toBe(false);
  });
});
