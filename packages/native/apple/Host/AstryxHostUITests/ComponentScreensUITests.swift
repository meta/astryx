// Copyright (c) Meta Platforms, Inc. and affiliates.

import XCTest

/// UI tests against the host app on the iOS Simulator: what VoiceOver and the
/// system's accessibility audit see in a running app, which a unit test
/// cannot measure (AST-093 FR5).
@MainActor
final class ComponentScreensUITests: XCTestCase {
  /// Every component screen the host app offers, in its order.
  static let screens = ["Banner", "Button", "Card", "Heading", "Icon", "Text", "TextInput"]

  static let loadingLabel =
    "A loading button keeps its label at zero opacity under the spinner so its width holds; the audit measures that hidden label."
  static let scrolledValue =
    "At the largest text size the unfocused field cuts off the email with an ellipsis; at the default size the screenshot shows the whole value, and the audit's reason is not known."

  /// Audit issues found when the audit first ran, each with what is known of
  /// its cause. Any other issue fails, and so does a listed issue that no
  /// longer occurs, so the list only shrinks.
  static let knownAuditIssues: [String: String] = [
    "Button 'Sending', default text: Contrast failed": loadingLabel,
    "Button 'Sending', largest text: Contrast failed": loadingLabel,
    "TextInput 'Email', default text: Text clipped": scrolledValue,
    "TextInput 'Email', largest text: Text clipped": scrolledValue,
  ]

  override func setUp() {
    continueAfterFailure = true
  }

  /// Text sizes the audit runs at: the default and the largest.
  static let textSizes: [(name: String, category: String?)] = [
    ("default text", nil),
    ("largest text", "UICTContentSizeCategoryAccessibilityXXXL"),
  ]

  private func launch(_ screen: String, textSize: String? = nil) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-component", screen]
    if let textSize {
      app.launchArguments += ["-UIPreferredContentSizeCategoryName", textSize]
    }
    app.launch()
    XCTAssertTrue(
      app.descendants(matching: .any)["screen.\(screen)"].waitForExistence(timeout: 10),
      "\(screen) screen did not appear"
    )
    return app
  }

  private func attachScreenshot(_ app: XCUIApplication, named name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// The host app lists exactly the screens these tests audit, so a new
  /// component screen cannot skip the audit.
  func testEveryScreenIsAudited() {
    let app = XCUIApplication()
    app.launch()
    for screen in Self.screens {
      XCTAssertTrue(app.buttons[screen].waitForExistence(timeout: 10), "\(screen) is missing from the host app")
    }
    XCTAssertEqual(app.cells.count, Self.screens.count, "the host app has a screen these tests do not audit")
  }

  /// The system accessibility audit (contrast, element detection, hit
  /// regions, Dynamic Type, traits, clipped text) on every screen, at the
  /// default and the largest text size. An issue not in knownAuditIssues
  /// fails the test with the element and the audit's own words.
  func testEveryScreenPassesTheAccessibilityAudit() throws {
    var issues: [String] = []
    for (sizeName, category) in Self.textSizes {
      for screen in Self.screens {
        let app = launch(screen, textSize: category)
        attachScreenshot(app, named: "\(screen), \(sizeName)")
        try app.performAccessibilityAudit { issue in
          let element = issue.element.map { "'\($0.label)'" } ?? "the screen"
          issues.append("\(screen) \(element), \(sizeName): \(issue.compactDescription)")
          return true
        }
        app.terminate()
      }
    }
    // One failure each for new and for fixed issues, listing them all.
    let new = issues.filter { Self.knownAuditIssues[$0] == nil }
    let fixed = Self.knownAuditIssues.keys.filter { !issues.contains($0) }.sorted()
    XCTAssertTrue(new.isEmpty, "New accessibility audit issues: " + new.joined(separator: "; "))
    XCTAssertTrue(
      fixed.isEmpty, "Fixed, so remove them from knownAuditIssues: " + fixed.joined(separator: "; "))
  }

  /// What VoiceOver reads for Button: its label, the button role, Loading as
  /// the value while loading, and dimmed when disabled; a loading button
  /// stays focusable but its tap does nothing.
  func testButtonAccessibilityTree() {
    let app = launch("Button")
    let taps = app.staticTexts["button.taps"]

    let save = app.buttons["Save"]
    XCTAssertTrue(save.exists)
    XCTAssertEqual(save.elementType, .button)
    XCTAssertTrue(save.isEnabled)
    XCTAssertEqual(save.value as? String ?? "", "")

    let sending = app.buttons["Sending"]
    XCTAssertTrue(sending.exists)
    XCTAssertTrue(sending.isEnabled, "a loading button stays focusable")
    XCTAssertEqual(sending.value as? String, "Loading")

    let delete = app.buttons["Delete"]
    XCTAssertTrue(delete.exists)
    XCTAssertFalse(delete.isEnabled)

    save.tap()
    XCTAssertEqual(taps.label, "Taps: 1")
    sending.tap()
    XCTAssertEqual(taps.label, "Taps: 1", "a loading button ignores taps")
    attachScreenshot(app, named: "Button after taps")
  }

  /// What VoiceOver reads for TextInput: each field is named by its visible
  /// label (which is not read twice), keeps its value, and a password field
  /// is secure.
  func testTextInputAccessibilityTree() {
    let app = launch("TextInput")

    let name = app.textFields["Name"]
    XCTAssertTrue(name.exists, "the field is named by its label")
    XCTAssertEqual(name.placeholderValue, "Your name")

    let email = app.textFields["Email"]
    XCTAssertTrue(email.exists)
    XCTAssertEqual(email.value as? String, "ada@example.com")

    XCTAssertTrue(app.secureTextFields["Password"].exists, "a password field is secure")
    XCTAssertFalse(app.staticTexts["Name"].exists, "the visible label is not read again as text")

    name.tap()
    name.typeText("Ada")
    XCTAssertEqual(name.value as? String, "Ada")
  }

  /// What VoiceOver reads for Text: each text is one static text with its
  /// words.
  func testTextAccessibilityTree() {
    let app = launch("Text")
    XCTAssertTrue(app.staticTexts["Body text that wraps onto a second line when the screen is narrow."].exists)
    XCTAssertTrue(app.staticTexts["Large"].exists)
    XCTAssertTrue(app.staticTexts["Secondary"].exists)
  }

  /// What VoiceOver reads for Heading: each level is a static text with its
  /// words. Its header trait is not readable through XCUITest, so the unit
  /// tests assert it instead.
  func testHeadingAccessibilityTree() {
    let app = launch("Heading")
    for level in 1...6 {
      XCTAssertTrue(app.staticTexts["Heading level \(level)"].exists, "level \(level)")
    }
  }

  /// What VoiceOver reads for Card: the card adds no element of its own, and
  /// its heading and text stay reachable inside it.
  func testCardAccessibilityTree() {
    let app = launch("Card")
    XCTAssertTrue(app.staticTexts["Order 1042"].exists)
    XCTAssertTrue(app.staticTexts["Two items, arriving Thursday."].exists)
  }

  /// What VoiceOver reads for Icon: a labeled icon is an image named by its
  /// label; an unlabeled icon is decorative and not read.
  func testIconAccessibilityTree() {
    let app = launch("Icon")
    XCTAssertTrue(app.images["Search"].exists)
    XCTAssertTrue(app.images["Done"].exists)
    XCTAssertEqual(app.images.count, 2, "the unlabeled icon is decorative")
  }

  /// What VoiceOver reads for Banner: one element per banner, reading its
  /// title then its description. XCUITest still lists the parts inside that
  /// element, so the test does not check that they are skipped.
  func testBannerAccessibilityTree() {
    let app = launch("Banner")
    let banners = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "Changes saved, Your draft is up to date."))
    XCTAssertEqual(banners.count, 4, "one element per banner, title then description")
  }
}
