// Copyright (c) Meta Platforms, Inc. and affiliates.

import Foundation
import Testing
@testable import Astryx

// The loading message comes from core's locale catalogs, so VoiceOver speaks
// it in the person's language.

@Test func theLoadingMessageIsLocalizedFromCoresCatalog() throws {
  func message(in locale: String) throws -> String {
    // SwiftPM may change a localization folder's case, so match it loosely.
    let resources = AstryxStrings.resourceBundle
    let name = try #require(resources.localizations.first { $0.lowercased() == locale.lowercased() })
    let path = try #require(resources.path(forResource: name, ofType: "lproj"))
    let bundle = try #require(Bundle(path: path))
    return bundle.localizedString(forKey: "@astryx.button.loading", value: nil, table: nil)
  }
  #expect(try message(in: "en") == "Loading")
  #expect(try message(in: "de") == "Wird geladen")
  #expect(try message(in: "pt-BR") == "Carregando")
  #expect(try message(in: "ja") != "Loading")
}
