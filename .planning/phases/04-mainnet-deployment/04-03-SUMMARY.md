---
phase: 04-mainnet-deployment
plan: 03
subsystem: governance
tags: [squads, multisig, authority-transfer, mainnet, security]
dependency_graph:
  requires: [mainnet-program-ids]
  provides: [multisig-setup-guide, authority-transfer-script]
  affects: [deployment-runbook, mainnet-security]
tech_stack:
  added: [squads-v4]
  patterns: [2-of-3-multisig, vault-pda-authority, anchor-toml-parsing]
key_files:
  created:
    - docs/multisig-setup.md
    - docs/authority-transfer.sh
  modified: []
decisions:
  - "Used placeholder wallet addresses (<MEMBER_N_WALLET>) since multisig member identities are pending Aji's decision"
  - "Member 1 gets permission 7 (all), Member 2 gets permission 6 (voter+executor), Member 3 gets permission 2 (voter only)"
  - "Authority transfer script reads program IDs dynamically from Anchor.toml rather than hardcoding"
  - "Script requires interactive confirmation for each program transfer (safety over convenience)"
metrics:
  completed: 2026-04-13
---

# Phase 04 Plan 03: Squads Multisig Setup and Authority Transfer Summary

Documented the complete Squads v4 multisig governance setup for Mycelium Protocol mainnet, with an executable authority transfer script covering all 5 programs.

## What Was Done

### Task 1: Multisig Member Decision (Checkpoint -- Placeholder Used)

The plan includes a checkpoint for Aji to decide on the 2nd and 3rd multisig members. Since this cannot be resolved without user input, placeholder wallet addresses (`<MEMBER_1_WALLET>`, `<MEMBER_2_WALLET>`, `<MEMBER_3_WALLET>`) are used throughout both documents. Three options are documented in the setup guide (Aji + 2 team members, Aji + 2 hardware wallets, Aji + 1 team + 1 cold storage).

**Action required:** Aji must decide on members and provide wallet addresses before any execution.

### Task 2: Multisig Setup Guide and Authority Transfer Script

**`docs/multisig-setup.md` (231 lines):**
- Member decision table with 3 options and recommendation
- Prerequisites checklist (wallets, SOL, browser extension)
- Step-by-step Squads v4 multisig creation procedure
- Test transaction verification (fund vault, propose, approve, execute, verify on explorer)
- Post-transfer verification commands for all 5 programs
- Emergency procedures (lost key, all authority lost, changing members)
- Programs under governance reference table

**`docs/authority-transfer.sh`:**
- Reads all 5 program IDs dynamically from `Anchor.toml` `[programs.mainnet-beta]` section
- `--dry-run` flag prints all commands without executing
- Interactive confirmation prompt before each irreversible transfer
- Post-transfer verification (grep for new authority in `solana program show` output)
- Color-coded output and timestamped logging to `authority-transfer.log`
- Pre-flight check showing current authorities before any changes
- Summary report with success/failure counts

## Verification Results

| Check | Result |
|-------|--------|
| `docs/multisig-setup.md` exists | PASS |
| `docs/authority-transfer.sh` exists | PASS |
| Setup guide >= 60 lines | PASS (231 lines) |
| Script contains `set-upgrade-authority` | PASS |
| Script contains `--dry-run` | PASS (6 references) |
| Script reads from `Anchor.toml` | PASS (6 references) |
| Script has confirmation prompts | PASS |
| Guide references 2-of-3 threshold | PASS (5 references) |

## Deviations from Plan

### Checkpoint Handled as Placeholder

**Task 1** is a `checkpoint:decision` requiring user input on multisig member identities. Since this execution cannot pause for interactive input, placeholder addresses were used and the decision is documented prominently in `docs/multisig-setup.md` with a clear "Decision Required" section at the top. This is not a deviation from intent -- the plan itself anticipated "will provide later" as a valid response.

## Known Stubs

| File | Location | Stub | Resolution |
|------|----------|------|------------|
| `docs/multisig-setup.md` | Member table | `<MEMBER_1_WALLET>`, `<MEMBER_2_WALLET>`, `<MEMBER_3_WALLET>` | Aji provides wallet addresses before execution |
| `docs/multisig-setup.md` | Section 1.3 | Blank multisig address and vault PDA fields | Filled after Squads multisig is created on-chain |

These stubs are intentional -- they represent values that only exist after human decisions and on-chain actions.

## Self-Check: PASSED

- [x] `docs/multisig-setup.md` exists (231 lines)
- [x] `docs/authority-transfer.sh` exists
- [x] Script parses Anchor.toml dynamically (not hardcoded IDs)
- [x] Script has --dry-run mode
- [x] Script has confirmation prompts
- [x] Guide documents 2-of-3 threshold
- [x] Guide includes test transaction verification
- [x] All 5 mainnet programs referenced
