use std::{cmp::Ordering, ops::Range};

use boa_ast::Position;
use itertools::Itertools;

use crate::vm::source_info::Entry;

#[cfg(test)]
mod tests;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct EntryRange {
    start: u32,
    end: u32,
    position: Option<Position>,
}

impl EntryRange {
    fn range(&self) -> Range<u32> {
        self.start..self.end
    }

    fn is_empty(&self) -> bool {
        self.range().is_empty()
    }
}

#[derive(Debug, Default)]
pub(crate) struct SourceMapBuilder {
    entries: Vec<EntryRange>,
    stack: Vec<u32>,
}

impl SourceMapBuilder {
    pub(crate) fn build(self, final_pc: u32) -> Box<[Entry]> {
        assert!(self.stack.is_empty(), "forgot to pop source scope");
        let end_entry = self
            .entries
            .last()
            .copied()
            .map(|entry| EntryRange {
                start: entry.end,
                end: final_pc,
                position: None,
            })
            .unwrap_or_default();

        self.entries
            .into_iter()
            .chain(std::iter::once(end_entry))
            .filter(|entry| !entry.is_empty())
            .dedup_by(|a, b| a.position == b.position)
            .map(|entry| Entry {
                pc: entry.start,
                position: entry.position,
            })
            .collect::<Box<[_]>>()
    }

    pub(crate) fn push_source_position(&mut self, start_pc: u32, position: Option<Position>) {
        let index = self.entries.len() as u32;
        self.entries.push(EntryRange {
            start: start_pc,
            end: u32::MAX,
            position,
        });
        self.stack.push(index);
    }

    // TODO: document implementation range flattening.
    pub(crate) fn pop_source_position(&mut self, current_start_pc: u32) {
        let Some(index) = self.stack.pop().map(|index| index as usize) else {
            panic!("popped more than pushed");
        };

        self.entries[index].end = current_start_pc;

        if self.entries[index].range().is_empty() {
            return;
        }

        let Some(parent) = self.stack.last().copied().map(|index| index as usize) else {
            return;
        };

        let ordering = self.entries[parent].start.cmp(&self.entries[index].start);

        let new_parent_index = match ordering {
            Ordering::Equal => {
                self.entries.swap(parent, index);
                let (parent, index) = (index, parent);

                self.entries[parent].start = self.entries[index].end;

                parent
            }
            Ordering::Less => {
                let old_end = self.entries[parent].end;
                assert_eq!(old_end, u32::MAX, "parent end position should not be set");

                self.entries[parent].end = self.entries[index].start;

                let new_index = self.entries.len();
                self.entries.push(EntryRange {
                    start: self.entries[index].end,
                    end: u32::MAX,
                    position: self.entries[parent].position,
                });
                new_index
            }
            Ordering::Greater => {
                unreachable!("Parent source scope cannot be greater than child scope")
            }
        };

        if let Some(parent) = self.stack.last_mut() {
            *parent = new_parent_index as u32;
        }
    }
}
