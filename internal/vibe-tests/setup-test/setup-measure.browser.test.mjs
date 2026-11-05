// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setup-measure.browser.test.mjs
 * @input The real page reader and transition settler, run in a real browser
 * @output Proof that each rule holds and that removing it changes the result
 * @position internal/vibe-tests/setup-test — canonical measurement proofs
 *
 * Two cells of an operator run failed on how the host was measured rather than
 * on anything the executor did to the host. Both are corrected in
 * setup-measure.mjs, and both corrections are the kind that can quietly become
 * a hole, so each is pinned here together with the mutation that must still be
 * caught.
 *
 * These drive the exported `readPage` and `settleTransitions` themselves rather
 * than restating their rules, so a copy cannot drift from the code that runs.
 * Gated on the same flag as the rest of the canonical browser work.
 */

import {describe, expect, it, beforeAll, afterAll} from 'vitest';
import {readPage, settleTransitions} from './setup-measure.mjs';

const RUN_CANONICAL = process.env.ASTRYX_CANONICAL_SETUP_BROWSER === '1';
const describeCanonical = RUN_CANONICAL ? describe : describe.skip;

const PROBE_SPEC = {
  probes: [{name: 'host-panel', selector: '[data-vibe-probe="host-panel"]'}],
  properties: ['color', 'backgroundColor'],
  rootVariables: [],
  results: [],
};

/** A host panel holding its own copy plus a mandated, task-owned control. */
const panelPage = ({
  tooltipHidden = true,
  hostCopy = 'Deploy targets ready',
}) => `
  <!doctype html><html><body>
    <section data-vibe-probe="host-panel">
      <p>${hostCopy}</p>
      <button data-vibe-result="astryx-button" aria-describedby="tip">Deploy</button>
      <div id="tip" role="tooltip" style="display:${tooltipHidden ? 'none' : 'block'}">
        Roll out the selected services
      </div>
    </section>
  </body></html>`;

describeCanonical(
  'canonical measurement — host text counts what is rendered',
  () => {
    let browser;
    let page;

    beforeAll(async () => {
      const {chromium} = await import('playwright');
      browser = await chromium.launch();
      page = await browser.newPage({viewport: {width: 1280, height: 720}});
    }, 120_000);

    afterAll(async () => {
      await browser?.close();
    });

    const textFor = async html => {
      await page.setContent(html);
      const reading = await page.evaluate(readPage, PROBE_SPEC);
      return reading.probes['host-panel'].text;
    };

    it('excludes a mandated control and its unrendered tooltip from host text', async () => {
      // This is the pilot failure: an Astryx Button with a `tooltip` renders the
      // tooltip as a display:none sibling, hoisted out of the button because a
      // button cannot contain it. The task-owned subtree rule cannot see it, so
      // it landed in the host container's text while nothing on screen changed.
      expect(await textFor(panelPage({}))).toBe('Deploy targets ready');
    });

    it('counts that same tooltip once it is actually rendered', async () => {
      // The rule is "not rendered", not "tooltips are exempt". Content an
      // executor makes visible inside a host container is still host change.
      expect(await textFor(panelPage({tooltipHidden: false}))).toBe(
        'Deploy targets ready Roll out the selected services',
      );
    });

    it('still reports host copy that was rewritten', async () => {
      expect(
        await textFor(panelPage({hostCopy: 'Deploy targets pending'})),
      ).not.toBe('Deploy targets ready');
    });

    it.each([
      {name: 'display', style: 'display:none'},
      {name: 'visibility', style: 'visibility:hidden'},
    ])(
      'still reports host copy hidden with $name rather than deleted',
      async ({style}) => {
        // The mutation that would matter if this rule were a hole: hiding host
        // copy must not read back as an unchanged host.
        expect(
          await textFor(`
      <!doctype html><html><body>
        <section data-vibe-probe="host-panel">
          <p style="${style}">Deploy targets ready</p>
        </section>
      </body></html>`),
        ).toBe('');
      },
    );
  },
);

describeCanonical('canonical measurement — probes are read at rest', () => {
  let browser;
  let page;

  beforeAll(async () => {
    const {chromium} = await import('playwright');
    browser = await chromium.launch();
    page = await browser.newPage({viewport: {width: 1280, height: 720}});
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  /**
   * A host control whose colour transitions, exactly like the fixture button
   * that produced the pilot's only colour finding.
   *
   * The endpoints differ here so a transition actually runs — in the fixture
   * the trigger was a click putting the button into a hover/active state. What
   * the pilot showed is the consequence: a read taken while the transition runs
   * returns the interpolated value, serialized in the interpolation colour
   * space rather than the authored one, and an exact string comparison scores
   * that against a resting baseline as host damage.
   */
  const TRANSITION_PAGE = `
    <!doctype html><html><head><style>
      #control { color: oklch(0.985 0 0); transition: color 0.4s linear; }
      #control.active { color: oklch(0.205 0 0); }
    </style></head><body>
      <button id="control" data-vibe-probe="host-panel">New request</button>
    </body></html>`;

  const colorNow = () =>
    page.evaluate(
      () => getComputedStyle(document.querySelector('#control')).color,
    );

  it('reads an interpolated value, in the interpolation colour space, mid-flight', async () => {
    await page.setContent(TRANSITION_PAGE);
    expect(await colorNow()).toBe('oklch(0.985 0 0)');

    await page.evaluate(() => {
      document.querySelector('#control').classList.add('active');
    });
    const midFlight = await colorNow();

    // Neither endpoint, and not spelled the way either endpoint is authored.
    expect(midFlight.startsWith('oklab(')).toBe(true);
    expect(midFlight).not.toBe('oklch(0.985 0 0)');
    expect(midFlight).not.toBe('oklch(0.205 0 0)');
  });

  it('settles the transition so the read is the resting value', async () => {
    await page.setContent(TRANSITION_PAGE);

    await page.evaluate(() => {
      document.querySelector('#control').classList.add('active');
    });
    await settleTransitions(page);

    expect(await colorNow()).toBe('oklch(0.205 0 0)');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // The pilot's finding was on a host control the executor never touched:
    // settling has to return the authored spelling, not merely a stable one.
    await page.setContent(TRANSITION_PAGE);
    await settleTransitions(page);
    expect(await colorNow()).toBe('oklch(0.985 0 0)');
  });

  it('returns rather than hanging when an infinite animation is running', async () => {
    // Only transitions are awaited. A decorative infinite animation never
    // finishes, and waiting on it would hang every measurement.
    await page.setContent(`
      <!doctype html><html><head><style>
        @keyframes spin { to { transform: rotate(360deg) } }
        #spinner { animation: spin 1s linear infinite; }
      </style></head><body><div id="spinner">.</div></body></html>`);

    const started = Date.now();
    await settleTransitions(page, 5_000);

    expect(Date.now() - started).toBeLessThan(4_000);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(1);
  });
});
