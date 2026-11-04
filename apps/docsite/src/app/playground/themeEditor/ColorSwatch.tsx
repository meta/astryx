// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TokenRow} from './TokenRow';
import {
  parseLightDark,
  parseColorWithAlpha,
  colorWithAlphaToString,
} from './helpers';

const s = stylex.create({
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    flexShrink: 0,
    position: 'relative',
  },
  swatchInteractive: {
    cursor: 'pointer',
  },
  // Native color input overlaid transparently on the swatch (Astryx has no color
  // picker), so clicking the swatch opens the OS picker.
  colorInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    zIndex: 1,
  },
  input: {
    width: 120,
  },
});

const dynamic = stylex.create({
  fill: (color: string) => ({backgroundColor: color}),
});

export function ColorSwatch({
  tokenName,
  value,
  onChange,
  mode,
}: {
  tokenName: string;
  value: string;
  onChange: (tokenName: string, value: string) => void;
  mode: 'light' | 'dark';
}) {
  const parsed = parseLightDark(value);
  const displayValue = parsed
    ? mode === 'light'
      ? parsed.light
      : parsed.dark
    : value;

  const colorParsed = parseColorWithAlpha(displayValue);
  const hasColorPicker = colorParsed !== null;

  const handleColorChange = (newHex: string, newAlpha?: number) => {
    const alpha = newAlpha ?? colorParsed?.alpha ?? 1;
    const newColor = colorWithAlphaToString(newHex, alpha);
    const newValue = parsed
      ? mode === 'light'
        ? `light-dark(${newColor}, ${parsed.dark})`
        : `light-dark(${parsed.light}, ${newColor})`
      : newColor;
    onChange(tokenName, newValue);
  };

  return (
    <TokenRow
      tokenName={tokenName}
      preview={
        <div
          {...stylex.props(
            s.swatch,
            hasColorPicker && s.swatchInteractive,
            dynamic.fill(displayValue),
          )}>
          {hasColorPicker && colorParsed && (
            <input
              type="color"
              value={colorParsed.hex}
              onChange={e => handleColorChange(e.target.value)}
              {...stylex.props(s.colorInput)}
            />
          )}
        </div>
      }
      input={
        <TextInput
          label={tokenName}
          isLabelHidden
          size="sm"
          value={
            hasColorPicker && colorParsed
              ? `${colorParsed.hex}  ${Math.round(colorParsed.alpha * 100)}%`
              : displayValue
          }
          onChange={(val: string) => {
            const parts = val.trim().split(/\s+/);
            const hex = parts[0] || '';
            const pctStr = parts.find(p => p.endsWith('%'));
            const alpha = pctStr
              ? Math.min(100, Math.max(0, Number(pctStr.replace('%', '')))) /
                100
              : (colorParsed?.alpha ?? 1);
            if (hex.startsWith('#') && hex.length >= 4) {
              handleColorChange(hex, alpha);
            } else {
              const newValue = parsed
                ? mode === 'light'
                  ? `light-dark(${val}, ${parsed.dark})`
                  : `light-dark(${parsed.light}, ${val})`
                : val;
              onChange(tokenName, newValue);
            }
          }}
          controlXstyle={s.input}
        />
      }
    />
  );
}
