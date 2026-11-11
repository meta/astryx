// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressBar.test.tsx
 * @input Uses Vitest, Testing Library, and ProgressBar
 * @output DOM regressions for values, labels, themes, and external mark triggers
 * @position Colocated unit tests; mark geometry is checked in Storybook
 */

import {describe, it, expect, beforeAll, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import {ProgressBar} from './ProgressBar';
import {getForcedColorsRules} from '../__tests__/forcedColors';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
  progressBar,
  registerProgressBarTable,
} from '../motion/uikit/progressBar';
import {formatMotionRoleValue, motionRole, motionRoleOf} from '../motion/roles';
import {
  REDUCED_MOTION_FADE_QUERY,
  REDUCED_MOTION_INSTANT_QUERY,
} from '../motion/reducedMotion';
import {TOUCH_QUERY} from '../utils/touchQueries';
import {TOUCH_MIN_FILL_PX} from './ProgressBarTouch';
import {timing} from '../motion/uikit/timing';

// A labeled mark wraps the tick in a lazily-loaded Tooltip (React.lazy +
// Suspense). Preload that chunk once so the Tooltip (and its
// aria-describedby) is present synchronously on first render, keeping these
// tests deterministic rather than racing the dynamic import's default 1s
// Suspense timeout.
beforeAll(async () => {
  await import('./ProgressBarMarkTooltip');
});

describe('ProgressBar', () => {
  it('renders visible label by default', () => {
    render(<ProgressBar value={50} label="Storage used" />);
    expect(screen.getByText('Storage used')).toBeInTheDocument();
  });

  it('hides label visually when isLabelHidden is true', () => {
    render(<ProgressBar value={50} label="Hidden label" isLabelHidden />);
    const label = screen.getByText('Hidden label');
    expect(label).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-labelledby');
  });

  it('shows value label when hasValueLabel is true', () => {
    render(<ProgressBar value={75} label="Upload" hasValueLabel />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('uses custom formatValueLabel', () => {
    render(
      <ProgressBar
        value={3}
        max={5}
        label="Disk"
        hasValueLabel
        formatValueLabel={(v, m) => `${v} GB / ${m} GB`}
      />,
    );
    expect(screen.getByText('3 GB / 5 GB')).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuetext', '3 GB / 5 GB');
  });

  it('sets aria-valuetext from formatValueLabel', () => {
    render(<ProgressBar value={50} label="Progress" />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuetext', '50%');
  });

  it('clamps value to [0, max]', () => {
    const {rerender} = render(
      <ProgressBar value={150} max={100} label="Over" />,
    );
    let progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar value={-10} max={100} label="Under" />);
    progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
  });

  it('forwards ref to outer container', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<ProgressBar ref={ref} value={50} label="Test" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes data-testid', () => {
    render(<ProgressBar value={50} label="Test" data-testid="my-progress" />);
    expect(screen.getByTestId('my-progress')).toBeInTheDocument();
  });

  it('renders with all variant options', () => {
    const variants = [
      'accent',
      'success',
      'warning',
      'error',
      'neutral',
    ] as const;
    for (const variant of variants) {
      const {unmount} = render(
        <ProgressBar value={50} label={variant} variant={variant} />,
      );
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      unmount();
    }
  });

  it('renders at fixed 8px track height', () => {
    render(<ProgressBar value={50} label="Progress" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows value label with hidden label', () => {
    render(
      <ProgressBar value={60} label="Hidden" isLabelHidden hasValueLabel />,
    );
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('renders no visible value label when isLabelHidden without hasValueLabel', () => {
    // Mirrors the intended "accessible label only" composition: the text
    // label is kept for assistive tech (visually hidden) while no extra
    // visible value label is surfaced.
    render(<ProgressBar value={42} label="Context usage" isLabelHidden />);
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
    const label = screen.getByText('Context usage');
    expect(label).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-labelledby', label.id);
  });

  it('handles zero max gracefully', () => {
    render(<ProgressBar value={0} max={0} label="Empty" />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '0');
  });

  it('treats a NaN value as empty progress instead of leaking "NaN"', () => {
    // e.g. an upstream `loaded / total * 100` where total is still 0.
    render(<ProgressBar value={NaN} label="Upload" hasValueLabel />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar.getAttribute('aria-valuetext')).toBe('0%');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    // The filled share must be a real percentage, not "NaN%".
    const fill = progressbar.firstElementChild as HTMLElement;
    expect(fill.style.getPropertyValue('--_progress-bar-fill')).toBe('0%');
  });

  it('treats a NaN max as an empty range instead of leaking "NaN"', () => {
    render(<ProgressBar value={5} max={NaN} label="Steps" hasValueLabel />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '0');
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('does not render NaN in the value label when max is zero', () => {
    render(<ProgressBar value={0} max={0} label="Empty" hasValueLabel />);
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuetext') ?? '').not.toMatch(
      /NaN|Infinity/,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  // Disabled state
  describe('disabled state', () => {
    it('renders with isDisabled', () => {
      render(
        <ProgressBar value={50} label="Canceled" isDisabled hasValueLabel />,
      );
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('still renders label when disabled', () => {
      render(<ProgressBar value={50} label="Canceled upload" isDisabled />);
      expect(screen.getByText('Canceled upload')).toBeInTheDocument();
    });
  });

  // Indeterminate mode tests
  describe('indeterminate mode', () => {
    it('omits authored value attributes while the value is indeterminate', () => {
      render(<ProgressBar isIndeterminate label="Loading" />);
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).not.toHaveAttribute('aria-valuenow');
      expect(progressbar).not.toHaveAttribute('aria-valuemin');
      expect(progressbar).not.toHaveAttribute('aria-valuemax');
      expect(progressbar).not.toHaveAttribute('aria-valuetext');
    });

    it('still renders label when indeterminate', () => {
      render(<ProgressBar isIndeterminate label="Processing" />);
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });

    it('hides value label when indeterminate even if hasValueLabel is true', () => {
      render(
        <ProgressBar
          isIndeterminate
          label="Loading"
          value={50}
          hasValueLabel
        />,
      );
      expect(screen.queryByText('50%')).not.toBeInTheDocument();
    });

    it('is labelled via aria-labelledby when indeterminate', () => {
      render(<ProgressBar isIndeterminate label="Loading data" />);
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-labelledby');
    });

    it('renders with all variants in indeterminate mode', () => {
      const variants = [
        'accent',
        'success',
        'warning',
        'error',
        'neutral',
      ] as const;
      for (const variant of variants) {
        const {unmount} = render(
          <ProgressBar isIndeterminate label={variant} variant={variant} />,
        );
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        unmount();
      }
    });

    it('drives a direction-aware indeterminate slide (mirrored keyframe under RTL)', () => {
      // StyleX injects the keyframes + the atomic rule that swaps the
      // animation-name under `[dir="rtl"]`. Scan the injected CSS so we can
      // assert the RTL branch exists without relying on jsdom animation.
      function injectedCss(): string {
        let out = '';
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              out += rule.cssText + '\n';
            }
          } catch {
            // ignore cross-origin sheets
          }
        }
        out += Array.from(document.querySelectorAll('style'))
          .map(s => s.textContent || '')
          .join('\n');
        return out;
      }

      render(<ProgressBar isIndeterminate label="Loading" />);
      const css = injectedCss();
      // LTR keyframe slides physically left → right (−100% → 250%).
      expect(css).toMatch(/translateX\(-100%\)/);
      expect(css).toMatch(/translateX\(250%\)/);
      // RTL keyframe mirrors it (100% → −250%) so the bar travels along the
      // reading flow (inline-start → inline-end, i.e. right → left).
      expect(css).toMatch(/translateX\(100%\)/);
      expect(css).toMatch(/translateX\(-250%\)/);
      // The animation-name is swapped specifically under `[dir="rtl"]`.
      expect(css).toMatch(/:is\(\[dir="rtl"\][^)]*\)[^{]*\{\s*animation-name:/);
    });
  });

  // Target marks
  describe('target marks', () => {
    const MARK = '.astryx-progress-bar-mark';

    // The StyleX atomic classes on an element, without the stable astryx-*
    // theme classes and the bare variant/placement tokens — so a comparison
    // reflects the resolved styles, not the reflected props.
    function styleClasses(el: HTMLElement): string {
      return Array.from(el.classList)
        .filter(c => /^x[a-z0-9]+$/.test(c))
        .sort()
        .join(' ');
    }

    it('renders no mark elements when marks is omitted', () => {
      const {container} = render(<ProgressBar value={50} label="Progress" />);
      expect(container.querySelectorAll(MARK)).toHaveLength(0);
    });

    it('renders no mark elements for an empty marks array', () => {
      const {container} = render(
        <ProgressBar value={50} label="Progress" marks={[]} />,
      );
      expect(container.querySelectorAll(MARK)).toHaveLength(0);
    });

    it('renders a mark at the position matching its value', () => {
      const {container} = render(
        <ProgressBar
          value={40}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks).toHaveLength(1);
      // value 80 of max 100 -> 80% along the track (RTL-safe logical property).
      expect(marks[0].style.insetInlineStart).toBe('80%');
    });

    it('positions marks relative to a custom max', () => {
      const {container} = render(
        <ProgressBar
          value={1}
          max={5}
          label="Steps"
          marks={[{value: 4, label: 'M'}]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      // value 4 of max 5 -> 80%.
      expect(marks[0].style.insetInlineStart).toBe('80%');
    });

    it('keeps a mark past the current value visible', () => {
      // A mark beyond the fill still renders — it layers above the fill.
      const {container} = render(
        <ProgressBar
          value={20}
          label="Progress"
          marks={[{value: 90, label: 'M'}]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks).toHaveLength(1);
      expect(marks[0].style.insetInlineStart).toBe('90%');
    });

    it('renders multiple marks', () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[
            {value: 25, label: 'M'},
            {value: 50, label: 'M'},
            {value: 80, label: 'M'},
          ]}
        />,
      );
      expect(container.querySelectorAll(MARK)).toHaveLength(3);
    });

    it('clamps out-of-range mark positions to the track edges', () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[
            {value: -10, label: 'M'},
            {value: 150, label: 'M'},
          ]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks).toHaveLength(2);
      expect(marks[0].style.insetInlineStart).toBe('0%');
      expect(marks[1].style.insetInlineStart).toBe('100%');
    });

    it('drops non-finite mark values', () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[
            {value: NaN, label: 'M'},
            {value: Infinity, label: 'M'},
            {value: 60, label: 'M'},
          ]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks).toHaveLength(1);
      expect(marks[0].style.insetInlineStart).toBe('60%');
    });

    it('does not render marks in indeterminate mode', () => {
      const {container} = render(
        <ProgressBar
          isIndeterminate
          label="Loading"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      expect(container.querySelectorAll(MARK)).toHaveLength(0);
    });

    // Mark color follows what the mark sits on: inside the filled area it
    // takes the fill variant's on-color, out on the bare track it takes the
    // primary text color. The choice is reflected as `data-placement`
    // (plus `data-variant`, mirroring the fill) so themes can target it and
    // tests can assert it without reading atomic class names.
    it('marks the ticks inside the filled area as placed on the fill', () => {
      const {container} = render(
        <ProgressBar
          value={60}
          label="Progress"
          marks={[
            {value: 25, label: 'Behind'},
            {value: 90, label: 'Ahead'},
          ]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks[0]).toHaveAttribute('data-placement', 'fill');
      expect(marks[1]).toHaveAttribute('data-placement', 'track');
      // Different placements resolve to different color styles.
      expect(styleClasses(marks[0])).not.toBe(styleClasses(marks[1]));
    });

    it('treats a mark exactly at the current value as on the fill', () => {
      const {container} = render(
        <ProgressBar
          value={70}
          label="Progress"
          marks={[{value: 70, label: 'Goal'}]}
        />,
      );
      expect(container.querySelector(MARK)).toHaveAttribute(
        'data-placement',
        'fill',
      );
    });

    it('places every mark on the track at zero progress', () => {
      // With no fill drawn, even a mark at 0 sits on the bare track.
      const {container} = render(
        <ProgressBar
          value={0}
          label="Progress"
          marks={[
            {value: 0, label: 'Start'},
            {value: 50, label: 'Goal'},
          ]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks[0]).toHaveAttribute('data-placement', 'track');
      expect(marks[1]).toHaveAttribute('data-placement', 'track');
      expect(styleClasses(marks[0])).toBe(styleClasses(marks[1]));
    });

    it('mirrors the fill variant on marks so the on-color matches the bar', () => {
      const {container} = render(
        <ProgressBar
          value={80}
          variant="warning"
          label="Budget used"
          marks={[
            {value: 50, label: 'Half'},
            {value: 95, label: 'Cap'},
          ]}
        />,
      );
      const marks = container.querySelectorAll<HTMLElement>(MARK);
      expect(marks[0]).toHaveAttribute('data-variant', 'warning');
      expect(marks[0]).toHaveAttribute('data-placement', 'fill');
      expect(marks[1]).toHaveAttribute('data-variant', 'warning');
      expect(marks[1]).toHaveAttribute('data-placement', 'track');
    });

    it('uses the disabled variant for marks when the bar is disabled', () => {
      const {container} = render(
        <ProgressBar
          value={80}
          variant="error"
          isDisabled
          label="Canceled"
          marks={[{value: 50, label: 'Half'}]}
        />,
      );
      expect(container.querySelector(MARK)).toHaveAttribute(
        'data-variant',
        'disabled',
      );
    });

    it('keeps one plain foreground on both sides for neutral and disabled bars', () => {
      // The neutral/disabled fill is the muted gray — it carries no semantic
      // weight and has no on-token, so a mark on it takes the same plain
      // foreground it would have out on the track.
      for (const props of [
        {variant: 'neutral'} as const,
        {isDisabled: true} as const,
      ]) {
        const {container, unmount} = render(
          <ProgressBar
            value={60}
            label="Progress"
            {...props}
            marks={[
              {value: 20, label: 'On fill'},
              {value: 90, label: 'On track'},
            ]}
          />,
        );
        const marks = container.querySelectorAll<HTMLElement>(MARK);
        expect(marks[0]).toHaveAttribute('data-placement', 'fill');
        expect(marks[1]).toHaveAttribute('data-placement', 'track');
        expect(styleClasses(marks[0])).toBe(styleClasses(marks[1]));
        unmount();
      }
    });

    it("dims a disabled bar's marks below a live one's", () => {
      // A disabled bar is deliberately low-emphasis (its label and value text
      // drop to muted colors), so its marks step down to the secondary
      // foreground on both sides rather than shouting over the grayed-out
      // bar. A live neutral bar — same muted gray fill — keeps the
      // full-contrast primary foreground.
      const MARKS = [
        {value: 20, label: 'On fill'},
        {value: 90, label: 'On track'},
      ];
      const {container: live} = render(
        <ProgressBar value={60} variant="neutral" label="A" marks={MARKS} />,
      );
      const {container: off} = render(
        <ProgressBar value={60} isDisabled label="B" marks={MARKS} />,
      );
      const liveMarks = live.querySelectorAll<HTMLElement>(MARK);
      const offMarks = off.querySelectorAll<HTMLElement>(MARK);
      expect(styleClasses(offMarks[0])).not.toBe(styleClasses(liveMarks[0]));
      expect(styleClasses(offMarks[1])).not.toBe(styleClasses(liveMarks[1]));
    });

    it('recolors marks per variant when they sit on the fill', () => {
      // Two bars at the same progress with different variants give their
      // on-fill marks different colors (different atomic classes), while
      // their on-track marks stay the same divider color.
      const {container: accent} = render(
        <ProgressBar
          value={60}
          variant="accent"
          label="A"
          marks={[
            {value: 20, label: 'On fill'},
            {value: 90, label: 'On track'},
          ]}
        />,
      );
      const {container: error} = render(
        <ProgressBar
          value={60}
          variant="error"
          label="B"
          marks={[
            {value: 20, label: 'On fill'},
            {value: 90, label: 'On track'},
          ]}
        />,
      );
      const accentMarks = accent.querySelectorAll<HTMLElement>(MARK);
      const errorMarks = error.querySelectorAll<HTMLElement>(MARK);
      expect(styleClasses(accentMarks[0])).not.toBe(
        styleClasses(errorMarks[0]),
      );
      expect(styleClasses(accentMarks[1])).toBe(styleClasses(errorMarks[1]));
    });

    it('renders every mark as a named, focusable image before its tooltip opens', () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'Goal'}]}
        />,
      );
      const mark = container.querySelector<HTMLElement>(MARK)!;
      // A mark always stands for something meaningful, so it is never
      // aria-hidden and is always keyboard-focusable to reveal its label.
      expect(mark).not.toHaveAttribute('aria-hidden');
      expect(mark).toHaveAttribute('tabindex', '0');
      expect(mark).toHaveAttribute('role', 'img');
      expect(mark).toHaveAttribute('aria-label', 'Goal');
    });

    it('reveals a labeled mark via a focusable Tooltip trigger', async () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'Goal'}]}
        />,
      );
      // Focusable so keyboard users can reveal the label visually; the tick
      // itself owns its name independently of the Tooltip's description.
      // The Tooltip loads lazily (Suspense), so re-query the live element and
      // wait for it to attach aria-describedby.
      const mark0 = container.querySelector<HTMLElement>(MARK)!;
      expect(mark0).toHaveAttribute('tabindex', '0');
      expect(mark0).not.toHaveAttribute('aria-hidden');
      await waitFor(() =>
        expect(container.querySelector(MARK)).toHaveAttribute(
          'aria-describedby',
        ),
      );
      const mark = container.querySelector<HTMLElement>(MARK)!;
      const tip = document.getElementById(
        mark.getAttribute('aria-describedby')!,
      );
      expect(tip).toHaveTextContent('Goal');
    });

    it('keeps the progressbar element free of role="img"/aria-label children', () => {
      // Marks stay outside the progressbar's presentational subtree; their
      // Tooltip descriptions must not change the bar's own semantics.
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'Goal'}]}
        />,
      );
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar.querySelector('[role="img"]')).toBeNull();
      expect(progressbar.querySelector('[aria-label]')).toBeNull();
      expect(container.querySelectorAll(MARK)).toHaveLength(1);
    });

    it('does not add mark info to the progressbar aria-valuetext', () => {
      render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'Goal'}]}
        />,
      );
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar.getAttribute('aria-valuetext')).toBe('50%');
    });

    it('keeps the fill as the progressbar child when marks are rendered', () => {
      // Only the fill belongs to the semantic track. That the focusable marks
      // stay outside its presentational subtree is the progressbar contract's
      // target-marks state (progressbar.subtree.no-focusable-descendants).
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const progressbar = screen.getByRole('progressbar');
      const fill = progressbar.firstElementChild as HTMLElement;
      expect(fill.style.getPropertyValue('--_progress-bar-fill')).toBe('50%');
      expect(fill.classList.contains('astryx-progress-bar-mark')).toBe(false);
      expect(container.querySelectorAll(MARK)).toHaveLength(1);
    });

    it('keeps marks outside the clipping track, so a themed tall mark can still overhang', () => {
      // The track clips its fill to the rounded rail. Marks sit beside the
      // track in its unclipped container, never inside it, so a theme that
      // makes a mark taller than the bar still sees it overhang both edges.
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const progressbar = screen.getByRole('progressbar');
      const marks = Array.from(container.querySelectorAll<HTMLElement>(MARK));
      expect(marks).toHaveLength(1);
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          css += rule.cssText + '\n';
        }
      }
      const clips = (el: Element) =>
        Array.from(el.classList).some(cls =>
          new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*overflow:\\s*hidden`, 'i').test(
            css,
          ),
        );
      for (const mark of marks) {
        expect(progressbar.contains(mark)).toBe(false);
        // No ancestor between the mark and the bar's root clips it.
        let node = mark.parentElement;
        while (node != null && node !== container) {
          expect(clips(node)).toBe(false);
          node = node.parentElement;
        }
      }
    });

    it('clips the track in determinate mode (the fill slides in from the start)', () => {
      // The determinate fill spans the whole track and is moved back by the
      // unfilled share; the track's clip keeps the moved-out part hidden.
      render(<ProgressBar value={30} label="Progress" />);
      const progressbar = screen.getByRole('progressbar');
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            css += rule.cssText + '\n';
          }
        } catch {
          // ignore cross-origin sheets
        }
      }
      const trackHasOverflowHidden = Array.from(progressbar.classList).some(
        cls =>
          new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*overflow:\\s*hidden`, 'i').test(
            css,
          ),
      );
      expect(trackHasOverflowHidden).toBe(true);
    });

    it('moves the determinate fill with a transform, not its width, except under forced colors', () => {
      // A width transition lays out and repaints on the main thread every
      // frame, so it stalls while a script runs; a transform transition runs
      // on the compositor. The fill spans the track and its leading edge sits
      // at the filled share, mirrored in RTL.
      render(<ProgressBar value={30} label="Progress" />);
      const fill = screen.getByRole('progressbar')
        .firstElementChild as HTMLElement;
      // The stylesheet's rules, apart and under forced colors.
      let css = '';
      let forcedCss = '';
      const collect = (rules: CSSRuleList, forced: boolean) => {
        for (const rule of Array.from(rules)) {
          if ('cssRules' in rule && 'conditionText' in rule) {
            collect(
              (rule as CSSMediaRule).cssRules,
              forced ||
                /forced-colors:\s*active/.test(
                  (rule as CSSMediaRule).conditionText,
                ),
            );
          } else if (forced) {
            forcedCss += rule.cssText + '\n';
          } else {
            css += rule.cssText + '\n';
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        collect(sheet.cssRules, false);
      }
      const declarationsIn = (text: string) =>
        Array.from(fill.classList)
          .flatMap(cls =>
            Array.from(
              text.matchAll(new RegExp(`\\.${cls}\\b[^{]*\\{([^}]*)\\}`, 'g')),
              m => m[1].trim(),
            ),
          )
          .join('\n');
      const joined = declarationsIn(css);
      expect(fill.style.width).toBe('');
      expect(fill.style.getPropertyValue('--_progress-bar-fill')).toBe('30%');
      expect(joined).toMatch(/width:\s*100%/);
      expect(joined).toMatch(/transition-property:\s*transform/);
      expect(joined).not.toMatch(/transition-property:\s*width/);
      expect(joined).toMatch(/will-change:\s*transform/);
      expect(joined).toMatch(
        /transform:\s*translateX\(calc\(var\(--_progress-bar-fill,\s*0%\) - 100%\)\)/,
      );
      expect(css).toMatch(
        // The bar's own direction (`:dir(rtl)`), not any RTL ancestor.
        /:dir\(rtl\)[^{]*\{[^}]*transform:\s*translateX\(calc\(100% - var\(--_progress-bar-fill,\s*0%\)\)\)/,
      );
      // Under forced colors the fill is sized to the value instead, so the
      // track's clip never cuts its CanvasText outline (theme-tokens INV11);
      // the Chromium spec checks the drawn outline.
      const forced = declarationsIn(forcedCss);
      expect(forced).toMatch(/width:\s*var\(--_progress-bar-fill,\s*0%\)/);
      expect(forced).toMatch(/transform:\s*none/);
      expect(forced).toMatch(/transition-property:\s*width/);
      expect(forced).toMatch(/will-change:\s*auto/);
    });

    it('clips the track in indeterminate mode (the sliding fill must not escape)', () => {
      // Regression: the indeterminate fill slides from translateX -100% to
      // 250%, deliberately overshooting the track, and relies on the track
      // clipping it to the visible window.
      render(<ProgressBar isIndeterminate label="Loading" />);
      const progressbar = screen.getByRole('progressbar');
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            css += rule.cssText + '\n';
          }
        } catch {
          // ignore cross-origin sheets
        }
      }
      css += Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent || '')
        .join('\n');
      const trackHasOverflowHidden = Array.from(progressbar.classList).some(
        cls => {
          const re = new RegExp(
            `\\.${cls}\\b[^{]*\\{[^}]*overflow:\\s*hidden`,
            'i',
          );
          return re.test(css);
        },
      );
      expect(trackHasOverflowHidden).toBe(true);
    });

    it('sizes the mark through the derived vars, so a theme override cannot lose the cascade', () => {
      // width/height are declared as `var(--_progressbar-mark-*)` and nothing
      // else declares those vars, so the value a theme sets on the
      // `progress-bar-mark` target lands even in a consumer whose StyleX is
      // unlayered and would otherwise outrank `@layer astryx-theme`.
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const mark = container.querySelector<HTMLElement>(MARK)!;
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            css += rule.cssText + '\n';
          }
        } catch {
          // ignore cross-origin sheets
        }
      }
      css += Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent || '')
        .join('\n');
      const markRules = Array.from(mark.classList)
        .filter(cls => /^x[a-z0-9]+$/.test(cls))
        .flatMap(
          cls =>
            css.match(new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*\\}`, 'g')) ?? [],
        );
      expect(markRules.join('\n')).toMatch(
        /width:\s*var\(--_progressbar-mark-width,\s*2px\)/,
      );
      expect(markRules.join('\n')).toMatch(
        /height:\s*var\(--_progressbar-mark-height,\s*8px\)/,
      );
    });

    it('renders the mark on the stable progress-bar-mark target, centered for symmetric overhang', () => {
      // The mark's width/height/color are directly overridable via the
      // `progress-bar-mark` theme target. It is centered
      // on the track (translate -50%,-50%) so a themed taller tick overhangs the
      // bar symmetrically above and below without being clipped.
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const mark = container.querySelector<HTMLElement>(MARK)!;
      expect(mark.className).toContain('astryx-progress-bar-mark');
      let css = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            css += rule.cssText + '\n';
          }
        } catch {
          // ignore cross-origin sheets
        }
      }
      css += Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent || '')
        .join('\n');
      // Centered so any themed overhang stays symmetric.
      expect(css).toMatch(/translate\(-50%,\s*-50%\)/);
      expect(container.querySelectorAll(MARK)).toHaveLength(1);
    });
  });
});

describe('ProgressBar theme target names', () => {
  it('renders only the canonical target classes', () => {
    const {container} = render(
      <ProgressBar
        value={50}
        label="Progress"
        marks={[{value: 80, label: 'M'}]}
      />,
    );
    expect(container.querySelector('.astryx-progress-bar')).toHaveClass(
      'astryx-progress-bar',
    );
    expect(container.querySelector('.astryx-progress-bar-track')).toHaveClass(
      'astryx-progress-bar-track',
    );
    expect(container.querySelector('.astryx-progress-bar-fill')).toHaveClass(
      'astryx-progress-bar-fill',
    );
    expect(container.querySelector('.astryx-progress-bar-mark')).toHaveClass(
      'astryx-progress-bar-mark',
    );
    expect(container.querySelector('.astryx-progressbar')).toBeNull();
    expect(container.querySelector('.astryx-progressbar-track')).toBeNull();
    expect(container.querySelector('.astryx-progressbar-fill')).toBeNull();
    expect(container.querySelector('.astryx-progressbar-mark')).toBeNull();
  });
});

/**
 * The value the browser would give `property` on `el` with this pointer and
 * reduced-motion preference. That is the last rule (in stylesheet order) for
 * one of its classes whose media conditions all hold. StyleX rewrites a key
 * into conditions that negate its later siblings, so this evaluates them
 * rather than matching their text. `@supports` blocks never hold (no engine
 * gate).
 */
function valueUnder(
  el: Element,
  property: string,
  env: {coarse: boolean; reduce: boolean},
): string | undefined {
  const holds = (condition: string): boolean => {
    const tokens = condition
      .replace(/\(pointer:\s*coarse\)/g, env.coarse ? ' T ' : ' F ')
      .replace(
        /\(prefers-reduced-motion:\s*reduce\)/g,
        env.reduce ? ' T ' : ' F ',
      )
      // A mouse hovers; any other feature is taken as unmet.
      .replace(/\(hover:\s*hover\)/g, env.coarse ? ' F ' : ' T ')
      .replace(/\([a-z-]+:[^()]*\)/g, ' F ')
      .replace(/\(/g, ' ( ')
      .replace(/\)/g, ' ) ')
      .trim()
      .split(/\s+/);
    let i = 0;
    const or = (): boolean => {
      let value = and();
      while (tokens[i] === 'or') {
        i += 1;
        value = and() || value;
      }
      return value;
    };
    const and = (): boolean => {
      let value = unary();
      while (tokens[i] === 'and') {
        i += 1;
        value = unary() && value;
      }
      return value;
    };
    const unary = (): boolean => {
      const token = tokens[i++];
      if (token === 'not') {
        return !unary();
      }
      if (token === '(') {
        const value = or();
        i += 1; // ')'
        return value;
      }
      if (token === 'T' || token === 'F') {
        return token === 'T';
      }
      throw new Error(`unexpected ${token} in ${condition}`);
    };
    return or();
  };
  // StyleX raises a conditional rule's specificity by repeating its class,
  // so the winner is the most specific matching rule, then the last one.
  let best: {value: string; specificity: number} | undefined;
  const specificityOf = (selector: string) =>
    (selector.split(':not(')[0].match(/\./g) ?? []).length;
  const visit = (rules: CSSRuleList, ok: boolean) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(
          rule.cssRules,
          ok && holds(rule.conditionText ?? rule.media.mediaText),
        );
      } else if (rule instanceof CSSSupportsRule) {
        visit(rule.cssRules, false);
      } else if (rule instanceof CSSStyleRule) {
        if (
          ok &&
          Array.from(el.classList).some(c =>
            rule.selectorText.includes(`.${c}`),
          ) &&
          rule.style.getPropertyValue(property) !== ''
        ) {
          const specificity = specificityOf(rule.selectorText);
          if (best == null || specificity >= best.specificity) {
            best = {value: rule.style.getPropertyValue(property), specificity};
          }
        }
      } else if ('cssRules' in rule) {
        // @layer and other grouping rules hold whatever they wrap.
        visit((rule as CSSGroupingRule).cssRules, ok);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, true);
  }
  return best?.value;
}

/**
 * The declarations the element's classes carry, as `prop: value`. It reads
 * rules at the top level (`media` null), inside `@media <media>`, or inside
 * exactly the nested conditions listed. Those are `@media` texts as they are
 * and `@supports` ones prefixed, in either nesting order.
 */
function rulesOf(
  el: Element,
  media: string | null | ReadonlyArray<string>,
): string[] {
  const out: string[] = [];
  const key = (list: ReadonlyArray<string>) => list.slice().sort().join(' & ');
  const want = key(
    media == null ? [] : typeof media === 'string' ? [media] : media,
  );
  const visit = (rules: CSSRuleList, conditions: ReadonlyArray<string>) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, [
          ...conditions,
          rule.conditionText ?? rule.media.mediaText,
        ]);
      } else if (rule instanceof CSSSupportsRule) {
        visit(rule.cssRules, [
          ...conditions,
          `@supports ${rule.conditionText}`,
        ]);
      } else if (rule instanceof CSSStyleRule && key(conditions) === want) {
        if (
          Array.from(el.classList).some(c =>
            rule.selectorText.includes(`.${c}`),
          )
        ) {
          for (let i = 0; i < rule.style.length; i += 1) {
            const prop = rule.style[i];
            out.push(`${prop}: ${rule.style.getPropertyValue(prop)}`);
          }
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    visit(sheet.cssRules, []);
  }
  return out;
}

const valueOf = (declarations: string[], prop: string) =>
  declarations
    .filter(d => d.startsWith(`${prop}:`))
    .map(d => d.slice(prop.length + 1).trim());

describe('ProgressBar under a finger: UIProgressView', () => {
  const view = progressBar.progressView;
  // The resolver's touch query, as TOUCH_QUERY spells it: every touch device.
  const TOUCH = TOUCH_QUERY;
  const fillOf = () =>
    screen.getByRole('progressbar').firstElementChild as HTMLElement;
  const moveOf = () => fillOf().style.getPropertyValue('--_progress-bar-move');
  const source = () =>
    readFileSync(path.resolve(__dirname, 'ProgressBar.tsx'), 'utf8');

  it('styles a mark the minimum fill covers as on the fill', () => {
    // A finger, as the touch presentation resolver reads it, and
    // a track measured 200 px wide: the 16 px minimum covers its first 8%.
    const originalMatchMedia = window.matchMedia;
    const originalObserver = globalThis.ResizeObserver;
    window.matchMedia = (query: string) => ({
      matches: /pointer:\s*coarse/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    class MeasuredTrack {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const entry = {target, contentRect: {width: 200}};
        this.callback([entry as unknown as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MeasuredTrack;
    // The shared observer's first call reads the box itself.
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({width: 200} as unknown as DOMRect);
    try {
      render(
        <ProgressBar
          value={2}
          label="Upload"
          marks={[
            {value: 5, label: 'Covered'},
            {value: 20, label: 'Ahead'},
          ]}
        />,
      );
      const placements = Array.from(
        document.querySelectorAll('[data-placement]'),
      ).map(mark => mark.getAttribute('data-placement'));
      // 5% sits inside the drawn 8%; 20% is out on the track.
      expect(placements).toEqual(['fill', 'track']);
    } finally {
      window.matchMedia = originalMatchMedia;
      globalThis.ResizeObserver = originalObserver;
      box.mockRestore();
    }
  });

  it('moves linearly for the progress.fillTrackMs role times the share of the track it moved, from the last value', () => {
    const {rerender} = render(<ProgressBar value={10} label="Upload" />);
    // Nothing to animate on the first render.
    expect(moveOf()).toBe('0ms');
    rerender(<ProgressBar value={60} label="Upload" />);
    expect(moveOf()).toBe(`${0.5 * progressBar.fillTrackMs}ms`);
    // A re-render with the same value keeps the running move's length.
    rerender(<ProgressBar value={60} label="Upload" />);
    expect(moveOf()).toBe(`${0.5 * progressBar.fillTrackMs}ms`);
    // The duration is the model change: 60 → 40 is 0.2 of the track.
    rerender(<ProgressBar value={40} label="Upload" />);
    expect(moveOf()).toBe(`${0.2 * progressBar.fillTrackMs}ms`);
    // On the progress.curves.fill role: linear.
    expect(fillOf().style.getPropertyValue('--_progress-bar-curve')).toBe(
      formatMotionRoleValue('curve', progressBar.curves.fill),
    );
    const touch = {coarse: true, reduce: false};
    // CSS scales the move by the theme's tempo.
    expect(valueUnder(fillOf(), 'transition-duration', touch)).toMatch(
      /^calc\(var\(--_progress-bar-move,\s*0m?s\)\s*\*\s*var\(--_astryx-motion-tempo,\s*1\)\)$/,
    );
    expect(valueUnder(fillOf(), 'transition-timing-function', touch)).toMatch(
      /^var\(--_progress-bar-curve,\s*linear\)$/,
    );
    // No engine gate: the touch query alone decides, on every touch device.
    const css = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .join('\n');
    expect(css).not.toContain('-webkit-touch-callout');
    // With a mouse or trackpad the theme's tokens still time it.
    const fine = rulesOf(fillOf(), null);
    expect(valueOf(fine, 'transition-duration')[0]).toMatch(/^var\(--/);
    expect(valueOf(fine, 'transition-timing-function')[0]).toMatch(/^var\(--/);
  });

  it('never draws shorter than two track heights above zero, and paints nothing at zero', () => {
    const {rerender} = render(<ProgressBar value={0} label="Upload" />);
    const track = screen.getByRole('progressbar');
    const trackHeight = Number.parseFloat(
      valueOf(rulesOf(track, null), 'height')[0],
    );
    const minimum = view.minimumFillHeights * trackHeight;
    expect(TOUCH_MIN_FILL_PX).toBe(minimum);
    expect(fillOf().style.getPropertyValue('--_progress-bar-min')).toBe(
      `${minimum}px`,
    );
    // Read from the source. The touch transform sits under a negated StyleX
    // condition (the forced-colors key after it). The jsdom runtime injects
    // that only in part; the Chromium spec checks what a browser draws.
    const compact = source().replace(/\s+/g, '');
    const fill = compact.slice(compact.indexOf('fill:{'));
    const transform = fill.slice(
      fill.indexOf('transform:{'),
      fill.indexOf('willChange:'),
    );
    const coarse = transform.slice(
      transform.indexOf("'@media(pointer:coarse)':{"),
    );
    const atLeast =
      'max(var(--_progress-bar-fill,0%),var(--_progress-bar-min,0px))';
    expect(coarse).toContain(atLeast);
    // Mirrored in RTL: the fill stops at the same minimum from the right.
    expect(coarse).toContain('calc(100%-var(--_progress-bar-min,0px))');
    // Under forced colors with a finger the sized fill keeps that minimum,
    // and lands at once: sizing is layout, which touch motion never animates.
    const width = fill.slice(fill.indexOf('width:{'), fill.indexOf('height:'));
    expect(width).toContain(atLeast);
    const duration = fill.slice(
      fill.indexOf('transitionDuration:{'),
      fill.indexOf('transitionTimingFunction:'),
    );
    expect(duration).toMatch(
      /'@media\(pointer:coarse\)':\{default:[^}]*'@media\(forced-colors:active\)':'0s'/,
    );
    // At zero the fill paints nothing under a finger (UIKit's alpha 0)…
    expect(view.emptyFillAlpha).toBe(0);
    expect(valueOf(rulesOf(fillOf(), TOUCH), 'opacity')).toEqual(['0']);
    // …and is drawn as soon as there is any progress.
    rerender(<ProgressBar value={1} label="Upload" />);
    expect(valueOf(rulesOf(fillOf(), TOUCH), 'opacity')).toEqual([]);
  });

  it('plays the progress table roles, never a literal', () => {
    registerProgressBarTable();
    expect(motionRole('progress.fillTrackMs')?.value).toBe(
      progressBar.fillTrackMs,
    );
    expect(motionRoleOf(progressBar.curves.fill)?.id).toBe(
      'progress.curves.fill',
    );
    const text = source();
    const fill = text.slice(
      text.indexOf('  fill: {'),
      text.indexOf('  fillEmpty: {'),
    );
    expect(fill).not.toMatch(/\d+m?s\)'|'linear'|\b16px\b/);
  });

  it('declares 0 s under both shared reduced-motion queries, after the touch key', () => {
    // The fill's transition-duration declares 0 s under both shared
    // reduced-motion queries, after the touch key so they win there. Read
    // from the source: the jsdom runtime injects only some of StyleX's
    // negated conditions, and the Chromium spec checks what a browser does.
    const text = source();
    const fill = text.slice(text.indexOf('  fill: {'));
    const duration = fill.slice(
      fill.indexOf('transitionDuration: {'),
      fill.indexOf('transitionTimingFunction:'),
    );
    const keys = [REDUCED_MOTION_INSTANT_QUERY, REDUCED_MOTION_FADE_QUERY].map(
      query => duration.indexOf(`'@media ${query}':`),
    );
    expect(keys.every(index => index >= 0)).toBe(true);
    expect(duration.indexOf("'@media (pointer: coarse)':")).toBeLessThan(
      Math.min(...keys),
    );
    for (const index of keys) {
      expect(duration.slice(index).split(',')[0]).toMatch(/'0s'$|\n\s*'0s'$/);
    }
  });
});

describe('ProgressBar under reduced motion: the indeterminate pulse', () => {
  const fillOf = () =>
    screen.getByRole('progressbar').firstElementChild as HTMLElement;
  const source = () =>
    readFileSync(path.resolve(__dirname, 'ProgressBar.tsx'), 'utf8');

  for (const coarse of [false, true]) {
    it(`spans the track and only pulses its opacity, with ${coarse ? 'a finger' : 'a mouse'}`, () => {
      render(<ProgressBar isIndeterminate label="Loading" />);
      const fill = fillOf();
      const reduce = {coarse, reduce: true};
      expect(valueUnder(fill, 'width', reduce)).toBe('100%');
      expect(valueUnder(fill, 'animation-duration', reduce)).toMatch(
        /^var\(--_progress-bar-pulse\)$/,
      );
      expect(valueUnder(fill, 'animation-timing-function', reduce)).toMatch(
        /^var\(--_progress-bar-pulse-curve\)$/,
      );
      expect(valueUnder(fill, 'animation-direction', reduce)).toBe('alternate');
      // Without reduced motion the 40% segment still slides.
      const motion = {coarse, reduce: false};
      expect(valueUnder(fill, 'width', motion)).toBe('40%');
      expect(valueUnder(fill, 'animation-duration', motion)).toBe('1.5s');
      expect(valueUnder(fill, 'animation-direction', motion)).toBeUndefined();
    });
  }

  it('pulses from full opacity down to the progress table floor and back', () => {
    render(<ProgressBar isIndeterminate label="Loading" />);
    expect(fillOf().style.getPropertyValue('--_progress-bar-pulse-floor')).toBe(
      String(progressBar.reducedMotionPulseFloor),
    );
    expect(progressBar.reducedMotionPulseFloor).toBe(0.84);
    // jsdom has no CSSKeyframesRule global: match the rule's text.
    const frames = Array.from(document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules))
      .map(rule => rule.cssText.replace(/\s+/g, ''))
      .filter(text => text.startsWith('@keyframes'))
      .filter(text => text.includes('--_progress-bar-pulse-floor'));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatch(/opacity:1/);
    expect(frames[0]).toMatch(/opacity:var\(--_progress-bar-pulse-floor\)/);
    // The pulse never moves the fill.
    expect(frames[0]).not.toMatch(/transform/);
  });

  it('plays the progress.reducedMotionPulseMs role on the timing.curves.move curve, which tempo does not scale', () => {
    render(<ProgressBar isIndeterminate label="Loading" />);
    const fill = fillOf();
    expect(fill.style.getPropertyValue('--_progress-bar-pulse')).toBe(
      `${progressBar.reducedMotionPulseMs}ms`,
    );
    expect(progressBar.reducedMotionPulseMs).toBe(2000);
    expect(fill.style.getPropertyValue('--_progress-bar-pulse-curve')).toBe(
      formatMotionRoleValue('curve', timing.curves.move),
    );
    registerProgressBarTable();
    expect(motionRole('progress.reducedMotionPulseMs')?.value).toBe(
      progressBar.reducedMotionPulseMs,
    );
    // A busy loop: nothing in the indeterminate fill reads the theme's tempo,
    // and its reduced-motion keys play no literal.
    const text = source();
    const block = text.slice(
      text.indexOf('  indeterminateFill: {'),
      text.indexOf('  // A mark is a vertical tick'),
    );
    expect(block).not.toContain('--_astryx-motion-tempo');
    const reduceValues = [
      ...block.matchAll(
        /'@media \(prefers-reduced-motion: reduce\)':\s*([^,\n]+)/g,
      ),
    ].map(match => match[1].trim());
    expect(reduceValues.length).toBeGreaterThan(0);
    for (const value of reduceValues) {
      expect(value).not.toMatch(/^'\d+(\.\d+)?m?s'$|cubic-bezier|ease/);
    }
  });
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// status fill relies on (architecture:theme-tokens INV11).
describe('ProgressBar forced colors', () => {
  it('keeps a visible boundary on the status fill', () => {
    render(<ProgressBar value={40} variant="error" label="Upload" />);
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
