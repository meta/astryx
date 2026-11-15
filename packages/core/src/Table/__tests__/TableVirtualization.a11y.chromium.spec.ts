// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/

/**
 * @file TableVirtualization.a11y.chromium.spec.ts
 * @input Public Table row fixture in a production source build and Chromium
 * @output Native semantics, logical positions and real keyboard/focus evidence
 * @position Row virtualization release proof; not an assistive-technology claim
 */
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {createChromiumHarness} from '@astryxdesign/a11y-spec/chromium';
import {
  startRowFixture,
  mountRows,
  scrollRows,
} from './TableVirtualization.release.harness';

let fixture: Awaited<ReturnType<typeof startRowFixture>>;
test.beforeAll(async () => {
  fixture = await startRowFixture(test.info().parallelIndex);
});
test.afterAll(async () => {
  await fixture?.close();
});

for (const count of [0, 3, 1000]) {
  test(`native sections and full logical positions at ${count} rows`, async ({
    page,
  }) => {
    await mountRows(page, fixture.origin, count, 'core');
    const table = page.getByRole('table', {name: 'Release rows'});
    const cdp = await page.context().newCDPSession(page);
    const harness = createChromiumHarness({page, cdp, subject: table});
    expect((await (await harness.subject()).computed()).role).toBe('table');
    await expect(table.locator('thead > tr')).toHaveCount(1);
    await expect(table.locator('thead > tr > th[scope="col"]')).toHaveCount(3);
    await expect(table.locator('[role="grid"], [role="row"]')).toHaveCount(0);
    if (count === 0) {
      await expect(table).not.toHaveAttribute('aria-rowcount');
      await expect(table.locator('tbody > tr[aria-hidden="true"]')).toHaveCount(
        0,
      );
      await expect(table.getByText('No release rows')).toBeVisible();
      return;
    }
    await expect(table).toHaveAttribute('aria-rowcount', String(count + 1));
    await expect(table.locator('thead > tr')).toHaveAttribute(
      'aria-rowindex',
      '1',
    );
    if (count > 3) {
      await scrollRows(page, (count / 2) * 56);
    }
    const facts = await table.evaluate(node => {
      const rows = Array.from(
        node.querySelectorAll<HTMLTableRowElement>('tbody > tr'),
      );
      return rows.map(row => ({
        index: row.getAttribute('aria-rowindex'),
        hidden: row.getAttribute('aria-hidden'),
        text: row.textContent,
        name: row.cells[1]?.textContent ?? null,
        tag: row.tagName,
        display: getComputedStyle(row).display,
        position: getComputedStyle(row).position,
        span: row.cells[0]?.colSpan,
        height: row.getBoundingClientRect().height,
        stops: row.querySelectorAll('button, input, [tabindex]').length,
      }));
    });
    const product = facts.filter(row => row.hidden !== 'true');
    expect(product.length).toBeGreaterThan(0);
    expect(product.length).toBeLessThanOrEqual(15);
    for (const row of facts) {
      expect(row.tag).toBe('TR');
      expect(row.display).toBe('table-row');
      expect(row.position).not.toBe('absolute');
      if (row.hidden === 'true') {
        expect(row.index).toBeNull();
        expect(row.text).toBe('');
        expect(row.span).toBe(3);
        expect(row.stops).toBe(0);
      } else {
        const logical = Number(row.name?.match(/^Product (\d+)$/)?.[1]);
        expect(Number(row.index)).toBe(logical + 1);
        expect(Math.abs(row.height - 56)).toBeLessThanOrEqual(0.75);
      }
    }
    expect(
      facts.filter(row => row.hidden === 'true').length,
    ).toBeLessThanOrEqual(3);
    const bodyHeight = await table
      .locator('tbody')
      .evaluate(node => node.getBoundingClientRect().height);
    expect(Math.abs(bodyHeight - count * 56)).toBeLessThanOrEqual(1);
    const gap = table.locator('tbody > tr[aria-hidden="true"]').first();
    if (await gap.count()) {
      const hidden = createChromiumHarness({page, cdp, subject: gap});
      expect((await (await hidden.subject()).computed()).role).toBeNull();
    }
    await expect(
      page.locator('[aria-live], [role="status"], [role="alert"]'),
    ).toHaveCount(0);
    await cdp.detach();
  });
}

for (const density of ['compact', 'balanced', 'spacious'] as const) {
  test(`fits four-digit row numbers at ${density} density without leaving the window`, async ({
    page,
  }) => {
    const fallbacks: string[] = [];
    page.on('console', message => {
      if (/Windowing disabled|exceeds the column width/.test(message.text())) {
        fallbacks.push(message.text());
      }
    });
    await mountRows(page, fixture.origin, 2000, 'supported', density);
    await scrollRows(page, 1500 * 56);
    const row = page.locator('tbody > tr[aria-rowindex="1502"]');
    await expect(row).toHaveCount(1);
    const number = row.getByText('1501', {exact: true});
    await expect(number).toBeVisible();
    // The number's text fits the cell's content box: nothing is clipped.
    const fit = await number.evaluate(node => {
      const cell = node.closest('td');
      const range = document.createRange();
      range.selectNodeContents(node);
      if (cell == null) {
        return {text: 0, room: 0};
      }
      const style = getComputedStyle(cell);
      return {
        text: range.getBoundingClientRect().width,
        room:
          cell.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
      };
    });
    expect(fit.text).toBeGreaterThan(0);
    expect(fit.text).toBeLessThanOrEqual(fit.room + 0.5);
    expect(
      await page.locator('tbody > tr:not([aria-hidden="true"])').count(),
    ).toBeLessThanOrEqual(15);
    // The pinned ID column starts where the columns before it end, including
    // the row-number column's extra width.
    const pinned = await page
      .getByRole('columnheader', {name: 'ID', exact: true})
      .evaluate(node => {
        const before = Array.from(node.parentElement?.children ?? []).slice(
          0,
          (node as HTMLTableCellElement).cellIndex,
        );
        return {
          offset: Number.parseFloat(getComputedStyle(node).insetInlineStart),
          widths: before.reduce(
            (sum, cell) => sum + cell.getBoundingClientRect().width,
            0,
          ),
        };
      });
    expect(Math.abs(pinned.offset - pinned.widths)).toBeLessThanOrEqual(1);
    expect(fallbacks).toEqual([]);
  });
}

test('native PageDown and Tab preserve selection and one keyed focus island', async ({
  page,
}) => {
  await mountRows(page, fixture.origin, 1000, 'supported');
  const viewport = page.getByRole('group', {name: 'Release rows'});
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await viewport.focus();
  await page.keyboard.press('PageDown');
  await expect
    .poll(async () => viewport.evaluate(node => node.scrollTop))
    .toBeGreaterThan(0);
  await scrollRows(page, 0);
  const control = page.getByRole('checkbox', {
    name: 'Select Product 1',
    exact: true,
  });
  await control.focus();
  await page.keyboard.press('Space');
  await expect(control).toBeChecked();
  const original = await control.elementHandle();
  await scrollRows(page, 500 * 56);
  expect(
    await original?.evaluate(
      node => node.isConnected && document.activeElement === node,
    ),
  ).toBe(true);
  await expect(control).toHaveCount(1);
  await expect(page.locator('tbody > tr[aria-rowindex="2"]')).toHaveCount(1);
  expect(
    await page.locator('tbody > tr:not([aria-hidden="true"])').count(),
  ).toBeLessThanOrEqual(16);
  await viewport.focus();
  await expect(control).toHaveCount(0);
  await scrollRows(page, 0);
  await expect(control).toBeChecked();
  await viewport.focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('checkbox', {name: 'Select all rows', exact: true}),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(viewport).toBeFocused();
  await original?.dispose();
});

test('removing a focused row returns focus without resetting scroll', async ({
  page,
}) => {
  await mountRows(page, fixture.origin, 1000, 'supported');
  const control = page.getByRole('checkbox', {
    name: 'Select Product 1',
    exact: true,
  });
  await control.focus();
  await scrollRows(page, 500 * 56);
  const viewport = page.getByRole('group', {name: 'Release rows'});
  const before = await viewport.evaluate(node => node.scrollTop);
  await page.evaluate(() => window.__rowRelease.remove('row-0'));
  await expect(viewport).toBeFocused();
  await expect(control).toHaveCount(0);
  await expect
    .poll(async () => viewport.evaluate(node => node.scrollTop))
    .toBeCloseTo(before - 56, 0);
});

test('leading deletion preserves the visible anchor and appending does not follow the tail', async ({
  page,
}) => {
  await mountRows(page, fixture.origin, 1000, 'core');
  await scrollRows(page, 500 * 56 + 7);
  const viewport = page.getByRole('group', {name: 'Release rows'});
  const before = await viewport.evaluate(node => node.scrollTop);
  const anchor = await viewport.evaluate(node => {
    const top = node.getBoundingClientRect().top;
    const row = Array.from(
      node.querySelectorAll<HTMLTableRowElement>('tbody > tr[aria-rowindex]'),
    ).find(row => row.getBoundingClientRect().bottom > top);
    return {text: row?.textContent, top: row?.getBoundingClientRect().top};
  });
  await page.evaluate(() => window.__rowRelease.remove('row-0'));
  await expect
    .poll(async () => viewport.evaluate(node => node.scrollTop))
    .toBeCloseTo(before - 56, 0);
  expect(
    await viewport.evaluate(
      (node, text) =>
        Array.from(node.querySelectorAll('tbody > tr'))
          .find(row => row.textContent === text)
          ?.getBoundingClientRect().top,
      anchor.text,
    ),
  ).toBeCloseTo(anchor.top ?? Number.NaN, 0);
  const anchored = await viewport.evaluate(node => node.scrollTop);
  await page.evaluate(() => window.__rowRelease.append());
  await expect
    .poll(async () => viewport.evaluate(node => node.scrollTop))
    .toBeCloseTo(anchored, 0);
});
