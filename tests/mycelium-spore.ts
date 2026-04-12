import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyceliumSpore } from "../target/types/mycelium_spore";
import { expect } from "chai";
import { createHash } from "crypto";

describe("mycelium-spore", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MyceliumSpore as Program<MyceliumSpore>;
  const creator = provider.wallet;

  // ── Helpers ──────────────────────────────────────────────────────────

  function contentHash(data: string): number[] {
    return Array.from(createHash("sha256").update(data).digest());
  }

  function perceptualHash(data: string): number[] {
    return Array.from(createHash("sha256").update("phash:" + data).digest());
  }

  function findIPAssetPDA(creatorKey: anchor.web3.PublicKey, hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ip_asset"), creatorKey.toBuffer(), Buffer.from(hash)],
      program.programId
    );
  }

  function findContentHashRegistryPDA(hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("content_hash_index"), Buffer.from(hash)],
      program.programId
    );
  }

  // ── REG-01: Register with all fields ─────────────────────────────────

  describe("register_ip (REG-01)", () => {
    it("registers a new IP asset with SHA-256 hash, metadata URI, IP type, and WIPO fields", async () => {
      const content = "Original artwork -- Mycelium test registration REG-01";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const metadataUri = "ar://abc123def456_test_metadata_v1";
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerIp(
          cHash,
          pHash,
          { visualArt: {} },
          metadataUri,
          25,       // Nice class 25 (clothing)
          null,     // No Berne category
          [73, 68], // "ID" = Indonesia
          null      // No first use date
        )
        .accounts({
          ipAsset: ipAssetPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(ipAssetPDA);
      expect(account.originalCreator.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(account.creator.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(Array.from(account.contentHash)).to.deep.equal(cHash);
      expect(Array.from(account.perceptualHash)).to.deep.equal(pHash);
      expect(account.metadataUri).to.equal(metadataUri);
      expect(account.ipType).to.deep.equal({ visualArt: {} });
      expect(account.status).to.deep.equal({ active: {} });
      expect(account.wipoAligned).to.be.true;
      expect(account.niceClass).to.equal(25);
      expect(Array.from(account.countryOfOrigin)).to.deep.equal([73, 68]);
      expect(account.version).to.equal(1);
      expect(account.licenseCount).to.equal(0);
      expect(account.disputeCount).to.equal(0);
      expect(account.parentIp).to.be.null;

      // Verify ContentHashRegistry was populated
      const registry = await program.account.contentHashRegistry.fetch(contentHashRegistryPDA);
      expect(Array.from(registry.contentHash)).to.deep.equal(cHash);
      expect(registry.ipAsset.toBase58()).to.equal(ipAssetPDA.toBase58());
    });

    it("registers with all WIPO fields populated", async () => {
      const content = "WIPO-full registration test";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);
      const firstUseDate = new anchor.BN(1700000000); // Nov 2023

      await program.methods
        .registerIp(
          cHash,
          pHash,
          { literaryWork: {} },
          "ar://wipo_full_test",
          9,        // Nice class 9 (scientific apparatus)
          2,        // Berne category
          [85, 83], // "US"
          firstUseDate
        )
        .accounts({
          ipAsset: ipAssetPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(ipAssetPDA);
      expect(account.wipoAligned).to.be.true;
      expect(account.niceClass).to.equal(9);
      expect(account.berneCategory).to.equal(2);
      expect(account.firstUseDate.toNumber()).to.equal(1700000000);
    });

    it("rejects zero content hash", async () => {
      const zeroHash = new Array(32).fill(0);
      const pHash = perceptualHash("zero");
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, zeroHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(zeroHash);

      try {
        await program.methods
          .registerIp(zeroHash, pHash, { software: {} }, "ar://valid", null, null, [73, 68], null)
          .accounts({
            ipAsset: ipAssetPDA,
            contentHashRegistry: contentHashRegistryPDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.toString()).to.include("InvalidContentHash");
      }
    });

    it("rejects empty metadata URI", async () => {
      const cHash = contentHash("empty uri test");
      const pHash = perceptualHash("empty uri test");
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      try {
        await program.methods
          .registerIp(cHash, pHash, { meme: {} }, "", null, null, [73, 68], null)
          .accounts({
            ipAsset: ipAssetPDA,
            contentHashRegistry: contentHashRegistryPDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err.toString()).to.include("MetadataUriEmpty");
      }
    });
  });

  // ── REG-02: PoH timestamp ────────────────────────────────────────────

  describe("PoH timestamp (REG-02)", () => {
    it("registration produces immutable PoH timestamp with slot and unix time", async () => {
      const content = "PoH timestamp verification -- REG-02";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      const preSlot = await provider.connection.getSlot();

      await program.methods
        .registerIp(cHash, pHash, { music: {} }, "ar://poh_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: ipAssetPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(ipAssetPDA);
      // Slot must be > 0 and >= the slot we recorded before the tx
      expect(account.registrationSlot.toNumber()).to.be.greaterThan(0);
      expect(account.registrationSlot.toNumber()).to.be.greaterThanOrEqual(preSlot);
      // Unix timestamp must be a reasonable value (after 2020-01-01)
      expect(account.registrationTimestamp.toNumber()).to.be.greaterThan(1577836800);
    });
  });

  // ── REG-03: Derivative registration ──────────────────────────────────

  describe("register_derivative (REG-03)", () => {
    let parentPDA: anchor.web3.PublicKey;

    before(async () => {
      const parentContent = "Parent character IP for derivative tests -- REG-03";
      const cHash = contentHash(parentContent);
      const pHash = perceptualHash(parentContent);
      [parentPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerIp(cHash, pHash, { characterIp: {} }, "ar://parent_reg03", null, null, [73, 68], null)
        .accounts({
          ipAsset: parentPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("registers a derivative work linked to parent IP", async () => {
      const derivContent = "Fan art derivative of character -- REG-03";
      const cHash = contentHash(derivContent);
      const pHash = perceptualHash(derivContent);
      const [derivPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerDerivative(cHash, pHash, { visualArt: {} }, "ar://fanart_reg03", [73, 68])
        .accounts({
          ipAsset: derivPDA,
          contentHashRegistry: contentHashRegistryPDA,
          parentIpAsset: parentPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(derivPDA);
      expect(account.parentIp.toBase58()).to.equal(parentPDA.toBase58());
      expect(account.originalCreator.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(account.status).to.deep.equal({ active: {} });
    });

    it("rejects derivative of non-active parent", async () => {
      // First, register a parent and then change its status to Disputed
      const suspendContent = "Parent to suspend -- REG-03 negative";
      const sCHash = contentHash(suspendContent);
      const sPHash = perceptualHash(suspendContent);
      const [suspendPDA] = findIPAssetPDA(creator.publicKey, sCHash);
      const [sRegistryPDA] = findContentHashRegistryPDA(sCHash);

      await program.methods
        .registerIp(sCHash, sPHash, { video: {} }, "ar://suspend_parent", null, null, [73, 68], null)
        .accounts({
          ipAsset: suspendPDA,
          contentHashRegistry: sRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Dispute the parent
      await program.methods
        .updateStatus({ disputed: {} })
        .accounts({
          ipAsset: suspendPDA,
          authority: creator.publicKey,
        })
        .rpc();

      // Try to register derivative of disputed parent
      const derivContent = "Derivative of disputed parent -- REG-03 negative";
      const dCHash = contentHash(derivContent);
      const dPHash = perceptualHash(derivContent);
      const [derivPDA] = findIPAssetPDA(creator.publicKey, dCHash);
      const [dRegistryPDA] = findContentHashRegistryPDA(dCHash);

      try {
        await program.methods
          .registerDerivative(dCHash, dPHash, { visualArt: {} }, "ar://bad_deriv", [73, 68])
          .accounts({
            ipAsset: derivPDA,
            contentHashRegistry: dRegistryPDA,
            parentIpAsset: suspendPDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected derivative of disputed parent");
      } catch (err) {
        expect(err.toString()).to.include("ParentIPNotActive");
      }
    });
  });

  // ── REG-04: Ownership transfer with original_creator immutability ────

  describe("transfer_ownership (REG-04)", () => {
    let transferPDA: anchor.web3.PublicKey;
    let transferContentHash: number[];
    let newOwner: anchor.web3.Keypair;

    before(async () => {
      const content = "Transferable IP -- REG-04";
      transferContentHash = contentHash(content);
      const pHash = perceptualHash(content);
      [transferPDA] = findIPAssetPDA(creator.publicKey, transferContentHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(transferContentHash);

      await program.methods
        .registerIp(
          transferContentHash, pHash, { brandMark: {} }, "ar://transfer_reg04",
          null, null, [73, 68], null
        )
        .accounts({
          ipAsset: transferPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      newOwner = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        newOwner.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    });

    it("transfers ownership and original_creator stays immutable", async () => {
      await program.methods
        .transferOwnership()
        .accounts({
          ipAsset: transferPDA,
          currentOwner: creator.publicKey,
          newOwner: newOwner.publicKey,
        })
        .signers([newOwner])
        .rpc();

      const account = await program.account.ipAsset.fetch(transferPDA);
      // original_creator unchanged -- IMMUTABLE
      expect(account.originalCreator.toBase58()).to.equal(creator.publicKey.toBase58());
      // creator changed to new owner
      expect(account.creator.toBase58()).to.equal(newOwner.publicKey.toBase58());
    });

    it("PDA still resolves using original_creator after transfer", async () => {
      // PDA derivation uses original_creator (not current creator)
      const [reDerived] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("ip_asset"),
          creator.publicKey.toBuffer(), // original_creator, NOT newOwner
          Buffer.from(transferContentHash),
        ],
        program.programId
      );
      expect(reDerived.toBase58()).to.equal(transferPDA.toBase58());

      // Verify PDA does NOT match if we use the new owner as seed
      const [wrongPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("ip_asset"),
          newOwner.publicKey.toBuffer(), // wrong -- this is new owner, not original_creator
          Buffer.from(transferContentHash),
        ],
        program.programId
      );
      expect(wrongPDA.toBase58()).to.not.equal(transferPDA.toBase58());
    });

    it("rejects transfer from non-owner", async () => {
      const attacker = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        attacker.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Register a fresh IP for this test
      const content = "Attacker transfer target -- REG-04 negative";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [pda] = findIPAssetPDA(creator.publicKey, cHash);
      const [registryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerIp(cHash, pHash, { dataset: {} }, "ar://attack_target", null, null, [73, 68], null)
        .accounts({
          ipAsset: pda,
          contentHashRegistry: registryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .transferOwnership()
          .accounts({
            ipAsset: pda,
            currentOwner: attacker.publicKey,
            newOwner: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        expect.fail("Should have rejected unauthorized transfer");
      } catch (err) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ── REG-05: Duplicate content hash rejection (global uniqueness) ─────

  describe("duplicate content hash rejection (REG-05)", () => {
    let sharedContentHash: number[];
    let sharedPerceptualHash: number[];

    before(async () => {
      const content = "Globally unique content -- REG-05";
      sharedContentHash = contentHash(content);
      sharedPerceptualHash = perceptualHash(content);
      const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, sharedContentHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(sharedContentHash);

      // First registration succeeds
      await program.methods
        .registerIp(
          sharedContentHash,
          sharedPerceptualHash,
          { visualArt: {} },
          "ar://first_registration",
          42,
          1,
          [73, 68],
          null
        )
        .accounts({
          ipAsset: ipAssetPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects duplicate content hash from a different creator", async () => {
      const secondCreator = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        secondCreator.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Different creator, same content hash
      const [secondPDA] = findIPAssetPDA(secondCreator.publicKey, sharedContentHash);
      // ContentHashRegistry PDA is seeded only by content_hash -- same PDA, already initialized
      const [sameRegistryPDA] = findContentHashRegistryPDA(sharedContentHash);

      try {
        await program.methods
          .registerIp(
            sharedContentHash,
            sharedPerceptualHash,
            { visualArt: {} },
            "ar://stolen_content",
            42,
            1,
            [73, 68],
            null
          )
          .accounts({
            ipAsset: secondPDA,
            contentHashRegistry: sameRegistryPDA, // Already initialized -- Anchor init will fail
            creator: secondCreator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([secondCreator])
          .rpc();
        expect.fail("Should have rejected duplicate content hash");
      } catch (err) {
        // Anchor init constraint fails because ContentHashRegistry PDA already exists
        expect(err.toString()).to.include("already in use");
      }
    });

    it("rejects duplicate content hash from the same creator (same PDA collision)", async () => {
      // Same creator, same content hash -- the IPAsset PDA itself collides
      const [samePDA] = findIPAssetPDA(creator.publicKey, sharedContentHash);
      const [sameRegistryPDA] = findContentHashRegistryPDA(sharedContentHash);

      try {
        await program.methods
          .registerIp(
            sharedContentHash,
            sharedPerceptualHash,
            { music: {} },
            "ar://duplicate_same_creator",
            null,
            null,
            [73, 68],
            null
          )
          .accounts({
            ipAsset: samePDA,
            contentHashRegistry: sameRegistryPDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected duplicate");
      } catch (err) {
        expect(err.toString()).to.include("already in use");
      }
    });
  });

  // ── REG-06: All 11 IP types supported ────────────────────────────────

  describe("all 11 IP types (REG-06)", () => {
    const allIpTypes: Array<{ type: Record<string, Record<string, never>>; name: string }> = [
      { type: { literaryWork: {} }, name: "literaryWork" },
      { type: { visualArt: {} }, name: "visualArt" },
      { type: { music: {} }, name: "music" },
      { type: { software: {} }, name: "software" },
      { type: { characterIp: {} }, name: "characterIp" },
      { type: { meme: {} }, name: "meme" },
      { type: { video: {} }, name: "video" },
      { type: { aiGenerated: {} }, name: "aiGenerated" },
      { type: { traditionalKnowledge: {} }, name: "traditionalKnowledge" },
      { type: { dataset: {} }, name: "dataset" },
      { type: { brandMark: {} }, name: "brandMark" },
    ];

    for (const [index, ipTypeEntry] of allIpTypes.entries()) {
      it(`registers IP type: ${ipTypeEntry.name}`, async () => {
        const content = `IP type test ${ipTypeEntry.name} -- REG-06 index ${index}`;
        const cHash = contentHash(content);
        const pHash = perceptualHash(content);
        const [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
        const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

        await program.methods
          .registerIp(
            cHash,
            pHash,
            ipTypeEntry.type as any,
            `ar://type_test_${ipTypeEntry.name}`,
            null,
            null,
            [73, 68],
            null
          )
          .accounts({
            ipAsset: ipAssetPDA,
            contentHashRegistry: contentHashRegistryPDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        const account = await program.account.ipAsset.fetch(ipAssetPDA);
        expect(account.ipType).to.deep.equal(ipTypeEntry.type);
      });
    }
  });

  // ── SEC-01: UpdateStatus rejects unauthorized signer ──────────────────

  describe("update_status security (SEC-01)", () => {
    let statusPDA: anchor.web3.PublicKey;

    before(async () => {
      const content = "Status security test -- SEC-01";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      [statusPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerIp(cHash, pHash, { meme: {} }, "ar://sec01_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: statusPDA,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects update_status from non-owner", async () => {
      const attacker = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        attacker.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      try {
        await program.methods
          .updateStatus({ disputed: {} })
          .accounts({
            ipAsset: statusPDA,
            authority: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        expect.fail("Should have rejected unauthorized signer");
      } catch (err) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("allows update_status from owner (Active -> Disputed)", async () => {
      await program.methods
        .updateStatus({ disputed: {} })
        .accounts({
          ipAsset: statusPDA,
          authority: creator.publicKey,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(statusPDA);
      expect(account.status).to.deep.equal({ disputed: {} });
      expect(account.disputeCount).to.equal(1);
    });

    it("rejects invalid status transition (Active -> Suspended)", async () => {
      const content = "Invalid transition test -- SEC-01";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [pda] = findIPAssetPDA(creator.publicKey, cHash);
      const [registryPDA] = findContentHashRegistryPDA(cHash);

      await program.methods
        .registerIp(cHash, pHash, { video: {} }, "ar://transition_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: pda,
          contentHashRegistry: registryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .updateStatus({ suspended: {} })
          .accounts({
            ipAsset: pda,
            authority: creator.publicKey,
          })
          .rpc();
        expect.fail("Should have rejected invalid transition");
      } catch (err) {
        expect(err.toString()).to.include("InvalidStatusTransition");
      }
    });
  });

  // ── Evidence chain verification ───────────────────────────────────────

  describe("evidence chain verification", () => {
    it("produces a complete evidence chain", async () => {
      const content = "Court evidence test -- Mycelium IP registration";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const metadataUri = "ar://TxAbCdEf123_court_evidence";
      const [pda] = findIPAssetPDA(creator.publicKey, cHash);
      const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

      const tx = await program.methods
        .registerIp(cHash, pHash, { literaryWork: {} }, metadataUri, null, 1, [73, 68], null)
        .accounts({
          ipAsset: pda,
          contentHashRegistry: contentHashRegistryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.ipAsset.fetch(pda);
      const accountInfo = await provider.connection.getAccountInfo(pda);

      expect(accountInfo).to.not.be.null;
      expect(accountInfo.owner.toBase58()).to.equal(program.programId.toBase58());
      expect(Array.from(account.contentHash)).to.deep.equal(cHash);
      expect(account.registrationSlot.toNumber()).to.be.greaterThan(0);
      expect(account.registrationTimestamp.toNumber()).to.be.greaterThan(0);
      expect(account.metadataUri).to.match(/^ar:\/\//);
      expect(account.originalCreator.toBase58()).to.equal(creator.publicKey.toBase58());

      console.log("\n    === EVIDENCE PACKAGE ===");
      console.log(`    PDA: ${pda.toBase58()}`);
      console.log(`    Original Creator: ${account.originalCreator.toBase58()}`);
      console.log(`    Current Owner: ${account.creator.toBase58()}`);
      console.log(`    Hash: ${Buffer.from(account.contentHash).toString("hex")}`);
      console.log(`    Slot: ${account.registrationSlot.toString()}`);
      console.log(`    Time: ${new Date(account.registrationTimestamp.toNumber() * 1000).toISOString()}`);
      console.log(`    Tx: ${tx}`);
      console.log("    === END ===\n");
    });
  });
});
