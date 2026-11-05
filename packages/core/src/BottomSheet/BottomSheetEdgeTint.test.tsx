// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetEdgeTint.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet, BottomSheetSwitcher
 * @output Tests which sheets carry the iOS Safari bottom edge tint, and pins
 *   the declarations WebKit's edge sampler reads
 * @position Core testing; validates BottomSheetEdgeTint.tsx and its two hosts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheetEdgeTint.tsx
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render} from '@testing-library/react';
import {BottomSheet} from './BottomSheet';
import {BottomSheetSwitcher} from './BottomSheetSwitcher';

// jsdom doesn't implement <dialog> open/close or pointer capture; stub them.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function tints(): ReadonlyArray<Element> {
  return Array.from(document.querySelectorAll('[data-sheet-edge-tint]'));
}

async function edgeTintSource(): Promise<string> {
  const tint = (await fullSource()).match(/\n {2}tint: \{([\s\S]*?)\n {2}\},/);
  expect(tint).not.toBeNull();
  return tint![1];
}

/** The tint's declarations with its explanatory comments stripped out. */
async function edgeTintDeclarations(): Promise<string> {
  return (await edgeTintSource())
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');
}

async function fullSource(): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  return fs.readFileSync(
    path.resolve(__dirname, './BottomSheetEdgeTint.tsx'),
    'utf-8',
  );
}

describe('BottomSheetEdgeTint', () => {
  it('gives a non-modal sheet an edge tint to colour the iOS toolbar strip', () => {
    render(
      <BottomSheet
        isOpen
        onOpenChange={() => {}}
        hasScrim={false}
        label="Place details">
        Content
      </BottomSheet>,
    );
    expect(tints()).toHaveLength(1);
  });

  it('gives a modal sheet the same surface-coloured edge tint', () => {
    render(
      <BottomSheet isOpen onOpenChange={() => {}} label="Place details">
        Content
      </BottomSheet>,
    );
    expect(tints()).toHaveLength(1);
  });

  it('renders the tint inside the dialog, so it unmounts with the sheet', () => {
    const {rerender} = render(
      <BottomSheet
        isOpen
        onOpenChange={() => {}}
        hasScrim={false}
        label="Place details">
        Content
      </BottomSheet>,
    );
    const [tint] = tints();
    expect(tint?.closest('dialog')).not.toBeNull();

    rerender(<div />);
    expect(tints()).toHaveLength(0);
  });

  // Each switcher step owns a dialog and tints it while presented: one tint
  // at rest, one per open dialog through a handoff (the retained dialog's
  // sits beneath the entering dialog), none for a sheet that is not
  // presented.
  it('gives a non-modal switcher flow exactly one tint', () => {
    render(
      <BottomSheetSwitcher
        activeSheet="comment"
        hasScrim={false}
        onActiveSheetChange={() => {}}>
        <BottomSheet sheetId="comment" label="Add a comment">
          Comment
        </BottomSheet>
        <BottomSheet sheetId="confirmation" label="Confirmation">
          Confirmation
        </BottomSheet>
      </BottomSheetSwitcher>,
    );
    expect(tints()).toHaveLength(1);
  });

  it('gives a modal switcher flow exactly one tint at rest, and one per presented dialog through a handoff', () => {
    const {rerender} = render(
      <BottomSheetSwitcher activeSheet="comment" onActiveSheetChange={() => {}}>
        <BottomSheet sheetId="comment" label="Add a comment">
          Comment
        </BottomSheet>
        <BottomSheet sheetId="confirmation" label="Confirmation">
          Confirmation
        </BottomSheet>
      </BottomSheetSwitcher>,
    );
    expect(tints()).toHaveLength(1);
    expect(tints()[0]?.closest('dialog')?.getAttribute('aria-label')).toBe(
      'Add a comment',
    );

    rerender(
      <BottomSheetSwitcher
        activeSheet="confirmation"
        onActiveSheetChange={() => {}}>
        <BottomSheet sheetId="comment" label="Add a comment">
          Comment
        </BottomSheet>
        <BottomSheet sheetId="confirmation" label="Confirmation">
          Confirmation
        </BottomSheet>
      </BottomSheetSwitcher>,
    );
    // Mid-handoff both dialogs are presented; each carries its own tint.
    expect(
      tints().map(tint => tint.closest('dialog')?.getAttribute('aria-label')),
    ).toEqual(['Add a comment', 'Confirmation']);
  });

  it('keeps the tint out of the accessibility tree and out of hit testing', async () => {
    render(
      <BottomSheet
        isOpen
        onOpenChange={() => {}}
        hasScrim={false}
        label="Place details">
        Content
      </BottomSheet>,
    );
    const [tint] = tints();
    expect(tint?.getAttribute('aria-hidden')).toBe('true');
    expect(tint?.textContent).toBe('');
    expect(await edgeTintSource()).toContain("pointerEvents: 'none'");
  });

  // Every declaration below is load-bearing for a heuristic that lives in
  // WebKit, not in this repo, and none of it is observable in jsdom or in any
  // engine without retractable browser chrome — so it is asserted on the style
  // definition, the way BottomSheetPanel pins its handle gradient.
  describe('the declarations WebKit samples', () => {
    it('is fixed and flush with the bottom edge of the viewport', async () => {
      const tint = await edgeTintSource();
      // Only a fixed or sticky box is a candidate, and only a box flush with
      // the edge is the one Safari hit tests.
      expect(tint).toContain("position: 'fixed'");
      expect(tint).toContain('insetBlockEnd: 0');
      expect(tint).toContain('insetInline: 0');
    });

    it('clears the 10px floor below which WebKit ignores the declared colour', async () => {
      const height = (await fullSource()).match(
        /const SAMPLE_HEIGHT_PX = (\d+);/,
      );
      expect(height).not.toBeNull();
      expect(Number(height![1])).toBeGreaterThan(10);
      expect(await edgeTintSource()).toContain(
        'height: `${SAMPLE_HEIGHT_PX}px`',
      );
    });

    it('declares the sheet surface colour, so the strip matches the sheet', async () => {
      expect(await edgeTintSource()).toContain(
        "backgroundColor: colorVars['--color-background-surface']",
      );
    });

    // visibility: hidden, display: none and a low opacity all disqualify the
    // element from sampling. A mask does not, which is the only reason the
    // strip can be both readable by Safari and invisible to the user.
    it('hides itself with a mask rather than with visibility or opacity', async () => {
      const tint = await edgeTintDeclarations();
      expect(tint).toContain(
        "maskImage: 'linear-gradient(transparent, transparent)'",
      );
      expect(tint).toContain(
        "WebkitMaskImage: 'linear-gradient(transparent, transparent)'",
      );
      expect(tint).not.toContain('visibility');
      expect(tint).not.toContain('opacity');
      expect(tint).not.toContain("display: 'none'");
    });
  });
});
