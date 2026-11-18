// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared sample datasets for the Charts stories. Not a story file (no `.stories`
 * suffix) so Storybook won't pick it up as a story.
 *
 * The scenario datasets model common product, operations and business charts.
 * They are synthetic. Their values are literal or come from a seeded generator,
 * so every load renders the same chart.
 */

/**
 * Seeded pseudo-random generator (mulberry32) with values in [0, 1). Stories use
 * it instead of `Math.random`, so every load renders the same data and two
 * captures of one story can be compared.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a function that gives the next sample of a noisy sine wave at
 * x = 0, 1, 2, … Each call to this factory starts the same sequence again.
 */
export function createStreamSamples(seed = 4): () => {x: number; y: number} {
  const random = seededRandom(seed);
  let x = 0;
  return () => {
    const sample = {x, y: 50 + Math.sin(x / 10) * 30 + random() * 10};
    x++;
    return sample;
  };
}

export const monthlyData = [
  {month: 'Jan', revenue: 45, costs: 30, trend: 38},
  {month: 'Feb', revenue: 52, costs: 35, trend: 42},
  {month: 'Mar', revenue: 48, costs: 32, trend: 40},
  {month: 'Apr', revenue: 61, costs: 38, trend: 48},
  {month: 'May', revenue: 55, costs: 34, trend: 45},
  {month: 'Jun', revenue: 70, costs: 40, trend: 52},
];

export const profitLossData = [
  {month: 'Jan', profit: 20, trend: 15},
  {month: 'Feb', profit: -10, trend: 5},
  {month: 'Mar', profit: 35, trend: 20},
  {month: 'Apr', profit: -25, trend: -5},
  {month: 'May', profit: 15, trend: 10},
  {month: 'Jun', profit: -5, trend: 8},
];

export const salesData = [
  {month: 'Jan', sales: 45, target: 50, errorHigh: 48, errorLow: 42},
  {month: 'Feb', sales: 52, target: 50, errorHigh: 56, errorLow: 48},
  {month: 'Mar', sales: 48, target: 50, errorHigh: 52, errorLow: 44},
  {month: 'Apr', sales: 61, target: 50, errorHigh: 66, errorLow: 56},
  {month: 'May', sales: 55, target: 50, errorHigh: 59, errorLow: 51},
  {month: 'Jun', sales: 70, target: 50, errorHigh: 76, errorLow: 64},
];

const scatterRandom = seededRandom(2);
export const scatterData = Array.from({length: 200}, () => ({
  x: scatterRandom() * 100,
  y: scatterRandom() * 100,
}));

const heatmapRandom = seededRandom(3);
export const heatmapData: Record<string, unknown>[] = [];
const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
for (const day of HEATMAP_DAYS) {
  for (let hour = 0; hour < 24; hour++) {
    heatmapData.push({
      hour: `${hour}`,
      day,
      traffic: Math.round(
        50 +
          Math.sin(hour / 4) * 30 +
          (day === 'Sat' || day === 'Sun' ? -20 : 10) +
          heatmapRandom() * 20,
      ),
    });
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** One value per month, January to December. */
function byMonth<T extends Record<string, number>>(
  values: Record<keyof T, readonly number[]>,
): Array<{month: string} & T> {
  return MONTHS.map((month, index) => {
    const row: Record<string, string | number> = {month};
    for (const key of Object.keys(values)) {
      row[key] = values[key as keyof T][index];
    }
    return row as {month: string} & T;
  });
}

/**
 * Mean of the last `window` values, rounded to `decimals` places. The value is
 * null until `window` values exist, so a partial window never passes as a full
 * one.
 */
function trailingAverage(
  values: readonly number[],
  window: number,
  decimals = 0,
): Array<number | null> {
  const factor = 10 ** decimals;
  return values.map((_, index) => {
    if (index < window - 1) {
      return null;
    }
    const slice = values.slice(index - window + 1, index + 1);
    const mean = slice.reduce((sum, v) => sum + v, 0) / window;
    return Math.round(mean * factor) / factor;
  });
}

/** Monthly revenue in US dollars. December is the peak month. */
export const monthlyRevenueData = byMonth<{revenue: number}>({
  revenue: [
    84200, 79600, 91300, 95800, 102400, 98100, 106700, 111200, 104900, 118500,
    131600, 152300,
  ],
});

/** Unique website visitors per day over two weeks. Weekends are quieter. */
export const dailyVisitorsData = [
  {day: 'Jun 2', visitors: 12480},
  {day: 'Jun 3', visitors: 13120},
  {day: 'Jun 4', visitors: 13560},
  {day: 'Jun 5', visitors: 12940},
  {day: 'Jun 6', visitors: 11870},
  {day: 'Jun 7', visitors: 8210},
  {day: 'Jun 8', visitors: 7960},
  {day: 'Jun 9', visitors: 12910},
  {day: 'Jun 10', visitors: 13740},
  {day: 'Jun 11', visitors: 14020},
  {day: 'Jun 12', visitors: 13380},
  {day: 'Jun 13', visitors: 12150},
  {day: 'Jun 14', visitors: 8640},
  {day: 'Jun 15', visitors: 8330},
];

const TRACKING_OUTAGE_DAYS = new Set(['Jun 10', 'Jun 11']);

/**
 * The same daily visitors, with no data for two days of a tracking outage.
 * Missing days are null, not zero.
 */
export const dailyVisitorsWithGapData = dailyVisitorsData.map(
  ({day, visitors}) => ({
    day,
    visitors: TRACKING_OUTAGE_DAYS.has(day) ? null : visitors,
  }),
);

/** Page load time percentiles in milliseconds, by hour of day. */
export const pageLoadTimeData = [
  {hour: '00:00', median: 820, p75: 1180, p95: 2100},
  {hour: '02:00', median: 790, p75: 1130, p95: 1980},
  {hour: '04:00', median: 770, p75: 1100, p95: 1940},
  {hour: '06:00', median: 800, p75: 1150, p95: 2050},
  {hour: '08:00', median: 910, p75: 1320, p95: 2380},
  {hour: '10:00', median: 1040, p75: 1510, p95: 2760},
  {hour: '12:00', median: 1120, p75: 1640, p95: 3020},
  {hour: '14:00', median: 1090, p75: 1590, p95: 2910},
  {hour: '16:00', median: 1060, p75: 1540, p95: 2830},
  {hour: '18:00', median: 1010, p75: 1460, p95: 2650},
  {hour: '20:00', median: 960, p75: 1380, p95: 2470},
  {hour: '22:00', median: 880, p75: 1260, p95: 2240},
];

/**
 * Newsletter subscribers at the end of each month. A March campaign adds
 * subscribers, and a May list cleanup removes inactive ones.
 */
export const subscriberGrowthData = byMonth<{subscribers: number}>({
  subscribers: [
    12400, 13100, 17900, 18600, 17200, 16800, 18900, 18100, 22400, 24800, 23600,
    28900,
  ],
});

/**
 * Website visits per month, split by device type. Desktop visits drop in the
 * summer and in December. Mobile visits peak in November and December.
 */
export const visitsByDeviceData = byMonth<{mobile: number; desktop: number}>({
  mobile: [
    241000, 218000, 263000, 251000, 289000, 312000, 276000, 258000, 297000,
    284000, 341000, 365000,
  ],
  desktop: [
    182000, 191000, 204000, 187000, 176000, 149000, 138000, 146000, 198000,
    211000, 226000, 189000,
  ],
});

/** Store orders per month, split by sales channel. */
export const ordersByChannelData = byMonth<{online: number; inStore: number}>({
  online: [
    1840, 1720, 1960, 2050, 2190, 2140, 2280, 2360, 2230, 2490, 2870, 3420,
  ],
  inStore: [
    1210, 1150, 1290, 1340, 1380, 1360, 1420, 1450, 1390, 1480, 1690, 2040,
  ],
});

/**
 * Q3 budget and actual spend by department, in US dollars, sorted by budget.
 * Engineering and Sales spent more than their budget.
 */
export const departmentSpendData = [
  {department: 'Engineering', budget: 420000, actual: 436000},
  {department: 'Sales', budget: 240000, actual: 252000},
  {department: 'Marketing', budget: 180000, actual: 171000},
  {department: 'Operations', budget: 130000, actual: 124000},
  {department: 'Support', budget: 95000, actual: 91000},
];

/** New and returning customers per quarter, for two consecutive years. */
export const customersByQuarterData = [
  {
    quarter: 'Q1',
    newLastYear: 1820,
    returningLastYear: 3140,
    newThisYear: 2160,
    returningThisYear: 3580,
  },
  {
    quarter: 'Q2',
    newLastYear: 1960,
    returningLastYear: 3310,
    newThisYear: 2340,
    returningThisYear: 3790,
  },
  {
    quarter: 'Q3',
    newLastYear: 1740,
    returningLastYear: 3420,
    newThisYear: 2080,
    returningThisYear: 3960,
  },
  {
    quarter: 'Q4',
    newLastYear: 2480,
    returningLastYear: 3870,
    newThisYear: 2910,
    returningThisYear: 4420,
  },
];

/**
 * Net cash flow per month in US dollars. A negative month spent more than it
 * earned.
 */
export const netCashFlowData = byMonth<{netCashFlow: number}>({
  netCashFlow: [
    18400, -6200, 24100, -12800, 9700, -3400, 15200, 21600, -8900, 12300, 27500,
    34100,
  ],
});

/** Percent of API requests that failed, by hour. Two hours exceed 1%. */
export const apiErrorRateData = [
  0.31, 0.28, 0.25, 0.24, 0.26, 0.3, 0.38, 0.52, 0.71, 1.42, 0.86, 0.64, 0.58,
  0.61, 0.77, 1.18, 0.83, 0.62, 0.55, 0.49, 0.44, 0.4, 0.36, 0.33,
].map((errorRate, hour) => ({
  hour: `${String(hour).padStart(2, '0')}:00`,
  errorRate,
}));

/**
 * Server CPU utilization in percent, by hour. It is below 40% at night and
 * above 70% at midday and in the early evening.
 */
export const cpuUtilizationData = [
  34, 31, 29, 28, 30, 36, 45, 58, 66, 72, 78, 81, 76, 69, 64, 62, 67, 74, 71,
  60, 52, 46, 41, 37,
].map((cpu, hour) => ({hour: `${String(hour).padStart(2, '0')}:00`, cpu}));

/**
 * 95th-percentile response time in milliseconds at each load level, in
 * concurrent users. Latency rises steeply above 800 users.
 */
export const latencyByConcurrencyData = [
  120, 124, 129, 135, 142, 151, 163, 180, 214, 290, 410, 580,
].map((p95LatencyMs, index) => ({users: (index + 1) * 100, p95LatencyMs}));

const WEEKLY_SIGNUPS = [1180, 1240, 1210, 1320, 1390, 1360, 1450, 1510];
const LAST_ACTUAL_WEEK = WEEKLY_SIGNUPS.length;

/**
 * Signups per week: 8 weeks of actuals, then a 12-week forecast with 80% and
 * 95% intervals. The forecast starts at the last actual value, and the
 * intervals widen each week. The 95% interval always contains the 80% one.
 */
export const signupForecastData = Array.from({length: 20}, (_, index) => {
  const week = index + 1;
  const actual = week <= LAST_ACTUAL_WEEK ? WEEKLY_SIGNUPS[index] : null;
  if (week < LAST_ACTUAL_WEEK) {
    return {
      week: `Week ${week}`,
      actual,
      forecast: null,
      lower95: null,
      lower80: null,
      upper80: null,
      upper95: null,
    };
  }
  const weeksAhead = week - LAST_ACTUAL_WEEK;
  const forecast = WEEKLY_SIGNUPS[LAST_ACTUAL_WEEK - 1] + weeksAhead * 42;
  const halfWidth80 = weeksAhead * 22;
  const halfWidth95 = Math.round(halfWidth80 * 1.53);
  return {
    week: `Week ${week}`,
    actual,
    forecast,
    lower95: forecast - halfWidth95,
    lower80: forecast - halfWidth80,
    upper80: forecast + halfWidth80,
    upper95: forecast + halfWidth95,
  };
});

/**
 * Checkout conversion rate in percent for an A/B test, with 95% confidence
 * intervals. Only Variant C's interval does not overlap Control's.
 */
export const conversionTestData = [
  {variant: 'Control', conversionRate: 4.2, ciLow: 3.9, ciHigh: 4.5},
  {variant: 'Variant A', conversionRate: 4.5, ciLow: 4.2, ciHigh: 4.8},
  {variant: 'Variant B', conversionRate: 4.1, ciLow: 3.8, ciHigh: 4.4},
  {variant: 'Variant C', conversionRate: 4.9, ciLow: 4.6, ciHigh: 5.2},
];

const pageRandom = seededRandom(5);
const SLOW_PAGE_INDEXES = new Set([11, 37, 52]);

/**
 * Page weight in kilobytes and load time in milliseconds for 60 pages of one
 * site. Heavier pages load more slowly. Three pages are much slower than their
 * weight predicts.
 */
export const pageWeightLoadTimeData = Array.from({length: 60}, (_, index) => {
  const pageWeightKb = Math.round((400 + pageRandom() * 2800) / 10) * 10;
  const spread = (pageRandom() - 0.5) * 700;
  const slowdown = SLOW_PAGE_INDEXES.has(index) ? 2600 : 0;
  const loadTimeMs = 600 + pageWeightKb * 0.9 + spread + slowdown;
  return {pageWeightKb, loadTimeMs: Math.round(loadTimeMs / 10) * 10};
});

const TICKET_PRIORITIES = [
  {priority: 'Urgent', minHours: 1, maxHours: 8},
  {priority: 'High', minHours: 3, maxHours: 20},
  {priority: 'Normal', minHours: 8, maxHours: 40},
  {priority: 'Low', minHours: 16, maxHours: 72},
];
const ticketRandom = seededRandom(6);

/**
 * Hours to resolve 12 support tickets at each priority. Whole hours make
 * several tickets in one priority share a value.
 */
export const ticketResolutionData = TICKET_PRIORITIES.flatMap(
  ({priority, minHours, maxHours}) =>
    Array.from({length: 12}, () => ({
      priority,
      hours: Math.round(minHours + ticketRandom() * (maxHours - minHours)),
    })),
);

/** Labels for 30 trading days from Mar 3, a Monday. Weekends are skipped. */
const TRADING_DAYS = Array.from({length: 30}, (_, index) => {
  const dayOfMarch = 3 + Math.floor(index / 5) * 7 + (index % 5);
  return dayOfMarch <= 31 ? `Mar ${dayOfMarch}` : `Apr ${dayOfMarch - 31}`;
});
const GAP_UP_DAY_INDEX = 17;

function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dailyPrices(): Array<{
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
}> {
  const random = seededRandom(1);
  const rows = [];
  let previousClose = 47.2;
  for (const [index, day] of TRADING_DAYS.entries()) {
    const gap = index === GAP_UP_DAY_INDEX ? 0.045 : (random() - 0.5) * 0.006;
    const open = toCents(previousClose * (1 + gap));
    const close = toCents(open * (1 + (random() - 0.47) * 0.03));
    const high = toCents(
      Math.max(open, close) * (1 + 0.002 + random() * 0.006),
    );
    const low = toCents(Math.min(open, close) * (1 - 0.002 - random() * 0.006));
    rows.push({day, open, high, low, close});
    previousClose = close;
  }
  return rows;
}

const DAILY_PRICES = dailyPrices();
const MOVING_AVERAGE_5_DAY = trailingAverage(
  DAILY_PRICES.map(row => row.close),
  5,
  2,
);

/**
 * Daily share prices in US dollars for a fictional company, over 30 trading
 * days. Day 18 opens with a gap up. `movingAverage5` is the mean close of the
 * last 5 trading days, and is null for the first 4 days.
 */
export const dailySharePriceData = DAILY_PRICES.map((row, index) => ({
  ...row,
  movingAverage5: MOVING_AVERAGE_5_DAY[index],
}));
