// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, fireEvent, userEvent, waitFor, within} from 'storybook/test';
import {Button, Card, Stack, Text} from '@astryxdesign/core';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Heading} from '@astryxdesign/core/Text';

const meta: Meta = {
  title: 'Lab/ChartTheming/ColorPicker',
  parameters: {
    docs: {
      description: {
        component:
          'Product-owned chart color workflow using existing Astryx theme APIs: Automatic, curated theme choices, an exact custom color, and Reset.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const styles = stylex.create({
  actions: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-2'],
  },
  chart: {
    alignItems: 'end',
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-container'],
    display: 'flex',
    gap: spacingVars['--spacing-4'],
    height: 220,
    padding: spacingVars['--spacing-6'],
  },
  bar: (color: string, height: number) => ({
    backgroundColor: color,
    borderRadius: `${radiusVars['--radius-element']} ${radiusVars['--radius-element']} 0 0`,
    height,
    width: 72,
  }),
  colorInput: {
    blockSize: 36,
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: 1,
    inlineSize: 48,
    padding: 2,
  },
  swatchOption: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
  },
  swatch: (color: string, selected: boolean) => ({
    backgroundColor: color,
    borderColor: selected
      ? colorVars['--color-border-emphasized']
      : colorVars['--color-border'],
    borderRadius: radiusVars['--radius-full'],
    borderStyle: 'solid',
    borderWidth: selected ? 3 : 1,
    blockSize: 36,
    cursor: 'pointer',
    inlineSize: 36,
  }),
});

const pickerTheme = defineTheme({
  name: 'chart-color-picker',
  tokens: {
    '--color-data-categorical-blue': ['#005A4E', '#72E1C1'],
    '--color-data-categorical-orange': ['#7A2E00', '#FFB280'],
    '--color-data-categorical-purple': ['#5A21A8', '#C6A7FF'],
  },
});

const productChartColors = [
  {id: '--color-data-categorical-blue', label: 'Blue'},
  {id: '--color-data-categorical-orange', label: 'Orange'},
  {id: '--color-data-categorical-purple', label: 'Purple'},
] as const;

type ProductChartToken = (typeof productChartColors)[number]['id'];
type ProductChartColorChoice =
  {kind: 'theme'; token: ProductChartToken} | {kind: 'custom'; color: string};

const automaticToken: ProductChartToken = productChartColors[0].id;

function normalizeProductCustomColor(input: string): string | undefined {
  return /^#[0-9A-F]{6}$/i.test(input) ? input.toUpperCase() : undefined;
}

function PickerContents({
  mode,
  onModeChange,
}: {
  mode: 'light' | 'dark';
  onModeChange: () => void;
}) {
  const {token} = useTheme();
  const [choice, setChoice] = useState<ProductChartColorChoice | undefined>();
  const [customInput, setCustomInput] = useState('#336699');
  const resolvedColor =
    choice?.kind === 'custom'
      ? choice.color
      : token(choice?.token ?? automaticToken);
  const paintColor =
    choice?.kind === 'custom'
      ? choice.color
      : dataVars[choice?.token ?? automaticToken];
  const state = choice?.kind ?? 'automatic';
  const applyCustom = () => {
    const normalized = normalizeProductCustomColor(customInput);
    if (normalized) {
      setChoice({kind: 'custom', color: normalized});
    }
  };

  return (
    <Card>
      <Stack direction="vertical" gap={4}>
        <Stack direction="vertical" gap={1}>
          <Heading level={3}>Series color</Heading>
          <Text type="supporting" color="secondary">
            Theme choices follow the current mode. Exact custom colors stay
            fixed.
          </Text>
        </Stack>

        <div {...stylex.props(styles.chart)}>
          <div
            {...stylex.props(styles.bar(paintColor, 112))}
            data-chart-color-preview
          />
          <div
            {...stylex.props(
              styles.bar(dataVars['--color-data-categorical-orange'], 164),
            )}
          />
        </div>

        <div
          {...stylex.props(styles.actions)}
          aria-label="Theme color choices"
          role="group">
          <Button
            aria-pressed={choice === undefined}
            label="Automatic"
            onClick={() => setChoice(undefined)}
            variant={choice === undefined ? 'primary' : 'secondary'}
          />
          {productChartColors.map(option => {
            const selected =
              choice?.kind === 'theme' && choice.token === option.id;
            return (
              <div {...stylex.props(styles.swatchOption)} key={option.id}>
                <button
                  {...stylex.props(
                    styles.swatch(dataVars[option.id], selected),
                  )}
                  aria-label={`${option.label} chart color`}
                  aria-pressed={selected}
                  data-color-token={option.id}
                  onClick={() => setChoice({kind: 'theme', token: option.id})}
                  type="button"
                />
                <Text type="supporting">{option.label}</Text>
              </div>
            );
          })}
        </div>

        <div {...stylex.props(styles.actions)}>
          <input
            {...stylex.props(styles.colorInput)}
            aria-label="Exact custom color"
            onChange={event => setCustomInput(event.currentTarget.value)}
            type="color"
            value={customInput}
          />
          <Button label="Apply custom color" onClick={applyCustom} />
          <Button
            label="Reset"
            onClick={() => setChoice(undefined)}
            variant="secondary"
          />
          <Button
            label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
            onClick={onModeChange}
            variant="secondary"
          />
        </div>

        <Text>
          <span data-choice-state={state} data-preview-color={resolvedColor}>
            {state === 'automatic'
              ? 'Automatic'
              : state === 'theme'
                ? 'Theme color'
                : 'Custom color'}
            : {resolvedColor}
          </span>
        </Text>
      </Stack>
    </Card>
  );
}

function ColorPickerExample() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  return (
    <Theme theme={pickerTheme} mode={mode}>
      <PickerContents
        mode={mode}
        onModeChange={() =>
          setMode(current => (current === 'light' ? 'dark' : 'light'))
        }
      />
    </Theme>
  );
}

export const EndUserChoices: Story = {
  render: () => <ColorPickerExample />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement);
    const state = () =>
      canvasElement.querySelector<HTMLElement>('[data-choice-state]');
    const previewBar = () =>
      canvasElement.querySelector<HTMLElement>('[data-chart-color-preview]');
    const expectPreviewBarColor = (color: string) => {
      const bar = previewBar();
      expect(bar).not.toBeNull();
      if (!bar) {
        return;
      }
      expect(getComputedStyle(bar).backgroundColor).toBe(color);
    };
    expect(state()).toHaveAttribute('data-choice-state', 'automatic');
    expect(state()).toHaveAttribute('data-preview-color', '#005A4E');
    expectPreviewBarColor('rgb(0, 90, 78)');
    expect(canvas.getByRole('button', {name: 'Automatic'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const purple = canvas.getByRole('button', {name: 'Purple chart color'});
    await userEvent.click(purple);
    expect(purple).toHaveAttribute('aria-pressed', 'true');
    expect(state()).toHaveAttribute('data-choice-state', 'theme');
    expect(state()).toHaveAttribute('data-preview-color', '#5A21A8');
    expectPreviewBarColor('rgb(90, 33, 168)');

    await userEvent.click(
      canvas.getByRole('button', {name: 'Switch to dark mode'}),
    );
    await waitFor(() => {
      expect(state()).toHaveAttribute('data-preview-color', '#C6A7FF');
      expectPreviewBarColor('rgb(198, 167, 255)');
    });

    fireEvent.change(canvas.getByLabelText('Exact custom color'), {
      target: {value: '#33aaff'},
    });
    await userEvent.click(
      canvas.getByRole('button', {name: 'Apply custom color'}),
    );
    expect(state()).toHaveAttribute('data-choice-state', 'custom');
    expect(state()).toHaveAttribute('data-preview-color', '#33AAFF');
    expectPreviewBarColor('rgb(51, 170, 255)');

    await userEvent.click(
      canvas.getByRole('button', {name: 'Switch to light mode'}),
    );
    await waitFor(() =>
      expect(state()).toHaveAttribute('data-preview-color', '#33AAFF'),
    );

    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    expect(state()).toHaveAttribute('data-choice-state', 'automatic');
    expect(state()).toHaveAttribute('data-preview-color', '#005A4E');
    expectPreviewBarColor('rgb(0, 90, 78)');
    expect(canvas.getByRole('button', {name: 'Automatic'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
