// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {useDirection} from '@astryxdesign/core/i18n';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {VStack} from '@astryxdesign/core/Layout';

const SERIES = [4, 9, 6, 12, 8, 14, 11];
// Oldest first: SERIES[0] is the oldest sample, the last entry is newest.

// Canvas drawing cannot use CSS logical properties, so the sparkline reads
// the direction during render and runs its time axis from the start edge:
// newest point on the right in LTR, on the left in RTL.
function DirectionalSparkline({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const direction = useDirection();
  const rtl = direction === 'rtl';
  const step = width / (SERIES.length - 1);
  // Oldest at the start edge: index 0 sits at the start (left in LTR,
  // right in RTL), so the newest point is always on the start edge.
  const x = (index: number) => (rtl ? width - index * step : index * step);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Requests sparkline, ${direction.toUpperCase()}, newest on the ${rtl ? 'left' : 'right'}`}>
      {SERIES.map((value, index) => {
        const cx = x(index);
        const cy = height - 4 - (value / 15) * (height - 8);
        return index === 0 ? null : (
          <line
            key={index}
            x1={x(index - 1)}
            y1={height - 4 - (SERIES[index - 1] / 15) * (height - 8)}
            x2={cx}
            y2={cy}
            stroke="var(--color-accent)"
            strokeWidth={2}
          />
        );
      })}
      <circle
        cx={x(SERIES.length - 1)}
        cy={height - 4 - (SERIES[SERIES.length - 1] / 15) * (height - 8)}
        r={4}
        fill="var(--color-accent)"
      />
    </svg>
  );
}

export default function UseDirectionHookUsage() {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  return (
    <InternationalizationProvider locale={locale}>
      <VStack gap={4} hAlign="center" style={{width: '100%'}}>
        <SegmentedControl
          label="Locale"
          value={locale}
          onChange={value => setLocale(value as 'en' | 'ar')}>
          <SegmentedControlItem value="en" label="English" />
          <SegmentedControlItem value="ar" label="العربية" />
        </SegmentedControl>
        <DirectionalSparkline width={280} height={96} />
      </VStack>
    </InternationalizationProvider>
  );
}
