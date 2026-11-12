// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tells whether the visitor's connection asks the site to send less data.
 * @input The browser's Network Information hints, where it has them.
 * @output True in a data-saving mode or on a 2G connection.
 * @position Shared by code that downloads ahead of need: the template thumbnail prefetch (components/templatePrefetch.ts) and the theme showcase photo warm-up (components/themeShowcaseWarmup.ts).
 */

type NetworkInformation = {saveData?: boolean; effectiveType?: string};

/**
 * Whether work that downloads ahead of need must not run: the visitor asked
 * to save data, or the connection is 2G. A browser without these hints
 * reports neither.
 */
export function prefersReducedData(): boolean {
  const {connection} = navigator as Navigator & {
    connection?: NetworkInformation;
  };
  return (
    connection?.saveData === true || /2g/.test(connection?.effectiveType ?? '')
  );
}
