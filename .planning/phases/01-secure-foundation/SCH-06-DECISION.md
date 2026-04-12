# SCH-06 Decision: Devnet Account Migration

**Decision:** Wipe devnet accounts and re-register after program redeployment.

**Rationale:**
- Devnet data has no production value
- realloc migration adds complexity for test data
- Schema change (adding original_creator + ContentHashRegistry) changes account layout
- Anchor 0.30.1 does not support Migration type (0.31+ feature)

**Impact:** All existing devnet registrations will be invalid after program redeployment.
All test data must be re-registered using the new schema.

**Mainnet note:** When deploying to mainnet in Phase 4, if there are existing
mainnet accounts, a proper migration strategy will be needed. This is NOT the
precedent for mainnet.
