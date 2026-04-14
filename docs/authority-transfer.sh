#!/bin/bash
# Mycelium Protocol -- Authority Transfer to Squads Multisig
# DANGER: This transfers program upgrade authority. Irreversible without multisig approval.
# Run with --dry-run first to verify commands.
# Prerequisites: Squads multisig created and tested (docs/multisig-setup.md)
#
# Usage:
#   ./docs/authority-transfer.sh <SQUADS_VAULT_PDA>           # Execute transfers
#   ./docs/authority-transfer.sh --dry-run <SQUADS_VAULT_PDA>  # Preview commands only
#
# The script reads program IDs from Anchor.toml [programs.mainnet-beta] section.
# It does NOT hardcode program IDs -- if Anchor.toml changes, this script picks up the new IDs.

set -euo pipefail

# --- Configuration ---
ANCHOR_TOML="Anchor.toml"
KEYPAIR="${KEYPAIR:-$HOME/solana-keys/id.json}"
RPC_URL="mainnet-beta"
LOG_FILE="authority-transfer.log"
DRY_RUN=false

# --- Color output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Parse arguments ---
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    shift
fi

SQUADS_VAULT_PDA="${1:-}"

if [[ -z "$SQUADS_VAULT_PDA" ]]; then
    echo -e "${RED}ERROR: Missing SQUADS_VAULT_PDA argument${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 <SQUADS_VAULT_PDA>           # Execute transfers"
    echo "  $0 --dry-run <SQUADS_VAULT_PDA>  # Preview commands only"
    echo ""
    echo "Example:"
    echo "  $0 --dry-run 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    exit 1
fi

# --- Validate Anchor.toml exists ---
if [[ ! -f "$ANCHOR_TOML" ]]; then
    echo -e "${RED}ERROR: $ANCHOR_TOML not found. Run this script from the project root.${NC}"
    exit 1
fi

# --- Validate keypair exists ---
if [[ ! -f "$KEYPAIR" ]]; then
    echo -e "${RED}ERROR: Keypair not found at $KEYPAIR${NC}"
    echo "Set KEYPAIR env var to override: KEYPAIR=/path/to/key.json $0 ..."
    exit 1
fi

# --- Logging ---
log() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
    echo "$msg" >> "$LOG_FILE"
    echo -e "$1"
}

# --- Extract mainnet program IDs from Anchor.toml ---
# Reads the [programs.mainnet-beta] section and extracts key = "value" pairs
parse_mainnet_programs() {
    local in_section=false
    local programs=()

    while IFS= read -r line; do
        # Detect section headers
        if [[ "$line" =~ ^\[programs\.mainnet-beta\] ]]; then
            in_section=true
            continue
        fi
        # Exit section on next header
        if [[ "$line" =~ ^\[.+\] ]] && $in_section; then
            break
        fi
        # Parse program entries
        if $in_section && [[ "$line" =~ ^([a-zA-Z_]+)[[:space:]]*=[[:space:]]*\"([a-zA-Z0-9]+)\" ]]; then
            local name="${BASH_REMATCH[1]}"
            local id="${BASH_REMATCH[2]}"
            programs+=("$name:$id")
        fi
    done < "$ANCHOR_TOML"

    if [[ ${#programs[@]} -eq 0 ]]; then
        echo -e "${RED}ERROR: No programs found in [programs.mainnet-beta] section of $ANCHOR_TOML${NC}"
        exit 1
    fi

    echo "${programs[@]}"
}

# --- Main ---
main() {
    echo ""
    echo "================================================================="
    echo "  MYCELIUM PROTOCOL -- AUTHORITY TRANSFER TO SQUADS MULTISIG"
    echo "================================================================="
    echo ""

    if $DRY_RUN; then
        echo -e "${YELLOW}>>> DRY RUN MODE -- No changes will be made <<<${NC}"
        echo ""
    fi

    log "Starting authority transfer process"
    log "Squads Vault PDA: $SQUADS_VAULT_PDA"
    log "Keypair: $KEYPAIR"
    log "RPC: $RPC_URL"
    log "Dry run: $DRY_RUN"
    echo ""

    # Parse programs from Anchor.toml
    local programs_raw
    programs_raw=$(parse_mainnet_programs)
    IFS=' ' read -ra programs <<< "$programs_raw"

    local total=${#programs[@]}
    log "Found $total programs in [programs.mainnet-beta]:"
    echo ""

    for entry in "${programs[@]}"; do
        IFS=':' read -r name id <<< "$entry"
        echo "  - $name: $id"
    done
    echo ""

    # Pre-flight: show current authorities
    echo "-----------------------------------------------------------------"
    echo "  CURRENT PROGRAM AUTHORITIES"
    echo "-----------------------------------------------------------------"
    echo ""

    for entry in "${programs[@]}"; do
        IFS=':' read -r name id <<< "$entry"
        if ! $DRY_RUN; then
            echo -e "${YELLOW}$name ($id):${NC}"
            solana program show "$id" -u "$RPC_URL" 2>&1 | grep -i "authority" || echo "  (could not read authority)"
            echo ""
        else
            echo "  [DRY RUN] Would check: solana program show $id -u $RPC_URL"
        fi
    done

    # Transfer authority for each program
    echo ""
    echo "-----------------------------------------------------------------"
    echo "  TRANSFERRING UPGRADE AUTHORITY"
    echo "-----------------------------------------------------------------"
    echo ""

    local success_count=0
    local fail_count=0

    for i in "${!programs[@]}"; do
        local entry="${programs[$i]}"
        IFS=':' read -r name id <<< "$entry"
        local num=$((i + 1))

        echo "[$num/$total] $name ($id)"
        echo ""

        local cmd="solana program set-upgrade-authority $id --new-upgrade-authority $SQUADS_VAULT_PDA --keypair $KEYPAIR -u $RPC_URL"

        if $DRY_RUN; then
            echo -e "  ${YELLOW}[DRY RUN] Would execute:${NC}"
            echo "  $cmd"
            echo ""
            echo -e "  ${YELLOW}[DRY RUN] Would verify:${NC}"
            echo "  solana program show $id -u $RPC_URL | grep Authority"
            echo ""
            log "[DRY RUN] $name: $cmd"
            success_count=$((success_count + 1))
            continue
        fi

        # Confirmation prompt (real mode only)
        echo -e "  ${RED}WARNING: This will transfer upgrade authority for $name to the Squads vault.${NC}"
        echo -e "  ${RED}This is IRREVERSIBLE without multisig approval.${NC}"
        echo ""
        echo -n "  Are you sure? [y/N] "
        read -r confirm

        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            log "SKIPPED: $name ($id) -- user declined"
            echo -e "  ${YELLOW}Skipped.${NC}"
            echo ""
            continue
        fi

        # Execute transfer
        log "Executing: $cmd"
        if eval "$cmd" 2>&1 | tee -a "$LOG_FILE"; then
            echo ""
            log "Transfer initiated for $name"
        else
            echo ""
            log "ERROR: Transfer failed for $name ($id)"
            fail_count=$((fail_count + 1))
            echo -e "  ${RED}FAILED. Check $LOG_FILE for details.${NC}"
            echo ""
            continue
        fi

        # Verify new authority
        echo "  Verifying new authority..."
        local verify_output
        verify_output=$(solana program show "$id" -u "$RPC_URL" 2>&1)
        echo "$verify_output" >> "$LOG_FILE"

        if echo "$verify_output" | grep -q "$SQUADS_VAULT_PDA"; then
            echo -e "  ${GREEN}VERIFIED: Authority is now $SQUADS_VAULT_PDA${NC}"
            log "VERIFIED: $name authority = $SQUADS_VAULT_PDA"
            success_count=$((success_count + 1))
        else
            echo -e "  ${RED}WARNING: Could not confirm authority transfer. Check manually:${NC}"
            echo "  solana program show $id -u $RPC_URL"
            log "WARNING: $name authority verification inconclusive"
            fail_count=$((fail_count + 1))
        fi

        echo ""
    done

    # Summary
    echo ""
    echo "================================================================="
    echo "  SUMMARY"
    echo "================================================================="
    echo ""

    if $DRY_RUN; then
        echo -e "  ${YELLOW}DRY RUN COMPLETE${NC}"
        echo "  $success_count commands would be executed"
        echo ""
        echo "  To execute for real, run without --dry-run:"
        echo "  $0 $SQUADS_VAULT_PDA"
    else
        echo -e "  Successful: ${GREEN}$success_count${NC}"
        echo -e "  Failed:     ${RED}$fail_count${NC}"
        echo ""

        if [[ $fail_count -gt 0 ]]; then
            echo -e "  ${RED}Some transfers failed. Check $LOG_FILE and retry failed programs.${NC}"
        else
            echo -e "  ${GREEN}All programs transferred to Squads multisig governance.${NC}"
        fi
    fi

    echo ""
    echo "  Log file: $LOG_FILE"
    echo ""
    log "Authority transfer process complete. Success: $success_count, Failed: $fail_count"
}

main
