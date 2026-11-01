// Copyright (c) Meta Platforms, Inc. and affiliates.

extension View {
  /// Draws a theme shadow around this view's shape, as CSS `box-shadow` does:
  /// drop layers only outside the shape, so a see-through view shows no
  /// shadow beneath it, and inset rings inside its edge. A view with a border
  /// passes its width, and inset rings draw inside the border, as CSS draws an
  /// inset shadow inside an element's border.
  func astryxShadow<S: InsettableShape>(_ layers: [ShadowLayer], in shape: S, borderWidth: CGFloat = 0) -> some View {
    background {
      ZStack {
        ForEach(Array(layers.enumerated()), id: \.offset) { _, layer in
          if !layer.isInset {
            // A CSS blur is twice SwiftUI's shadow radius.
            shape.fill(.black)
              .shadow(color: layer.color, radius: layer.blur / 2, x: layer.x, y: layer.y)
          }
        }
      }
      .mask {
        // Everything but the shape itself.
        Rectangle()
          .padding(-Self.shadowReach(layers))
          .overlay(shape.fill(.black).blendMode(.destinationOut))
          .compositingGroup()
      }
    }
    .overlay {
      ForEach(Array(layers.enumerated()), id: \.offset) { _, layer in
        if layer.isInset {
          shape.inset(by: borderWidth).strokeBorder(layer.color, lineWidth: layer.spread)
        }
      }
    }
  }

  /// How far past the shape the layers can draw.
  fileprivate static func shadowReach(_ layers: [ShadowLayer]) -> CGFloat {
    layers.map { $0.blur + max(abs($0.x), abs($0.y)) }.max().map { $0 + 4 } ?? 0
  }
}
