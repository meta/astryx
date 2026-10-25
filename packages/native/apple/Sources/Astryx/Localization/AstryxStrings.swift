// Copyright (c) Meta Platforms, Inc. and affiliates.

import Foundation

/// Core's catalog messages, read from `Resources/<locale>.lproj`, which
/// `generate:swift-ios` writes from core's locale catalogs.
enum AstryxStrings {
  /// What a loading button says to assistive technology.
  static var buttonLoading: String { localized("@astryx.button.loading", "Loading") }

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
