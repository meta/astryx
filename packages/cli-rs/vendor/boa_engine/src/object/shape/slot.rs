use bitflags::bitflags;
pub(crate) type SlotIndex = u32;

bitflags! {
    /// Attributes of a slot.
    #[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub(crate) struct SlotAttributes: u8 {
        const WRITABLE = 0b0000_0001;
        const ENUMERABLE = 0b0000_0010;
        const CONFIGURABLE = 0b0000_0100;
        const GET = 0b0000_1000;
        const SET = 0b0001_0000;

        const INLINE_CACHE_BITS = 0b1110_0000;
        const PROTOTYPE    = 0b0010_0000;
        const FOUND        = 0b0100_0000;
        const NOT_CACHEABLE = 0b1000_0000;
    }
}

impl SlotAttributes {
    pub(crate) const fn is_accessor_descriptor(self) -> bool {
        self.contains(Self::GET) || self.contains(Self::SET)
    }

    pub(crate) const fn has_get(self) -> bool {
        self.contains(Self::GET)
    }
    pub(crate) const fn has_set(self) -> bool {
        self.contains(Self::SET)
    }

    /// Check if slot type width matches, this can only happens,
    /// if they are both accessors, or both data properties.
    pub(crate) const fn width_match(self, other: Self) -> bool {
        self.is_accessor_descriptor() == other.is_accessor_descriptor()
    }

    /// Get the width of the slot.
    pub(crate) fn width(self) -> u32 {
        // accessor take 2 positions in the storage to accommodate for the `get` and `set` fields.
        1 + u32::from(self.is_accessor_descriptor())
    }

    pub(crate) const fn is_cacheable(self) -> bool {
        !self.contains(Self::NOT_CACHEABLE) && self.contains(Self::FOUND)
    }

    #[cfg(test)]
    pub(crate) const fn in_prototype(self) -> bool {
        self.contains(Self::PROTOTYPE)
    }
}

/// Represents an [`u32`] index and it's slot attributes of an element in a object storage.
///
/// Slots can have different width depending on its attributes, accessors properties have width `2`,
/// while data properties have width `1`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Slot {
    pub(crate) index: SlotIndex,
    pub(crate) attributes: SlotAttributes,
}

impl Slot {
    pub(crate) const fn new() -> Self {
        Self {
            index: 0,
            attributes: SlotAttributes::empty(),
        }
    }

    pub(crate) const fn is_cacheable(self) -> bool {
        self.attributes.is_cacheable()
    }

    #[cfg(test)]
    pub(crate) const fn in_prototype(self) -> bool {
        self.attributes.in_prototype()
    }

    /// Get the width of the slot.
    pub(crate) fn width(self) -> u32 {
        self.attributes.width()
    }

    /// Calculate next slot from previous one.
    ///
    /// This is needed because slots do not have the same width.
    pub(crate) fn from_previous(
        previous_slot: Option<Self>,
        new_attributes: SlotAttributes,
    ) -> Self {
        // If there was no previous slot then return 0 as the index.
        let Some(previous_slot) = previous_slot else {
            return Self {
                index: 0,
                attributes: new_attributes,
            };
        };

        Self {
            index: previous_slot.index + previous_slot.width(),
            attributes: new_attributes,
        }
    }

    pub(crate) fn set_not_cacheable_if_already_prototype(&mut self) {
        // NOTE(HalidOdat): This is a bit of a hack to avoid conditional branches.
        //
        // Equivalent to:
        // if slot.attributes.contains(SlotAttributes::PROTOTYPE) {
        //     slot.attributes |= SlotAttributes::NOT_CACHEABLE;
        // }
        //
        self.attributes |= SlotAttributes::from_bits_retain(
            (self.attributes.bits() & SlotAttributes::PROTOTYPE.bits()) << 2,
        );
    }
}
