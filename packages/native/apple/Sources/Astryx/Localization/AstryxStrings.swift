// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
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

  /// The indicator after an optional field's label.
  static var fieldOptional: String { localized("@astryx.field.optional", "Optional") }
  /// What VoiceOver reads for a read-only field, which SwiftUI cannot mark.
  static var inputReadOnly: String { localized("@astryx.input.readOnly", "Read only") }
  /// The indicator after a required field's label.
  static var fieldRequired: String { localized("@astryx.field.required", "Required") }
  /// The hover and pointer tip on an input's clear button.
  static var clearTooltip: String { localized("@astryx.inputClearButton.tooltip", "Clear") }

  /// The clear button's accessible name, naming the field.
  static func clearLabel(_ label: String) -> String {
    localized("@astryx.textInput.clearLabel", "Clear {label}").replacingOccurrences(of: "{label}", with: label)
  }

  /// The accessible name of an input's status button when its message shows
  /// in a tip.
  static func statusButton(_ type: TextInputStatusType) -> String {
    switch type {
    case .error: localized("@astryx.input.statusButton.error", "Error details")
    case .warning: localized("@astryx.input.statusButton.warning", "Warning details")
    case .success: localized("@astryx.input.statusButton.success", "Success details")
    }
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
