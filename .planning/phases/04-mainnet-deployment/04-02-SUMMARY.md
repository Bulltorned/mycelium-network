---
phase: 04-mainnet-deployment
plan: 02
subsystem: ci-cd-deployment
tags: [github-actions, verifiable-builds, deployment-runbook, squads, ci-cd]
dependency_graph:
  requires: [mainnet-program-ids]
  provides: [ci-cd-pipeline, deployment-runbook, verifiable-build-workflow]
  affects: [04-03, deployment-ops]
tech_stack:
  added: [solana-developers/github-workflows@v0.2.9]
  patterns: [reusable-workflow-matrix, workflow-dispatch-deploy, squads-multisig-proposals]
key_files:
  created:
    - .github/workflows/build-verify.yml
    - .github/workflows/mainnet-deploy.yml
    - docs/deployment-runbook.md
  modified: []
decisions:
  - "Matrix strategy for CI build -- all 5 programs built in parallel on push/PR"
  - "Per-program keypair secrets (PROGRAM_ADDRESS_KEYPAIR_SPORE etc.) instead of single PROGRAM_ADDRESS_KEYPAIR -- avoids secret collision across programs"
  - "Setup job resolves program-to-ID mapping via case statement rather than reading Anchor.toml at runtime -- simpler, no file parsing in CI"
  - "Devnet deploy path included in mainnet-deploy.yml (no Squads, no IDL upload) for testing the workflow"
metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
  completed_date: "2026-04-13"
---

# Phase 04 Plan 02: CI/CD Pipeline and Deployment Runbook Summary

GitHub Actions CI/CD with solana-developers/github-workflows v0.2.9 for Docker-based verifiable builds, Squads multisig deployment, and 452-line deployment runbook covering 3 rollback scenarios.

## Task Completion

### Task 1: Create GitHub Actions CI/CD workflows for verifiable builds and deployment

Created two workflow files:

**`.github/workflows/build-verify.yml`** -- CI build on push/PR:
- Matrix strategy builds all 5 programs in parallel (mycelium_spore, mycelium_hypha, mycelium_rhizome, mycelium_meridian, mycelium_drp)
- Each matrix entry maps program name to its mainnet program ID from Anchor.toml
- Uses `solana-developers/github-workflows/.github/workflows/reusable-build.yaml@v0.2.9`
- `deploy: false`, `verify: true` -- builds deterministically via Docker, verifies bytecode, but does not deploy
- Concurrency group prevents duplicate runs on the same branch

**`.github/workflows/mainnet-deploy.yml`** -- Manual deployment:
- `workflow_dispatch` trigger with 3 inputs: program (choice of 5), network (mainnet/devnet), priority_fee (default 300000)
- Setup job resolves program name to program ID and per-program keypair secret name
- Mainnet path: `deploy: true`, `upload_idl: true`, `verify: true`, `use-squads: true`
- Devnet path: `deploy: true`, `verify: true` (no Squads, no IDL upload)
- All required secrets documented in workflow comments (MAINNET_SOLANA_DEPLOY_URL, MAINNET_DEPLOYER_KEYPAIR, per-program PROGRAM_ADDRESS_KEYPAIR, MAINNET_MULTISIG, MAINNET_MULTISIG_VAULT)

### Task 2: Write deployment runbook with rollback procedures

Created `docs/deployment-runbook.md` (452 lines) covering:

1. **Prerequisites checklist** -- 9 items including wallet funding, RPC, secrets, Squads, keypairs, Anchor.toml, CI passing, cross-program IDs
2. **First-time deployment procedure** -- 8 steps from workflow trigger to program verification
3. **Deployment order** -- Spore first (no deps), then Hypha/Rhizome/Meridian, DRP last; includes authority transfer script
4. **Post-deployment verification** -- program existence, verifiable build, functional smoke test, authority check
5. **Upgrade procedure** -- tag release, trigger workflow, Squads approval, verify
6. **Rollback procedures** -- 3 scenarios:
   - Scenario A: Failed deployment (close buffer, reclaim SOL)
   - Scenario B: Buggy deployment (revert to previous version via same CI/CD)
   - Scenario C: Authority compromised (multisig member rotation, migration)
7. **Emergency contacts** -- escalation path
8. **Cost reference** -- deployment costs (~15 SOL) and per-registration costs (~0.00474 SOL)
9. **GitHub secrets reference** -- all 11 secrets with descriptions and how to obtain

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None. All program IDs reference real mainnet keypairs generated in Plan 04-01. Workflow files are complete and ready for use once GitHub secrets are configured.

## Self-Check: PASSED

All 3 created files verified present. No missing artifacts.
