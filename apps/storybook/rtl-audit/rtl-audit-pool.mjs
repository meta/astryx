// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rtl-audit-pool.mjs
 * @input A page opener (`openPage`) and the number of workers; work items and
 *   a per-item scan function with its error record; for the curated pass, a
 *   coarse-pointer page opener and each target's steps.
 * @output createPagePool, a fixed set of worker slots that each hold one page
 *   at a time, and mapPool, which runs items over those slots. A slot whose
 *   scan throws gets a fresh page before it takes another item.
 *   createCuratedPages and runSteps do the same for the serial curated pass:
 *   a step that throws gets the page it ran on replaced before the next step.
 * @position Used by rtl-audit.mjs for the D1, D5, and D6 auto-discovery passes
 *   and the curated pass. A page that failed a story can be unusable — a
 *   navigation that never commits, a crashed or hung renderer — and a worker
 *   that kept it would fail every later story it was handed. Recovery never
 *   retries the failed story: its error record stays, and only what follows
 *   runs on the new page.
 */

/** How long to wait for a discarded page to close before moving on. */
const CLOSE_WAIT_MS = 5000;

/** The first line of an error, as a recovery record keeps it. */
function firstLine(error) {
  return String(error).split('\n')[0].slice(0, 160);
}

/**
 * Runs `replace(reason)` after a failure. A page that cannot be replaced ends
 * the run, and the error names the failure that needed the replacement, so
 * neither failure is lost.
 */
async function recover(replace, reason) {
  try {
    await replace(reason);
  } catch (replaceError) {
    const failed = [reason.phase, reason.storyId, reason.dim]
      .filter(Boolean)
      .join(' ');
    throw new Error(
      `cannot replace the page after ${failed || 'a scan'} failed (${reason.error}): ${firstLine(replaceError)}`,
      {cause: replaceError},
    );
  }
}

/**
 * Closes `page` without letting a wedged page stall the caller: a page whose
 * renderer is stuck may never acknowledge the close.
 */
export async function closePageQuietly(page, waitMs = CLOSE_WAIT_MS) {
  let timer;
  await Promise.race([
    Promise.resolve()
      .then(() => page.close())
      .catch(() => {}),
    new Promise(resolve => {
      timer = setTimeout(resolve, waitMs);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Opens `size` worker pages with `openPage`. Every page comes from the same
 * opener, so a replacement has exactly the options its predecessor had.
 */
export async function createPagePool({
  size,
  openPage,
  closePage = closePageQuietly,
}) {
  const slots = await Promise.all(
    Array.from({length: Math.max(1, size)}, async (_, id) => ({
      id,
      page: await openPage(),
      replacements: 0,
    })),
  );
  const recoveries = [];
  return {
    slots,
    recoveries,
    /** The page in the first slot now; it changes when that slot recovers. */
    first() {
      return slots[0].page;
    },
    pages() {
      return slots.map(slot => slot.page);
    },
    /**
     * Gives `slot` a fresh page and discards its old one. `reason` names the
     * story whose failure made the old page untrustworthy.
     */
    async replace(slot, reason) {
      const discarded = slot.page;
      slot.page = await openPage();
      slot.replacements += 1;
      recoveries.push({worker: slot.id, ...reason});
      await closePage(discarded);
    },
    async close() {
      await Promise.all(slots.map(slot => closePage(slot.page)));
    },
  };
}

/**
 * Runs `scan(item, page)` over `items` with one worker per pool slot. Results
 * are written by index, so the output is in input order regardless of which
 * worker finished first. When `scan` throws, the item's result is
 * `onError(item, error)`, and that worker's page is replaced before it takes
 * its next item. `describe(item)` names the item in the recovery record.
 */
export async function mapPool(
  items,
  pool,
  {scan, onError, describe = () => ({})},
) {
  const out = new Array(items.length);
  let next = 0;
  const workers = pool.slots.slice(
    0,
    Math.max(1, Math.min(pool.slots.length, items.length)),
  );
  await Promise.all(
    workers.map(async slot => {
      for (let i = next++; i < items.length; i = next++) {
        try {
          out[i] = await scan(items[i], slot.page);
        } catch (error) {
          out[i] = onError(items[i], error);
          await recover(reason => pool.replace(slot, reason), {
            ...describe(items[i]),
            error: firstLine(error),
          });
        }
      }
    }),
  );
  return out;
}

/**
 * The two pages the serial curated pass runs on: the first worker slot's page
 * (`'main'`) and a coarse-pointer page from its own context (`'coarse'`).
 * `replace(kind, reason)` swaps one for a fresh page and records why.
 */
export function createCuratedPages({
  pool,
  coarsePage,
  openCoarsePage,
  closePage = closePageQuietly,
}) {
  let coarse = coarsePage;
  return {
    page: () => pool.first(),
    coarsePage: () => coarse,
    async replace(kind, reason) {
      if (kind === 'main') {
        await pool.replace(pool.slots[0], reason);
        return;
      }
      const discarded = coarse;
      coarse = await openCoarsePage();
      pool.recoveries.push({worker: 'coarse', ...reason});
      await closePage(discarded);
    },
  };
}

/**
 * Runs one target's steps in order, each on the page `pageFor` names
 * (`'main'` or `'coarse'`). A step that throws records its error through
 * `onError`, and the page it ran on is replaced before the next step, so
 * neither the rest of the target nor the next target inherits a broken page.
 * `describe(step)` names the step in the recovery record.
 */
export async function runSteps(
  steps,
  pages,
  {run, onError, pageFor, describe = () => ({})},
) {
  for (const step of steps) {
    const kind = pageFor(step);
    try {
      await run(step, kind === 'main' ? pages.page() : pages.coarsePage());
    } catch (error) {
      onError(step, error);
      await recover(reason => pages.replace(kind, reason), {
        ...describe(step),
        error: firstLine(error),
      });
    }
  }
}
