// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, waitFor} from 'storybook/test';
import {Button, Card, Stack, Text} from '@astryxdesign/core';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {Heading} from '@astryxdesign/core/Text';
import {useCssLengthInPixels} from './chartThemingUtils';

const meta: Meta = {
  title: 'Lab/ChartTheming/Canvas',
  parameters: {
    docs: {
      description: {
        component:
          'Guide evidence for Canvas: `useTheme().token()` provides concrete theme values, and the same canvas redraws when mode changes.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const styles = stylex.create({
  canvas: {
    display: 'block',
    height: 'auto',
    maxWidth: '100%',
    width: 480,
  },
});

const canvasTheme = defineTheme({
  name: 'chart-theming-canvas',
  tokens: {
    '--color-data-categorical-blue': ['#005A4E', '#72E1C1'],
  },
});

let nextCanvasInstance = 1;

function NativeCanvasChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instance = useRef(nextCanvasInstance++);
  const drawCount = useRef(0);
  const {token} = useTheme();
  const color = token('--color-data-categorical-blue');
  const fontFamily = token('--font-family-body');
  const fontSize = token('--text-supporting-size');
  const radius = useCssLengthInPixels(token('--radius-element'));

  // Synchronize the canvas 2D bitmap with the resolved theme values.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(64, 64, 96, 112, [radius, radius, 0, 0]);
    context.roundRect(240, 24, 96, 152, [radius, radius, 0, 0]);
    context.fill();
    context.fillStyle = token('--color-text-secondary');
    context.font = `${fontSize} ${fontFamily}`;
    context.fillText('Q1', 96, 204);
    context.fillText('Q2', 272, 204);

    drawCount.current += 1;
    canvas.dataset.drawCount = String(drawCount.current);
  }, [color, fontFamily, fontSize, radius, token]);

  return (
    <>
      <canvas
        {...stylex.props(styles.canvas)}
        aria-label="Q1 is 112 units. Q2 is 152 units."
        data-color={color}
        data-font-family={fontFamily}
        data-instance={instance.current}
        data-radius={radius}
        height={240}
        ref={canvasRef}
        role="img"
        width={480}
      />
      <Text>Q1: 112 units · Q2: 152 units</Text>
    </>
  );
}

function RuntimeCanvasThemeSwitch() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  return (
    <Theme theme={canvasTheme} mode={mode}>
      <Card>
        <Stack direction="vertical" gap={4}>
          <Stack direction="vertical" gap={1}>
            <Heading level={3}>Quarterly comparison</Heading>
            <Text type="supporting" color="secondary">
              Canvas uses a concrete color and redraws without replacing its
              drawing surface.
            </Text>
          </Stack>
          <Button
            label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
            onClick={() =>
              setMode(current => (current === 'light' ? 'dark' : 'light'))
            }
          />
          <NativeCanvasChart />
        </Stack>
      </Card>
    </Theme>
  );
}

function sampledBarPixel(canvas: HTMLCanvasElement): number[] {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  return Array.from(context.getImageData(80, 80, 1, 1).data);
}

export const RuntimeThemeSwitch: Story = {
  render: () => <RuntimeCanvasThemeSwitch />,
  play: async ({canvasElement}) => {
    const canvas = canvasElement.querySelector('canvas');
    expect(canvas).not.toBeNull();
    if (!canvas) {
      return;
    }

    const instance = canvas.dataset.instance;
    expect(canvasElement).toHaveTextContent('Q1: 112 units · Q2: 152 units');
    let initialDrawCount = 0;
    await waitFor(() => {
      expect(canvas.dataset.color).toBe('#005A4E');
      expect(canvas.dataset.fontFamily).not.toBe('');
      expect(Number(canvas.dataset.radius)).toBeGreaterThan(5);
      initialDrawCount = Number(canvas.dataset.drawCount);
      expect(initialDrawCount).toBeGreaterThan(0);
      expect(sampledBarPixel(canvas)).toEqual([0, 90, 78, 255]);
    });

    const button = canvasElement.querySelector('button');
    expect(button).toHaveTextContent('Switch to dark mode');
    button?.click();

    await waitFor(() => {
      expect(canvasElement.querySelector('canvas')).toBe(canvas);
      expect(canvas.dataset.instance).toBe(instance);
      expect(canvas.dataset.color).toBe('#72E1C1');
      expect(Number(canvas.dataset.drawCount)).toBeGreaterThan(
        initialDrawCount,
      );
      expect(sampledBarPixel(canvas)).toEqual([114, 225, 193, 255]);
    });
  },
};
