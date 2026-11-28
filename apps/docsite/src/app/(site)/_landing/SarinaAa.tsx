// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SarinaAa.tsx
 * @input A StyleX style for the drawing's font size and color
 * @output The letters "Aa" of Sarina, the display font of the Butter theme,
 *   as a drawing with the box of that text
 * @position The swatch rail of the themes card (ThemesPreview.tsx), on the
 *   home page and on the community page. The card shows the two letters,
 *   and a drawing of them needs no font file.
 */

import * as stylex from '@stylexjs/stylex';

const UNITS_PER_EM = 2048;

// The box of the text "Aa" at a line height of 1 is two ems wide and one em
// high. At a font size of 24px, a browser puts the baseline of that text
// 19px below the top of the box.
const WIDTH = 2 * UNITS_PER_EM;
const BASELINE = (19 / 24) * UNITS_PER_EM;

// The outlines of the glyphs "A" and "a" of
// packages/themes/butter/fonts/sarina-latin-400-normal.woff2, in font
// units from the start of the text on its baseline, with y down. The "a"
// starts 30 of 24 parts of an em after the "A", as in the text at 24px.
const LETTERS =
  'M257 67Q205 67 158.5 42.5Q112 18 74 -27Q-11 -130 -11 -274Q-11 -333 35.5 -392.5Q82 -452 188 -500Q426 -607 883 -607Q883 -607 1720 -1256Q1762 -1289 1770 -1296Q1783 -1310 1803.5 -1310Q1824 -1310 1843.5 -1306Q1863 -1302 1879 -1295Q1914 -1280 1914 -1260Q1914 -1246 1907 -1238L1335 -610L1579 -610Q1595 -646 1632 -710L1724 -860Q1778 -946 1830 -1022L1931 -1162Q2086 -1369 2155 -1369Q2162 -1369 2209.5 -1350.5Q2257 -1332 2290 -1314Q2370 -1272 2370 -1235Q2370 -1200 2339 -1161.5Q2308 -1123 2273.5 -1071Q2239 -1019 2199.5 -953.5Q2160 -888 2120 -814.5Q2080 -741 2048 -672Q1975 -515 1975 -459.5Q1975 -404 1983.5 -379Q1992 -354 2004 -342Q2023 -323 2065 -323Q2107 -323 2150.5 -338.5Q2194 -354 2235.5 -377.5Q2277 -401 2317 -428.5Q2357 -456 2395 -480Q2483 -534 2525 -534Q2567 -534 2581.5 -514.5Q2596 -495 2596 -464Q2596 -433 2570 -380.5Q2544 -328 2497 -272Q2450 -216 2386 -161.5Q2322 -107 2246 -64Q2075 31 1911 31Q1763 31 1650 -73Q1524 -188 1524 -370Q1524 -379 1524 -388Q1524 -397 1525 -407L1106 -354Q929 -180 678 -56Q426 67 257 67ZM4297 -751Q4329 -751 4329 -697Q4329 -604 4199 -456L4142 -398Q3883 -139 3654 -53Q3512 0 3450 -58Q3399 -107 3369 -216L3345 -303L3132 -172L3009 -102Q2789 18 2679 18Q2538 18 2444 -91Q2354 -194 2354 -330Q2354 -464 2461 -569Q2614 -719 2944 -844Q3256 -961 3448 -961Q3513 -961 3513 -897Q3513 -853 3496 -831Q3479 -809 3426 -786L3300 -732Q3020 -615 2890 -489Q2853 -454 2853 -421Q2853 -388 2906 -388Q2958 -388 3148 -500L3231 -549Q3424 -665 3554 -665Q3664 -665 3700 -568Q3709 -542 3717 -515.5Q3725 -489 3733 -468Q3751 -419 3765.5 -419Q3780 -419 3807 -433.5Q3834 -448 3866.5 -470.5Q3899 -493 3934 -520L4055 -617Q4216 -751 4297 -751Z';

const styles = stylex.create({
  // The letters extend past the box, as the text does.
  drawing: {
    display: 'block',
    width: '2em',
    height: '1em',
    overflow: 'visible',
    fill: 'currentColor',
  },
});

export function SarinaAa({xstyle}: {xstyle?: stylex.StyleXStyles}) {
  return (
    <svg
      {...stylex.props(styles.drawing, xstyle)}
      viewBox={`0 ${-BASELINE} ${WIDTH} ${UNITS_PER_EM}`}
      aria-hidden="true">
      <path d={LETTERS} />
    </svg>
  );
}
