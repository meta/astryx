// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headingLinks.a11y.chromium.spec.ts
 * @input Heading-link copy-button Storybook story in real Chromium
 * @output Reveal, geometry, copy, no-navigation, modality, theme, and screenshot evidence
 * @position Browser proof for module:Markdown/headingLinks
 *
 * Build Storybook first:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright test headingLinks.a11y.chromium.spec.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-markdown--heading-links';
const OUTPUT = path.resolve('test-results/markdown-heading-links');
const GEOMETRY_TOLERANCE_PX = 1;
let storybook: StaticServer;
const evidence: Record<string, unknown> = {};

interface RectGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

interface HeadingGeometry {
  readonly row: RectGeometry;
  readonly heading: RectGeometry;
  readonly slot: RectGeometry;
  readonly button: RectGeometry;
  readonly glyph: RectGeometry;
  readonly headingBaseline: number;
  readonly slotBaseline: number;
  readonly lineHeight: number;
  readonly alignItems: string;
  readonly flexWrap: string;
  readonly outlineExtent: number;
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  evidence.headSha = process.env.ASTRYX_HEAD_SHA ?? null;
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify({version: 1, ...evidence}, null, 2)}\n`,
  );
  await storybook?.close();
});

async function openStory(
  page: Page,
  globals = 'astryxTheme:neutral;colorMode:light;direction:ltr',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=${globals}`,
    {waitUntil: 'load'},
  );
  await page.locator('#heading-links-ltr h1').waitFor({state: 'visible'});
  await page
    .locator('#heading-links-ltr[data-heading-links-play-complete="true"]')
    .waitFor();
}

function copyButtonForHeading(heading: Locator): Locator {
  return heading.locator('..').locator('button').first();
}

async function copyButtonOpacity(page: Page): Promise<number> {
  const heading = page
    .locator('#heading-links-ltr')
    .getByRole('heading', {name: 'Linkable headings'});
  return copyButtonForHeading(heading).evaluate(element =>
    Number(getComputedStyle(element).opacity),
  );
}

async function blurActiveElement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
}

async function measureHeading(heading: Locator): Promise<HeadingGeometry> {
  return heading.evaluate(element => {
    const headingElement = element as HTMLElement;
    const rowElement = headingElement.parentElement;
    const buttonElement = rowElement?.querySelector('button');
    const slotElement = buttonElement?.parentElement;
    const glyphElement = buttonElement?.querySelector('[aria-hidden="true"]');
    if (
      rowElement == null ||
      buttonElement == null ||
      slotElement == null ||
      glyphElement == null
    ) {
      throw new Error(
        'Heading-link geometry requires its complete rendered row',
      );
    }

    const makeBaselineProbe = (): HTMLSpanElement => {
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, {
        display: 'inline-block',
        width: '0px',
        height: '0px',
        margin: '0px',
        padding: '0px',
        verticalAlign: 'baseline',
      });
      return probe;
    };
    const headingProbe = makeBaselineProbe();
    const slotProbe = makeBaselineProbe();
    headingElement.append(headingProbe);
    slotElement.append(slotProbe);

    const round = (value: number): number => Math.round(value * 1000) / 1000;
    const readRect = (target: Element): RectGeometry => {
      const rect = target.getBoundingClientRect();
      return {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
        right: round(rect.right),
        bottom: round(rect.bottom),
      };
    };
    const buttonStyle = getComputedStyle(buttonElement);
    const outlineWidth = Number.parseFloat(buttonStyle.outlineWidth) || 0;
    const outlineOffset = Number.parseFloat(buttonStyle.outlineOffset) || 0;
    const geometry = {
      row: readRect(rowElement),
      heading: readRect(headingElement),
      slot: readRect(slotElement),
      button: readRect(buttonElement),
      glyph: readRect(glyphElement),
      headingBaseline: round(headingProbe.getBoundingClientRect().top),
      slotBaseline: round(slotProbe.getBoundingClientRect().top),
      lineHeight: round(
        Number.parseFloat(getComputedStyle(headingElement).lineHeight),
      ),
      alignItems: getComputedStyle(rowElement).alignItems,
      flexWrap: getComputedStyle(rowElement).flexWrap,
      outlineExtent: round(outlineWidth + Math.max(0, outlineOffset)),
    };

    headingProbe.remove();
    slotProbe.remove();
    return geometry;
  });
}

async function measureReferenceHeading(heading: Locator): Promise<{
  readonly height: number;
  readonly lineHeight: number;
  readonly fontSize: string;
}> {
  return heading.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      height: Math.round(element.getBoundingClientRect().height * 1000) / 1000,
      lineHeight: Math.round(Number.parseFloat(style.lineHeight) * 1000) / 1000,
      fontSize: style.fontSize,
    };
  });
}

async function readFocusRing(button: Locator): Promise<{
  readonly focusVisible: boolean;
  readonly outlineWidth: string;
  readonly outlineStyle: string;
  readonly outlineOffset: string;
  readonly boxShadow: string;
  readonly slotOutlineWidth: string;
  readonly slotOutlineStyle: string;
}> {
  return button.evaluate(element => {
    const style = getComputedStyle(element);
    const slotStyle = getComputedStyle(element.parentElement as HTMLElement);
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      slotOutlineWidth: slotStyle.outlineWidth,
      slotOutlineStyle: slotStyle.outlineStyle,
    };
  });
}

function expectAlignedGeometry(geometry: HeadingGeometry): void {
  expect(
    Math.abs(geometry.row.height - geometry.heading.height),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(
    Math.abs(geometry.headingBaseline - geometry.slotBaseline),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(
    Math.abs(
      geometry.glyph.y +
        geometry.glyph.height / 2 -
        (geometry.slot.y + geometry.slot.height / 2),
    ),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(geometry.alignItems).toMatch(/baseline/u);
  expect(geometry.flexWrap).toBe('nowrap');
}

function expectSameRect(before: RectGeometry, after: RectGeometry): void {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(before[key] - after[key])).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE_PX,
    );
  }
}

function rectsIntersect(a: RectGeometry, b: RectGeometry): boolean {
  return !(
    a.right <= b.x ||
    b.right <= a.x ||
    a.bottom <= b.y ||
    b.bottom <= a.y
  );
}

interface NamedHeadingGeometry {
  readonly name: string;
  readonly level: number;
  readonly geometry: HeadingGeometry;
}

/**
 * Every heading in `root`, in document order, with its measured row. Each
 * row is aligned, and no copy button overlaps the button of the heading
 * after it; a failure names the pair.
 */
async function expectCompactHeadingsApart(
  root: Locator,
): Promise<ReadonlyArray<NamedHeadingGeometry>> {
  const headings = root.getByRole('heading');
  const count = await headings.count();
  const measured: NamedHeadingGeometry[] = [];
  for (let index = 0; index < count; index++) {
    const heading = headings.nth(index);
    const [name, level] = await heading.evaluate(
      (element): [string, number] => [
        element.textContent?.trim() ?? '',
        Number(element.tagName.slice(1)),
      ],
    );
    const geometry = await measureHeading(heading);
    expectAlignedGeometry(geometry);
    measured.push({name, level, geometry});
  }
  for (let index = 1; index < measured.length; index++) {
    const before = measured[index - 1];
    const after = measured[index];
    expect(
      rectsIntersect(before.geometry.button, after.geometry.button),
      `h${before.level} "${before.name}" button overlaps h${after.level} "${after.name}" button`,
    ).toBe(false);
  }
  return measured;
}

test('heading copy buttons are honest, aligned, discoverable, and stable in every required state', async ({
  browser,
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: storybook.origin,
  });
  await openStory(page);

  const root = page.locator('#heading-links-ltr');
  const heading = root.getByRole('heading', {name: 'Linkable headings'});
  const row = heading.locator('..');
  // This DOM relationship remains stable while the localized accessible name
  // intentionally changes from the copy action to its success confirmation.
  const copyButton = copyButtonForHeading(heading);

  await expect(heading).toHaveAttribute(
    'id',
    'heading-links-ltr--linkable-headings',
  );
  await expect(copyButton).toHaveAccessibleName(
    'Copy link to Linkable headings',
  );
  await expect(copyButton).toHaveAttribute('type', 'button');
  await expect(copyButton).not.toHaveAttribute('href', /.+/u);
  expect(await copyButton.evaluate(element => element.tagName)).toBe('BUTTON');
  expect(await heading.locator('button').count()).toBe(0);
  expect(await root.locator('a[href^="#heading-links-ltr"]').count()).toBe(0);

  await blurActiveElement(page);
  await page.mouse.move(0, 0);
  await expect(copyButton).not.toBeFocused();
  expect(
    await row.evaluate(element => ({
      focusWithin: element.matches(':focus-within'),
      hover: element.matches(':hover'),
    })),
  ).toEqual({focusWithin: false, hover: false});
  await expect.poll(async () => copyButtonOpacity(page)).toBe(0);
  evidence.restOpacity = await copyButtonOpacity(page);
  await root.screenshot({path: path.join(OUTPUT, 'light-rest.png')});

  await heading.hover();
  await expect.poll(async () => copyButtonOpacity(page)).toBe(1);
  evidence.headingHoverOpacity = await copyButtonOpacity(page);
  await root.screenshot({path: path.join(OUTPUT, 'light-heading-hover.png')});

  const headingCases = [
    [1, 'Linkable headings'],
    [2, 'Read the guide'],
    [3, 'Third-level heading'],
    [4, 'Fourth-level heading'],
    [5, 'Fifth-level heading'],
    [6, 'Sixth-level heading'],
  ] as const;
  const headingGeometry: Record<
    string,
    {
      linked: HeadingGeometry;
      reference: Awaited<ReturnType<typeof measureReferenceHeading>>;
    }
  > = {};
  const referenceRoot = page.locator('#heading-links-reference');
  for (const [level, name] of headingCases) {
    const caseHeading = root.getByRole('heading', {level, name});
    const referenceHeading = referenceRoot
      .locator(`h${level}`)
      .filter({hasText: name})
      .first();
    await caseHeading.hover();
    const geometry = await measureHeading(caseHeading);
    const referenceGeometry = await measureReferenceHeading(referenceHeading);
    expectAlignedGeometry(geometry);
    expect(
      Math.abs(geometry.row.height - referenceGeometry.height),
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
    expect(
      Math.abs(geometry.slot.height - referenceGeometry.lineHeight),
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
    headingGeometry[`h${level}`] = {
      linked: geometry,
      reference: referenceGeometry,
    };
  }
  evidence.headingGeometry = headingGeometry;

  // The compact sample steps h1 through h6 and repeats h6: every heading's
  // row is aligned and no copy button overlaps the next heading's.
  const compactHeadings = await expectCompactHeadingsApart(
    page.locator('#heading-links-compact'),
  );
  expect(compactHeadings.map(heading => heading.level)).toEqual([
    1, 2, 3, 4, 5, 6, 6,
  ]);
  evidence.compactGeometry = {
    h1: compactHeadings[0].geometry,
    h6: compactHeadings[5].geometry,
    headings: compactHeadings,
  };

  const authoredHeading = root.getByRole('heading', {name: 'Read the guide'});
  const authoredLink = authoredHeading.getByRole('link', {name: 'guide'});
  const authoredCopyButton = copyButtonForHeading(authoredHeading);
  await expect(authoredCopyButton).toHaveAccessibleName(
    'Copy link to Read the guide',
  );
  await page.mouse.move(1200, 800);
  await authoredLink.focus();
  await expect(authoredLink).toBeFocused();
  await expect
    .poll(async () =>
      authoredCopyButton.evaluate(element =>
        Number(getComputedStyle(element).opacity),
      ),
    )
    .toBe(1);
  evidence.focusWithinOpacity = await authoredCopyButton.evaluate(element =>
    Number(getComputedStyle(element).opacity),
  );

  await page.mouse.move(1200, 800);
  await page.keyboard.press('Tab');
  await expect(authoredCopyButton).toBeFocused();
  await expect
    .poll(async () =>
      authoredCopyButton.evaluate(element =>
        Number(getComputedStyle(element).opacity),
      ),
    )
    .toBe(1);
  evidence.keyboardTabOpacity = await authoredCopyButton.evaluate(element =>
    Number(getComputedStyle(element).opacity),
  );

  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await expect.poll(async () => copyButtonOpacity(page)).toBe(1);
  evidence.keyboardFocusOpacity = await copyButtonOpacity(page);
  const focusedGeometry = await measureHeading(heading);
  expectAlignedGeometry(focusedGeometry);
  expect(
    focusedGeometry.button.x - focusedGeometry.outlineExtent,
  ).toBeGreaterThanOrEqual(focusedGeometry.heading.right);
  expect(
    await copyButton.evaluate(element => {
      let ancestor = element.parentElement;
      while (ancestor != null) {
        const style = getComputedStyle(ancestor);
        if (
          ['hidden', 'clip'].includes(style.overflowX) ||
          ['hidden', 'clip'].includes(style.overflowY)
        ) {
          return false;
        }
        ancestor = ancestor.parentElement;
      }
      return true;
    }),
  ).toBe(true);
  evidence.focusGeometry = focusedGeometry;
  await root.screenshot({path: path.join(OUTPUT, 'light-focus.png')});

  await blurActiveElement(page);
  await heading.hover();
  const restGeometry = await measureHeading(heading);
  const restGlyphWidth = restGeometry.glyph.width;
  const canonicalUrl = new URL(
    '#heading-links-ltr--linkable-headings',
    page.url(),
  ).href;
  const locationBeforeCopy = page.url();
  const scrollBeforeCopy = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await page.evaluate(() => {
    (
      window as typeof window & {__headingLinksNoReload?: string}
    ).__headingLinksNoReload = 'alive';
  });
  await copyButton.click();
  await expect(page).toHaveURL(locationBeforeCopy);
  expect(
    await page.evaluate(() => ({x: window.scrollX, y: window.scrollY})),
  ).toEqual(scrollBeforeCopy);
  await expect(copyButton).toHaveAccessibleName('Link copied');
  await expect(copyButton.locator('.astryx-icon')).toHaveCount(1);
  const pointerRing = await readFocusRing(copyButton);
  expect(pointerRing.focusVisible).toBe(false);
  expect(pointerRing.outlineWidth).toBe('0px');
  expect(pointerRing.outlineStyle).toBe('none');
  const copiedGeometry = await measureHeading(heading);
  expectAlignedGeometry(copiedGeometry);
  expectSameRect(restGeometry.row, copiedGeometry.row);
  expectSameRect(restGeometry.heading, copiedGeometry.heading);
  expectSameRect(restGeometry.slot, copiedGeometry.slot);
  expectSameRect(restGeometry.button, copiedGeometry.button);
  expectSameRect(restGeometry.glyph, copiedGeometry.glyph);
  evidence.glyphWidths = {
    rest: restGlyphWidth,
    copied: copiedGeometry.glyph.width,
  };
  evidence.stateGeometry = {rest: restGeometry, copied: copiedGeometry};
  evidence.pointerRing = pointerRing;
  evidence.desktopClipboard = await page.evaluate(async () =>
    navigator.clipboard.readText(),
  );
  expect(evidence.desktopClipboard).toBe(canonicalUrl);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & {__headingLinksNoReload?: string})
          .__headingLinksNoReload,
    ),
  ).toBe('alive');
  await root.screenshot({path: path.join(OUTPUT, 'light-pointer-copied.png')});
  await expect(copyButton).toHaveAccessibleName(
    'Copy link to Linkable headings',
    {timeout: 3000},
  );
  await expect(copyButton).toHaveText('#');
  expectSameRect(restGeometry.row, (await measureHeading(heading)).row);

  await blurActiveElement(page);
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await page.keyboard.press('Tab');
  await expect(copyButton).toBeFocused();
  await page.evaluate(() => {
    document.body.removeAttribute('tabindex');
  });
  expect(
    await copyButton.evaluate(element => element.matches(':focus-visible')),
  ).toBe(true);
  await page.keyboard.press('Enter');
  await expect(copyButton).toHaveAccessibleName('Link copied');
  const keyboardRing = await readFocusRing(copyButton);
  expect(keyboardRing.focusVisible).toBe(true);
  expect(keyboardRing.outlineWidth).toBe('2px');
  expect(keyboardRing.outlineStyle).toBe('solid');
  expect(keyboardRing.slotOutlineStyle).toBe('none');
  expect(keyboardRing.boxShadow).toBe('none');
  const keyboardCopiedGeometry = await measureHeading(heading);
  expectSameRect(restGeometry.row, keyboardCopiedGeometry.row);
  expectSameRect(restGeometry.heading, keyboardCopiedGeometry.heading);
  expectSameRect(restGeometry.slot, keyboardCopiedGeometry.slot);
  expectSameRect(restGeometry.button, keyboardCopiedGeometry.button);
  expectSameRect(restGeometry.glyph, keyboardCopiedGeometry.glyph);
  evidence.keyboardRing = keyboardRing;
  await root.screenshot({path: path.join(OUTPUT, 'light-keyboard-copied.png')});

  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  await expect(copyButton).toHaveAccessibleName('Link copied');
  expect(
    await copyButton.evaluate(element => element.matches(':focus-visible')),
  ).toBe(true);
  await expect(copyButton).toHaveAccessibleName(
    'Copy link to Linkable headings',
    {timeout: 2500},
  );
  await expect(copyButton).toHaveText('#');

  await page.evaluate(async () => navigator.clipboard.writeText('sentinel'));
  await copyButton.click({modifiers: ['Control']});
  expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(
    'sentinel',
  );
  await copyButton.dispatchEvent('contextmenu');
  expect(await page.evaluate(async () => navigator.clipboard.readText())).toBe(
    'sentinel',
  );
  await expect(page).toHaveURL(locationBeforeCopy);

  const narrowHeading = root.getByRole('heading', {
    name: 'A narrow heading whose trailing control stays with its final text line',
  });
  await root.evaluate(element => {
    element.style.inlineSize = '240px';
  });
  await narrowHeading.hover();
  const narrowGeometry = await measureHeading(narrowHeading);
  expectAlignedGeometry(narrowGeometry);
  expect(narrowGeometry.heading.height).toBeGreaterThan(
    narrowGeometry.lineHeight * 1.5,
  );
  expect(narrowGeometry.slot.x).toBeGreaterThanOrEqual(
    narrowGeometry.heading.right,
  );
  evidence.narrowGeometry = narrowGeometry;
  await root.screenshot({path: path.join(OUTPUT, 'narrow-wrap.png')});
  await root.evaluate(element => {
    element.style.removeProperty('inline-size');
  });

  for (const target of [root, referenceRoot]) {
    await target.evaluate(element => {
      element.style.setProperty(
        '--text-heading-1-size',
        'var(--text-body-size)',
      );
      element.style.setProperty(
        '--text-heading-1-leading',
        'var(--text-body-leading)',
      );
    });
  }
  const bodyScaleGeometry = await measureHeading(heading);
  const bodyScaleReference = await measureReferenceHeading(
    referenceRoot.locator('h1').first(),
  );
  expectAlignedGeometry(bodyScaleGeometry);
  expect(
    Math.abs(bodyScaleGeometry.row.height - bodyScaleReference.height),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(
    Math.abs(bodyScaleGeometry.slot.height - bodyScaleReference.lineHeight),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  evidence.bodyScaleGeometry = {
    linked: bodyScaleGeometry,
    reference: bodyScaleReference,
  };
  await root.screenshot({path: path.join(OUTPUT, 'body-scale-heading.png')});
  for (const target of [root, referenceRoot]) {
    await target.evaluate(element => {
      element.style.removeProperty('--text-heading-1-size');
      element.style.removeProperty('--text-heading-1-leading');
    });
  }

  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  const zoomGeometry = await measureHeading(heading);
  expectAlignedGeometry(zoomGeometry);
  evidence.zoom200Geometry = zoomGeometry;
  await root.screenshot({path: path.join(OUTPUT, 'zoom-200.png')});
  await page.evaluate(() => {
    document.body.style.removeProperty('zoom');
  });

  await page.emulateMedia({forcedColors: 'active'});
  await blurActiveElement(page);
  await page.mouse.move(1200, 800);
  await expect.poll(async () => copyButtonOpacity(page)).toBe(0);
  evidence.forcedColorsRestOpacity = await copyButtonOpacity(page);
  await copyButton.focus();
  await expect.poll(async () => copyButtonOpacity(page)).toBe(1);
  evidence.forcedColorsFocusOpacity = await copyButtonOpacity(page);
  await root.screenshot({path: path.join(OUTPUT, 'forced-colors-focus.png')});

  await page.emulateMedia({forcedColors: 'none', reducedMotion: 'reduce'});
  evidence.reducedMotionDuration = await copyButton.evaluate(
    element => getComputedStyle(element).transitionDuration,
  );
  expect(evidence.reducedMotionDuration).toBe('0s');

  await openStory(page, 'astryxTheme:neutral;colorMode:dark;direction:ltr');
  const darkRoot = page.locator('#heading-links-ltr');
  const darkHeading = darkRoot.getByRole('heading', {
    name: 'Linkable headings',
  });
  const darkCopyButton = copyButtonForHeading(darkHeading);
  await darkHeading.hover();
  await expect.poll(async () => copyButtonOpacity(page)).toBe(1);
  evidence.darkColor = await darkCopyButton.evaluate(
    element => getComputedStyle(element).color,
  );
  await darkRoot.screenshot({path: path.join(OUTPUT, 'dark-hover.png')});

  const rtlHeading = page.getByRole('heading', {
    name: 'عنوان قابل للربط',
  });
  const rtlCopyButton = copyButtonForHeading(rtlHeading);
  await expect(rtlCopyButton).toHaveAccessibleName(
    'Copy link to عنوان قابل للربط',
  );
  await rtlHeading.hover();
  const [rtlHeadingBox, rtlButtonBox] = await Promise.all([
    rtlHeading.boundingBox(),
    rtlCopyButton.boundingBox(),
  ]);
  if (rtlHeadingBox == null || rtlButtonBox == null) {
    throw new Error('RTL heading and copy button must have layout boxes');
  }
  expect(rtlButtonBox.x).toBeLessThan(rtlHeadingBox.x);
  const rtlGeometry = await measureHeading(rtlHeading);
  expectAlignedGeometry(rtlGeometry);
  expect(
    rtlGeometry.button.right + rtlGeometry.outlineExtent,
  ).toBeLessThanOrEqual(rtlGeometry.heading.x);
  evidence.rtl = {
    heading: rtlHeadingBox,
    button: rtlButtonBox,
    geometry: rtlGeometry,
  };

  const singleProcessProof = process.env.ASTRYX_SINGLE_PROCESS_CHROMIUM === '1';
  const touchContext = singleProcessProof
    ? page.context()
    : await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: {width: 390, height: 844},
      });
  let touchCdp: Awaited<ReturnType<typeof touchContext.newCDPSession>> | null =
    null;
  if (singleProcessProof) {
    touchCdp = await touchContext.newCDPSession(page);
    await touchCdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });
    await page.setViewportSize({width: 390, height: 844});
  } else {
    await touchContext.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: storybook.origin,
    });
  }
  const touchPage = singleProcessProof ? page : await touchContext.newPage();
  await openStory(touchPage);
  const touchRoot = touchPage.locator('#heading-links-ltr');
  const touchHeading = touchRoot.getByRole('heading', {
    name: 'Linkable headings',
  });
  const touchCopyButton = copyButtonForHeading(touchHeading);
  await expect(touchCopyButton).toHaveAccessibleName(
    'Copy link to Linkable headings',
  );
  evidence.touchOpacity = await copyButtonOpacity(touchPage);
  expect(evidence.touchOpacity).toBe(1);
  await expect(touchCopyButton).toHaveText('#');
  const touchTarget = await touchCopyButton.boundingBox();
  if (touchTarget == null) {
    throw new Error('Touch copy button must have a layout box');
  }
  expect(touchTarget.width).toBeGreaterThanOrEqual(24);
  expect(touchTarget.height).toBeGreaterThanOrEqual(24);
  evidence.touchTarget = touchTarget;
  const touchGeometry = await measureHeading(touchHeading);
  expect(
    Math.abs(touchGeometry.headingBaseline - touchGeometry.slotBaseline),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(touchGeometry.button.x).toBeGreaterThanOrEqual(
    touchGeometry.heading.right,
  );
  expect(
    Math.abs(touchGeometry.row.height - touchGeometry.heading.height),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  expect(
    Math.abs(touchGeometry.row.height - touchGeometry.lineHeight),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
  evidence.touchGeometry = touchGeometry;

  // At touch size the 24px targets are taller than compact headings' lines:
  // still no copy button overlaps the next heading's.
  const touchCompactHeadings = await expectCompactHeadingsApart(
    touchPage.locator('#heading-links-compact'),
  );
  evidence.touchCompactGeometry = {
    h1: touchCompactHeadings[0].geometry,
    h6: touchCompactHeadings[5].geometry,
    h6Sibling: touchCompactHeadings[6].geometry,
    headings: touchCompactHeadings,
  };
  await touchRoot.screenshot({path: path.join(OUTPUT, 'touch-rest.png')});

  const touchCanonicalUrl = new URL(
    '#heading-links-ltr--linkable-headings',
    touchPage.url(),
  ).href;
  const touchLocationBeforeCopy = touchPage.url();
  const touchScrollBeforeCopy = await touchPage.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await touchPage.evaluate(() => {
    (
      window as typeof window & {__headingLinksNoReload?: string}
    ).__headingLinksNoReload = 'alive';
  });
  if (singleProcessProof) {
    await touchCopyButton.click();
  } else {
    await touchCopyButton.tap();
  }
  await expect(touchPage).toHaveURL(touchLocationBeforeCopy);
  expect(
    await touchPage.evaluate(() => ({x: window.scrollX, y: window.scrollY})),
  ).toEqual(touchScrollBeforeCopy);
  await expect(touchCopyButton).toHaveAccessibleName('Link copied');
  const touchRing = await readFocusRing(touchCopyButton);
  expect(touchRing.focusVisible).toBe(false);
  expect(touchRing.outlineWidth).toBe('0px');
  expect(touchRing.outlineStyle).toBe('none');
  evidence.touchRing = touchRing;
  evidence.touchClipboard = await touchPage.evaluate(async () =>
    navigator.clipboard.readText(),
  );
  expect(evidence.touchClipboard).toBe(touchCanonicalUrl);
  expect(
    await touchPage.evaluate(
      () =>
        (window as typeof window & {__headingLinksNoReload?: string})
          .__headingLinksNoReload,
    ),
  ).toBe('alive');
  await touchRoot.screenshot({path: path.join(OUTPUT, 'touch-copied.png')});
  if (singleProcessProof) {
    await touchCdp?.send('Emulation.setTouchEmulationEnabled', {
      enabled: false,
    });
    await page.setViewportSize({width: 1280, height: 900});
  } else {
    await touchContext.close();
  }

  const failureContext = singleProcessProof
    ? page.context()
    : await browser.newContext({
        viewport: {width: 1280, height: 900},
      });
  await failureContext.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      get: () => ({
        writeText: async () =>
          Promise.reject(new Error('clipboard denied for proof')),
      }),
    });
  });
  const failurePage = singleProcessProof
    ? page
    : await failureContext.newPage();
  await openStory(failurePage);
  const failureHeading = failurePage
    .locator('#heading-links-ltr')
    .getByRole('heading', {name: 'Linkable headings'});
  const failureButton = copyButtonForHeading(failureHeading);
  const failureLocation = failurePage.url();
  const failureGeometryBefore = await measureHeading(failureHeading);
  await failureButton.click();
  await expect(failureButton).toHaveAccessibleName(
    'Copy link to Linkable headings',
  );
  await expect(failureButton).toHaveText('#');
  await expect(failurePage).toHaveURL(failureLocation);
  const failureGeometryAfter = await measureHeading(failureHeading);
  expectSameRect(failureGeometryBefore.row, failureGeometryAfter.row);
  expectSameRect(failureGeometryBefore.heading, failureGeometryAfter.heading);
  expectSameRect(failureGeometryBefore.slot, failureGeometryAfter.slot);
  expectSameRect(failureGeometryBefore.button, failureGeometryAfter.button);
  evidence.failureGeometry = {
    before: failureGeometryBefore,
    after: failureGeometryAfter,
  };
  if (!singleProcessProof) {
    await failureContext.close();
  }
});
