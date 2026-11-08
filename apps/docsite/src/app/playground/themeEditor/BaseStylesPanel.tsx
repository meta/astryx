// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text} from '@astryxdesign/core/Text';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {Grid} from '@astryxdesign/core/Grid';
import {Selector} from '@astryxdesign/core/Selector';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Icon} from '@astryxdesign/core/Icon';
import {Banner} from '@astryxdesign/core/Banner';
import {expandRadiusScale, expandTypeScale} from '@astryxdesign/core/theme';
import {ColorSwatch} from './ColorSwatch';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {FONT_OPTIONS, RATIO_OPTIONS, UNIFIED_PRESETS} from './constants';
import {getConcentricityWarning, spacingToPx} from './helpers';
import {useLiveNumberInput} from '@/lib/useLiveNumberInput';

const styles = stylex.create({
  fullWidthField: {width: '100%'},
});

interface ScaleOption {
  label: string;
  value: string;
}

interface ScaleControlProps {
  /** Visible section label (e.g. "Corner Radius"). */
  label: string;
  /** Info-tooltip text describing the scale formula. */
  tooltip: string;
  /** Accessible base name; the toggle group adds " preset". */
  controlLabel: string;
  /** Preset buttons (label + value). */
  options: ScaleOption[];
  /** Selected preset value, or null when the theme doesn't match a preset. */
  toggleValue: string | null;
  onToggle: (value: string) => void;
  numberValue: number | null;
  onNumber: (value: number) => void;
  min: number;
  max: number;
  step: number;
  units: string;
}

/**
 * A label + info tooltip over a preset toggle group and a free-entry number
 * input — the shared shape of the type-size, radius, spacing, element-size, and
 * duration controls.
 */
function ScaleControl({
  label,
  tooltip,
  controlLabel,
  options,
  toggleValue,
  onToggle,
  numberValue,
  onNumber,
  min,
  max,
  step,
  units,
}: ScaleControlProps) {
  const liveNumber = useLiveNumberInput(
    numberValue,
    nextValue => {
      if (nextValue != null) {
        onNumber(nextValue);
      }
    },
    {min, max},
  );

  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        <Text type="label" color="secondary">
          {label}
        </Text>
        <Tooltip content={tooltip}>
          <Icon icon="info" size="sm" color="secondary" />
        </Tooltip>
      </HStack>
      <HStack gap={2} vAlign="center" justify="between">
        <ToggleButtonGroup
          label={`${controlLabel} preset`}
          type="single"
          size="sm"
          value={toggleValue}
          onChange={(v: string | null) => {
            if (v != null) {
              onToggle(v);
            }
          }}>
          {options.map(o => (
            <ToggleButton key={o.value} label={o.label} value={o.value} />
          ))}
        </ToggleButtonGroup>
        <NumberInput
          label={controlLabel}
          isLabelHidden
          value={liveNumber.value}
          placeholder="—"
          onChange={liveNumber.handleChange}
          onFocus={liveNumber.handleFocus}
          onInput={liveNumber.handleInput}
          onBlur={liveNumber.handleBlur}
          onKeyDown={liveNumber.handleKeyDown}
          min={min}
          max={max}
          step={step}
          units={units}
          size="sm"
        />
      </HStack>
    </VStack>
  );
}

/** Label-over-field pairing used by the typography selectors. */
function LabeledField({label, children}: {label: string; children: ReactNode}) {
  return (
    <VStack gap={1}>
      <Text type="label" color="secondary">
        {label}
      </Text>
      {children}
    </VStack>
  );
}

interface BaseStylesPanelProps {
  tokens: Record<string, string>;
  mode: 'light' | 'dark';
  typeScaleBase: number;
  typeScaleRatio: number;
  radiusBase: number;
  spacingBase: number;
  sizeBase: number;
  durationStep: number;
  activePreset: string | null;
  onTokenChange: (name: string, value: string) => void;
  onApplyTypeScale: (base: number, ratio: number) => void;
  onApplyRadiusScale: (base: number) => void;
  onApplySpacingScale: (base: number) => void;
  onApplySizeScale: (base: number) => void;
  onApplyDurationScale: (multiplier: number) => void;
  onApplyUnifiedPreset: (key: string) => void;
}

export function BaseStylesPanel({
  tokens,
  mode,
  typeScaleBase,
  typeScaleRatio,
  radiusBase,
  spacingBase,
  sizeBase,
  durationStep,
  activePreset,
  onTokenChange,
  onApplyTypeScale,
  onApplyRadiusScale,
  onApplySpacingScale,
  onApplySizeScale,
  onApplyDurationScale,
  onApplyUnifiedPreset,
}: BaseStylesPanelProps) {
  // Reflect the active token values in the typography controls. Fonts map
  // directly to a token; the type scale ratio is derived from the raw
  // --font-size-* tokens (present only when a theme customizes its scale).
  const fontValue = (token: string): string | undefined =>
    FONT_OPTIONS.some(o => o.value === tokens[token])
      ? tokens[token]
      : undefined;

  const baseRem = parseFloat(tokens['--font-size-base'] ?? '');
  const lgRem = parseFloat(tokens['--font-size-lg'] ?? '');
  const tokenTypeRatio =
    Number.isFinite(baseRem) && Number.isFinite(lgRem) && baseRem > 0
      ? lgRem / baseRem
      : null;
  const tokenTypeBase =
    Number.isFinite(baseRem) && baseRem > 0
      ? Math.round(baseRem * 16)
      : typeScaleBase;
  const matchedRatio =
    tokenTypeRatio != null
      ? RATIO_OPTIONS.find(o => Math.abs(o.value - tokenTypeRatio) < 0.02)
      : undefined;

  // The scale controls below only show a value when the seeded theme's tokens
  // actually follow the generator algorithm. A theme can ship hand-tuned tokens
  // that don't fit any base — then the match is null and the control renders
  // "unset" so it never implies a base the theme isn't really using.

  // Type size — matches when the raw font-size ramp follows the geometric
  // scale for the derived base + nearest standard ratio.
  const typeSizeMatch = (() => {
    if (tokenTypeRatio == null || !matchedRatio) {
      return null;
    }
    const expected = expandTypeScale({
      base: tokenTypeBase,
      ratio: matchedRatio.value,
    });
    const keys = [
      '--font-size-xs',
      '--font-size-sm',
      '--font-size-base',
      '--font-size-lg',
      '--font-size-xl',
      '--font-size-2xl',
    ];
    return keys.every(k => tokens[k] === expected[k]) ? tokenTypeBase : null;
  })();

  // Corner radius — linear scale anchored on --radius-inner (= base).
  const radiusMatch = (() => {
    const inner = parseInt(tokens['--radius-inner'] ?? '', 10);
    if (!Number.isFinite(inner)) {
      return null;
    }
    const expected = expandRadiusScale({base: inner, multiplier: 1});
    const keys = [
      '--radius-inner',
      '--radius-element',
      '--radius-container',
      '--radius-page',
    ];
    return keys.every(k => tokens[k] === expected[k]) ? inner : null;
  })();

  // Spacing — linear scale where step N = base × N (base = --spacing-1), read
  // in px whether a step is written in rem (the defaults) or px (a theme).
  const spacingMatch = (() => {
    const base = spacingToPx(tokens['--spacing-1']);
    if (!Number.isFinite(base)) {
      return null;
    }
    const steps: Record<string, number> = {
      '--spacing-0': 0,
      '--spacing-0-5': 0.5,
      '--spacing-1': 1,
      '--spacing-1-5': 1.5,
      '--spacing-2': 2,
      '--spacing-3': 3,
      '--spacing-4': 4,
      '--spacing-5': 5,
      '--spacing-6': 6,
      '--spacing-7': 7,
      '--spacing-8': 8,
      '--spacing-9': 9,
      '--spacing-10': 10,
      '--spacing-11': 11,
      '--spacing-12': 12,
    };
    const ok = Object.entries(steps).every(
      ([k, step]) => spacingToPx(tokens[k]) === Math.round(base * step),
    );
    return ok ? base : null;
  })();

  // Element size — md = base, sm = base − 4, lg = base + 4.
  const sizeMatch = (() => {
    const md = parseInt(tokens['--size-element-md'] ?? '', 10);
    const sm = parseInt(tokens['--size-element-sm'] ?? '', 10);
    const lg = parseInt(tokens['--size-element-lg'] ?? '', 10);
    if (!Number.isFinite(md)) {
      return null;
    }
    return sm === md - 4 && lg === md + 4 ? md : null;
  })();

  // Concentricity couples the radius and spacing bases. Warn — never block —
  // when they diverge, reading the same values the two controls display. #958
  const shownRadius = radiusMatch ?? radiusBase;
  const shownSpacing = spacingMatch ?? spacingBase;
  const radiusWarning = getConcentricityWarning(
    'radius',
    shownRadius,
    shownSpacing,
  );
  const spacingWarning = getConcentricityWarning(
    'spacing',
    shownRadius,
    shownSpacing,
  );

  return (
    <VStack gap={5}>
      {/* Color */}
      <VStack gap={3}>
        <Text type="label" color="secondary">
          Colors
        </Text>
        <VStack gap={0}>
          {[
            '--color-accent',
            '--color-neutral',
            '--color-background-card',
            '--color-background-surface',
            '--color-background-body',
            '--color-background-muted',
            '--color-text-primary',
          ].map(tokenName => (
            <ColorSwatch
              key={tokenName}
              tokenName={tokenName}
              value={tokens[tokenName] || ''}
              onChange={onTokenChange}
              mode={mode}
            />
          ))}
        </VStack>
      </VStack>

      {/* Presets */}
      <VStack gap={3}>
        <Text type="label" color="secondary">
          Preset
        </Text>
        <Grid columns={4} gap={2}>
          {Object.keys(UNIFIED_PRESETS).map(key => {
            const isSelected = activePreset === key;
            const gap =
              key === 'compact'
                ? 1
                : key === 'default'
                  ? 2
                  : key === 'comfortable'
                    ? 3
                    : 4;
            const cornerR =
              key === 'compact'
                ? 1
                : key === 'default'
                  ? 2
                  : key === 'comfortable'
                    ? 3
                    : 5;
            const fillColor = isSelected
              ? 'var(--color-accent)'
              : 'var(--color-text-disabled)';
            const title = key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <SelectableCard
                key={key}
                label={`${title} preset`}
                isSelected={isSelected}
                onChange={() => onApplyUnifiedPreset(key)}
                padding={2}>
                <VStack gap={1.5} hAlign="center">
                  <svg width={32} height={32} viewBox="0 0 32 32">
                    <rect
                      x={0}
                      y={0}
                      width={32}
                      height={8}
                      rx={cornerR}
                      fill={fillColor}
                      opacity={0.5}
                    />
                    <rect
                      x={0}
                      y={8 + gap}
                      width={15 - gap / 2}
                      height={32 - 8 - gap}
                      rx={cornerR}
                      fill={fillColor}
                    />
                    <rect
                      x={15 + gap / 2}
                      y={8 + gap}
                      width={32 - 15 - gap / 2}
                      height={(32 - 8 - gap * 2) / 2}
                      rx={cornerR}
                      fill={fillColor}
                      opacity={0.7}
                    />
                    <rect
                      x={15 + gap / 2}
                      y={8 + gap + (32 - 8 - gap * 2) / 2 + gap}
                      width={32 - 15 - gap / 2}
                      height={(32 - 8 - gap * 2) / 2}
                      rx={cornerR}
                      fill={fillColor}
                      opacity={0.7}
                    />
                  </svg>
                  <Text
                    type="supporting"
                    color={isSelected ? 'primary' : 'secondary'}>
                    {title}
                  </Text>
                </VStack>
              </SelectableCard>
            );
          })}
        </Grid>
      </VStack>

      {/* Typography */}
      <VStack gap={4}>
        <VStack gap={3}>
          {[
            {token: '--font-family-heading', label: 'Heading Font'},
            {token: '--font-family-body', label: 'Body Font'},
          ].map(({token, label}) => (
            <LabeledField key={token} label={label}>
              <Selector
                label={label}
                isLabelHidden
                size="sm"
                placeholder="Custom"
                controlXstyle={styles.fullWidthField}
                options={FONT_OPTIONS}
                value={fontValue(token)}
                onChange={(val: string) => onTokenChange(token, val)}
              />
            </LabeledField>
          ))}
          <LabeledField label="Type Scale">
            <Selector
              label="Type Scale"
              isLabelHidden
              size="sm"
              placeholder="Default"
              controlXstyle={styles.fullWidthField}
              options={[
                ...RATIO_OPTIONS.map(opt => ({
                  value: String(opt.value),
                  label: opt.label,
                })),
                ...(tokenTypeRatio != null && !matchedRatio
                  ? [
                      {
                        value: 'custom',
                        label: `Custom — ${tokenTypeRatio.toFixed(3)}`,
                      },
                    ]
                  : []),
              ]}
              value={
                tokenTypeRatio == null
                  ? undefined
                  : matchedRatio
                    ? String(matchedRatio.value)
                    : 'custom'
              }
              onChange={(v: string) => {
                if (v !== 'custom') {
                  onApplyTypeScale(tokenTypeBase, Number(v));
                }
              }}
            />
          </LabeledField>
        </VStack>
        <ScaleControl
          label="Type Size"
          tooltip={`Geometric scale: size = round(base × ratio^step). Base = ${typeSizeMatch ?? typeScaleBase}px, ratio = ${typeScaleRatio.toFixed(3)}.`}
          controlLabel="Type size"
          options={[
            {label: 'S', value: '12'},
            {label: 'M', value: '14'},
            {label: 'L', value: '16'},
            {label: 'XL', value: '18'},
          ]}
          toggleValue={typeSizeMatch != null ? String(typeSizeMatch) : null}
          onToggle={v => onApplyTypeScale(Number(v), typeScaleRatio)}
          numberValue={typeSizeMatch ?? null}
          onNumber={v => onApplyTypeScale(v, typeScaleRatio)}
          min={10}
          max={24}
          step={1}
          units="px"
        />
      </VStack>

      {/* Shape & Layout */}
      <VStack gap={4}>
        <VStack gap={2}>
          <ScaleControl
            label="Corner Radius"
            tooltip={`Linear scale: inner = ${shownRadius}px, element = ${shownRadius * 2}px, container = ${shownRadius * 3}px, page = ${Math.round(shownRadius * 7)}px.`}
            controlLabel="Radius"
            options={[
              {label: 'S', value: '2'},
              {label: 'M', value: '4'},
              {label: 'L', value: '6'},
              {label: 'XL', value: '8'},
            ]}
            toggleValue={radiusMatch != null ? String(radiusMatch) : null}
            onToggle={v => onApplyRadiusScale(Number(v))}
            numberValue={radiusMatch ?? null}
            onNumber={v => onApplyRadiusScale(v)}
            min={0}
            max={18}
            step={2}
            units="px"
          />
          {radiusWarning && (
            <Banner
              status="warning"
              title={radiusWarning.title}
              description={radiusWarning.description}
            />
          )}
        </VStack>
        <VStack gap={2}>
          <ScaleControl
            label="Spacing"
            tooltip={`Linear scale: step N = ${shownSpacing}px × N.`}
            controlLabel="Spacing"
            options={[
              {label: 'S', value: '2'},
              {label: 'M', value: '4'},
              {label: 'L', value: '6'},
              {label: 'XL', value: '8'},
            ]}
            toggleValue={spacingMatch != null ? String(spacingMatch) : null}
            onToggle={v => onApplySpacingScale(Number(v))}
            numberValue={spacingMatch ?? null}
            onNumber={v => onApplySpacingScale(v)}
            min={0}
            max={16}
            step={2}
            units="px"
          />
          {spacingWarning && (
            <Banner
              status="warning"
              title={spacingWarning.title}
              description={spacingWarning.description}
            />
          )}
        </VStack>
        <ScaleControl
          label="Element Size"
          tooltip={`sm = ${(sizeMatch ?? sizeBase) - 4}px, md = ${sizeMatch ?? sizeBase}px, lg = ${(sizeMatch ?? sizeBase) + 4}px.`}
          controlLabel="Element size"
          options={[
            {label: 'S', value: '28'},
            {label: 'M', value: '32'},
            {label: 'L', value: '40'},
            {label: 'XL', value: '48'},
          ]}
          toggleValue={sizeMatch != null ? String(sizeMatch) : null}
          onToggle={v => onApplySizeScale(Number(v))}
          numberValue={sizeMatch ?? null}
          onNumber={v => onApplySizeScale(v)}
          min={24}
          max={56}
          step={2}
          units="px"
        />
      </VStack>

      {/* Motion */}
      <ScaleControl
        label="Duration"
        tooltip={`Speed multiplier for all motion. Current: ${durationStep}× (e.g. medium = ${Math.round(410 / durationStep)}ms).`}
        controlLabel="Duration"
        options={[
          {label: '0.5×', value: '0.5'},
          {label: '1×', value: '1'},
          {label: '1.5×', value: '1.5'},
          {label: '2×', value: '2'},
        ]}
        toggleValue={String(durationStep)}
        onToggle={v => onApplyDurationScale(Number(v))}
        numberValue={durationStep}
        onNumber={v => onApplyDurationScale(Math.round(v * 10) / 10)}
        min={0.5}
        max={2}
        step={0.1}
        units="×"
      />
    </VStack>
  );
}
