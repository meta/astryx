// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file containerCorners.stylex.ts
 * @input Uses @stylexjs/stylex
 * @output containerCornerStyles: the corner publication rounded padding
 *   publishers share, and the corner reading of a host's radius
 * @position Layout utility beside container(). Internal: the package does not
 *   export `containerCornerStyles`. The `--container-corner-*` variables it
 *   sets are in the shipped CSS, but no API documents them; only Table and
 *   List read them.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Corner publication for a rounded padding publisher (Card, Dialog). The host
 * copies its radius variables into the host variables that `fromHostRadius`
 * reads. `fromHostRadius` works out `--_container-corner-start-start`,
 * `-start-end`, `-end-start` and `-end-end`. A radius of different corners
 * then reaches the child as it is drawn.
 *
 * A corner goes only to the host's first or last child when that child reads
 * corners (it carries `data-container-corner`). A reader deeper inside could
 * take a corner it does not reach, so then no corner goes out.
 */
export const containerCornerStyles = stylex.create({
  /**
   * Each corner of the host's radius, as a full-bleed child takes it. The
   * host copies its radius variables into `--_container-host-radius` and
   * `--_container-host-radius-<corner>` (the corner variables the theme
   * pipeline writes). A corner reads its logical variable, then the physical
   * corner it is in this direction, then the one radius. The shorthand
   * clears the logical corners, so a logical corner wins only when the theme
   * writes it last.
   */
  fromHostRadius: {
    '--_container-corner-start-start': {
      default:
        'var(--_container-host-radius-start-start, var(--_container-host-radius-top-left, var(--_container-host-radius)))',
      ':dir(rtl)':
        'var(--_container-host-radius-start-start, var(--_container-host-radius-top-right, var(--_container-host-radius)))',
    },
    '--_container-corner-start-end': {
      default:
        'var(--_container-host-radius-start-end, var(--_container-host-radius-top-right, var(--_container-host-radius)))',
      ':dir(rtl)':
        'var(--_container-host-radius-start-end, var(--_container-host-radius-top-left, var(--_container-host-radius)))',
    },
    '--_container-corner-end-start': {
      default:
        'var(--_container-host-radius-end-start, var(--_container-host-radius-bottom-left, var(--_container-host-radius)))',
      ':dir(rtl)':
        'var(--_container-host-radius-end-start, var(--_container-host-radius-bottom-right, var(--_container-host-radius)))',
    },
    '--_container-corner-end-end': {
      default:
        'var(--_container-host-radius-end-end, var(--_container-host-radius-bottom-right, var(--_container-host-radius)))',
      ':dir(rtl)':
        'var(--_container-host-radius-end-end, var(--_container-host-radius-bottom-left, var(--_container-host-radius)))',
    },
  },
  publish: {
    '--container-corner-start-start': {
      default: '0px',
      ':has(> [data-container-corner]:first-child)': {
        default: 'var(--_container-corner-start-start, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-start-end': {
      default: '0px',
      ':has(> [data-container-corner]:first-child)': {
        default: 'var(--_container-corner-start-end, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-end-start': {
      default: '0px',
      ':has(> [data-container-corner]:last-child)': {
        default: 'var(--_container-corner-end-start, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-end-end': {
      default: '0px',
      ':has(> [data-container-corner]:last-child)': {
        default: 'var(--_container-corner-end-end, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
  },
});
