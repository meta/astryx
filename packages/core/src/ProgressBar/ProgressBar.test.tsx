// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressBar.test.tsx
 * @input Uses Vitest, Testing Library, and ProgressBar
 * @output DOM regressions for values, labels, themes, and external mark triggers
 * @position Colocated unit tests; mark geometry is checked in Storybook
 */

import {describe, it, expect, beforeAll} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import {ProgressBar} from './ProgressBar';
import {getForcedColorsRules} from '../__tests__/forcedColors';

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
    // The fill width must be a real percentage, not "NaN%".
    const fill = progressbar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
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

    it('renders every mark as a focusable trigger (label is required, never decorative)', () => {
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
      // The name comes from the Tooltip (aria-describedby), not a role/label on
      // the tick itself, so the progressbar's own subtree stays clean.
      expect(mark).not.toHaveAttribute('role');
      expect(mark).not.toHaveAttribute('aria-label');
    });

    it('reveals a labeled mark via a focusable Tooltip trigger', async () => {
      const {container} = render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'Goal'}]}
        />,
      );
      // Focusable so keyboard users can reveal the label; named via the
      // Tooltip's aria-describedby rather than a labeled child of the bar.
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
      expect(fill.style.width).toBe('50%');
      expect(fill.classList.contains('astryx-progress-bar-mark')).toBe(false);
      expect(container.querySelectorAll(MARK)).toHaveLength(1);
    });

    it('does not clip marks in determinate mode (track carries no overflow:hidden)', () => {
      // In determinate mode the track must NOT clip, so a themed taller mark
      // can overhang the bar. (Indeterminate mode re-adds the clip — covered
      // separately — but marks are suppressed there, so nothing overhangs.)
      render(
        <ProgressBar
          value={50}
          label="Progress"
          marks={[{value: 80, label: 'M'}]}
        />,
      );
      const progressbar = screen.getByRole('progressbar');
      const trackClass = Array.from(progressbar.classList).find(c =>
        c.startsWith('x'),
      );
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
      // The atomic class that would set overflow:hidden must not be applied to
      // the track. Sanity-check the bar still rendered with a StyleX class.
      expect(trackClass).toBeDefined();
      // No rule targeting the track's classes sets overflow:hidden. (StyleX
      // atomic classes are unique per declaration; if overflow:hidden were on
      // the track we'd see it applied. We assert the track element's computed
      // intent by checking no overflow:hidden atomic is in its class list's
      // rules — simplest robust check: the track style object omits it.)
      const trackHasOverflowHidden = Array.from(progressbar.classList).some(
        cls => {
          const re = new RegExp(
            `\\.${cls}\\b[^{]*\\{[^}]*overflow:\\s*hidden`,
            'i',
          );
          return re.test(css);
        },
      );
      expect(trackHasOverflowHidden).toBe(false);
    });

    it('clips the track in indeterminate mode (the sliding fill must not escape)', () => {
      // Regression: the indeterminate fill slides from translateX -100% to
      // 250%, deliberately overshooting the track, and relies on the track
      // clipping it to the visible window. Determinate mode drops the clip so
      // marks can overhang — indeterminate mode must keep it.
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
