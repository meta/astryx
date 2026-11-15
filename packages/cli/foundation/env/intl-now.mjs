// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The locale and time zone this process's Intl uses by default, asked
 *   now.
 * @input Nothing; Intl's defaults.
 * @output `intlNow()`: `{locale, timezone}`, each a string or null.
 * @position Shared by the debug record's environment snapshot
 *   (debug/event.mjs) and the copy of the answer kept between runs
 *   (env/intl-defaults.mjs). A process's first Intl call loads ICU's data.
 */

/**
 * The locale and time zone Intl gives this process by default, asked now, as
 * Intl gives them: a TZ that holds a POSIX rule leaves the zone undefined.
 * @returns {{locale: string | null, timezone: string | null}}
 */
export function intlNow() {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    return {locale: resolved.locale, timezone: resolved.timeZone};
  } catch {
    return {locale: null, timezone: null};
  }
}
