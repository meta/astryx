// Copyright (c) Meta Platforms, Inc. and affiliates.

import Foundation

/// An `href` as a link reads it: control characters removed and surrounding
/// whitespace trimmed, as core's shared destination rule does.
func astryxNormalizedHref(_ href: String) -> String {
  String(String.UnicodeScalarView(
    href.unicodeScalars.filter { $0.value > 0x1F && $0.value != 0x7F }
  )).trimmingCharacters(in: .whitespacesAndNewlines)
}

/// A destination a link may open, normalized as core's shared rule does, or
/// nil for a script URL or an HTML document in a `data:` URL, which core's
/// navigation destinations refuse (`family:navigation-destinations` FR4).
/// The scheme is compared in lowercase without the spaces after its colon,
/// which a data URL's media type ignores (`data: text/html` is HTML).
func astryxSafeDestination(_ href: String) -> String? {
  let normalized = astryxNormalizedHref(href)
  var comparable = normalized.lowercased()
  if let colon = comparable.firstIndex(of: ":"),
     comparable[..<colon].range(of: "^[a-z][a-z0-9+.-]*$", options: .regularExpression) != nil {
    let rest = comparable[comparable.index(after: colon)...].drop { $0 == " " }
    comparable = String(comparable[...colon]) + rest
  }
  for blocked in ["javascript:", "vbscript:", "data:text/html"] where comparable.hasPrefix(blocked) {
    return nil
  }
  return normalized
}

/// A non-empty `href` that is not an absolute URL, such as a web path. Pass
/// the `href` as the view's link reads it, so the check and the link agree.
func astryxIsUnusableHref(_ href: String?) -> Bool {
  guard let href, !href.isEmpty else { return false }
  guard let url = URL(string: href) else { return true }
  return url.scheme == nil
}

/// Stops a development build on an `href` an app cannot open, naming the
/// component and the value; a release build draws the view without a link.
func astryxCheckHref(_ href: String?, in component: String) {
  #if DEBUG
  if astryxIsUnusableHref(href) {
    assertionFailure("\(component) href \"\(href ?? "")\" is not an absolute URL an app can open; it draws without a link.")
  }
  #endif
}
