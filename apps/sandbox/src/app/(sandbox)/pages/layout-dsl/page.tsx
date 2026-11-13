// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sandbox page for XLE/XLO layout expressions (the "Layout DSL").
 *
 * Type a compressed layout expression (compact XLE or indented outline XLO),
 * see it live-validated against the @astryxdesign/core registry shipped as a
 * build-time JSON, watch the expanded TSX with input/output token counts,
 * browse a searchable example library, and copy the expanded TSX to the
 * clipboard. The whole pipeline runs in-browser via the pure
 * @astryxdesign/cli/xle barrel.
 *
 * Ported from the docsite Playground's "Layout DSL" tab so the layout grammar
 * has a standalone home in the component sandbox.
 *
 * @input  user-typed expression
 * @output validity/errors, token metrics, live expanded TSX, example browser
 */

'use client';

import {useEffect, useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack, HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Banner} from '@astryxdesign/core/Banner';
import {checkExpression, expandExpression} from '@astryxdesign/cli/xle';
import xleData from '@/generated/xle-registry.json';
import {XLE_EXAMPLES, XLE_CATEGORIES} from './xleExamples';

type Surface = 'auto' | 'compact' | 'outline';

/** Heuristic fallback used until the BPE tokenizer loads (or if it can't). */
function heuristicTokens(src: string): number {
  return (src.match(/\w+|[^\s\w]/g) || []).length;
}

/**
 * Loads the build-time tokenizer module from public/xle-tokenizer.mjs
 * (esbuild-bundled gpt-tokenizer o200k_base, or a heuristic fallback — see
 * scripts/generate-xle-tokenizer.mjs). Loaded by URL with Vite's dynamic
 * import analysis disabled; the build never needs gpt-tokenizer installed.
 * The inline heuristic runs until that module loads. The Vite base path keeps
 * the asset reachable at /sandbox/ and during root-local development.
 */
type TokenizerModule = {countTokens: (s: string) => number; ENCODER: string};
const TOKENIZER_URL = `${import.meta.env.BASE_URL}xle-tokenizer.mjs`;

function useTokenCounter() {
  const [bpe, setBpe] = useState<((s: string) => number) | null>(null);
  const [encoder, setEncoder] = useState('est.');
  useEffect(() => {
    let alive = true;
    (import(/* @vite-ignore */ TOKENIZER_URL) as Promise<TokenizerModule>)
      .then(m => {
        if (!alive) {
          return;
        }
        setBpe(() => (s: string) => m.countTokens(s));
        setEncoder(m.ENCODER || 'o200k_base');
      })
      .catch(() => {
        /* keep heuristic */
      });
    return () => {
      alive = false;
    };
  }, []);
  return {count: bpe ?? heuristicTokens, encoder: bpe ? encoder : 'est.'};
}

const s = stylex.create({
  page: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 'var(--spacing-6)',
    gap: 'var(--spacing-4)',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 880,
    marginInline: 'auto',
    width: '100%',
  },
  editor: {
    width: '100%',
    minHeight: 120,
    resize: 'vertical',
    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
    fontSize: 'var(--text-sm, 13px)',
    lineHeight: 1.6,
    padding: 'var(--spacing-3)',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-base)',
    color: 'var(--color-content-primary)',
    tabSize: 2,
  },
  metrics: {
    display: 'flex',
    gap: 'var(--spacing-2)',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  metric: {
    flex: 1,
    minWidth: 96,
    padding: 'var(--spacing-2)',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  metricValue: {fontVariantNumeric: 'tabular-nums'},
  source: {
    whiteSpace: 'pre',
    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
    fontSize: 'var(--text-xsm, 12px)',
    color: 'var(--color-content-primary)',
    backgroundColor: 'var(--color-background-base)',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: 'var(--spacing-3)',
    margin: 0,
    maxHeight: 360,
    overflow: 'auto',
  },
  echo: {
    whiteSpace: 'pre-wrap',
    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
    fontSize: 'var(--text-xsm, 12px)',
    color: 'var(--color-content-secondary)',
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-inner)',
    padding: 'var(--spacing-2)',
    margin: 0,
    overflowX: 'auto',
  },
  errorRow: {
    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
    fontSize: 'var(--text-xsm, 12px)',
  },
  search: {
    width: '100%',
    padding: 'var(--spacing-2)',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-base)',
    color: 'var(--color-content-primary)',
    fontSize: 'var(--text-sm, 13px)',
  },
  browser: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-inner)',
    maxHeight: 320,
    overflowY: 'auto',
  },
  catHeader: {
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--color-background-muted)',
    paddingBlock: 'var(--spacing-1)',
    paddingInline: 'var(--spacing-2)',
    fontSize: 'var(--text-2xs, 10px)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-content-secondary)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--spacing-2)',
    width: '100%',
    textAlign: 'start',
    paddingBlock: 'var(--spacing-1)',
    paddingInline: 'var(--spacing-2)',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-hover, var(--color-background-muted))',
    },
    cursor: 'pointer',
    color: 'var(--color-content-primary)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border-subtle, var(--color-border))',
  },
  rowActive: {
    backgroundColor:
      'var(--color-background-active, var(--color-background-muted))',
  },
  rowLabel: {fontSize: 'var(--text-sm, 13px)', fontWeight: 600},
  rowExpr: {
    fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
    fontSize: 'var(--text-2xs, 11px)',
    color: 'var(--color-content-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  rowTok: {
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 'var(--text-2xs, 11px)',
    color: 'var(--color-content-secondary)',
  },
  min0: {minWidth: 0},
});

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div {...stylex.props(s.metric)}>
      <Text type="supporting">{label}</Text>
      <Text weight="semibold" xstyle={s.metricValue}>
        {value}
      </Text>
      {sub && <Text type="supporting">{sub}</Text>}
    </div>
  );
}

export default function LayoutDSLPage() {
  const [expr, setExpr] = useState(XLE_EXAMPLES[0].expr);
  // 'surface' is the displayed dialect; parsing is always auto-detected, so a
  // compact expression never "fails" just because Outline is selected.
  const [surface, setSurface] = useState<Surface>('auto');
  const [query, setQuery] = useState('');
  const [activeLabel, setActiveLabel] = useState(XLE_EXAMPLES[0].label);
  const [copied, setCopied] = useState(false);
  const {count: countTokens, encoder} = useTokenCounter();

  const check = useMemo(
    () =>
      checkExpression(expr, xleData.registry, {
        blocks: xleData.blocks,
        form: 'auto',
      }),
    [expr],
  );

  const valid = check.ok && check.valid;

  const expanded = useMemo(
    () =>
      valid
        ? expandExpression(expr, xleData.registry, {
            blocks: xleData.blocks,
            form: 'auto',
            name: 'PlaygroundLayout',
          })
        : null,
    [expr, valid],
  );

  const inTokens = countTokens(expr);
  const outCode = expanded?.ok ? expanded.code : '';
  const outTokens = outCode ? countTokens(outCode) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return XLE_EXAMPLES;
    }
    return XLE_EXAMPLES.filter(
      e =>
        e.label.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.expr.toLowerCase().includes(q),
    );
  }, [query]);

  // Switching the dialect converts the current expression to that surface
  // (using the canonical printers) rather than forcing a mismatched parse.
  const switchSurface = (next: Surface) => {
    setSurface(next);
    if (next === 'auto') {
      return;
    }
    const c = checkExpression(expr, xleData.registry, {
      blocks: xleData.blocks,
      form: 'auto',
    });
    if (c.ok && c.valid) {
      const converted = next === 'compact' ? c.compact : c.outline;
      if (converted) {
        setExpr(converted);
      }
    }
  };

  const pick = (label: string, exprText: string) => {
    setActiveLabel(label);
    setExpr(exprText);
    setSurface('auto'); // examples carry their own surface; let auto-detect handle it
  };

  const copyCode = () => {
    if (!expanded?.ok) {
      return;
    }
    void navigator.clipboard?.writeText(expanded.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div {...stylex.props(s.page)}>
      <VStack gap={1}>
        <Heading level={2}>Layout DSL</Heading>
        <Text type="supporting">
          Write a compressed layout expression (compact XLE or indented outline
          XLO). It is validated live against @astryxdesign/core; the expanded
          TSX and token counts update below. The whole pipeline runs in-browser
          via the @astryxdesign/cli/xle barrel.
        </Text>
      </VStack>

      <SegmentedControl
        label="Surface"
        size="sm"
        value={surface}
        onChange={v => v && switchSurface(v as Surface)}>
        <SegmentedControlItem value="auto" label="Auto" />
        <SegmentedControlItem value="compact" label="Compact (XLE)" />
        <SegmentedControlItem value="outline" label="Outline (XLO)" />
      </SegmentedControl>

      <textarea
        {...stylex.props(s.editor)}
        value={expr}
        spellCheck={false}
        onChange={e => setExpr(e.target.value)}
        aria-label="Layout expression"
      />

      <HStack gap={2} align="center">
        <Button
          variant="primary"
          size="sm"
          label={copied ? 'Copied!' : 'Copy expanded TSX'}
          isDisabled={!valid}
          onClick={copyCode}
        />
        <Badge
          variant={valid ? 'success' : 'error'}
          label={
            check.ok
              ? valid
                ? `Valid · ${check.form}`
                : `${check.errors.length} error${check.errors.length === 1 ? '' : 's'}`
              : 'Parse error'
          }
        />
        {valid && check.warnings.length > 0 && (
          <Badge variant="warning" label={`${check.warnings.length} warning`} />
        )}
      </HStack>

      {/* Token economics (BPE via gpt-tokenizer o200k_base; 'est.' until loaded) */}
      <div {...stylex.props(s.metrics)}>
        <Metric
          label={`XLE input · ${encoder}`}
          value={`${inTokens} tok`}
          sub={`${expr.length} chars`}
        />
        <Metric
          label={`Output TSX · ${encoder}`}
          value={`${outTokens} tok`}
          sub={outCode ? `${outCode.length} chars` : '—'}
        />
        <Metric
          label="Expansion"
          value={
            inTokens > 0 && outTokens > 0
              ? `${(outTokens / inTokens).toFixed(1)}×`
              : '—'
          }
          sub="output ÷ input"
        />
      </div>

      {!valid && check.errors.length > 0 && (
        <VStack gap={1}>
          {check.errors.map((e, i) => (
            <Banner
              key={i}
              status="error"
              title={
                <span {...stylex.props(s.errorRow)}>
                  {e.formatted}
                  {e.suggestions && e.suggestions.length > 0
                    ? ` — did you mean: ${e.suggestions.join(', ')}?`
                    : ''}
                </span>
              }
            />
          ))}
        </VStack>
      )}

      {valid && expanded?.ok && (
        <VStack gap={1}>
          <HStack gap={2} align="center">
            <Text type="label">Rendered source (TSX)</Text>
            {expanded.componentsUsed.length > 0 && (
              <Text type="supporting">
                {expanded.componentsUsed.length} components
                {expanded.states ? ` · ${expanded.states} state hooks` : ''}
                {expanded.todos.length
                  ? ` · ${expanded.todos.length} TODO`
                  : ''}
              </Text>
            )}
          </HStack>
          <pre {...stylex.props(s.source)}>{expanded.code}</pre>
        </VStack>
      )}

      {valid && (
        <VStack gap={1}>
          <Text type="label">Canonical forms</Text>
          <pre
            {...stylex.props(
              s.echo,
            )}>{`compact:\n${check.compact}\n\noutline:\n${check.outline}`}</pre>
        </VStack>
      )}

      {/* Example browser */}
      <VStack gap={1}>
        <HStack gap={2} align="center" justify="between">
          <Text type="label">Examples</Text>
          <Text type="supporting">
            {filtered.length} of {XLE_EXAMPLES.length}
          </Text>
        </HStack>
        <input
          {...stylex.props(s.search)}
          type="search"
          placeholder="Search examples (label, category, or expression)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search examples"
        />
        <div {...stylex.props(s.browser)}>
          {XLE_CATEGORIES.map(cat => {
            const rows = filtered.filter(e => e.category === cat);
            if (rows.length === 0) {
              return null;
            }
            return (
              <div key={cat}>
                <div {...stylex.props(s.catHeader)}>{cat}</div>
                {rows.map(ex => (
                  <button
                    key={ex.label}
                    type="button"
                    {...stylex.props(
                      s.row,
                      ex.label === activeLabel && s.rowActive,
                    )}
                    onClick={() => pick(ex.label, ex.expr)}>
                    <VStack gap={0} xstyle={s.min0}>
                      <span {...stylex.props(s.rowLabel)}>{ex.label}</span>
                      <span {...stylex.props(s.rowExpr)}>
                        {ex.expr.replace(/\n/g, ' ⏎ ')}
                      </span>
                    </VStack>
                    <span {...stylex.props(s.rowTok)}>
                      {countTokens(ex.expr)} tok
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </VStack>
    </div>
  );
}
