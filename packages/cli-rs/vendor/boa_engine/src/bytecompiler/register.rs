use crate::vm::opcode::RegisterOperand;
use std::mem::forget;

bitflags::bitflags! {
    #[derive(Debug, Default, Clone, Copy)]
    struct RegisterFlags: u8 {
        /// Whether the register is still in use (not deallocated).
        const USED       = 0b0000_0001;

        const PERSISTENT = 0b0000_0010;
    }
}

impl RegisterFlags {
    fn is_used(self) -> bool {
        self.contains(Self::USED)
    }
    fn is_persistent(self) -> bool {
        self.contains(Self::PERSISTENT)
    }
}

/// An entry in the [`RegisterAllocator`].
#[derive(Debug, Default)]
pub(crate) struct RegisterEntry {
    flags: RegisterFlags,
}

/// Represent a VM register.
///
/// This is intended to be passed by reference or to be moved, dropping this is a bug,
/// it should only be dropped though the [`RegisterAllocator::dealloc()`] method.
/// This doesn't apply to persistent registers.
///
/// A [`Register`] is index into the register allocator,
/// as well as an index into the per-frame register file on each [`CallFrame`](crate::vm::CallFrame).
#[derive(Debug)]
pub(crate) struct Register {
    index: u32,
    flags: RegisterFlags,
}

impl Register {
    /// The index of the [`Register`].
    pub(crate) fn index(&self) -> u32 {
        self.index
    }

    /// The index of the [`Register`] as a [`RegisterOperand`].
    pub(crate) fn variable(&self) -> RegisterOperand {
        self.index.into()
    }

    pub(crate) fn persistent(index: u32) -> Self {
        Self {
            index,
            flags: RegisterFlags::PERSISTENT,
        }
    }
}

impl Drop for Register {
    /// This method should never be called.
    /// It is used to detect when a register has not been deallocated.
    fn drop(&mut self) {
        if self.flags.is_persistent() {
            return;
        }

        // Prevent double panic.
        if std::thread::panicking() {
            return;
        }

        unreachable!("forgot to deallocate a register!")
    }
}

#[derive(Debug, Default)]
pub(crate) struct RegisterAllocator {
    registers: Vec<RegisterEntry>,
}

impl RegisterAllocator {
    pub(crate) fn alloc(&mut self) -> Register {
        if let Some((i, register)) = self
            .registers
            .iter_mut()
            .enumerate()
            .find(|(_, reg)| !reg.flags.is_used())
        {
            assert!(!register.flags.is_persistent());

            register.flags |= RegisterFlags::USED;
            return Register {
                index: i as u32,
                flags: register.flags,
            };
        }

        let flags = RegisterFlags::USED;

        let index = self.registers.len() as u32;
        self.registers.push(RegisterEntry { flags });

        Register { index, flags }
    }

    pub(crate) fn alloc_persistent(&mut self) -> Register {
        let mut reg = self.alloc();

        let index = reg.index();

        let register = &mut self.registers[index as usize];

        register.flags |= RegisterFlags::PERSISTENT;

        reg.flags = register.flags;
        reg
    }

    #[track_caller]
    pub(crate) fn dealloc(&mut self, reg: Register) {
        assert!(
            !reg.flags.is_persistent(),
            "Trying to deallocate a persistent register"
        );

        let register = &mut self.registers[reg.index as usize];

        assert!(
            register.flags.is_used(),
            "Cannot deallocate unused variable"
        );
        register.flags.set(RegisterFlags::USED, false);

        // NOTE: We should not drop it since, dropping it used to detect bugs.
        forget(reg);
    }

    pub(crate) fn finish(self) -> u32 {
        for register in &self.registers {
            debug_assert!(
                !register.flags.is_used()
                    || (register.flags.is_used() && register.flags.is_persistent())
            );
        }

        self.registers.len() as u32
    }
}
