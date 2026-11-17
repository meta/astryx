// swift-tools-version: 6.0
// Copyright (c) Meta Platforms, Inc. and affiliates.

// Page templates drawn with Astryx's SwiftUI views. Templates are clone-only:
// copy a template's folder into an app and own it from then on. This package
// exists only so the templates compile and are tested against the `Astryx`
// product; it has no products, and `@astryxdesign/native` does not publish it.

import PackageDescription

let package = Package(
  name: "AstryxTemplates",
  platforms: [.iOS(.v17), .macOS(.v14)],
  dependencies: [.package(path: "..")],
  targets: [
    .target(
      name: "AstryxTemplates",
      dependencies: [.product(name: "Astryx", package: "apple")],
      path: ".",
      exclude: ["Package.swift", "Tests"]
    ),
    .testTarget(name: "AstryxTemplatesTests", dependencies: ["AstryxTemplates"], path: "Tests"),
  ]
)
