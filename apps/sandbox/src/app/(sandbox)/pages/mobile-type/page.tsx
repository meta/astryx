// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output Mobile Type — two-pane explorer showing how the type scale adapts on touch devices
 * @position Sandbox tool page (/pages/mobile-type), fullscreen
 */

import {useState, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Stack';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Avatar} from '@astryxdesign/core/Avatar';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Selector, SelectorOption} from '@astryxdesign/core/Selector';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Switch} from '@astryxdesign/core/Switch';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Icon} from '@astryxdesign/core/Icon';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Layout, LayoutPanel, LayoutContent} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';

// =============================================================================
// Constants
// =============================================================================

const RATIO_OPTIONS = [
  {value: '1.067', label: '1.067 — Minor Second'},
  {value: '1.125', label: '1.125 — Major Second'},
  {value: '1.2', label: '1.200 — Minor Third'},
  {value: '1.25', label: '1.250 — Major Third'},
  {value: '1.333', label: '1.333 — Perfect Fourth'},
  {value: '1.414', label: '1.414 — Augmented Fourth'},
  {value: '1.5', label: '1.500 — Perfect Fifth'},
  {value: '1.618', label: '1.618 — Golden Ratio'},
];

type Mode = 'lift' | 'pin' | 'custom';

const PIN_ANCHORS = [
  {value: '6', label: 'Display 1'},
  {value: '5', label: 'Display 2'},
  {value: '4', label: 'Display 3'},
  {value: '3', label: 'Heading 1'},
  {value: '2', label: 'Heading 2'},
  {value: '1', label: 'Heading 3'},
];

/**
 * Recommended pin anchor for a given desktop ratio. Gentler scales can afford
 * to pin high (the whole ladder is close together, so pinning Display 1 barely
 * tames anything); more dramatic scales need a lower anchor so the display tier
 * doesn't tower over 16px body text on a phone.
 * - up to Major Third (≤ 1.25): pin Display 1
 * - Perfect Fourth (1.333):     pin Heading 2
 * - Aug Fourth → Golden (≥ 1.414): pin Heading 3
 */
function recommendedPinStep(ratio: number): number {
  if (ratio <= 1.25) {
    return 6; // Display 1
  }
  if (ratio < 1.414) {
    return 2; // Heading 2 (Perfect Fourth range)
  }
  return 1; // Heading 3 (Aug Fourth and above)
}

const ROLES: ReadonlyArray<{name: string; step: number}> = [
  {name: 'display-1', step: 6},
  {name: 'display-2', step: 5},
  {name: 'display-3', step: 4},
  {name: 'heading-1', step: 3},
  {name: 'heading-2', step: 2},
  {name: 'heading-3', step: 1},
  {name: 'heading-4', step: 0},
  {name: 'heading-5', step: -1},
  {name: 'heading-6', step: -2},
  {name: 'body', step: 0},
  {name: 'large', step: 1},
  {name: 'label', step: 0},
  {name: 'supporting', step: -1},
  {name: 'code', step: 0},
];

const DEFAULT_BASE = 14;
const DEFAULT_RATIO = '1.2';
const DEFAULT_MODE: Mode = 'lift';
const DEFAULT_PIN_STEP = 3;

/**
 * Tiered target line-height and 4px-grid snap, mirroring expandTypeScale's
 * computeLeading so the preview's leading matches what a shipped scale emits.
 */
function computeLeading(fontSize: number): number {
  const target = fontSize < 20 ? 1.5 : fontSize < 32 ? 1.4 : 1.25;
  const snapped = Math.max(
    Math.round((fontSize * target) / 4) * 4,
    Math.ceil((fontSize + 4) / 4) * 4,
  );
  return Math.round((snapped / fontSize) * 10000) / 10000;
}

/**
 * Build an inline style object that pins the SEMANTIC type-scale tokens to the
 * given role→px size map, so real Astryx components inside render at that scale.
 *
 * Components read the semantic tokens (--text-body-size, --text-display-3-size,
 * …). In the base theme those are `var(--font-size-*)` refs declared on :root,
 * so the browser resolves them at :root — overriding the RAW --font-size-*
 * tokens lower in the tree does nothing (the semantic token already captured
 * root's computed value). Declaring the semantic tokens directly, as literal
 * rem values, is what actually re-sizes the components. This is the token layer
 * a shipped `@media (pointer: coarse)` implementation would target.
 */
function semanticVars(sizes: Record<string, number>): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const role of ROLES) {
    const px = sizes[role.name];
    // 16px root → rem, matching expandTypeScale's pxToRem.
    vars[`--text-${role.name}-size`] = `${px / 16}rem`;
    vars[`--text-${role.name}-leading`] = `${computeLeading(px)}`;
  }
  return vars as React.CSSProperties;
}

// =============================================================================
// Type scale computation
// =============================================================================

function computeSize(base: number, ratio: number, step: number): number {
  return Math.round(base * Math.pow(ratio, step));
}

function computeDesktopSizes(
  base: number,
  ratio: number,
): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const role of ROLES) {
    sizes[role.name] = computeSize(base, ratio, role.step);
  }
  return sizes;
}

function computePinnedSizes(
  base: number,
  ratio: number,
  pinStep: number,
): Record<string, number> {
  const bottom = Math.max(16, base);
  // Re-derive the ratio so the pinned role lands back on its desktop size,
  // then rebuild the entire ladder from the floored base. The scale stays
  // smooth — body meets the 16px floor, the pinned role holds.
  const ratioPinned =
    bottom !== base && pinStep > 0
      ? ratio * Math.pow(base / bottom, 1 / pinStep)
      : ratio;

  const sizes: Record<string, number> = {};
  for (const role of ROLES) {
    sizes[role.name] = computeSize(bottom, ratioPinned, role.step);
  }
  return sizes;
}

function computeLiftedSizes(
  base: number,
  ratio: number,
): Record<string, number> {
  // Floor the base to the 16px readability minimum, then rebuild the ladder
  // using the FULL desktop ratio. Nothing is pinned — the whole scale lifts
  // together, so the display tier keeps its dramatic size differences instead
  // of being compressed by a tamed ratio.
  const bottom = Math.max(16, base);
  const sizes: Record<string, number> = {};
  for (const role of ROLES) {
    sizes[role.name] = computeSize(bottom, ratio, role.step);
  }
  return sizes;
}

/**
 * Human-readable formula describing how the mobile scale is derived, with the
 * current numbers substituted in. Shown under the Mobile column so the math is
 * self-explanatory.
 */
function mobileFormula(
  base: number,
  ratio: number,
  mode: Mode,
  adapt: boolean,
  pinStep: number,
): {title: string; formula: string; floor: string; note: string} {
  const bottom = Math.max(16, base);
  const floor =
    bottom !== base ? `Base floored ${base} → ${bottom}px` : `Base ${base}px`;
  if (!adapt) {
    return {
      title: 'No adaptation',
      formula: `size = round(${base} × ${ratio}^step)`,
      floor: `Base ${base}px`,
      note: 'Mobile matches desktop exactly.',
    };
  }
  if (mode === 'lift') {
    return {
      title: 'Lift',
      formula: `size = round(${bottom} × ${ratio}^step)`,
      floor,
      note: 'Full desktop ratio kept, so the whole ladder lifts together.',
    };
  }
  if (mode === 'pin') {
    const rp =
      bottom !== base && pinStep > 0
        ? ratio * Math.pow(base / bottom, 1 / pinStep)
        : ratio;
    const anchor =
      PIN_ANCHORS.find(a => a.value === String(pinStep))?.label ?? 'anchor';
    return {
      title: 'Pin',
      formula: `size = round(${bottom} × ${rp.toFixed(3)}^step)`,
      floor,
      note: `Ratio re-derived (${ratio} → ${rp.toFixed(3)}) so ${anchor} holds its desktop size — the top of the scale eases off, no ceiling clamp.`,
    };
  }
  return {
    title: 'Custom',
    formula: 'size = per-role override',
    floor,
    note: 'Each role is set by hand.',
  };
}

function readableName(role: string): string {
  return role
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Default font weight per role, matching the DEFAULT_HEADING_WEIGHTS and
 * DEFAULT_TEXT_WEIGHTS in @astryxdesign/core's expandTypeScale:
 *   headings 1–6 → semibold (600)
 *   large        → semibold (600)
 *   label        → medium   (500)
 *   body/code/supporting/display-* → normal (400)
 */
function roleWeight(role: string): number {
  if (role.startsWith('heading') || role === 'large') {
    return 600;
  }
  if (role === 'label') {
    return 500;
  }
  return 400;
}

function getSampleText(role: string): string {
  if (role.startsWith('display')) {
    return 'Astryx';
  }
  if (role.startsWith('heading')) {
    return 'The quick brown fox';
  }
  if (role === 'code') {
    return 'const theme = defineTheme()';
  }
  return 'The quick brown fox jumps over the lazy dog';
}

// =============================================================================
// Demo content — real Astryx components across text sizes
// =============================================================================

/**
 * A realistic marketing/product card built from real Astryx components,
 * exercising a range of text roles: display eyebrow, heading, body, labels,
 * badges, avatar metadata, and buttons. Because it uses real components, it
 * automatically picks up whatever font-size tokens are in scope.
 */
function ProductCard() {
  return (
    <Card padding={5}>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center" justify="between">
          <Badge variant="green" label="New" />
          <Text type="supporting" color="secondary">
            v2.4 · Design system
          </Text>
        </HStack>

        {/* Display tier — the roles most affected by anchor changes. */}
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            {'ASTRYX · TYPOGRAPHY'}
          </Text>
          <Text type="display-1">Scale</Text>
          <Text type="display-3">Type that scales</Text>
        </VStack>

        <VStack gap={2}>
          <Heading level={1}>Design at every scale</Heading>
          <Text type="large" color="secondary">
            One type scale, tuned for touch.
          </Text>
        </VStack>

        <Text type="body" color="secondary">
          Astryx gives your team a shared visual language with flexible tokens,
          accessible components, and a type scale that responds to every device
          — from a dense desktop table to a phone in one hand.
        </Text>

        <Divider />

        <VStack gap={2}>
          <Heading level={4}>What&apos;s included</Heading>
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Icon icon="check" size="sm" color="green" />
              <Text type="body">Capability-based mobile adaptation</Text>
            </HStack>
            <HStack gap={2} vAlign="center">
              <Icon icon="check" size="sm" color="green" />
              <Text type="body">Readable 16px input floor</Text>
            </HStack>
            <HStack gap={2} vAlign="center">
              <Icon icon="check" size="sm" color="green" />
              <Text type="body">Zero desktop change</Text>
            </HStack>
          </VStack>
        </VStack>

        <Divider />

        {/* An input — demonstrates the 16px touch floor in context. */}
        <TextInput
          label="Email"
          placeholder="you@example.com"
          value=""
          onChange={() => {}}
        />

        <HStack gap={3} vAlign="center" justify="between">
          <HStack gap={2} vAlign="center">
            <Avatar name="Ada Lovelace" size="sm" />
            <VStack gap={0}>
              <Text type="label">Ada Lovelace</Text>
              <Text type="supporting" color="secondary">
                Maintainer
              </Text>
            </VStack>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Button label="Docs" variant="secondary" size="sm" />
            <Button label="Get started" variant="primary" size="sm" />
          </HStack>
        </HStack>

        <Text type="code">npm install @astryxdesign/core</Text>
      </VStack>
    </Card>
  );
}

/**
 * A phone-shaped frame. The caller applies the mobile scale via semanticVars on
 * the screen wrapper, so real components inside render at that scale.
 */
function PhoneFrame({
  style,
  children,
}: {
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.phoneOuter)}>
      <div {...stylex.props(styles.phoneNotch)} />
      <div {...stylex.props(styles.phoneScreen)} style={style}>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function MobileTypePage() {
  const base = DEFAULT_BASE;
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [adapt, setAdapt] = useState(true);
  const [pinStep, setPinStep] = useState(DEFAULT_PIN_STEP);
  const [customOverrides, setCustomOverrides] = useState<
    Record<string, number>
  >({});

  const ratioNum = Number(ratio);

  const formula = useMemo(
    () => mobileFormula(base, ratioNum, mode, adapt, pinStep),
    [base, ratioNum, mode, adapt, pinStep],
  );

  const recommendedStep = recommendedPinStep(ratioNum);

  const desktopSizes = useMemo(
    () => computeDesktopSizes(base, ratioNum),
    [base, ratioNum],
  );

  const pinnedSizes = useMemo(
    () => computePinnedSizes(base, ratioNum, pinStep),
    [base, ratioNum, pinStep],
  );

  const liftedSizes = useMemo(
    () => computeLiftedSizes(base, ratioNum),
    [base, ratioNum],
  );

  const mobileSizes = useMemo(() => {
    if (!adapt) {
      return desktopSizes;
    }
    if (mode === 'lift') {
      return liftedSizes;
    }
    if (mode === 'pin') {
      return pinnedSizes;
    }
    const sizes: Record<string, number> = {};
    for (const role of ROLES) {
      sizes[role.name] = customOverrides[role.name] ?? pinnedSizes[role.name];
    }
    return sizes;
  }, [adapt, mode, desktopSizes, liftedSizes, pinnedSizes, customOverrides]);

  return (
    <div style={{position: 'fixed', inset: 0, display: 'flex'}}>
      <Layout
        height="fill"
        xstyle={styles.layoutFill}
        start={
          <LayoutPanel width={340} hasDivider padding={4}>
            <VStack gap={5}>
              {/* Header */}
              <VStack gap={1}>
                <Heading level={3}>Mobile Type</Heading>
                <Text type="supporting" color="secondary">
                  How the type scale adapts on touch devices.
                </Text>
              </VStack>

              <Divider />

              {/* Desktop reference scale */}
              <VStack gap={1}>
                <HStack gap={1} vAlign="center">
                  <Text type="label" color="secondary">
                    Desktop scale
                  </Text>
                  <Tooltip content="The fixed source scale you're adapting from. Every role = round(base × ratio^step). Desktop never changes — only mobile adapts.">
                    <Icon icon="info" size="sm" color="secondary" />
                  </Tooltip>
                </HStack>
                <Selector
                  label="Type Scale ratio"
                  isLabelHidden
                  size="sm"
                  placeholder="Select ratio"
                  controlXstyle={styles.fullWidth}
                  options={RATIO_OPTIONS}
                  value={ratio}
                  onChange={(v: string) => setRatio(v)}
                />
              </VStack>

              <Divider />

              {/* Mobile adaptation */}
              <VStack gap={3}>
                <Switch
                  label="Mobile adaptation"
                  description="Adjust the scale on touch devices. Off = mobile matches desktop exactly."
                  value={adapt}
                  onChange={setAdapt}
                  labelPosition="start"
                  labelSpacing="spread"
                />

                {adapt && (
                  <SegmentedControl
                    label="Adaptation strategy"
                    size="sm"
                    layout="fill"
                    value={mode}
                    onChange={(v: string) => setMode(v as Mode)}>
                    <SegmentedControlItem value="lift" label="Lift" />
                    <SegmentedControlItem value="pin" label="Pin" />
                    <SegmentedControlItem value="custom" label="Custom" />
                  </SegmentedControl>
                )}
              </VStack>

              {/* Mode-dependent controls */}
              {adapt && mode === 'lift' && (
                <Text type="supporting" color="secondary">
                  Body floors to 16px and the whole ladder lifts with it,
                  keeping the full desktop ratio. Nothing is pinned — the
                  display tier stays large and dramatic.
                </Text>
              )}

              {adapt && mode === 'pin' && (
                <VStack gap={1}>
                  <HStack gap={1} vAlign="center">
                    <Text type="label" color="secondary">
                      Pin anchor
                    </Text>
                    <Tooltip content="When body is floored to 16px, the whole ladder shifts. The pinned role is re-derived back to its desktop size, so it keeps its character; everything else follows the scale.">
                      <Icon icon="info" size="sm" color="secondary" />
                    </Tooltip>
                  </HStack>
                  <Selector
                    label="Pin anchor"
                    isLabelHidden
                    size="sm"
                    controlXstyle={styles.fullWidth}
                    options={PIN_ANCHORS}
                    value={String(pinStep)}
                    onChange={(v: string) => setPinStep(Number(v))}
                    renderOption={option => (
                      <SelectorOption
                        label={option.label ?? option.value}
                        endContent={
                          option.value === String(recommendedStep) ? (
                            <Badge variant="blue" label="Recommended" />
                          ) : undefined
                        }
                      />
                    )}
                  />
                  {pinStep !== recommendedStep && (
                    <HStack gap={1} vAlign="center">
                      <Text type="supporting" color="secondary">
                        Recommended for this scale:{' '}
                        {PIN_ANCHORS.find(
                          a => a.value === String(recommendedStep),
                        )?.label ?? ''}
                      </Text>
                      <Button
                        variant="ghost"
                        size="sm"
                        label="Use"
                        onClick={() => setPinStep(recommendedStep)}
                      />
                    </HStack>
                  )}
                </VStack>
              )}

              {adapt && mode === 'custom' && (
                <VStack gap={2}>
                  <HStack justify="between" vAlign="center">
                    <Text type="label" color="secondary">
                      Mobile sizes
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      label="Reset"
                      onClick={() => setCustomOverrides({})}
                    />
                  </HStack>
                  {ROLES.map(role => (
                    <HStack
                      key={role.name}
                      gap={3}
                      vAlign="center"
                      justify="between">
                      <StackItem size="fill" xstyle={styles.tokenLabel}>
                        <Text type="body" maxLines={1}>
                          {readableName(role.name)}
                        </Text>
                      </StackItem>
                      <NumberInput
                        label={readableName(role.name)}
                        isLabelHidden
                        size="sm"
                        units="px"
                        min={8}
                        max={200}
                        step={1}
                        value={
                          customOverrides[role.name] ?? pinnedSizes[role.name]
                        }
                        onChange={(v: number) => {
                          setCustomOverrides(prev => ({
                            ...prev,
                            [role.name]: v,
                          }));
                        }}
                      />
                    </HStack>
                  ))}
                </VStack>
              )}

              {adapt && (
                <>
                  <Divider />
                  <HStack gap={1} vAlign="start">
                    <Icon icon="info" size="sm" color="secondary" />
                    <Text type="supporting" color="secondary">
                      Astryx inputs already jump to 16px under{' '}
                      <code style={{fontFamily: 'monospace'}}>
                        @media (pointer: coarse)
                      </code>{' '}
                      to block mobile zoom-on-focus. Flooring body to match
                      keeps text and inputs on one scale.
                    </Text>
                  </HStack>
                </>
              )}
            </VStack>
          </LayoutPanel>
        }
        content={
          <LayoutContent padding={0}>
            <div {...stylex.props(styles.previewPane)}>
              <div {...stylex.props(styles.previewInner)}>
                <VStack gap={5}>
                  {/* Device columns */}
                  <Grid columns={2} gap={4}>
                    {/* Desktop card */}
                    <Card>
                      <VStack gap={3}>
                        <Text type="label" weight="semibold">
                          Desktop
                        </Text>
                        <VStack gap={0.5}>
                          {ROLES.map(role => {
                            const px = desktopSizes[role.name];
                            return (
                              <div
                                key={role.name}
                                {...stylex.props(styles.roleRow)}>
                                <span {...stylex.props(styles.roleLabel)}>
                                  {readableName(role.name)}
                                </span>
                                <span {...stylex.props(styles.pxCell)}>
                                  {px}
                                </span>
                                <div
                                  {...stylex.props(styles.sampleText)}
                                  style={{
                                    fontSize: px,
                                    fontWeight: roleWeight(role.name),
                                    fontFamily:
                                      role.name === 'code'
                                        ? 'monospace'
                                        : undefined,
                                  }}>
                                  {getSampleText(role.name)}
                                </div>
                              </div>
                            );
                          })}
                        </VStack>
                      </VStack>
                    </Card>

                    {/* Mobile card */}
                    <Card>
                      <VStack gap={3}>
                        <VStack gap={0.5}>
                          <HStack gap={2} vAlign="center" justify="between">
                            <HStack gap={2} vAlign="center">
                              <Text type="label" weight="semibold">
                                Mobile
                              </Text>
                              <Text type="supporting" color="secondary">
                                {formula.floor}
                              </Text>
                            </HStack>
                            <span {...stylex.props(styles.formulaInline)}>
                              {formula.formula}
                            </span>
                          </HStack>
                        </VStack>
                        <VStack gap={0.5}>
                          {ROLES.map(role => {
                            const mPx = mobileSizes[role.name];
                            const dPx = desktopSizes[role.name];
                            const delta = mPx - dPx;
                            const changed = delta !== 0;
                            return (
                              <div
                                key={role.name}
                                {...stylex.props(styles.roleRow)}>
                                <span {...stylex.props(styles.roleLabel)}>
                                  {readableName(role.name)}
                                </span>
                                <span {...stylex.props(styles.pxCell)}>
                                  {mPx}
                                  {changed && (
                                    <span {...stylex.props(styles.delta)}>
                                      {delta > 0
                                        ? ` +${delta}`
                                        : ` −${Math.abs(delta)}`}
                                    </span>
                                  )}
                                </span>
                                <div
                                  {...stylex.props(styles.sampleText)}
                                  style={{
                                    fontSize: mPx,
                                    fontWeight: roleWeight(role.name),
                                    fontFamily:
                                      role.name === 'code'
                                        ? 'monospace'
                                        : undefined,
                                  }}>
                                  {getSampleText(role.name)}
                                </div>
                              </div>
                            );
                          })}
                        </VStack>
                      </VStack>
                    </Card>
                  </Grid>

                  {/* Real content — real components at the two scales */}
                  <VStack gap={2}>
                    <Text type="label" color="secondary">
                      Real components
                    </Text>
                    <div {...stylex.props(styles.realGrid)}>
                      {/* Desktop — components at the desktop scale */}
                      <VStack gap={2}>
                        <Text type="label" weight="semibold">
                          Desktop
                        </Text>
                        <div style={semanticVars(desktopSizes)}>
                          <ProductCard />
                        </div>
                      </VStack>

                      {/* Mobile — same components inside a phone frame at the
                      adapted scale */}
                      <VStack gap={2} hAlign="center">
                        <Text type="label" weight="semibold">
                          Mobile
                        </Text>
                        <PhoneFrame style={semanticVars(mobileSizes)}>
                          <ProductCard />
                        </PhoneFrame>
                      </VStack>
                    </div>
                  </VStack>
                </VStack>
              </div>
            </div>
          </LayoutContent>
        }
      />
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  layoutFill: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
  tokenLabel: {
    minWidth: 0,
  },
  previewPane: {
    padding: 'var(--spacing-6)',
    backgroundColor: 'var(--color-background-muted)',
    height: '100%',
    overflowY: 'auto',
  },
  previewInner: {
    width: '100%',
    maxWidth: 1100,
    marginInline: 'auto',
  },
  roleRow: {
    display: 'grid',
    gridTemplateColumns: '96px 72px 1fr',
    columnGap: 16,
    alignItems: 'baseline',
    paddingBlock: 4,
  },
  roleLabel: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  pxCell: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#888',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  sampleText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    minWidth: 0,
    paddingInlineStart: 48,
  },
  formulaInline: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
  delta: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 600,
    color: 'var(--color-icon-blue)',
    whiteSpace: 'nowrap',
  },
  realGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 'var(--spacing-6)',
    alignItems: 'start',
  },
  // Phone frame — a device-shaped shell (390×844, iPhone-ish) so the mobile
  // column reads as an actual handset rather than a second desktop card. The
  // screen scrolls internally when content exceeds the viewport height.
  phoneOuter: {
    position: 'relative',
    width: 390,
    height: 844,
    flexShrink: 0,
    backgroundColor: 'var(--color-background-body)',
    borderWidth: 10,
    borderStyle: 'solid',
    borderColor: '#111',
    borderRadius: 44,
    overflow: 'hidden',
  },
  phoneNotch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 150,
    height: 24,
    backgroundColor: '#111',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    zIndex: 2,
  },
  phoneScreen: {
    height: '100%',
    overflowY: 'auto',
    padding: 'var(--spacing-4)',
    paddingTop: 'var(--spacing-7)',
    backgroundColor: 'var(--color-background-body)',
  },
});
