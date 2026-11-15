// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Small assertion kit for task probes.
 * @input a Playwright page
 * @output named steps; the first failed step ends the probe
 * @position Imported by eval/tasks/<set>/<id>.probe.mjs and lib/grade.mjs
 */

const STEP_TIMEOUT_MS = 5000;
const KEY_HOLD_MS = 80;

export class ProbeFailure extends Error {}

export function assert(condition, message) {
  if (!condition) throw new ProbeFailure(message);
}

/** Waits until the locator matches exactly one visible element. */
export async function one(locator, description) {
  try {
    await locator.filter({visible: true}).first().waitFor({state: 'visible', timeout: STEP_TIMEOUT_MS});
  } catch {
    throw new ProbeFailure(`${description}: not visible`);
  }
  const count = await locator.filter({visible: true}).count();
  assert(count === 1, `${description}: expected 1 visible match, found ${count}`);
  return locator;
}

/**
 * Holds the key like a person does. Some widgets act on focus moves that a
 * timer schedules after keydown, and they check that the key is still down.
 */
export async function press(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(KEY_HOLD_MS);
  await page.keyboard.up(key);
}

/**
 * Waits until at least one match is visible. Use it for text: a live region
 * can repeat a message, and that copy is not a second message.
 */
export async function shown(locator, description) {
  try {
    await locator.filter({visible: true}).first().waitFor({state: 'visible', timeout: STEP_TIMEOUT_MS});
  } catch {
    throw new ProbeFailure(`${description}: not visible`);
  }
  return locator;
}

/** Waits until no match is visible. */
export async function hidden(locator, description) {
  await eventually(
    async () => (await locator.filter({visible: true}).count()) === 0,
    `${description}: still visible`,
  );
}

/** Polls a predicate; Playwright checks auto-wait, plain DOM reads do not. */
export async function eventually(predicate, message) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) {
      throw new ProbeFailure(typeof message === 'function' ? message() : message);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** A dialog under either role, filtered by accessible name. */
export function dialogNamed(page, name) {
  return page
    .getByRole('dialog', {name})
    .or(page.getByRole('alertdialog', {name}));
}

export async function isFocusedWithin(locator) {
  return locator.evaluate(
    element =>
      element === document.activeElement ||
      element.contains(document.activeElement),
  );
}

/** Text of the elements an input names in aria-describedby and aria-errormessage. */
export async function describedText(locator) {
  return locator.evaluate(element => {
    const ids = [
      element.getAttribute('aria-describedby') ?? '',
      element.getAttribute('aria-errormessage') ?? '',
    ]
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    return ids
      .map(id => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  });
}

/**
 * Runs named steps in order. A failed step stops the probe.
 * @returns {Promise<{passed: boolean, steps: {name: string, passed: boolean, error?: string}[]}>}
 */
export async function runSteps(steps) {
  const results = [];
  for (const [name, step] of steps) {
    try {
      await step();
      results.push({name, passed: true});
    } catch (error) {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return {passed: false, steps: results};
    }
  }
  return {passed: true, steps: results};
}
