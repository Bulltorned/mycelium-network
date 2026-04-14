import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyceliumHypha } from "../target/types/mycelium_hypha";
import { MyceliumSpore } from "../target/types/mycelium_spore";
import { expect } from "chai";
import { createHash } from "crypto";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";

describe("mycelium-hypha", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const hyphaProgram = anchor.workspace.MyceliumHypha as Program<MyceliumHypha>;
  const sporeProgram = anchor.workspace.MyceliumSpore as Program<MyceliumSpore>;
  const licensor = provider.wallet;

  // USDC mock mint for testing (6 decimals)
  const USDC_DECIMALS = 6;
  let usdcMint: anchor.web3.PublicKey;
  const mintAuthority = anchor.web3.Keypair.generate();

  function contentHash(data: string): number[] {
    return Array.from(createHash("sha256").update(data).digest());
  }

  function perceptualHash(data: string): number[] {
    return Array.from(createHash("sha256").update("phash:" + data).digest());
  }

  function findIPAssetPDA(creatorKey: anchor.web3.PublicKey, hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ip_asset"), creatorKey.toBuffer(), Buffer.from(hash)],
      sporeProgram.programId
    );
  }

  function findContentHashRegistryPDA(hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("content_hash_index"), Buffer.from(hash)],
      sporeProgram.programId
    );
  }

  function findLicenseTemplatePDA(ipAssetKey: anchor.web3.PublicKey, licensorKey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("license_template"), ipAssetKey.toBuffer(), licensorKey.toBuffer()],
      hyphaProgram.programId
    );
  }

  function findLicensePDA(templateKey: anchor.web3.PublicKey, licenseeKey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("license"), templateKey.toBuffer(), licenseeKey.toBuffer()],
      hyphaProgram.programId
    );
  }

  let ipAssetPDA: anchor.web3.PublicKey;

  before(async () => {
    // Fund mint authority
    const airdropSig = await provider.connection.requestAirdrop(
      mintAuthority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create USDC-like mint with 6 decimals for testing
    usdcMint = await createMint(
      provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      USDC_DECIMALS
    );

    // Register an IP asset for licensing tests
    const content = "Hai Dudu character IP -- licensing test";
    const cHash = contentHash(content);
    const pHash = perceptualHash(content);
    [ipAssetPDA] = findIPAssetPDA(licensor.publicKey, cHash);
    const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

    await sporeProgram.methods
      .registerIp(cHash, pHash, { characterIp: {} }, "ar://hai_dudu", 25, null, [73, 68], null)
      .accounts({
        ipAsset: ipAssetPDA,
        contentHashRegistry: contentHashRegistryPDA,
        creator: licensor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  // ── Create License Template -- All 4 Archetypes ─────────────────

  describe("create_license_template", () => {
    it("creates a CreativeCommons license template (LIC-01)", async () => {
      // Use a separate IP for this template to avoid PDA collision
      const content = "CC license test IP";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ccIpPDA] = findIPAssetPDA(licensor.publicKey, cHash);
      const [ccRegistryPDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { music: {} }, "ar://cc_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: ccIpPDA,
          contentHashRegistry: ccRegistryPDA,
          creator: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [templatePDA] = findLicenseTemplatePDA(ccIpPDA, licensor.publicKey);

      await hyphaProgram.methods
        .createLicenseTemplate(
          { creativeCommons: {} },
          0,     // 0% royalty (free)
          100,   // max 100 sublicenses
          { global: {} },
          null,  // no expiry
          false, // non-commercial
          false  // no AI training
        )
        .accounts({
          licenseTemplate: templatePDA,
          ipAsset: ccIpPDA,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
      expect(template.ipAsset.toBase58()).to.equal(ccIpPDA.toBase58());
      expect(template.royaltyRateBps).to.equal(0);
      expect(template.commercialUse).to.be.false;
      expect(template.aiTrainingAllowed).to.be.false;
      expect(template.isActive).to.be.true;
    });

    it("creates a Commercial license template (LIC-01, LIC-02)", async () => {
      const [templatePDA] = findLicenseTemplatePDA(ipAssetPDA, licensor.publicKey);

      await hyphaProgram.methods
        .createLicenseTemplate(
          { commercial: {} },
          500,  // 5% royalty
          10,   // max 10 sublicenses
          { asean: {} },
          new anchor.BN(365 * 24 * 60 * 60), // 1 year
          true, // commercial use
          false // no AI training
        )
        .accounts({
          licenseTemplate: templatePDA,
          ipAsset: ipAssetPDA,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
      expect(template.ipAsset.toBase58()).to.equal(ipAssetPDA.toBase58());
      expect(template.royaltyRateBps).to.equal(500);
      expect(template.commercialUse).to.be.true;
      expect(template.aiTrainingAllowed).to.be.false;
      expect(template.isActive).to.be.true;
      expect(template.activeLicenses).to.equal(0);
    });

    it("creates an Exclusive license template (LIC-02)", async () => {
      const content = "Exclusive license test IP";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [exIpPDA] = findIPAssetPDA(licensor.publicKey, cHash);
      const [exRegistryPDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { characterIp: {} }, "ar://exclusive_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: exIpPDA,
          contentHashRegistry: exRegistryPDA,
          creator: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [templatePDA] = findLicenseTemplatePDA(exIpPDA, licensor.publicKey);

      await hyphaProgram.methods
        .createLicenseTemplate(
          { exclusive: {} },
          1000,  // 10% royalty
          1,     // max 1 sublicense (exclusive)
          { country: { code: [73, 68] } }, // Indonesia
          new anchor.BN(180 * 24 * 60 * 60), // 6 months
          true,  // commercial
          false  // no AI training
        )
        .accounts({
          licenseTemplate: templatePDA,
          ipAsset: exIpPDA,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
      expect(template.maxSublicenses).to.equal(1);
      expect(template.royaltyRateBps).to.equal(1000);
      expect(template.commercialUse).to.be.true;
    });

    it("creates an AITraining license template (LIC-02)", async () => {
      const content = "AI Training license test IP";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [aiIpPDA] = findIPAssetPDA(licensor.publicKey, cHash);
      const [aiRegistryPDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { dataset: {} }, "ar://ai_training_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: aiIpPDA,
          contentHashRegistry: aiRegistryPDA,
          creator: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [templatePDA] = findLicenseTemplatePDA(aiIpPDA, licensor.publicKey);

      await hyphaProgram.methods
        .createLicenseTemplate(
          { aiTraining: {} },
          750,    // 7.5% royalty
          50,     // max 50 sublicenses
          { global: {} },
          null,   // no expiry
          false,  // non-commercial (training only)
          true    // AI training allowed
        )
        .accounts({
          licenseTemplate: templatePDA,
          ipAsset: aiIpPDA,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
      expect(template.aiTrainingAllowed).to.be.true;
      expect(template.royaltyRateBps).to.equal(750);
      expect(template.isActive).to.be.true;
    });
  });

  // ── Issue License (acquire with USDC payment) ───────────────────

  describe("issue_license", () => {
    it("issues a license to a brand partner (LIC-03)", async () => {
      const [templatePDA] = findLicenseTemplatePDA(ipAssetPDA, licensor.publicKey);
      const licensee = anchor.web3.Keypair.generate();
      const [licensePDA] = findLicensePDA(templatePDA, licensee.publicKey);

      await hyphaProgram.methods
        .issueLicense("Unilever Indonesia", "Brand collaboration -- Hai Dudu x product packaging")
        .accounts({
          license: licensePDA,
          licenseTemplate: templatePDA,
          licensee: licensee.publicKey,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const license = await hyphaProgram.account.license.fetch(licensePDA);
      expect(license.licensee.toBase58()).to.equal(licensee.publicKey.toBase58());
      expect(license.licenseeName).to.equal("Unilever Indonesia");
      expect(license.royaltyRateBps).to.equal(500);
      expect(license.status).to.deep.equal({ active: {} });

      const template = await hyphaProgram.account.licenseTemplate.fetch(templatePDA);
      expect(template.activeLicenses).to.equal(1);
      expect(template.totalIssued).to.equal(1);
    });

    it("acquires license with USDC payment flow (LIC-03)", async () => {
      // Mint USDC to a licensee and verify transfer
      const licensee = anchor.web3.Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        licensee.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create licensee USDC ATA and mint 100 USDC
      const licenseeAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        usdcMint,
        licensee.publicKey
      );

      await mintTo(
        provider.connection,
        mintAuthority,
        usdcMint,
        licenseeAta.address,
        mintAuthority,
        100_000_000 // 100 USDC (6 decimals)
      );

      // Create licensor USDC ATA
      const licensorAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        usdcMint,
        licensor.publicKey
      );

      const licensorBalanceBefore = (await getAccount(provider.connection, licensorAta.address)).amount;

      // Transfer 10 USDC as license fee
      const priceUsdcLamports = 10_000_000; // $10 USDC
      const tx = new anchor.web3.Transaction();
      tx.add(
        createTransferCheckedInstruction(
          licenseeAta.address,
          usdcMint,
          licensorAta.address,
          licensee.publicKey,
          priceUsdcLamports,
          USDC_DECIMALS
        )
      );
      await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [licensee]);

      const licensorBalanceAfter = (await getAccount(provider.connection, licensorAta.address)).amount;
      expect(Number(licensorBalanceAfter) - Number(licensorBalanceBefore)).to.equal(priceUsdcLamports);

      // Verify licensee balance decreased
      const licenseeBalanceAfter = (await getAccount(provider.connection, licenseeAta.address)).amount;
      expect(Number(licenseeBalanceAfter)).to.equal(100_000_000 - priceUsdcLamports);
    });
  });

  // ── Verify License ──────────────────────────────────────────────

  describe("verify_license", () => {
    it("verifies a licensed wallet returns active status (LIC-04)", async () => {
      const [templatePDA] = findLicenseTemplatePDA(ipAssetPDA, licensor.publicKey);

      // Issue a license to a new wallet for verification
      const verifyLicensee = anchor.web3.Keypair.generate();
      const [licensePDA] = findLicensePDA(templatePDA, verifyLicensee.publicKey);

      await hyphaProgram.methods
        .issueLicense("Test Licensee", "Verification test")
        .accounts({
          license: licensePDA,
          licenseTemplate: templatePDA,
          licensee: verifyLicensee.publicKey,
          licensor: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Verify the license exists and is active
      const license = await hyphaProgram.account.license.fetch(licensePDA);
      expect(license.status).to.deep.equal({ active: {} });
      expect(license.licensee.toBase58()).to.equal(verifyLicensee.publicKey.toBase58());
    });

    it("verifies an unlicensed wallet has no license PDA (LIC-04)", async () => {
      const [templatePDA] = findLicenseTemplatePDA(ipAssetPDA, licensor.publicKey);
      const unlicensedWallet = anchor.web3.Keypair.generate();
      const [licensePDA] = findLicensePDA(templatePDA, unlicensedWallet.publicKey);

      try {
        await hyphaProgram.account.license.fetch(licensePDA);
        expect.fail("Should not find a license for unlicensed wallet");
      } catch (err) {
        // Expected: account does not exist
        expect(err.toString()).to.include("Account does not exist");
      }
    });
  });

  // ── Error Cases ─────────────────────────────────────────────────

  describe("error_cases", () => {
    it("rejects license creation with invalid royalty rate", async () => {
      const content = "Invalid royalty test IP";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [badIpPDA] = findIPAssetPDA(licensor.publicKey, cHash);
      const [badRegistryPDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { meme: {} }, "ar://bad_royalty", null, null, [73, 68], null)
        .accounts({
          ipAsset: badIpPDA,
          contentHashRegistry: badRegistryPDA,
          creator: licensor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [templatePDA] = findLicenseTemplatePDA(badIpPDA, licensor.publicKey);

      try {
        await hyphaProgram.methods
          .createLicenseTemplate(
            { commercial: {} },
            15000,  // 150% -- invalid, exceeds 10000 bps
            10,
            { global: {} },
            null,
            true,
            false
          )
          .accounts({
            licenseTemplate: templatePDA,
            ipAsset: badIpPDA,
            licensor: licensor.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected invalid royalty rate");
      } catch (err) {
        expect(err.toString()).to.include("InvalidRoyaltyRate");
      }
    });

    it("rejects USDC transfer with insufficient balance", async () => {
      const poorLicensee = anchor.web3.Keypair.generate();
      const airdropSig = await provider.connection.requestAirdrop(
        poorLicensee.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Create ATA but don't mint any USDC
      const poorAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        usdcMint,
        poorLicensee.publicKey
      );

      const licensorAta = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mintAuthority,
        usdcMint,
        licensor.publicKey
      );

      try {
        const tx = new anchor.web3.Transaction();
        tx.add(
          createTransferCheckedInstruction(
            poorAta.address,
            usdcMint,
            licensorAta.address,
            poorLicensee.publicKey,
            10_000_000, // $10 USDC -- but balance is 0
            USDC_DECIMALS
          )
        );
        await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [poorLicensee]);
        expect.fail("Should have rejected transfer with insufficient USDC");
      } catch (err) {
        // Expected: insufficient funds error from SPL token program
        expect(err.toString()).to.include("insufficient");
      }
    });
  });
});
