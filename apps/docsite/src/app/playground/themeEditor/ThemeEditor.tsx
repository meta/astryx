// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThemeEditor.tsx
 * @input optional seed theme + the playground's light/dark mode
 * @output the theme editor's left-panel content (tab strip + scrollable body)
 * @position Playground — the Theme tab's editor, rendered in the left panel.
 *
 * A self-contained theme editor: it owns the token + scale state, renders the
 * Theme/Components/Tokens tab strip and body, and reports the composed theme upward
 * via onThemeChange so the playground can push it to the live preview iframe.
 */

'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {VStack, StackItem} from '@astryxdesign/core/Stack';
import {
  defineTheme,
  expandTypeScale,
  expandRadiusScale,
  colorDefaults,
  spacingDefaults,
  radiusDefaults,
  typographyDefaults,
  textSizeDefaults,
  fontWeightDefaults,
  typeScaleDefaults,
  sizeDefaults,
  shadowDefaults,
  durationDefaults,
  easeDefaults,
} from '@astryxdesign/core/theme';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import {BaseStylesPanel} from './BaseStylesPanel';
import {ComponentTokensPanel} from './ComponentTokensPanel';
import type {CustomOverride} from './ComponentTokensPanel';
import {RawTokensPanel} from './RawTokensPanel';
import {
  UNIFIED_PRESETS,
  COMPONENT_VAR_NAMES,
  GOOGLE_FONTS_URL,
} from './constants';
import {
  buildComponentOverrides,
  buildSpacingScale,
  mergeComponentStyleMaps,
} from './helpers';

const s = stylex.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--spacing-4)',
  },
});

const ALL_DEFAULTS: Record<string, string> = {
  ...colorDefaults,
  ...spacingDefaults,
  ...radiusDefaults,
  ...typographyDefaults,
  ...textSizeDefaults,
  ...fontWeightDefaults,
  ...typeScaleDefaults,
  ...sizeDefaults,
  ...shadowDefaults,
  ...durationDefaults,
  ...easeDefaults,
};

interface ThemeEditorProps {
  /** Light/dark mode, owned by the playground so editor + preview stay in sync. */
  mode: 'light' | 'dark';
  /** Optional theme to seed the editor's token + component state from. */
  initialTheme?: DefinedTheme;
  /** Called whenever the composed theme changes so the parent can apply it. */
  onThemeChange: (theme: DefinedTheme) => void;
}

export function ThemeEditor({
  mode,
  initialTheme,
  onThemeChange,
}: ThemeEditorProps) {
  const [tokens, setTokens] = useState<Record<string, string>>(() => ({
    ...ALL_DEFAULTS,
    ...initialTheme?.tokens,
  }));
  // Component-level overrides from the seeded theme. Kept separate from token
  // state so they form the base layer that token + custom overrides compose on.
  const [baseComponents] = useState<Record<string, unknown>>(
    () => initialTheme?.components ?? {},
  );
  const [panelTab, setPanelTab] = useState<'theme' | 'components' | 'tokens'>(
    'theme',
  );
  const [typeScaleBase, setTypeScaleBase] = useState(14);
  const [typeScaleRatio, setTypeScaleRatio] = useState(1.2);
  const [radiusBase, setRadiusBase] = useState(4);
  const [spacingBase, setSpacingBase] = useState(4);
  const [sizeBase, setSizeBase] = useState(32);
  const [durationStep, setDurationStep] = useState(1);
  // A unified preset is only "active" once the user explicitly applies one.
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customOverrides, setCustomOverrides] = useState<CustomOverride[]>([]);

  const currentTheme = useMemo(() => {
    const coreTokens: Record<string, string> = {};
    const componentTokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(tokens)) {
      if (COMPONENT_VAR_NAMES.has(key)) {
        componentTokens[key] = value;
      } else {
        coreTokens[key] = value;
      }
    }
    const customMap: Record<string, {base: Record<string, string>}> = {};
    for (const override of customOverrides) {
      customMap[override.component] ??= {base: {}};
      customMap[override.component].base[override.property] = override.value;
    }
    // Layer order: seeded component overrides (base) → token-derived overrides
    // → freeform custom overrides. Later layers win at the leaf level.
    const components = mergeComponentStyleMaps(
      baseComponents,
      buildComponentOverrides(componentTokens),
      customMap,
    ) as DefinedTheme['components'];
    return defineTheme({name: 'custom', tokens: coreTokens, components});
  }, [tokens, customOverrides, baseComponents]);

  // Report the composed theme upward so the playground can push it to the
  // preview iframe whenever tokens or overrides change.
  useEffect(() => {
    onThemeChange(currentTheme);
  }, [currentTheme, onThemeChange]);

  const handleTokenChange = useCallback((name: string, value: string) => {
    setTokens(prev => ({...prev, [name]: value}));
  }, []);

  const applyTypeScale = useCallback((base: number, ratio: number) => {
    setActivePreset(null);
    setTypeScaleBase(base);
    setTypeScaleRatio(ratio);
    setTokens(prev => ({...prev, ...expandTypeScale({base, ratio})}));
  }, []);

  const applySpacingScale = useCallback((base: number) => {
    setActivePreset(null);
    setSpacingBase(base);
    setTokens(prev => ({...prev, ...buildSpacingScale(base)}));
  }, []);

  const applySizeScale = useCallback((base: number) => {
    setActivePreset(null);
    setSizeBase(base);
    setTokens(prev => ({
      ...prev,
      '--size-element-sm': `${base - 4}px`,
      '--size-element-md': `${base}px`,
      '--size-element-lg': `${base + 4}px`,
    }));
  }, []);

  const applyRadiusScale = useCallback((base: number) => {
    setActivePreset(null);
    setRadiusBase(base);
    setTokens(prev => ({
      ...prev,
      ...expandRadiusScale({base, multiplier: 1}),
    }));
  }, []);

  const applyDurationScale = useCallback((multiplier: number) => {
    setDurationStep(multiplier);
    const defaults: Record<string, number> = {
      '--duration-fast-min': 130,
      '--duration-fast': 175,
      '--duration-fast-max': 230,
      '--duration-medium-min': 310,
      '--duration-medium': 410,
      '--duration-medium-max': 550,
      '--duration-slow-min': 730,
      '--duration-slow': 975,
      '--duration-slow-max': 1300,
    };
    const patch: Record<string, string> = {};
    for (const [key, base] of Object.entries(defaults)) {
      patch[key] = `${Math.round(base / multiplier)}ms`;
    }
    setTokens(prev => ({...prev, ...patch}));
  }, []);

  const applyUnifiedPreset = useCallback((presetKey: string) => {
    const p = UNIFIED_PRESETS[presetKey as keyof typeof UNIFIED_PRESETS];
    if (!p) {
      return;
    }
    setActivePreset(presetKey);
    setTypeScaleBase(p.typeBase);
    setTypeScaleRatio(p.typeRatio);
    setSpacingBase(p.spacing);
    setRadiusBase(p.radius);
    setSizeBase(p.sizeMd);
    setTokens(prev => ({
      ...prev,
      ...expandTypeScale({base: p.typeBase, ratio: p.typeRatio}),
      ...buildSpacingScale(p.spacing),
      ...expandRadiusScale({base: p.radius, multiplier: 1}),
      '--size-element-sm': `${p.sizeMd - p.spacing}px`,
      '--size-element-md': `${p.sizeMd}px`,
      '--size-element-lg': `${p.sizeMd + p.spacing}px`,
    }));
  }, []);

  return (
    <VStack xstyle={s.root}>
      {/* Self-load theme fonts so the editor's controls render in the loaded
          theme's typeface even when used standalone. */}
      <style>{`@import url("${GOOGLE_FONTS_URL}");`}</style>
      <TabList
        hasDivider
        value={panelTab}
        onChange={v => setPanelTab(v as 'theme' | 'components' | 'tokens')}>
        <Tab value="theme" label="Base Styles" />
        <Tab value="components" label="Components" />
        <Tab value="tokens" label="Advanced" />
      </TabList>

      <StackItem size="fill" xstyle={s.body}>
        {panelTab === 'theme' && (
          <BaseStylesPanel
            tokens={tokens}
            mode={mode}
            typeScaleBase={typeScaleBase}
            typeScaleRatio={typeScaleRatio}
            radiusBase={radiusBase}
            spacingBase={spacingBase}
            sizeBase={sizeBase}
            durationStep={durationStep}
            activePreset={activePreset}
            onTokenChange={handleTokenChange}
            onApplyTypeScale={applyTypeScale}
            onApplyRadiusScale={applyRadiusScale}
            onApplySpacingScale={applySpacingScale}
            onApplySizeScale={applySizeScale}
            onApplyDurationScale={applyDurationScale}
            onApplyUnifiedPreset={applyUnifiedPreset}
          />
        )}
        {panelTab === 'components' && (
          <ComponentTokensPanel
            tokens={tokens}
            onTokenChange={handleTokenChange}
            customOverrides={customOverrides}
            onCustomOverridesChange={setCustomOverrides}
            baseComponents={baseComponents}
          />
        )}
        {panelTab === 'tokens' && (
          <RawTokensPanel
            tokens={tokens}
            mode={mode}
            onTokenChange={handleTokenChange}
          />
        )}
      </StackItem>
    </VStack>
  );
}
