// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a theme's own changes should have reached and did not: each
 * part, with why and the steps that reach it. `show` lists them under
 * missed, each step followed as set follows it; `how "<part> match the
 * theme"` answers with the same steps for that part.
 *
 * @position api/theme-edit — imported by _edit.mjs and _how.mjs
 */

import {COMMON_STATES} from './_tables.mjs';
import {baseComponent, modesOf, partsOf} from './_settings.mjs';
import {borderlessSurfaces, pillParts} from './_check.mjs';
import {parseColor, ratio} from './_color.mjs';
import {blurScaled} from './_how-question.mjs';

/**
 * @typedef {{thing: string, value: string, on?: string, when?: string, state?: string, mode?: string}} MissedStep
 * @typedef {{kind: number, part: string, state?: string, why: string, steps: MissedStep[], aspect: string}} Missed
 */

/**
 * The parts the theme's own changes should have reached and did not, one
 * of each kind first (an inverted surface, a disabled part, a selected
 * state, a status fill, pills, borderless surfaces), then the next of
 * each, with the steps that reach each (not yet checked). None for a theme
 * with no settings.
 * @param {any} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {Record<string, Record<string, string>>} res
 * @param {Record<string, any>} base
 * @returns {Missed[]}
 */
export function missedSteps(ctx, data, res, base) {
  if (!data.settings.length) return [];
  const C = ctx.C;
  // The modes the theme draws (a dark-only theme's dark), each one res
  // holds.
  const modes = modesOf(data).filter(m => res[m]);
  /** @param {string} token */
  const changed = token =>
    modes.some(m => String(res[m]?.[token]) !== String(base[m]?.[token]));
  const tokens = Object.keys(res[modes[0]] ?? {});
  const any = (/** @type {RegExp} */ re) =>
    tokens.some(t => re.test(t) && changed(t));
  const accent = any(/^--color-(accent|on-accent|text-accent)/);
  const surfaces = any(/^--color-background-(body|surface)$/);
  const corners = any(/^--radius-(?!full$)/);
  // (A border width the theme took to zero draws no border: a part with
  // none already shows what it asked for.)
  const borders =
    any(/^--border-width/) &&
    modes.some(
      m =>
        !/^0(?:px|rem|em)?$/.test(
          String(res[m]?.['--border-width'] ?? '').trim(),
        ),
    );
  const has = (/** @type {string} */ p) => ctx.project.target.has(p);
  /**
   * A setting on the part that covers an aspect: one of the properties or
   * tokens named, in the state named (at rest with none).
   * @param {string} p @param {RegExp} things @param {string} [state]
   */
  const covers = (p, things, state) =>
    data.settings.some(
      x =>
        x.on &&
        (x.state ?? '') === (state ?? '') &&
        partsOf(ctx, x).includes(p) &&
        things.test(x.thing),
    );
  const FILL = /^(background(-color|-image)?|--color-background-[\w-]+)$/;
  /** @typedef {{thing: string, value: string, on?: string, when?: string, state?: string, mode?: string}} Step */
  /** @type {Array<{kind: number, part: string, state?: string, why: string, steps: Step[], aspect: string}>} */
  const found = [];
  /** The fills of a part (never the shared hover and pressed tints). @param {string} p @param {(prop: string) => boolean} prop */
  const fills = (p, prop = x => /^background/.test(x)) =>
    (C.partReads(p, null) ?? []).filter(
      (/** @type {any} */ r) =>
        /^--color-/.test(r.token) &&
        !/^--color-overlay-/.test(r.token) &&
        r.props.some(prop),
    );
  /** The tokens a part's text reads at rest. @param {string} q */
  const textTokensOf = q => [
    ...new Set(
      fills(q, x => x === 'color')
        .filter((/** @type {any} */ r) =>
          r.when.some((/** @type {string} */ w) => !/:|selected/.test(w)),
        )
        .map((/** @type {any} */ r) => /** @type {string} */ (r.token)),
    ),
  ];
  // The status colors, by the word their tokens carry, and the dial that
  // generates each with the text that reads on it.
  // Whether the theme's vibrancy differs from the base's: only then does a
  // status dial build a color of its own.
  const vibrancyMoved = data.settings.some(
    x => x.source === 'dial' && x.thing === 'vibrancy',
  );
  const STATUS = /** @type {Record<string, [string, string]>} */ ({
    info: ['info', '--color-info'],
    success: ['success', '--color-success'],
    warning: ['warning', '--color-warning'],
    error: ['danger', '--color-error'],
  });
  for (const p of Object.keys(C.MAP).filter(has)) {
    const reads = fills(p);
    const rest = reads.filter((/** @type {any} */ r) => r.when.includes(''));
    const restKept =
      rest.length && !rest.some((/** @type {any} */ r) => changed(r.token));
    // A part on the base's inverted surface (a toast's, or a tooltip drawn
    // in the theme's text color) that no longer stands out from the
    // theme's page (under 3:1 against it in a mode): one that still stands
    // out is drawn so on purpose. Its line, in each mode it disappears in,
    // turns the surface to the theme's own light surface where the page is
    // dark (or the other way), with the text on it the theme's text color.
    const INVERTED = ['--color-background-inverted', '--color-text-primary'];
    const inverted = rest.find((/** @type {any} */ r) =>
      INVERTED.includes(r.token),
    )?.token;
    /** Whether a color stands out from the page in a mode. @param {unknown} v @param {string} m */
    const standsOut = (v, m) => {
      const a = parseColor(String(v));
      const b = parseColor(String(res[m]?.['--color-background-body']));
      return !a || !b || ratio(a, b) >= 3;
    };
    const lost = inverted
      ? modes.filter(m => !standsOut(res[m]?.[inverted], m))
      : [];
    // (Only a surface that holds text: a placeholder block is no surface
    // a reader looks for.)
    const textTokens = textTokensOf(p);
    const holdsText = Boolean(C.MAP[p]?.media) || textTokens.length > 0;
    /**
     * The text on the theme's surface in a mode: the theme's text color
     * where it reads there (4.5:1), else the plain black or white that
     * does (a theme whose surface stays light in dark mode).
     * @param {string} m @param {string} [ground] the token the text sits on
     */
    const readableOn = (m, ground = '--color-background-surface') => {
      const text = String(res[m]?.['--color-text-primary']);
      const t = parseColor(text);
      const g = parseColor(String(res[m]?.[ground]));
      if (!t || !g || ratio(t, g) >= 4.5) return text;
      return ratio([0, 0, 0], g) >= ratio([255, 255, 255], g)
        ? '#000000'
        : '#ffffff';
    };
    /**
     * The line that gives the part the theme's own surface in the modes
     * named, with its text readable on it.
     * @param {string[]} ms
     */
    // Another variant with a fill of its own (an error toast's red) keeps
    // text readable on that fill: its own text step, scoped to it, after
    // the text step for the part.
    const otherFills = reads.flatMap((/** @type {any} */ r) =>
      r.token === inverted
        ? []
        : r.when
            .map((/** @type {string} */ w) =>
              /^([\w-]+)=([\w-]+)$/.exec(w)?.slice(1).join(':'),
            )
            .filter(Boolean)
            .map((/** @type {string} */ when) => ({when, token: r.token})),
    );
    /** @param {string[]} ms */
    const surfaceSteps = ms =>
      inverted === '--color-background-inverted'
        ? // The inverted surface turns to the theme's surface on this part
          // alone (as the color it is: a part may read the surface token
          // for its text; the lightbox and the scrim keep theirs), with its
          // text readable on it: a toast's color (the two colors its media
          // surface gives its text), else each token its text reads.
          ms.flatMap(m => [
            {
              thing: '--color-background-inverted',
              value: String(res[m]?.['--color-background-surface']),
              on: p,
              mode: m,
            },
            ...(C.MAP[p]?.media || !textTokens.length
              ? ['color']
              : textTokens
            ).map(thing => ({
              thing,
              value: readableOn(m),
              on: p,
              mode: m,
            })),
            ...(C.MAP[p]?.media || !textTokens.length
              ? otherFills.map((/** @type {any} */ o) => ({
                  thing: 'color',
                  value: readableOn(m, o.token),
                  on: p,
                  mode: m,
                  when: o.when,
                }))
              : []),
          ])
        : // The surface and the text as the colors they are in that mode (a
          // tooltip's text reads the surface token itself, so a token
          // reference would turn the fill back): the fill, then each token
          // the part's text reads, or its text color when it reads none.
          ms.flatMap(m => [
            {
              thing: 'background-color',
              value: String(res[m]?.['--color-background-surface']),
              on: p,
              mode: m,
            },
            ...(textTokens.length ? textTokens : ['color']).map(thing => ({
              thing,
              value: readableOn(m),
              on: p,
              mode: m,
            })),
          ]);
    // The theme's own surfaces changed (its neutral, surface, card or page
    // color), while the part still paints the base's inverted surface: it
    // keeps the base's dark look beside the theme's (a Win98 theme's grey
    // tooltips). Its line gives it the theme's surface in each mode.
    const ownSurfaces = any(
      /^--color-(neutral|background-(body|surface|card))$/,
    );
    // (Its inverted surface is the base's, or one a dial made from the
    // neutral seed: no setting of the theme's chose it.)
    const chosen = data.settings.some(
      x => x.source === 'token' && x.thing === inverted && !x.on,
    );
    if (
      inverted &&
      holdsText &&
      !covers(p, FILL) &&
      (lost.length
        ? surfaces && restKept
        : ownSurfaces &&
          !chosen &&
          rest.every(
            (/** @type {any} */ r) => r.token === inverted || !changed(r.token),
          ))
    ) {
      const swap = lost.filter(m =>
        standsOut(res[m]?.['--color-background-surface'], m),
      );
      found.push({
        kind: 0,
        part: p,
        why: lost.length
          ? `still the base's inverted surface (${inverted}), which no longer stands out from the page in ${lost.join(' and ')}`
          : `still the base's dark inverted surface (${inverted}); the theme's surfaces changed`,
        aspect: 'background',
        steps: lost.length
          ? swap.length !== lost.length
            ? []
            : surfaceSteps(lost)
          : surfaceSteps(modes),
      });
    }
    if (!accent) continue;
    // A status fill still the base's (a banner's, a badge's status
    // variants): the status color generated at the theme's vibrancy (its
    // dial), with the text that reads on it. Only where that changes the
    // color built: with the vibrancy at the base's, the dial gives the
    // base's own color back, and the part is drawn as the base draws it.
    const statusReads = reads.filter(
      (/** @type {any} */ r) =>
        /-(info|success|warning|error)(-|$)/.test(r.token) &&
        !changed(r.token) &&
        r.when.some(
          (/** @type {string} */ w) => w === '' || /^variant=[\w-]+$/.test(w),
        ),
    );
    const statuses = vibrancyMoved
      ? [
          ...new Set(
            statusReads.map(
              (/** @type {any} */ r) =>
                /** @type {string} */ (
                  /-(info|success|warning|error)(-|$)/.exec(r.token)?.[1]
                ),
            ),
          ),
        ].filter(
          st =>
            !data.settings.some(
              x => x.source === 'dial' && x.thing === STATUS[st][0],
            ),
        )
      : [];
    if (statuses.length && !covers(p, FILL))
      found.push({
        kind: 3,
        part: p,
        why: `still the base's ${statuses.join(', ')} color${statuses.length > 1 ? 's' : ''} (${statusReads[0].token}): not generated at the theme's vibrancy`,
        aspect: 'background',
        steps: statuses.map(st => ({
          thing: STATUS[st][0],
          value: String(base.light?.[STATUS[st][1]] ?? '#1f2937'),
        })),
      });
    // A disabled part drawn as the accent at reduced opacity: with the
    // accent changed, a translucent block of the new accent. Only the
    // variants drawn as the accent, with the text on them.
    const name = ctx.project.target.get(p)?.component;
    const disables = Boolean(
      name && ctx.project.components[name]?.props?.isDisabled,
    );
    const dims = (C.MAP[p]?.own?.opacity?.values ?? []).some(
      (/** @type {unknown} */ v) => Number(v) > 0 && Number(v) < 1,
    );
    const accentVariants = [
      ...new Set(
        reads
          .filter((/** @type {any} */ r) => r.token === '--color-accent')
          .flatMap((/** @type {any} */ r) => r.when)
          .filter((/** @type {string} */ w) => !/:/.test(w))
          .map(
            (/** @type {string} */ w) => /(?:^|\s)variant=(\S+)/.exec(w)?.[1],
          )
          .filter(Boolean),
      ),
    ];
    // (A part drawn as the accent in every variant, a checked indicator,
    // keeps it: its fill says checked or not.)
    if (
      disables &&
      dims &&
      accentVariants.length &&
      !covers(p, FILL, 'disabled')
    ) {
      const whens = accentVariants.map(v => `variant:${v}`);
      found.push({
        kind: 1,
        part: p,
        state: 'disabled',
        why: `disabled, the ${accentVariants.join(', ')} variant is drawn as the accent at reduced opacity, a translucent block of the new accent`,
        aspect: 'background',
        steps: whens.flatMap(when => [
          {
            thing: 'background-color',
            value: 'var(--color-neutral)',
            on: p,
            when,
            state: 'disabled',
          },
          {
            thing: 'color',
            value: 'var(--color-text-primary)',
            on: p,
            when,
            state: 'disabled',
          },
        ]),
      });
    }
    // A state the part draws as a look of its own (a selected item): one
    // whose fill, by the part data, is not the fill the part draws without
    // that state (the same variant and status, the state left out), still
    // the base's. A state that keeps that fill (a readonly field on its
    // surface, a checked switch's thumb) is drawn so on purpose: no line
    // paints it.
    const states = (ctx.project.target.get(p)?.states ?? []).filter(
      (/** @type {string} */ st) => !COMMON_STATES.includes(st),
    );
    for (const st of states) {
      const term = new RegExp(`(^|[\\s,])${st}=\\S+`);
      /** The condition without the state. @param {string} w */
      const without = w => w.replace(term, ' ').replace(/\s+/g, ' ').trim();
      // A tint the state lays over any fill (an overlay token) follows
      // the fill; only a fill of its own is kept from the base.
      const inState = reads.filter(
        (/** @type {any} */ r) =>
          !/^--color-overlay-/.test(r.token) &&
          r.when.some(
            (/** @type {string} */ w) =>
              term.test(w) &&
              !/:/.test(w) &&
              // The same fill without the state: no look of its own.
              !r.when.includes(without(w)),
          ),
      );
      // The base theme's own rule for the state (butter draws its
      // selected nav item with no fill, on purpose) is the look there.
      const baseDraws = ['backgroundColor', 'background'].some(
        prop =>
          baseComponent(/** @type {any} */ (base), ctx, p, prop, {
            state: st,
          }) != null,
      );
      if (
        inState.length &&
        !baseDraws &&
        !inState.some((/** @type {any} */ r) => changed(r.token)) &&
        !covers(p, FILL, st)
      )
        found.push({
          kind: 2,
          part: p,
          state: st,
          why: `${st}, it keeps the base's fill (${inState[0].token})`,
          aspect: 'background',
          steps: [
            {
              thing: 'background-color',
              value: 'var(--color-accent-muted)',
              on: p,
              state: st,
            },
          ],
        });
    }
  }
  // With the theme's own corners at a pill (its element corners as round
  // as --radius-full), a pill part draws what the corners give: none is
  // missed, and a line would change nothing.
  const pillCorners = modes.every(
    m =>
      String(res[m]?.['--radius-element']) ===
      String(res[m]?.['--radius-full']),
  );
  if (corners && !pillCorners)
    for (const p of pillParts(C).filter(
      x => has(x) && !covers(x, /^(border-radius|corners|--radius-[\w-]+)$/),
    ))
      found.push({
        kind: 4,
        part: p,
        why: 'still a full pill: it reads --radius-full, which the corners leave as they are',
        aspect: 'corners',
        steps: [
          {thing: 'border-radius', value: 'var(--radius-element)', on: p},
        ],
      });
  // The theme changed one of its corner sizes and left the other (its
  // element corners, not its container corners): the parts whose corners
  // read the one it left (a popover's, a dialog's, at the container size)
  // keep the base's shape beside the theme's. One line sets the size it
  // left to the size it changed (as the value it has), when that differs
  // from what they draw.
  const RADII = ['--radius-element', '--radius-container'];
  const changedRadius = RADII.find(t => changed(t));
  const keptRadius = RADII.find(t => !changed(t));
  if (
    changedRadius &&
    keptRadius &&
    !data.settings.some(x => x.thing === keptRadius) &&
    modes.some(
      m => String(res[m]?.[keptRadius]) !== String(res[m]?.[changedRadius]),
    )
  ) {
    const kept = Object.keys(C.MAP)
      .filter(has)
      .filter(
        p =>
          !covers(p, /^(border-radius|corners|--radius-[\w-]+)$/) &&
          (C.partReads(p, 'corners') ?? []).some(
            (/** @type {any} */ r) =>
              r.token === keptRadius &&
              r.when.some(
                (/** @type {string} */ w) =>
                  w === '' || !/:|aria-|selected|\[/.test(w),
              ),
          ),
      );
    const lead = ['popover', 'dialog', 'hover-card'].find(p =>
      kept.includes(p),
    );
    if (kept.length) {
      const values = modes.map(m => String(res[m]?.[changedRadius]));
      found.push({
        kind: 4,
        part: lead ?? kept[0],
        why: `still the base's corners (${keptRadius}), beside the theme's ${changedRadius}: ${kept.length} parts read it (${kept.slice(0, 4).join(', ')}${kept.length > 4 ? ', …' : ''})`,
        aspect: 'corners',
        steps: values.every(v => v === values[0])
          ? [{thing: keptRadius, value: values[0]}]
          : modes.map((m, k) => ({
              thing: keptRadius,
              value: values[k],
              mode: m,
            })),
      });
    }
  }
  // A square or outlined look (square corners, or a border width the
  // theme set) beside a soft shadow the base draws (a popover's, a menu's,
  // a dialog's): the shadow with no blur matches it.
  const square = modes.every(m =>
    /^0(px|rem)?$/.test(String(res[m]?.['--radius-element']).trim()),
  );
  // The same look beside the base's focus ring, drawn outside the part with
  // a gap: a ring drawn inside the part's edge matches it.
  const offsets = modes.map(m =>
    String(res[m]?.['--focus-outline-offset'] ?? ''),
  );
  if (
    (square || borders) &&
    !changed('--focus-outline-offset') &&
    !data.settings.some(x => x.thing === '--focus-outline-offset') &&
    offsets.every(
      o => /^\d*\.?\d+(px|rem)?$/.test(o.trim()) && parseFloat(o) > 0,
    )
  )
    found.push({
      kind: 7,
      part: 'focus-ring',
      why: `the focus ring is still drawn ${offsets[0]} outside each part, beside the theme's ${square ? 'square corners' : 'border'}`,
      aspect: 'ring',
      steps: [{thing: '--focus-outline-offset', value: '-2px'}],
    });
  if (square || borders)
    for (const p of Object.keys(C.MAP).filter(has)) {
      if (covers(p, /^(box-shadow|--shadow-[\w-]+)$/)) continue;
      const read = (C.partReads(p, 'shadow') ?? []).find(
        (/** @type {any} */ r) =>
          /^--shadow-/.test(r.token) &&
          r.when.includes('') &&
          !changed(r.token),
      );
      if (!read) continue;
      const hard = modes.map(m => ({
        m,
        v: blurScaled(String(res[m]?.[read.token] ?? ''), 0),
        was: String(res[m]?.[read.token] ?? ''),
      }));
      // Only a shadow with a blur (a line that would change nothing is
      // never offered).
      if (hard.some(h => !h.v || h.v === h.was)) continue;
      const same = hard.every(h => h.v === hard[0].v);
      found.push({
        kind: 6,
        part: p,
        why: `still a soft shadow (${read.token}) beside the theme's ${square ? 'square corners' : 'border'}`,
        aspect: 'shadow',
        steps: same
          ? [{thing: 'box-shadow', value: String(hard[0].v), on: p}]
          : hard.map(h => ({
              thing: 'box-shadow',
              value: String(h.v),
              on: p,
              mode: h.m,
            })),
      });
    }
  if (borders)
    for (const x of borderFrames(
      ctx,
      data,
      'var(--border-width) solid var(--color-border)',
    ))
      found.push({...x, kind: 5, aspect: 'border'});

  // One of each kind first, in the order the kinds are missed most (an
  // inverted surface, a disabled part, a selected state, a status fill,
  // pills, borderless surfaces), then the next of each: six lines reach six
  // kinds of miss, never six of one.
  /** @type {Map<number, typeof found>} */
  const byKind = new Map();
  for (const x of found) byKind.set(x.kind, [...(byKind.get(x.kind) ?? []), x]);
  const kinds = [...byKind.keys()].sort((a, b) => a - b);
  /** @type {typeof found} */
  const ordered = [];
  for (let round = 0; ordered.length < found.length; round++)
    for (const k of kinds) {
      const x = byKind.get(k)?.[round];
      if (x) ordered.push(x);
    }
  return ordered;
}

/**
 * The surfaces a border width does not reach that draw a box of their own
 * (a dialog, a banner, a filled button's variants), each with the steps
 * that frame it with `value`: scoped to the variants that draw a filled
 * box at rest, where some do not (a ghost button); none for a part that
 * draws no box at rest (a ghost toggle button, a menu row), one whose
 * filled variants set cannot name, or one a border setting covers. Show's
 * missed list and set's note on a border width both take them.
 * @param {any} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} value the border each step sets
 * @returns {Array<{part: string, why: string, steps: MissedStep[]}>}
 */
export function borderFrames(ctx, data, value) {
  const C = ctx.C;
  /** @param {string} p */
  const covered = p =>
    data.settings.some(
      x =>
        x.on &&
        !x.state &&
        partsOf(ctx, x).includes(p) &&
        /^(border(-width|-style|-color)?|--border-[\w-]+)$/.test(x.thing),
    );
  /** The fills a part draws (never the shared hover and pressed tints). @param {string} p */
  const fills = p =>
    (C.partReads(p, null) ?? []).filter(
      (/** @type {any} */ r) =>
        /^--color-/.test(r.token) &&
        !/^--color-overlay-/.test(r.token) &&
        r.props.some((/** @type {string} */ x) => /^background/.test(x)),
    );
  /** @type {Array<{part: string, why: string, steps: MissedStep[]}>} */
  const out = [];
  for (const p of borderlessSurfaces(C).filter(
    x => ctx.project.target.has(x) && !covered(x),
  )) {
    // A part whose variants differ, some with a filled box and some with
    // none (a button's ghost): only the variants that draw a filled box
    // at rest get a frame; one with no fill is borderless on purpose.
    const variants = [
      ...new Set(
        fills(p)
          .flatMap((/** @type {any} */ r) => r.when)
          .filter((/** @type {string} */ w) => !/:|aria-|selected|\[/.test(w))
          .map(
            (/** @type {string} */ w) => /(?:^|\s)variant=(\S+)/.exec(w)?.[1],
          )
          .filter(Boolean),
      ),
    ];
    // A part that draws no filled box at rest in any variant (a ghost
    // toggle button, a menu row: their fills are pressed, hover or
    // selected ones) is borderless on purpose: no frame for it.
    const boxAtRest = fills(p).some((/** @type {any} */ r) =>
      r.when.some(
        (/** @type {string} */ w) => w === '' || !/:|aria-|selected|\[/.test(w),
      ),
    );
    if (!boxAtRest) continue;
    const all = /** @type {string[]} */ ([...(C.MAP[p]?.attrs?.variant ?? [])]);
    const scoped = variants.length && all.some(v => !variants.includes(v));
    // Scoped to variants set can name (the part's own variant prop); a
    // part whose filled variants set cannot name is left out: one frame
    // for all of them would frame the ones that draw no box.
    const settable = /** @type {string[]} */ (
      C.variantValues(p)?.variant ?? []
    );
    if (scoped && !variants.every(v => settable.includes(v))) continue;
    out.push({
      part: p,
      why: scoped
        ? `still borderless: the border width reaches no border it does not draw (the ${variants.join(', ')} variant${variants.length > 1 ? 's' : ''}; the others draw no box)`
        : 'still borderless: the border width reaches no border it does not draw',
      steps: (scoped ? variants.map(v => `variant:${v}`) : [undefined]).map(
        when => ({thing: 'border', value, on: p, ...(when ? {when} : {})}),
      ),
    });
  }
  return out;
}
