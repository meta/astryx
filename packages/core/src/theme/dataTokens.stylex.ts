// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dataTokens.stylex.ts
 * @input None (canonical data-color token definitions)
 * @output dataVars, DataTokenName
 * @position Public StyleX data-token source; generates the plain JS compatibility view
 *
 * This is the single source of truth for Astryx data-color names and defaults.
 * Run `pnpm generate:data-tokens` after editing the static defaults object.
 */

import * as stylex from '@stylexjs/stylex';

const dataTokenDefaults = {
  // Categorical palette
  '--color-data-categorical-blue': 'light-dark(#0171E3, #0171E3)',
  '--color-data-categorical-orange': 'light-dark(#EB6E00, #EB6E00)',
  '--color-data-categorical-purple': 'light-dark(#6B1EFD, #6B1EFD)',
  '--color-data-categorical-green': 'light-dark(#0B991F, #0B991F)',
  '--color-data-categorical-pink': 'light-dark(#F351C0, #F351C0)',
  '--color-data-categorical-cyan': 'light-dark(#0171A4, #0171A4)',
  '--color-data-categorical-red': 'light-dark(#F5394F, #F5394F)',
  '--color-data-categorical-teal': 'light-dark(#08A3A3, #08A3A3)',
  '--color-data-categorical-brown': 'light-dark(#965E03, #965E03)',
  '--color-data-categorical-indigo': 'light-dark(#6F8AFF, #6F8AFF)',

  // Neutral
  '--color-data-neutral': 'light-dark(#8494A3, #8C939B)',

  // Sequential ramps (5 = darkest, 1 = lightest)
  '--color-data-blue-5': 'light-dark(#02165E, #02165E)',
  '--color-data-blue-4': 'light-dark(#004CBC, #004CBC)',
  '--color-data-blue-3': 'light-dark(#2694FE, #2694FE)',
  '--color-data-blue-2': 'light-dark(#78BEFF, #78BEFF)',
  '--color-data-blue-1': 'light-dark(#DBECFF, #DBECFF)',

  '--color-data-shamrock-5': 'light-dark(#0B603D, #0B603D)',
  '--color-data-shamrock-4': 'light-dark(#138546, #138546)',
  '--color-data-shamrock-3': 'light-dark(#24BB5E, #24BB5E)',
  '--color-data-shamrock-2': 'light-dark(#8EF7AA, #8EF7AA)',
  '--color-data-shamrock-1': 'light-dark(#D6FEE4, #D6FEE4)',

  '--color-data-orange-5': 'light-dark(#A13F04, #A13F04)',
  '--color-data-orange-4': 'light-dark(#D66100, #D66100)',
  '--color-data-orange-3': 'light-dark(#FD9537, #FD9537)',
  '--color-data-orange-2': 'light-dark(#FDB876, #FDB876)',
  '--color-data-orange-1': 'light-dark(#FFE6CF, #FFE6CF)',

  '--color-data-pink-5': 'light-dark(#8E1073, #8E1073)',
  '--color-data-pink-4': 'light-dark(#D123A1, #D123A1)',
  '--color-data-pink-3': 'light-dark(#F989D3, #F989D3)',
  '--color-data-pink-2': 'light-dark(#FEADE3, #FEADE3)',
  '--color-data-pink-1': 'light-dark(#FCE3F4, #FCE3F4)',

  '--color-data-purple-5': 'light-dark(#3E0697, #3E0697)',
  '--color-data-purple-4': 'light-dark(#6B1EFD, #6B1EFD)',
  '--color-data-purple-3': 'light-dark(#9081FF, #9081FF)',
  '--color-data-purple-2': 'light-dark(#B3B0FE, #B3B0FE)',
  '--color-data-purple-1': 'light-dark(#E8E8FB, #E8E8FB)',

  '--color-data-red-5': 'light-dark(#9D0519, #9D0519)',
  '--color-data-red-4': 'light-dark(#D31130, #D31130)',
  '--color-data-red-3': 'light-dark(#FB7D87, #FB7D87)',
  '--color-data-red-2': 'light-dark(#FFB2B8, #FFB2B8)',
  '--color-data-red-1': 'light-dark(#FEE4E6, #FEE4E6)',

  '--color-data-teal-5': 'light-dark(#08767D, #08767D)',
  '--color-data-teal-4': 'light-dark(#0C9293, #0C9293)',
  '--color-data-teal-3': 'light-dark(#0DB7AF, #0DB7AF)',
  '--color-data-teal-2': 'light-dark(#6CE6D8, #6CE6D8)',
  '--color-data-teal-1': 'light-dark(#D7FCF8, #D7FCF8)',

  '--color-data-yellow-5': 'light-dark(#8A5001, #8A5001)',
  '--color-data-yellow-4': 'light-dark(#D69804, #D69804)',
  '--color-data-yellow-3': 'light-dark(#FBCE03, #FBCE03)',
  '--color-data-yellow-2': 'light-dark(#FCEC85, #FCEC85)',
  '--color-data-yellow-1': 'light-dark(#FDF6BA, #FDF6BA)',

  '--color-data-gray-5': 'light-dark(#25363F, #333338)',
  '--color-data-gray-4': 'light-dark(#5D6C7B, #666A72)',
  '--color-data-gray-3': 'light-dark(#AFB9C4, #B2B8BE)',
  '--color-data-gray-2': 'light-dark(#CCD3DB, #D0D3D6)',
  '--color-data-gray-1': 'light-dark(#F1F4F7, #F2F4F6)',
} as const;

/** Public StyleX data-color variables. The complete 56-token group is atomic. */
export const dataVars = stylex.defineVars(dataTokenDefaults);

export type DataTokenName = keyof typeof dataTokenDefaults;
