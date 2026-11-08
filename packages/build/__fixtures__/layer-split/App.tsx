// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Product code, for the layer-split build fixture. It uses an Astryx component
 * AND authors its own StyleX in the same tree, which is the case the split
 * exists for: the two must not land in the same cascade layer.
 *
 * `themedButton` deliberately sets the same property the fixture theme
 * overrides on the same element, so the built stylesheet answers which layer
 * wins rather than only which rules were emitted.
 *
 * The `data-*` swatches use the public StyleX data variables. Importing that
 * group emits the canonical defaults in `astryx-base`; the fixture then asks
 * whether a theme override wins and whether a nested theme inherits it.
 */

import * as stylex from '@stylexjs/stylex';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {Button} from '@astryxdesign/core/Button';
import {Theme} from '@astryxdesign/core/theme';
import {nestedTheme, nestedDarkTheme} from './theme';

const integrityPulse = stylex.keyframes({
  from: {opacity: 0.271},
  to: {opacity: 0.913},
});

const styles = stylex.create({
  productBox: {
    backgroundColor: 'rgb(238, 238, 238)',
    padding: '11px',
    animationName: integrityPulse,
    animationDuration: '717ms',
    '::after': {
      content: '""',
      borderTopColor: 'rgb(1, 2, 3)',
      borderTopStyle: 'solid',
      borderTopWidth: '7px',
    },
  },
  themedButton: {
    backgroundColor: 'rgb(255, 140, 0)',
  },
});

export function App() {
  return (
    <div id="product-box" {...stylex.props(styles.productBox)}>
      <Button id="library-only" label="Delete" variant="destructive" />
      <Button
        id="product-wins"
        label="Delete"
        variant="destructive"
        xstyle={styles.themedButton}
      />
      <span
        id="data-default"
        style={{color: dataVars['--color-data-categorical-orange']}}>
        default
      </span>
      <span
        id="data-override"
        style={{color: dataVars['--color-data-categorical-blue']}}>
        overridden
      </span>
      <Theme theme={nestedTheme}>
        <span
          id="data-nested"
          style={{color: dataVars['--color-data-categorical-blue']}}>
          nested, inherited
        </span>
        <span
          id="data-nested-default"
          style={{color: dataVars['--color-data-categorical-orange']}}>
          nested, default
        </span>
      </Theme>
      <Theme theme={nestedDarkTheme} mode="dark">
        <span
          id="data-dark"
          style={{color: dataVars['--color-data-categorical-blue']}}>
          dark, inherited
        </span>
        <span
          id="data-dark-default"
          style={{color: dataVars['--color-data-neutral']}}>
          dark, default
        </span>
      </Theme>
    </div>
  );
}
