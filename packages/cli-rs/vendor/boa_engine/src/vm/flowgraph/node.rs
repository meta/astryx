use crate::vm::flowgraph::Color;

/// Represents the shape of a node in the flowgraph.
#[derive(Debug, Clone, Copy)]
pub enum NodeShape {
    /// Represents the default shape used in the graph.
    None,
    /// Represents a rectangular node shape.
    Record,
    /// Represents a diamond node shape.
    Diamond,
}

/// This represents a node in the flowgraph.
#[derive(Debug, Clone)]
pub struct Node {
    /// The opcode location.
    pub(super) location: usize,
    /// The shape of the opcode.
    pub(super) shape: NodeShape,
    /// The label/contents of the node.
    pub(super) label: Box<str>,
    /// The background color of the node.
    pub(super) color: Color,
}

impl Node {
    /// Construct a new node.
    pub(super) fn new(location: usize, shape: NodeShape, label: Box<str>, color: Color) -> Self {
        Self {
            location,
            shape,
            label,
            color,
        }
    }
}
