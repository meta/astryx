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
import {baseComponent, partsOf} from './_settings.mjs';
import {borderlessSurfaces, pillParts} from './_check.mjs';
import {parseColor, ratio} from './_color.mjs';

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
  const modes = Object.keys(res).filter(m => m === 'light' || m === 'dark');
  /** @param {string} token */
  const changed = token =>
    modes.some(m => String(res[m]?.[token]) !== String(base[m]?.[token]));
  const tokens = Object.keys(res[modes[0]] ?? {});
  const any = (/** @type {RegExp} */ re) =>
    tokens.some(t => re.test(t) && changed(t));
  const accent = any(/^--color-(accent|on-accent|text-accent)/);
  const surfaces = any(/^--color-background-(body|surface)$/);
  const corners = any(/^--radius-(?!full$)/);
  const borders = any(/^--border-width/);
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
  /** The parts drawn at rest on the inverted surface. */
  const onInverted = Object.keys(C.MAP).filter(
    q =>
      has(q) &&
      fills(q).some(
        (/** @type {any} */ r) =>
          r.token === '--color-background-inverted' &&
          r.when.some((/** @type {string} */ w) => !/:|selected/.test(w)),
      ),
  );
  // The status colors, by the word their tokens carry, and the dial that
  // generates each with the text that reads on it.
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
    if (
      surfaces &&
      restKept &&
      inverted &&
      holdsText &&
      lost.length &&
      !covers(p, FILL)
    ) {
      const swap = lost.filter(m =>
        standsOut(res[m]?.['--color-background-surface'], m),
      );
      found.push({
        kind: 0,
        part: p,
        why: `still the base's inverted surface (${inverted}), which no longer stands out from the page in ${lost.join(' and ')}`,
        aspect: 'background',
        // The inverted surface itself is the theme's own token: it turns to
        // the light surface in that mode, and Core picks the text on it
        // (a toast). A part drawn in the text color gets that surface with
        // the text color on it.
        steps:
          swap.length !== lost.length
            ? []
            : inverted === '--color-background-inverted'
              ? // The theme's inverted surface turns to its light surface
                // (as the color it is: a part may read the surface token
                // for its text), and the text of each part drawn on it
                // that reads a token (a tooltip's) turns to the text
                // color; a toast picks its own text from the surface.
                lost.flatMap(m => [
                  {
                    thing: '--color-background-inverted',
                    value: String(res[m]?.['--color-background-surface']),
                    mode: m,
                  },
                  ...onInverted.flatMap(q =>
                    textTokensOf(q).map(thing => ({
                      thing,
                      value: String(res[m]?.['--color-text-primary']),
                      on: q,
                      mode: m,
                    })),
                  ),
                ])
              : // The surface and the text as the colors they are in that
                // mode (a tooltip's text reads the surface token itself, so
                // a token reference would turn the fill back): the fill,
                // then each token the part's text reads, or its text color
                // when it reads none.
                lost.flatMap(m => [
                  {
                    thing: 'background-color',
                    value: String(res[m]?.['--color-background-surface']),
                    on: p,
                    mode: m,
                  },
                  ...(textTokens.length ? textTokens : ['color']).map(
                    thing => ({
                      thing,
                      value: String(res[m]?.['--color-text-primary']),
                      on: p,
                      mode: m,
                    }),
                  ),
                ]),
      });
    }
    if (!accent) continue;
    // A status fill still the base's: the status color generated at the
    // theme's vibrancy (its dial), with the text that reads on it.
    const status = restKept
      ? /** @type {string | undefined} */ (
          rest
            .map(
              (/** @type {any} */ r) =>
                /-(info|success|warning|error)(-|$)/.exec(r.token)?.[1],
            )
            .find(Boolean)
        )
      : undefined;
    if (
      status &&
      !covers(p, FILL) &&
      !data.settings.some(
        x => x.source === 'dial' && x.thing === STATUS[status][0],
      )
    )
      found.push({
        kind: 3,
        part: p,
        why: `still the base's ${status} color (${rest[0].token}): the ${STATUS[status][0]} color is not generated`,
        aspect: 'background',
        steps: [
          {
            thing: STATUS[status][0],
            value: String(base.light?.[STATUS[status][1]] ?? '#1f2937'),
          },
        ],
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
  if (borders)
    for (const p of borderlessSurfaces(C).filter(
      x =>
        has(x) &&
        !covers(x, /^(border(-width|-style|-color)?|--border-[\w-]+)$/),
    )) {
      // A part whose variants differ, some with a filled box and some with
      // none (a button's ghost): only the variants that draw a filled box
      // at rest get a frame; one with no fill is borderless on purpose.
      const variants = [
        ...new Set(
          fills(p)
            .filter(
              (/** @type {any} */ r) => !/^--color-overlay-/.test(r.token),
            )
            .flatMap((/** @type {any} */ r) => r.when)
            .filter((/** @type {string} */ w) => !/:|aria-|selected|\[/.test(w))
            .map(
              (/** @type {string} */ w) => /(?:^|\s)variant=(\S+)/.exec(w)?.[1],
            )
            .filter(Boolean),
        ),
      ];
      const all = /** @type {string[]} */ ([
        ...(C.MAP[p]?.attrs?.variant ?? []),
      ]);
      const scoped = variants.length && all.some(v => !variants.includes(v));
      // Scoped to variants set can name (the part's own variant prop); a
      // part whose filled variants set cannot name is left out: one frame
      // for all of them would frame the ones that draw no box.
      const settable = /** @type {string[]} */ (
        C.variantValues(p)?.variant ?? []
      );
      if (scoped && !variants.every(v => settable.includes(v))) continue;
      found.push({
        kind: 5,
        part: p,
        why: scoped
          ? `still borderless: the border width reaches no border it does not draw (the ${variants.join(', ')} variant${variants.length > 1 ? 's' : ''}; the others draw no box)`
          : 'still borderless: the border width reaches no border it does not draw',
        aspect: 'border',
        steps: (scoped ? variants.map(v => `variant:${v}`) : [undefined]).map(
          when => ({
            thing: 'border',
            value: 'var(--border-width) solid var(--color-border)',
            on: p,
            ...(when ? {when} : {}),
          }),
        ),
      });
    }

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
