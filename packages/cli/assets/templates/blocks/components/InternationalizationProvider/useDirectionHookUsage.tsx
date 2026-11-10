// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef, useState} from 'react';
import {InternationalizationProvider, useDirection} from '@astryxdesign/core';
import {VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';

const DATA_POINTS = [10, 25, 18, 40, 32, 60, 48, 75];

function Sparkline() {
  const direction = useDirection();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const step = width / (DATA_POINTS.length - 1);
    const maxVal = Math.max(...DATA_POINTS);
    const minVal = Math.min(...DATA_POINTS);
    const range = maxVal - minVal || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#0064e0';
    ctx.lineWidth = 2;

    DATA_POINTS.forEach((val, i) => {
      // In LTR: oldest data starts at 0 (left), newest at right.
      // In RTL: oldest data starts at right (width), newest at left.
      const x = direction === 'rtl' ? width - i * step : i * step;
      const y = height - ((val - minVal) / range) * (height - 10) - 5;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw point at latest value
    const lastIndex = DATA_POINTS.length - 1;
    const lastX = direction === 'rtl' ? 0 : width;
    const lastY =
      height - ((DATA_POINTS[lastIndex] - minVal) / range) * (height - 10) - 5;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0064e0';
    ctx.fill();
  }, [direction]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={60}
      data-testid="sparkline-canvas"
      data-direction={direction}
      style={{border: '1px solid #e1e4e8', borderRadius: 4}}
    />
  );
}

export default function UseDirectionHookUsage() {
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const isRtl = lang === 'ar';

  return (
    <InternationalizationProvider locale={lang} dir={isRtl ? 'rtl' : 'ltr'}>
      <VStack
        gap={4}
        hAlign="center"
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{width: '100%'}}>
        <SegmentedControl
          label="Locale"
          value={lang}
          onChange={next => setLang(next as 'en' | 'ar')}
          size="sm">
          <SegmentedControlItem value="en" label="English (LTR)" />
          <SegmentedControlItem value="ar" label="العربية (RTL)" />
        </SegmentedControl>
        <Sparkline />
      </VStack>
    </InternationalizationProvider>
  );
}
