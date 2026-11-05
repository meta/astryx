// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Slider} from '@astryxdesign/core/Slider';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

import {
  COMPACT_11_STOPS,
  FULL_21_STOPS,
  generatePaletteSet,
  parseStopList,
  perceptualDelta,
  serializeGenerationResult,
  type AnchorPolicy,
  type GeneratedFamily,
  type GeneratedRamp,
  type ModeStrategy,
  type NeutralProfile,
  type PaletteAlgorithm,
  type PaletteFamilyRequest,
  type PaletteGenerationResult,
  type PaletteMode,
} from './generator';
import {
  THEME_REFERENCES,
  type ThemeReference,
  type ThemeReferenceFamily,
} from './themeCorpus';

const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

type AlgorithmView = 'oklch' | 'hct' | 'compare';
type LabView = 'generator' | 'themes';
type VibrancyPreset = 'muted' | 'balanced' | 'vibrant';
type StopPreset = 'full-21' | 'compact-11' | 'custom';
type EditableAnchor = {
  mode: PaletteMode;
  stop: number;
  color: string;
  policy: AnchorPolicy;
  maxDeltaE: number;
};
type EditableFamily = Omit<PaletteFamilyRequest, 'anchors'> & {
  anchors: EditableAnchor[];
};

function editableFamily(
  id: string,
  name: string,
  seed: string,
  options: {
    kind?: 'chromatic' | 'neutral';
    anchors?: EditableAnchor[];
  } = {},
): EditableFamily {
  return {
    id,
    name,
    seed,
    kind: options.kind ?? 'chromatic',
    anchors: options.anchors ?? [],
  };
}

const INITIAL_FAMILIES: EditableFamily[] = [
  editableFamily('neutral', 'Neutral', '#777777', {kind: 'neutral'}),
  editableFamily('blue', 'Blue', '#0074e2', {
    anchors: [
      {
        mode: 'light',
        stop: 50,
        color: '#0074e2',
        policy: 'exact',
        maxDeltaE: 2,
      },
    ],
  }),
  editableFamily('red', 'Red', '#d62830'),
  editableFamily('orange', 'Orange', '#d57113'),
  editableFamily('yellow', 'Yellow', '#f8c723', {
    anchors: [
      {
        mode: 'light',
        stop: 80,
        color: '#f8c723',
        policy: 'preferred',
        maxDeltaE: 3,
      },
    ],
  }),
  editableFamily('green', 'Green', '#358a3a', {
    anchors: [
      {
        mode: 'light',
        stop: 50,
        color: '#358a3a',
        policy: 'preferred',
        maxDeltaE: 3,
      },
    ],
  }),
  editableFamily('teal', 'Teal', '#0c7365'),
  editableFamily('cyan', 'Cyan', '#0c6f82'),
  editableFamily('purple', 'Purple', '#980fb2', {
    anchors: [
      {
        mode: 'light',
        stop: 50,
        color: '#980fb2',
        policy: 'preferred',
        maxDeltaE: 3,
      },
    ],
  }),
  editableFamily('pink', 'Pink', '#b10e69'),
];

const styles = {
  page: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface, #fff)',
  } satisfies React.CSSProperties,
  sidebar: {
    width: 380,
    flexShrink: 0,
    height: '100vh',
    padding: 8,
  } satisfies React.CSSProperties,
  panel: {
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    border: '1px solid var(--color-border, #ddd)',
    borderRadius: 16,
    backgroundColor: 'var(--color-background-card, #fff)',
  } satisfies React.CSSProperties,
  header: {
    padding: 16,
    borderBottom: '1px solid var(--color-border, #ddd)',
  } satisfies React.CSSProperties,
  controls: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: 16,
  } satisfies React.CSSProperties,
  main: {
    flex: 1,
    minWidth: 0,
    height: '100vh',
    overflowY: 'auto' as const,
    padding: 24,
  } satisfies React.CSSProperties,
  fieldLabel: {
    minWidth: 74,
    flexShrink: 0,
  } satisfies React.CSSProperties,
  family: {
    borderTop: '1px solid var(--color-border, #ddd)',
    paddingTop: 12,
  } satisfies React.CSSProperties,
  swatchStrip: {
    display: 'grid',
    gridAutoFlow: 'column' as const,
    gridAutoColumns: 'minmax(28px, 1fr)',
    overflowX: 'auto' as const,
    border: '1px solid var(--color-border, #ddd)',
    borderRadius: 8,
  } satisfies React.CSSProperties,
  swatch: (color: string): React.CSSProperties => ({
    minWidth: 28,
    height: 54,
    backgroundColor: color,
    position: 'relative' as const,
  }),
  stopLabel: {
    position: 'absolute' as const,
    insetInline: 0,
    bottom: 3,
    textAlign: 'center' as const,
    fontFamily: MONO,
    fontSize: 8,
    color: 'var(--color-text-primary, #111)',
    mixBlendMode: 'difference' as const,
    filter: 'invert(1)',
  } satisfies React.CSSProperties,
  resultSection: {
    padding: 16,
    border: '1px solid var(--color-border, #ddd)',
    borderRadius: 12,
    backgroundColor: 'var(--color-background-card, #fff)',
  } satisfies React.CSSProperties,
  diagnostic: {
    fontFamily: MONO,
    fontSize: 10,
    color: 'var(--color-text-secondary, #666)',
  } satisfies React.CSSProperties,
  sampleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
    gap: 12,
  } satisfies React.CSSProperties,
};

function algorithmForView(
  view: Exclude<AlgorithmView, 'compare'>,
): PaletteAlgorithm {
  return view === 'oklch' ? 'oklch-v1-experimental' : 'hct-v1-experimental';
}

function presetForVibrancy(vibrancy: number): VibrancyPreset {
  if (vibrancy < 38) {
    return 'muted';
  }
  if (vibrancy > 62) {
    return 'vibrant';
  }
  return 'balanced';
}

function vibrancyForPreset(preset: VibrancyPreset): number {
  return preset === 'muted' ? 25 : preset === 'vibrant' ? 75 : 50;
}

function nearestStop(stops: number[], target: number): number {
  return stops.reduce((best, stop) =>
    Math.abs(stop - target) < Math.abs(best - target) ? stop : best,
  );
}

function nextAnchorStop(
  stops: number[],
  anchors: EditableAnchor[],
  mode: PaletteMode,
): number {
  const occupied = new Set(
    anchors.filter(anchor => anchor.mode === mode).map(anchor => anchor.stop),
  );
  return (
    [...stops]
      .sort((a, b) => Math.abs(a - 50) - Math.abs(b - 50))
      .find(stop => !occupied.has(stop)) ?? stops[0]
  );
}

function resultColor(
  result: PaletteGenerationResult,
  familyId: string,
  mode: PaletteMode,
  targetStop: number,
  fallback: string,
): string {
  const ramp = result.families.find(family => family.id === familyId)?.[mode];
  if (!ramp) {
    return fallback;
  }
  const stop = nearestStop(result.request.stops, targetStop);
  return ramp.colors[stop] ?? fallback;
}

function ContextPreview({result}: {result: PaletteGenerationResult}) {
  const lightBg = resultColor(result, 'neutral', 'light', 95, '#f5f5f5');
  const lightText = resultColor(result, 'neutral', 'light', 10, '#222222');
  const darkBg = resultColor(result, 'neutral', 'dark', 10, '#1b1b1b');
  const darkText = resultColor(result, 'neutral', 'dark', 90, '#ededed');
  const lightBlue = resultColor(result, 'blue', 'light', 50, '#0064e0');
  const darkBlue = resultColor(result, 'blue', 'dark', 70, '#70a0ff');
  const lightYellow = resultColor(result, 'yellow', 'light', 80, '#e0b600');
  const darkYellow = resultColor(result, 'yellow', 'dark', 70, '#e8c94c');
  const lightGreen = resultColor(result, 'green', 'light', 50, '#248a36');
  const darkGreen = resultColor(result, 'green', 'dark', 70, '#75c47c');

  const examples = [
    result.request.modeStrategy !== 'dark-only'
      ? {
          mode: 'light' as const,
          label: 'Light context',
          background: lightBg,
          text: lightText,
          colors: [lightBlue, lightYellow, lightGreen],
        }
      : null,
    result.request.modeStrategy !== 'light-only'
      ? {
          mode: 'dark' as const,
          label: 'Dark context',
          background: darkBg,
          text: darkText,
          colors: [darkBlue, darkYellow, darkGreen],
        }
      : null,
  ].filter(example => example != null);

  return (
    <div style={styles.sampleGrid}>
      {examples.map(example => (
        <div
          key={example.label}
          style={{
            padding: 18,
            borderRadius: 12,
            backgroundColor: example.background,
            color: example.text,
            border: '1px solid var(--color-border, #ddd)',
          }}>
          <div style={{fontWeight: 700, marginBottom: 6}}>{example.label}</div>
          <div style={{fontSize: 12, opacity: 0.8, marginBottom: 14}}>
            Context preview only—not an accessibility approval.
          </div>
          {example.mode === 'dark' && (
            <div style={{fontSize: 12, marginBottom: 14, maxWidth: 460}}>
              Body text uses the generated near-white neutral. Pure white is
              intentionally avoided because it can feel harsh or “vibrate” on a
              dark surface.
            </div>
          )}
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            {example.colors.map((color, index) => (
              <div
                key={color}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  backgroundColor: color,
                  color: index === 1 ? '#241b00' : example.background,
                  fontWeight: 700,
                  fontSize: 12,
                }}>
                {['Blue', 'Yellow', 'Green'][index]}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactRampDiagnostics({
  label,
  ramp,
}: {
  label: string;
  ramp: GeneratedRamp;
}) {
  return (
    <div style={styles.diagnostic}>
      {label}: min/max adjacent ΔE{' '}
      {ramp.diagnostics.minimumAdjacentDeltaE.toFixed(1)}/
      {ramp.diagnostics.maximumAdjacentDeltaE.toFixed(1)} · hue drift{' '}
      {ramp.diagnostics.maximumHueDrift.toFixed(1)}° · mapped{' '}
      {ramp.diagnostics.gamutMappedStops.length}
    </div>
  );
}

function HueIdentityWarning({
  label,
  ramp,
}: {
  label?: string;
  ramp: GeneratedRamp;
}) {
  if (!ramp.diagnostics.hueIdentityRisk) {
    return null;
  }
  const message =
    ramp.diagnostics.hueIdentityRisk === 'blue-to-purple'
      ? 'blue may shift toward purple'
      : 'yellow may shift toward orange/brown';
  return (
    <Text
      type="supporting"
      style={{color: 'var(--color-text-yellow, #7a5700)'}}>
      {label ? `${label}: ` : ''}Review hue identity—{message}.
    </Text>
  );
}

function CompareRampRows({
  familyName,
  mode,
  stops,
  oklchRamp,
  hctRamp,
}: {
  familyName: string;
  mode: PaletteMode;
  stops: number[];
  oklchRamp?: GeneratedRamp;
  hctRamp?: GeneratedRamp;
}) {
  const rows = [
    {label: 'OKLCH', ramp: oklchRamp},
    {label: 'HCT-like', ramp: hctRamp},
  ].filter(
    (row): row is {label: string; ramp: GeneratedRamp} => row.ramp != null,
  );

  return (
    <VStack gap={2}>
      <Text type="supporting" weight="semibold">
        {mode === 'light' ? 'Light' : 'Dark'}
      </Text>
      <div>
        {rows.map((row, rowIndex) => (
          <div
            key={row.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px minmax(0, 1fr)',
              alignItems: 'stretch',
            }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingInlineEnd: 8,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
              }}>
              {row.label}
            </div>
            <div
              style={{
                ...styles.swatchStrip,
                borderRadius:
                  rows.length === 1
                    ? 8
                    : rowIndex === 0
                      ? '8px 8px 0 0'
                      : '0 0 8px 8px',
                borderBottomWidth: rows.length > 1 && rowIndex === 0 ? 0 : 1,
                borderTopWidth: rows.length > 1 && rowIndex === 1 ? 0 : 1,
              }}>
              {stops.map(stop => (
                <div
                  key={stop}
                  title={`${familyName} ${row.label} ${mode} ${stop}: ${row.ramp.colors[stop]}`}
                  style={styles.swatch(row.ramp.colors[stop])}>
                  <span style={styles.stopLabel}>{stop}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {oklchRamp && <CompactRampDiagnostics label="OKLCH" ramp={oklchRamp} />}
      {hctRamp && <CompactRampDiagnostics label="HCT-like" ramp={hctRamp} />}
      {oklchRamp && <HueIdentityWarning label="OKLCH" ramp={oklchRamp} />}
      {hctRamp && <HueIdentityWarning label="HCT-like" ramp={hctRamp} />}
      {hctRamp &&
        oklchRamp &&
        hctRamp.diagnostics.maximumHueDrift >
          oklchRamp.diagnostics.maximumHueDrift + 8 && (
          <Text
            type="supporting"
            style={{color: 'var(--color-text-yellow, #7a5700)'}}>
            HCT-like has materially more hue drift in this ramp.
          </Text>
        )}
    </VStack>
  );
}

function CompareResultView({
  oklch,
  hct,
}: {
  oklch: PaletteGenerationResult;
  hct: PaletteGenerationResult;
}) {
  function familyFor(
    result: PaletteGenerationResult,
    familyId: string,
  ): GeneratedFamily | undefined {
    return result.families.find(family => family.id === familyId);
  }

  return (
    <VStack gap={5} style={styles.resultSection}>
      <VStack gap={1}>
        <Heading level={3}>Direct algorithm comparison</Heading>
        <Text type="supporting" color="secondary">
          Matching ramps share an edge so differences appear in the same visual
          position.
        </Text>
      </VStack>

      {[...oklch.errors, ...hct.errors].map((error, index) => (
        <div
          key={`${error.familyId}-${index}`}
          style={{
            padding: 10,
            borderRadius: 8,
            color: 'var(--color-on-error-muted)',
            backgroundColor: 'var(--color-error-muted)',
          }}>
          <strong>{error.familyId}:</strong> {error.message}
        </div>
      ))}

      {oklch.request.families.map(requestedFamily => {
        const oklchFamily = familyFor(oklch, requestedFamily.id);
        const hctFamily = familyFor(hct, requestedFamily.id);
        if (!oklchFamily && !hctFamily) {
          return null;
        }

        return (
          <VStack key={requestedFamily.id} gap={3}>
            <Text weight="semibold">{requestedFamily.name}</Text>
            {(['light', 'dark'] as const).map(mode => {
              const oklchRamp = oklchFamily?.[mode];
              const hctRamp = hctFamily?.[mode];
              if (!oklchRamp && !hctRamp) {
                return null;
              }
              return (
                <CompareRampRows
                  key={mode}
                  familyName={requestedFamily.name}
                  mode={mode}
                  stops={oklch.request.stops}
                  oklchRamp={oklchRamp}
                  hctRamp={hctRamp}
                />
              );
            })}
          </VStack>
        );
      })}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
        }}>
        <VStack gap={2}>
          <Text weight="semibold">OKLCH contexts</Text>
          <ContextPreview result={oklch} />
        </VStack>
        <VStack gap={2}>
          <Text weight="semibold">HCT-like contexts</Text>
          <ContextPreview result={hct} />
        </VStack>
      </div>
    </VStack>
  );
}

function differenceStats(
  reference: Record<number, string>,
  generated: Record<number, string>,
  stops: number[],
): {average: number; maximum: number; maximumStop: number} {
  const differences = stops.map(stop => ({
    stop,
    delta: perceptualDelta(reference[stop], generated[stop]),
  }));
  const maximum = differences.reduce((largest, item) =>
    item.delta > largest.delta ? item : largest,
  );
  return {
    average:
      differences.reduce((sum, item) => sum + item.delta, 0) /
      differences.length,
    maximum: maximum.delta,
    maximumStop: maximum.stop,
  };
}

function ThemeFamilyComparison({
  reference,
  results,
  stops,
  sharedAcrossModes,
}: {
  reference: ThemeReferenceFamily;
  results: PaletteGenerationResult[];
  stops: number[];
  sharedAcrossModes?: boolean;
}) {
  return (
    <VStack gap={3}>
      <HStack vAlign="center" style={{justifyContent: 'space-between'}}>
        <Text weight="semibold">{reference.name}</Text>
        <Text type="supporting" color="secondary">
          source {reference.seed}
        </Text>
      </HStack>
      {(['light', 'dark'] as const).map(mode => {
        const existing = reference[mode];
        if (!existing) {
          return null;
        }
        const generatedRows = results
          .map(result => {
            const family = result.families.find(
              item => item.id === reference.id,
            );
            const ramp = family?.[mode];
            return ramp
              ? {
                  label:
                    result.request.algorithm === 'oklch-v1-experimental'
                      ? 'OKLCH'
                      : 'HCT-like',
                  colors: ramp.colors,
                  stats: differenceStats(existing, ramp.colors, stops),
                }
              : null;
          })
          .filter(
            (
              row,
            ): row is {
              label: string;
              colors: Record<number, string>;
              stats: {average: number; maximum: number; maximumStop: number};
            } => row != null,
          );
        const existingRow = {
          label: sharedAcrossModes ? 'Existing shared' : 'Existing',
          colors: existing,
          stats: null,
        };
        const rows =
          generatedRows.length === 2
            ? [generatedRows[0], existingRow, generatedRows[1]]
            : [existingRow, ...generatedRows];

        return (
          <VStack key={mode} gap={2}>
            <Text type="supporting" weight="semibold">
              {mode === 'light' ? 'Light' : 'Dark'} candidate
              {sharedAcrossModes ? ' vs shared reference' : ''}
            </Text>
            <div>
              {rows.map((row, rowIndex) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px minmax(0, 1fr)',
                    alignItems: 'stretch',
                  }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      paddingInlineEnd: 8,
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                    {row.label}
                  </div>
                  <div
                    style={{
                      ...styles.swatchStrip,
                      borderRadius:
                        rowIndex === 0
                          ? '8px 8px 0 0'
                          : rowIndex === rows.length - 1
                            ? '0 0 8px 8px'
                            : 0,
                      borderTopWidth: rowIndex === 0 ? 1 : 0,
                      borderBottomWidth: rowIndex === rows.length - 1 ? 1 : 0,
                    }}>
                    {stops.map(stop => (
                      <div
                        key={stop}
                        title={`${reference.name} ${row.label} ${mode} ${stop}: ${row.colors[stop]}`}
                        style={styles.swatch(row.colors[stop])}>
                        <span style={styles.stopLabel}>{stop}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {generatedRows.map(row => (
              <div key={row.label} style={styles.diagnostic}>
                {row.label} vs existing: average ΔE{' '}
                {row.stats.average.toFixed(1)} · maximum{' '}
                {row.stats.maximum.toFixed(1)} at stop {row.stats.maximumStop}
              </div>
            ))}
          </VStack>
        );
      })}
    </VStack>
  );
}

function ThemeComparisonView({
  theme,
  results,
}: {
  theme: ThemeReference;
  results: PaletteGenerationResult[];
}) {
  const stops = FULL_21_STOPS.filter(stop => stop !== 0 && stop !== 100);
  const hasSharedReferences = theme.families.some(
    family => family.sharedAcrossModes,
  );
  return (
    <VStack gap={5} style={styles.resultSection}>
      <VStack gap={1}>
        <HStack vAlign="center" style={{justifyContent: 'space-between'}}>
          <Heading level={3}>{theme.name} theme comparison</Heading>
          <Text type="supporting" color="secondary">
            {theme.referenceKind === 'stored'
              ? 'stored reference ramps'
              : 'legacy generated reference'}
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          {theme.description} Shared black and white endpoints are omitted from
          the display but remain in exported data.
        </Text>
        {hasSharedReferences && (
          <Text
            type="supporting"
            style={{color: 'var(--color-text-yellow, #7a5700)'}}>
            This package publishes one mode-agnostic ramp. Repeating it beside
            both candidates does not mean its dark-mode palette was reviewed
            independently.
          </Text>
        )}
      </VStack>
      {theme.families.map(family => (
        <ThemeFamilyComparison
          key={family.id}
          reference={family}
          results={results}
          stops={stops}
          sharedAcrossModes={family.sharedAcrossModes}
        />
      ))}
    </VStack>
  );
}

function ResultView({result}: {result: PaletteGenerationResult}) {
  return (
    <VStack gap={5} style={styles.resultSection}>
      <HStack vAlign="center" style={{justifyContent: 'space-between'}}>
        <Heading level={3}>
          {result.request.algorithm === 'oklch-v1-experimental'
            ? 'OKLCH experiment'
            : 'CIELAB / HCT-like experiment'}
        </Heading>
        <Text type="supporting" color="secondary">
          vibrancy {result.request.vibrancy} · {result.request.stops.length}{' '}
          stops
        </Text>
      </HStack>

      {result.errors.map(error => (
        <div
          key={error.familyId}
          style={{
            padding: 10,
            borderRadius: 8,
            color: 'var(--color-on-error-muted)',
            backgroundColor: 'var(--color-error-muted)',
          }}>
          <strong>{error.familyId}:</strong> {error.message}
        </div>
      ))}

      {result.coordination.map(diagnostic => (
        <div
          key={diagnostic.mode}
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: 'var(--color-background-secondary, #f4f4f4)',
          }}>
          <Text type="supporting" weight="semibold">
            {diagnostic.mode === 'light' ? 'Light' : 'Dark'} family balance at
            stop {diagnostic.stop}
          </Text>
          <div style={styles.diagnostic}>
            Closest pair:{' '}
            {diagnostic.closestFamilies
              ? `${diagnostic.closestFamilies.join(' / ')} (ΔE ${diagnostic.minimumFamilyDeltaE?.toFixed(1)})`
              : 'not enough chromatic families'}
            {' · '}Strongest chroma: {diagnostic.strongestFamily ?? 'n/a'}
            {' · '}Weakest chroma: {diagnostic.weakestFamily ?? 'n/a'}
            {diagnostic.chromaRatio != null
              ? ` · ratio ${diagnostic.chromaRatio.toFixed(2)}×`
              : ''}
          </div>
          {diagnostic.minimumFamilyDeltaE != null &&
            diagnostic.minimumFamilyDeltaE < 8 && (
              <Text
                type="supporting"
                style={{color: 'var(--color-text-yellow, #7a5700)'}}>
                Review this pair in real components: neighboring families may be
                too similar to communicate different meanings reliably.
              </Text>
            )}
          {diagnostic.chromaRatio != null && diagnostic.chromaRatio > 2 && (
            <Text
              type="supporting"
              style={{color: 'var(--color-text-yellow, #7a5700)'}}>
              Review visual weight: the strongest family is more than twice as
              chromatic as the weakest.
            </Text>
          )}
        </div>
      ))}

      {result.families.map(family => (
        <VStack key={family.id} gap={2}>
          <HStack vAlign="center" style={{justifyContent: 'space-between'}}>
            <Text weight="semibold">{family.name}</Text>
            <Text type="supporting" color="secondary">
              seed {family.seed}
            </Text>
          </HStack>
          {(['light', 'dark'] as const).map(mode => {
            const ramp = family[mode];
            if (!ramp) {
              return null;
            }
            return (
              <VStack key={mode} gap={1}>
                <HStack
                  vAlign="center"
                  style={{justifyContent: 'space-between'}}>
                  <Text type="supporting" weight="semibold">
                    {mode === 'light' ? 'Light' : 'Dark'}
                  </Text>
                  <span style={styles.diagnostic}>
                    {ramp.diagnostics.monotonic ? 'monotonic' : 'not monotonic'}{' '}
                    · min ΔE {ramp.diagnostics.minimumAdjacentDeltaE.toFixed(1)}{' '}
                    · max ΔE {ramp.diagnostics.maximumAdjacentDeltaE.toFixed(1)}{' '}
                    · max hue drift{' '}
                    {ramp.diagnostics.maximumHueDrift.toFixed(1)}° · mapped{' '}
                    {ramp.diagnostics.gamutMappedStops.length}
                  </span>
                </HStack>
                <div style={styles.swatchStrip}>
                  {result.request.stops.map(stop => (
                    <div
                      key={stop}
                      title={`${family.name} ${mode} ${stop}: ${ramp.colors[stop]}`}
                      style={styles.swatch(ramp.colors[stop])}>
                      <span style={styles.stopLabel}>{stop}</span>
                    </div>
                  ))}
                </div>
                <HueIdentityWarning ramp={ramp} />
                {ramp.diagnostics.anchors.map(anchor => (
                  <Text
                    key={`${anchor.mode}-${anchor.stop}`}
                    type="supporting"
                    color="secondary">
                    {anchor.policy} anchor · {mode} {anchor.stop} · requested{' '}
                    {anchor.color} · produced {anchor.generatedColor} · ΔE{' '}
                    {anchor.deltaE.toFixed(2)}
                  </Text>
                ))}
              </VStack>
            );
          })}
        </VStack>
      ))}

      <ContextPreview result={result} />
    </VStack>
  );
}

export default function PaletteGeneratorPage() {
  const [labView, setLabView] = useState<LabView>('generator');
  const [algorithmView, setAlgorithmView] = useState<AlgorithmView>('compare');
  const [vibrancy, setVibrancy] = useState(50);
  const [neutralProfile, setNeutralProfile] =
    useState<NeutralProfile>('neutral-v1');
  const [modeStrategy, setModeStrategy] =
    useState<ModeStrategy>('light-and-dark');
  const [stopPreset, setStopPreset] = useState<StopPreset>('full-21');
  const [customStops, setCustomStops] = useState(
    '0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100',
  );
  const [families, setFamilies] = useState<EditableFamily[]>(INITIAL_FAMILIES);
  const [selectedThemeId, setSelectedThemeId] = useState(
    THEME_REFERENCES[0].id,
  );
  const [copied, setCopied] = useState(false);

  const stopResolution = useMemo(() => {
    try {
      const stops =
        stopPreset === 'full-21'
          ? [...FULL_21_STOPS]
          : stopPreset === 'compact-11'
            ? [...COMPACT_11_STOPS]
            : parseStopList(customStops);
      return {stops, error: null};
    } catch (error) {
      return {
        stops: [...FULL_21_STOPS],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [customStops, stopPreset]);

  const familyRequests = useMemo<PaletteFamilyRequest[]>(
    () =>
      families.map(family => ({
        id: family.id,
        name: family.name,
        seed: family.seed,
        kind: family.kind,
        anchors: family.anchors.map(anchor => ({
          ...anchor,
          maxDeltaE: anchor.policy === 'bounded' ? anchor.maxDeltaE : undefined,
        })),
      })),
    [families],
  );

  const algorithms = useMemo<PaletteAlgorithm[]>(
    () =>
      algorithmView === 'compare'
        ? ['oklch-v1-experimental', 'hct-v1-experimental']
        : [algorithmForView(algorithmView)],
    [algorithmView],
  );

  const results = useMemo(
    () =>
      algorithms.map(algorithm =>
        generatePaletteSet({
          algorithm,
          vibrancy,
          neutralProfile,
          modeStrategy,
          stops: stopResolution.stops,
          families: familyRequests,
        }),
      ),
    [
      algorithms,
      familyRequests,
      modeStrategy,
      neutralProfile,
      stopResolution.stops,
      vibrancy,
    ],
  );

  const selectedTheme =
    THEME_REFERENCES.find(theme => theme.id === selectedThemeId) ??
    THEME_REFERENCES[0];

  const themeResults = useMemo(() => {
    const themeModeStrategy: ModeStrategy =
      selectedTheme.modes.length === 1
        ? selectedTheme.modes[0] === 'dark'
          ? 'dark-only'
          : 'light-only'
        : 'light-and-dark';
    return algorithms.map(algorithm =>
      generatePaletteSet({
        algorithm,
        vibrancy,
        neutralProfile: 'custom',
        modeStrategy: themeModeStrategy,
        stops: [...FULL_21_STOPS],
        families: selectedTheme.families.map(family => ({
          id: family.id,
          name: family.name,
          seed: family.seed,
          kind: family.kind,
          anchors: [],
        })),
      }),
    );
  }, [algorithms, selectedTheme, vibrancy]);

  const suggestedThemeVibrancy = selectedTheme.suggestedVibrancy[algorithmView];

  function selectLabView(value: LabView): void {
    setLabView(value);
    if (value === 'themes') {
      setVibrancy(selectedTheme.suggestedVibrancy[algorithmView]);
    }
  }

  function selectAlgorithm(value: AlgorithmView): void {
    setAlgorithmView(value);
    if (labView === 'themes') {
      setVibrancy(selectedTheme.suggestedVibrancy[value]);
    }
  }

  function selectTheme(value: string): void {
    const theme =
      THEME_REFERENCES.find(item => item.id === value) ?? THEME_REFERENCES[0];
    setSelectedThemeId(theme.id);
    setVibrancy(theme.suggestedVibrancy[algorithmView]);
  }

  function updateFamily(id: string, changes: Partial<EditableFamily>): void {
    setFamilies(current =>
      current.map(family =>
        family.id === id ? {...family, ...changes} : family,
      ),
    );
  }

  function updateAnchor(
    familyId: string,
    anchorIndex: number,
    changes: Partial<EditableAnchor>,
  ): void {
    setFamilies(current =>
      current.map(family =>
        family.id === familyId
          ? {
              ...family,
              anchors: family.anchors.map((anchor, index) =>
                index === anchorIndex ? {...anchor, ...changes} : anchor,
              ),
            }
          : family,
      ),
    );
  }

  function copyResults(): void {
    const output = (labView === 'themes' ? themeResults : results).map(result =>
      JSON.parse(serializeGenerationResult(result)),
    );
    navigator.clipboard
      .writeText(`${JSON.stringify(output, null, 2)}\n`)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      });
  }

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.panel}>
          <div style={styles.header}>
            <VStack gap={2}>
              <HStack vAlign="center" style={{justifyContent: 'space-between'}}>
                <Heading level={3}>Palette Generator</Heading>
                <Button
                  label={copied ? 'Copied' : 'Copy JSON'}
                  variant="ghost"
                  size="sm"
                  onClick={copyResults}
                />
              </HStack>
              <Text type="supporting" color="secondary">
                Experimental AST-008 decision tool. Outputs are candidates, not
                adopted theme colors.
              </Text>
              <SegmentedControl
                label="Lab view"
                value={labView}
                onChange={value => selectLabView(value as LabView)}
                size="sm">
                <SegmentedControlItem value="generator" label="Generator" />
                <SegmentedControlItem value="themes" label="Themes" />
              </SegmentedControl>
            </VStack>
          </div>

          <div style={styles.controls}>
            <VStack gap={5}>
              <VStack gap={2}>
                <Text type="label" weight="semibold">
                  Algorithm
                </Text>
                <SegmentedControl
                  label="Algorithm"
                  value={algorithmView}
                  onChange={value => selectAlgorithm(value as AlgorithmView)}
                  size="sm">
                  <SegmentedControlItem value="oklch" label="OKLCH" />
                  <SegmentedControlItem value="hct" label="HCT-like" />
                  <SegmentedControlItem value="compare" label="Compare" />
                </SegmentedControl>
              </VStack>

              <VStack gap={2}>
                <Text type="label" weight="semibold">
                  Vibrancy presets
                </Text>
                <SegmentedControl
                  label="Vibrancy preset"
                  value={presetForVibrancy(vibrancy)}
                  onChange={value =>
                    setVibrancy(vibrancyForPreset(value as VibrancyPreset))
                  }
                  size="sm">
                  <SegmentedControlItem value="muted" label="Muted" />
                  <SegmentedControlItem value="balanced" label="Balanced" />
                  <SegmentedControlItem value="vibrant" label="Vibrant" />
                </SegmentedControl>
                <Slider
                  label="Vibrancy"
                  description="Fine-tune perceptual color strength"
                  value={vibrancy}
                  onChange={setVibrancy}
                  min={0}
                  max={100}
                  step={1}
                  formatValue={value => `${value}%`}
                  valueDisplay="text"
                  marks={[
                    {value: 25, label: 'Muted'},
                    {value: 50, label: 'Balanced'},
                    {value: 75, label: 'Vibrant'},
                  ]}
                />
              </VStack>

              {labView === 'themes' && (
                <VStack gap={2}>
                  <Text type="label" weight="semibold">
                    Existing theme
                  </Text>
                  <Selector
                    label="Existing theme"
                    isLabelHidden
                    value={selectedThemeId}
                    onChange={selectTheme}
                    options={THEME_REFERENCES.map(theme => ({
                      value: theme.id,
                      label: theme.name,
                    }))}
                  />
                  <Text type="supporting" color="secondary">
                    Theme comparisons use the full 21-stop reference and each
                    theme&apos;s supported mode. Matcha and Chocolate do not yet
                    publish complete tonal ramps.
                  </Text>
                  <HStack
                    gap={2}
                    vAlign="center"
                    style={{justifyContent: 'space-between'}}>
                    <Text type="supporting" color="secondary">
                      Best-fit starting point: {suggestedThemeVibrancy}%
                    </Text>
                    {vibrancy !== suggestedThemeVibrancy && (
                      <Button
                        label="Use best fit"
                        size="sm"
                        variant="ghost"
                        onClick={() => setVibrancy(suggestedThemeVibrancy)}
                      />
                    )}
                  </HStack>
                </VStack>
              )}

              {labView === 'generator' && (
                <>
                  <HStack
                    vAlign="center"
                    style={{justifyContent: 'space-between'}}>
                    <Text
                      type="supporting"
                      color="secondary"
                      style={styles.fieldLabel}>
                      Neutral
                    </Text>
                    <Selector
                      label="Neutral profile"
                      isLabelHidden
                      size="sm"
                      value={neutralProfile}
                      onChange={value =>
                        setNeutralProfile(value as NeutralProfile)
                      }
                      options={[
                        {value: 'neutral-v1', label: 'Neutral'},
                        {value: 'warm-v1', label: 'Warm'},
                        {value: 'cool-v1', label: 'Cool / blue'},
                        {value: 'custom', label: 'Use neutral seed'},
                      ]}
                    />
                  </HStack>

                  <HStack
                    vAlign="center"
                    style={{justifyContent: 'space-between'}}>
                    <Text
                      type="supporting"
                      color="secondary"
                      style={styles.fieldLabel}>
                      Modes
                    </Text>
                    <Selector
                      label="Mode strategy"
                      isLabelHidden
                      size="sm"
                      value={modeStrategy}
                      onChange={value => setModeStrategy(value as ModeStrategy)}
                      options={[
                        {value: 'light-and-dark', label: 'Light + dark'},
                        {value: 'light-only', label: 'Light only'},
                        {value: 'dark-only', label: 'Dark only'},
                      ]}
                    />
                  </HStack>

                  <VStack gap={2}>
                    <Text type="label" weight="semibold">
                      Stops
                    </Text>
                    <SegmentedControl
                      label="Stop layout"
                      value={stopPreset}
                      onChange={value => setStopPreset(value as StopPreset)}
                      size="sm">
                      <SegmentedControlItem value="full-21" label="21" />
                      <SegmentedControlItem value="compact-11" label="11" />
                      <SegmentedControlItem value="custom" label="Custom" />
                    </SegmentedControl>
                    {stopPreset === 'custom' && (
                      <TextInput
                        label="Custom stops"
                        value={customStops}
                        onChange={setCustomStops}
                        description="Comma-separated values from 0 to 100"
                        size="sm"
                      />
                    )}
                    {stopResolution.error && (
                      <Text
                        type="supporting"
                        style={{color: 'var(--color-text-red, #b42318)'}}>
                        {stopResolution.error} Showing 21-stop fallback.
                      </Text>
                    )}
                  </VStack>

                  <VStack gap={3}>
                    <HStack
                      vAlign="center"
                      style={{justifyContent: 'space-between'}}>
                      <Text type="label" weight="semibold">
                        Color families
                      </Text>
                      <IconButton
                        label="Add family"
                        variant="ghost"
                        size="sm"
                        icon={<span style={{fontSize: 16}}>+</span>}
                        onClick={() => {
                          const next = families.length + 1;
                          setFamilies(current => [
                            ...current,
                            {
                              id: `custom-${next}`,
                              name: `Color ${next}`,
                              seed: '#c44a70',
                              kind: 'chromatic',
                              anchors: [],
                            },
                          ]);
                        }}
                      />
                    </HStack>

                    {families.map(family => (
                      <VStack key={family.id} gap={2} style={styles.family}>
                        <HStack gap={2} vAlign="center">
                          <div style={{flex: 1}}>
                            <TextInput
                              label={`${family.name} family name`}
                              isLabelHidden
                              value={family.name}
                              onChange={value =>
                                updateFamily(family.id, {name: value})
                              }
                              size="sm"
                            />
                          </div>
                          <IconButton
                            label={`Remove ${family.name}`}
                            variant="ghost"
                            size="sm"
                            icon={<span aria-hidden="true">×</span>}
                            onClick={() =>
                              setFamilies(current =>
                                current.filter(item => item.id !== family.id),
                              )
                            }
                          />
                        </HStack>
                        <HStack gap={2} vAlign="center">
                          <input
                            aria-label={`${family.name} seed color`}
                            type="color"
                            value={family.seed}
                            onChange={event =>
                              updateFamily(family.id, {
                                seed: event.target.value,
                              })
                            }
                            style={{
                              width: 34,
                              height: 34,
                              border: 0,
                              padding: 0,
                            }}
                          />
                          <div style={{flex: 1}}>
                            <TextInput
                              label={`${family.name} seed`}
                              isLabelHidden
                              value={family.seed}
                              onChange={value =>
                                updateFamily(family.id, {seed: value})
                              }
                              size="sm"
                            />
                          </div>
                          <Selector
                            label={`${family.name} kind`}
                            isLabelHidden
                            size="sm"
                            value={family.kind ?? 'chromatic'}
                            onChange={value =>
                              updateFamily(family.id, {
                                kind: value as 'chromatic' | 'neutral',
                              })
                            }
                            options={[
                              {value: 'chromatic', label: 'Color'},
                              {value: 'neutral', label: 'Neutral'},
                            ]}
                          />
                        </HStack>

                        <HStack
                          gap={2}
                          vAlign="center"
                          style={{justifyContent: 'space-between'}}>
                          <Text type="supporting" color="secondary">
                            Anchors ({family.anchors.length})
                          </Text>
                          <IconButton
                            label={`Add ${family.name} anchor`}
                            variant="ghost"
                            size="sm"
                            icon={<span aria-hidden="true">+</span>}
                            onClick={() =>
                              updateFamily(family.id, {
                                anchors: [
                                  ...family.anchors,
                                  {
                                    mode: 'light',
                                    stop: nextAnchorStop(
                                      stopResolution.stops,
                                      family.anchors,
                                      'light',
                                    ),
                                    color: family.seed,
                                    policy: 'preferred',
                                    maxDeltaE: 2,
                                  },
                                ],
                              })
                            }
                          />
                        </HStack>

                        {family.anchors.map((anchor, anchorIndex) => (
                          <VStack
                            key={`${anchor.mode}-${anchor.stop}-${anchorIndex}`}
                            gap={2}
                            style={{
                              padding: 10,
                              borderRadius: 8,
                              backgroundColor:
                                'var(--color-background-secondary, #f4f4f4)',
                            }}>
                            <HStack gap={2} vAlign="center">
                              <Selector
                                label="Anchor policy"
                                size="sm"
                                value={anchor.policy}
                                onChange={value =>
                                  updateAnchor(family.id, anchorIndex, {
                                    policy: value as AnchorPolicy,
                                  })
                                }
                                options={[
                                  {value: 'exact', label: 'Exact'},
                                  {value: 'bounded', label: 'Bounded'},
                                  {value: 'preferred', label: 'Preferred'},
                                ]}
                              />
                              <IconButton
                                label={`Remove ${family.name} anchor ${anchorIndex + 1}`}
                                variant="ghost"
                                size="sm"
                                icon={<span aria-hidden="true">×</span>}
                                onClick={() =>
                                  updateFamily(family.id, {
                                    anchors: family.anchors.filter(
                                      (_, index) => index !== anchorIndex,
                                    ),
                                  })
                                }
                              />
                            </HStack>
                            <HStack gap={2} vAlign="center">
                              <TextInput
                                label="Anchor color"
                                value={anchor.color}
                                onChange={value =>
                                  updateAnchor(family.id, anchorIndex, {
                                    color: value,
                                  })
                                }
                                size="sm"
                              />
                              <NumberInput
                                label="Stop"
                                value={anchor.stop}
                                onChange={value =>
                                  updateAnchor(family.id, anchorIndex, {
                                    stop: value,
                                  })
                                }
                                min={0}
                                max={100}
                                step={5}
                                size="sm"
                              />
                            </HStack>
                            <HStack gap={2} vAlign="center">
                              <Selector
                                label="Anchor mode"
                                size="sm"
                                value={anchor.mode}
                                onChange={value =>
                                  updateAnchor(family.id, anchorIndex, {
                                    mode: value as PaletteMode,
                                  })
                                }
                                options={[
                                  {value: 'light', label: 'Light'},
                                  {value: 'dark', label: 'Dark'},
                                ]}
                              />
                              {anchor.policy === 'bounded' && (
                                <NumberInput
                                  label="Max ΔE"
                                  value={anchor.maxDeltaE}
                                  onChange={value =>
                                    updateAnchor(family.id, anchorIndex, {
                                      maxDeltaE: Math.max(0, value),
                                    })
                                  }
                                  min={0}
                                  max={20}
                                  step={0.5}
                                  size="sm"
                                />
                              )}
                            </HStack>
                          </VStack>
                        ))}
                      </VStack>
                    ))}
                  </VStack>
                </>
              )}
            </VStack>
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        <VStack gap={5}>
          {labView === 'themes' ? (
            <>
              <VStack gap={2}>
                <Heading level={1}>Existing theme comparison</Heading>
                <Text color="secondary">
                  Compare the selected Astryx theme with newly generated ramps
                  from the same source colors.
                </Text>
              </VStack>
              <ThemeComparisonView
                theme={selectedTheme}
                results={themeResults}
              />
            </>
          ) : (
            <>
              <VStack gap={2}>
                <Heading level={1}>Tonal palette decision lab</Heading>
                <Text color="secondary">
                  Compare complete recipes, preserve declared anchors, and
                  inspect light and dark output before selecting a canonical
                  algorithm.
                </Text>
              </VStack>
              <div style={styles.resultSection}>
                <VStack gap={2}>
                  <Heading level={3}>How to read this experiment</Heading>
                  <Text type="supporting" color="secondary">
                    An algorithm version names a fixed recipe. If its behavior
                    changes later, it needs a new version so existing themes do
                    not silently change.
                  </Text>
                  <Text type="supporting" color="secondary">
                    Vibrancy is hue-, tone-, and mode-aware—not one chroma
                    multiplier applied equally to every family. Exact anchors
                    must be preserved; bounded anchors may move only within the
                    stated ΔE; preferred anchors may move and report the
                    difference. Anchor corrections taper through neighboring
                    stops instead of changing one isolated swatch.
                  </Text>
                  <Text type="supporting" color="secondary">
                    Dark ramps are generated separately from light ramps. The
                    preview deliberately uses a near-white neutral instead of
                    pure white body text. Contrast and context still need
                    semantic review: a palette alone cannot guarantee
                    accessibility.
                  </Text>
                  <Text type="supporting" color="secondary">
                    Transparency and compositing are outside this generator;
                    they belong to semantic token usage and adoption guidance.
                  </Text>
                </VStack>
              </div>
              {algorithmView === 'compare' && results.length === 2 ? (
                <CompareResultView oklch={results[0]} hct={results[1]} />
              ) : (
                results.map(result => (
                  <ResultView key={result.request.algorithm} result={result} />
                ))
              )}
            </>
          )}
        </VStack>
      </main>
    </div>
  );
}
