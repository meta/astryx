// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MotionLabStore.tsx
 * @input Proposed token values from motionTokens
 * @output Context owning the tuned token values and the lab's viewing modes
 * @position Motion Lab root state; mounted by app/motion/layout.tsx
 *
 * Every control in the lab writes a real custom property on the lab's own
 * scope element rather than holding a number in React state. That is the whole
 * point of the tool: a value you tune on the tokens page is the same value
 * every demo on every page is already reading, because they all read the
 * token. Nothing has to be threaded through props to stay in sync.
 *
 * Scoped to a wrapper element, not :root, so the lab never restyles the
 * docsite chrome around it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ALL_TUNABLE_TOKENS,
  CURRENT_EASE,
  DEFAULT_TOKEN_VALUES,
  SPRINGS,
  type SpringSpec,
} from './motionTokens';

/** How the lab answers `prefers-reduced-motion`, so the choice is watchable. */
export type ReducedMotionMode = 'off' | 'degrade' | 'delete';
/** Which side of every before/after pane is on screen. */
export type CompareMode = 'both' | 'before' | 'after';

export type MotionLabState = {
  readonly tokens: Readonly<Record<string, string>>;
  readonly springs: Readonly<
    Record<string, {duration: number; bounce: number}>
  >;
  readonly speed: number;
  readonly reducedMotion: ReducedMotionMode;
  readonly compare: CompareMode;
  readonly isLooping: boolean;
  readonly dirtyTokens: ReadonlyArray<string>;
  setToken: (name: string, value: string) => void;
  setSpring: (name: string, next: {duration: number; bounce: number}) => void;
  setSpeed: (value: number) => void;
  setReducedMotion: (mode: ReducedMotionMode) => void;
  setCompare: (mode: CompareMode) => void;
  setLooping: (value: boolean) => void;
  reset: () => void;
  /** Milliseconds for a token, already multiplied by the slow-mo factor. */
  scaledMs: (token: string) => number;
  /** Raw token value as authored, e.g. `cubic-bezier(...)` or `230ms`. */
  rawToken: (token: string) => string;
  registerScope: (el: HTMLElement | null) => void;
  /** Bumped on every replay press, so demos can re-run without prop drilling. */
  readonly replayNonce: number;
  replay: () => void;
};

const MotionLabContext = createContext<MotionLabState | null>(null);

export function useMotionLab(): MotionLabState {
  const value = useContext(MotionLabContext);
  if (value == null) {
    throw new Error('useMotionLab must be used inside <MotionLabProvider>');
  }
  return value;
}

const DEFAULT_SPRINGS = Object.fromEntries(
  SPRINGS.map((s: SpringSpec) => [
    s.name,
    {duration: s.duration, bounce: s.bounce},
  ]),
);

export function parseMs(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('ms')) {
    return Number.parseFloat(trimmed);
  }
  if (trimmed.endsWith('s')) {
    return Number.parseFloat(trimmed) * 1000;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : 0;
}

export function MotionLabProvider({children}: {children: ReactNode}) {
  const [tokens, setTokens] = useState<Record<string, string>>({
    ...DEFAULT_TOKEN_VALUES,
  });
  const [springs, setSprings] = useState(DEFAULT_SPRINGS);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion, setReducedMotion] = useState<ReducedMotionMode>('off');
  const [compare, setCompare] = useState<CompareMode>('both');
  const [isLooping, setLooping] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const scopeRef = useRef<HTMLElement | null>(null);

  const registerScope = useCallback((el: HTMLElement | null) => {
    scopeRef.current = el;
  }, []);

  // The scope element carries the tuned values. Writing them in an effect
  // rather than as an inline style keeps the paint out of React's render and
  // means a demo that reads getComputedStyle sees the same value the
  // stylesheet does.
  //
  // The reduced-motion policy is applied HERE rather than in the stylesheet.
  // An inline custom property beats any selector in the module, so a
  // `.scope[data-reduced-motion='delete']` rule that redeclares
  // `--lab-duration-*` silently loses to these writes — which made Delete look
  // like it worked (movement stopped, because the multipliers are not written
  // inline) while every duration stayed at its tuned value.
  useEffect(() => {
    const el = scopeRef.current;
    if (el == null) {
      return;
    }
    const collapse = reducedMotion === 'delete';
    for (const [name, value] of Object.entries(tokens)) {
      el.style.setProperty(name, value);
      // The scaled alias every demo actually reads, so slow-mo stretches
      // motion without moving the token the export writes out.
      if (name.startsWith('--duration-') || name.startsWith('--stagger-')) {
        el.style.setProperty(
          name.replace(/^--(duration|stagger)-/, '--lab-$1-'),
          collapse ? '0ms' : `${parseMs(value) * speed}ms`,
        );
      }
    }
    // Degrade keeps opacity and colour and drops movement; delete drops both.
    const moves = reducedMotion === 'off';
    el.style.setProperty('--lab-translate', moves ? '1' : '0');
    el.style.setProperty('--lab-scale', moves ? '1' : '0');
    el.style.setProperty('--lab-speed', String(speed));
    // The curve core ships today, published as its own name so a "before" pane
    // can run the real thing rather than a copy that drifts when the proposal's
    // --ease-standard alias is retuned.
    el.style.setProperty('--ease-standard-today', CURRENT_EASE.value);
  }, [tokens, speed, reducedMotion]);

  const setToken = useCallback((name: string, value: string) => {
    setTokens(prev => (prev[name] === value ? prev : {...prev, [name]: value}));
  }, []);

  const setSpring = useCallback(
    (name: string, next: {duration: number; bounce: number}) => {
      setSprings(prev => ({...prev, [name]: next}));
    },
    [],
  );

  const reset = useCallback(() => {
    setTokens({...DEFAULT_TOKEN_VALUES});
    setSprings(DEFAULT_SPRINGS);
    setSpeed(1);
    setReducedMotion('off');
    setCompare('both');
  }, []);

  const replay = useCallback(() => setReplayNonce(n => n + 1), []);

  const dirtyTokens = useMemo(
    () =>
      ALL_TUNABLE_TOKENS.filter(
        name => tokens[name] !== DEFAULT_TOKEN_VALUES[name],
      ),
    [tokens],
  );

  const rawToken = useCallback(
    (token: string) =>
      token === '--ease-standard-today'
        ? CURRENT_EASE.value
        : (tokens[token] ?? DEFAULT_TOKEN_VALUES[token] ?? ''),
    [tokens],
  );

  const scaledMs = useCallback(
    (token: string) => parseMs(rawToken(token)) * speed,
    [rawToken, speed],
  );

  const value = useMemo<MotionLabState>(
    () => ({
      tokens,
      springs,
      speed,
      reducedMotion,
      compare,
      isLooping,
      dirtyTokens,
      setToken,
      setSpring,
      setSpeed,
      setReducedMotion,
      setCompare,
      setLooping,
      reset,
      scaledMs,
      rawToken,
      registerScope,
      replayNonce,
      replay,
    }),
    [
      tokens,
      springs,
      speed,
      reducedMotion,
      compare,
      isLooping,
      dirtyTokens,
      setToken,
      setSpring,
      reset,
      scaledMs,
      rawToken,
      registerScope,
      replayNonce,
      replay,
    ],
  );

  return (
    <MotionLabContext.Provider value={value}>
      {children}
    </MotionLabContext.Provider>
  );
}
