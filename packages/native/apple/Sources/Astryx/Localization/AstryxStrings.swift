// Copyright (c) Meta Platforms, Inc. and affiliates.

import Foundation

/// Core's catalog messages, read from `Resources/<locale>.lproj`, which
/// `generate:swift-ios` writes from core's locale catalogs.
enum AstryxStrings {
  /// What a loading button says to assistive technology.
  static var buttonLoading: String { localized("@astryx.button.loading", "Loading") }
  /// An avatar's name with its status, such as "Ada Lovelace, Online".
  static func avatarNameWithStatus(name: String, status: String) -> String {
    fill(localized("@astryx.avatar.nameWithStatus", "{name}, {status}"), ["name": name, "status": status])
  }

  /// Fills each `{key}` placeholder in a message once, in one pass, as core's
  /// messages do, so a value that itself contains a placeholder stays as it is.
  /// An unknown placeholder stays in place.
  static func fill(_ template: String, _ values: [String: String]) -> String {
    var result = ""
    var rest = template[...]
    while let open = rest.firstIndex(of: "{") {
      result += rest[..<open]
      guard let close = rest[open...].firstIndex(of: "}") else {
        rest = rest[open...]
        break
      }
      let key = String(rest[rest.index(after: open)..<close])
      result += values[key] ?? String(rest[open...close])
      rest = rest[rest.index(after: close)...]
    }
    return result + rest
  }

  /// What a busy view announces when it starts loading.
  static var spinnerLoading: String { localized("@astryx.spinner.loading", "Loading") }
  /// A thumbnail's name when it has no alt or label.
  static var thumbnailFallbackName: String { localized("@astryx.thumbnail.fallbackName", "Thumbnail") }
  /// The name of a thumbnail's open button.
  static func thumbnailOpen(_ accessibleName: String) -> String {
    fill(localized("@astryx.thumbnail.open", "Open {accessibleName}"), ["accessibleName": accessibleName])
  }
  /// The name of a thumbnail's remove button.
  static func thumbnailRemove(_ accessibleName: String) -> String {
    fill(localized("@astryx.thumbnail.remove", "Remove {accessibleName}"), ["accessibleName": accessibleName])
  }

  static func localized(_ key: String, _ english: String) -> String {
    resourceBundle.localizedString(forKey: key, value: english, table: nil)
  }

  static var resourceBundle: Bundle {
    #if SWIFT_PACKAGE
    Bundle.module
    #else
    Bundle.main
    #endif
  }
}
