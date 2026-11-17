// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fixed clock for a page process, preloaded through NODE_OPTIONS:
 *   `new Date()`, `Date()` and `Date.now()` answer one instant, so a page
 *   that shows the time renders the same markup every time.
 * @input Nothing; NODE_OPTIONS `--import` loads it before the page.
 * @output The global `Date`, fixed at one instant; dates given a value are
 *   as before.
 * @position Test support: the template round trip preloads it into the
 *   render's page processes.
 */

const INSTANT = Date.UTC(2026, 0, 15, 9, 30, 0);
const SystemDate = Date;

globalThis.Date = new Proxy(SystemDate, {
  construct: (target, args) =>
    Reflect.construct(target, args.length === 0 ? [INSTANT] : args),
  apply: () => new SystemDate(INSTANT).toString(),
  get: (target, key) =>
    key === 'now' ? () => INSTANT : Reflect.get(target, key),
});
