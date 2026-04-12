import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MyceliumRhizome } from "../target/types/mycelium_rhizome";
import { MyceliumSpore } from "../target/types/mycelium_spore";
import { expect } from "chai";
import { createHash } from "crypto";

describe("mycelium-rhizome", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const rhizomeProgram = anchor.workspace.MyceliumRhizome as Program<MyceliumRhizome>;
  const sporeProgram = anchor.workspace.MyceliumSpore as Program<MyceliumSpore>;
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
      sporeProgram.programId
    );
  }

  function findContentHashRegistryPDA(hash: number[]) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("content_hash_index"), Buffer.from(hash)],
      sporeProgram.programId
    );
  }

  function findRoyaltyConfigPDA(ipAssetKey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("royalty_config"), ipAssetKey.toBuffer()],
      rhizomeProgram.programId
    );
  }

  function findRoyaltyVaultPDA(configKey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("royalty_vault"), configKey.toBuffer()],
      rhizomeProgram.programId
    );
  }

  // Shared state across tests
  let ipAssetPDA: anchor.web3.PublicKey;
  let royaltyConfigPDA: anchor.web3.PublicKey;
  let royaltyVaultPDA: anchor.web3.PublicKey;
  const platformWallet = anchor.web3.Keypair.generate();
  const distributionPool = anchor.web3.Keypair.generate();
  const recipient1 = anchor.web3.Keypair.generate();
  const recipient2 = anchor.web3.Keypair.generate();

  before(async () => {
    // Register an IP asset for royalty configuration tests
    const content = "Rhizome test IP -- royalty distribution";
    const cHash = contentHash(content);
    const pHash = perceptualHash(content);
    [ipAssetPDA] = findIPAssetPDA(creator.publicKey, cHash);
    const [contentHashRegistryPDA] = findContentHashRegistryPDA(cHash);

    await sporeProgram.methods
      .registerIp(cHash, pHash, { music: {} }, "ar://rhizome_test_ip", null, null, [73, 68], null)
      .accounts({
        ipAsset: ipAssetPDA,
        contentHashRegistry: contentHashRegistryPDA,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    [royaltyConfigPDA] = findRoyaltyConfigPDA(ipAssetPDA);
    [royaltyVaultPDA] = findRoyaltyVaultPDA(royaltyConfigPDA);

    // Fund platform wallet so it can receive lamports (needs to be rent-exempt)
    const sig1 = await provider.connection.requestAirdrop(
      platformWallet.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig1);

    // Fund distribution pool
    const sig2 = await provider.connection.requestAirdrop(
      distributionPool.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig2);
  });

  // ── Configure royalty ─────────────────────────────────────────────────

  describe("configure_royalty", () => {
    it("creates RoyaltyConfig PDA with correct recipients and platform_wallet", async () => {
      const recipients = [
        {
          wallet: recipient1.publicKey,
          shareBps: 7000, // 70%
          role: { creator: {} } as any,
        },
        {
          wallet: recipient2.publicKey,
          shareBps: 3000, // 30%
          role: { coCreator: {} } as any,
        },
      ];

      await rhizomeProgram.methods
        .configureRoyalty(
          recipients,
          250, // 2.5% platform fee
          platformWallet.publicKey
        )
        .accounts({
          royaltyConfig: royaltyConfigPDA,
          ipAsset: ipAssetPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const config = await rhizomeProgram.account.royaltyConfig.fetch(royaltyConfigPDA);
      expect(config.ipAsset.toBase58()).to.equal(ipAssetPDA.toBase58());
      expect(config.creator.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(config.platformWallet.toBase58()).to.equal(platformWallet.publicKey.toBase58());
      expect(config.platformFeeBps).to.equal(250);
      expect(config.recipientCount).to.equal(2);
      expect(config.isActive).to.be.true;
      expect(config.totalDeposited.toNumber()).to.equal(0);
      expect(config.totalDistributed.toNumber()).to.equal(0);
      expect(config.distributionCount).to.equal(0);
    });

    it("rejects splits that do not sum to 10000 bps", async () => {
      // Register a second IP for this test
      const content = "Rhizome bad splits test";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ip2PDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [registry2PDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { software: {} }, "ar://bad_splits_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: ip2PDA,
          contentHashRegistry: registry2PDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [config2PDA] = findRoyaltyConfigPDA(ip2PDA);

      const badRecipients = [
        {
          wallet: recipient1.publicKey,
          shareBps: 5000,
          role: { creator: {} } as any,
        },
        {
          wallet: recipient2.publicKey,
          shareBps: 4000, // Only 9000 total -- should fail
          role: { coCreator: {} } as any,
        },
      ];

      try {
        await rhizomeProgram.methods
          .configureRoyalty(badRecipients, 250, platformWallet.publicKey)
          .accounts({
            royaltyConfig: config2PDA,
            ipAsset: ip2PDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected splits not summing to 10000");
      } catch (err) {
        expect(err.toString()).to.include("SplitsMustSum10000");
      }
    });

    it("rejects platform fee exceeding 10%", async () => {
      const content = "Rhizome high fee test";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ip3PDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [registry3PDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { meme: {} }, "ar://high_fee_test", null, null, [73, 68], null)
        .accounts({
          ipAsset: ip3PDA,
          contentHashRegistry: registry3PDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [config3PDA] = findRoyaltyConfigPDA(ip3PDA);

      try {
        await rhizomeProgram.methods
          .configureRoyalty(
            [{ wallet: recipient1.publicKey, shareBps: 10000, role: { creator: {} } as any }],
            1500, // 15% -- exceeds 10% max
            platformWallet.publicKey
          )
          .accounts({
            royaltyConfig: config3PDA,
            ipAsset: ip3PDA,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected platform fee > 10%");
      } catch (err) {
        expect(err.toString()).to.include("PlatformFeeTooHigh");
      }
    });
  });

  // ── Deposit royalty ───────────────────────────────────────────────────

  describe("deposit_royalty", () => {
    it("deposits SOL into the royalty vault", async () => {
      const depositAmount = 500_000_000; // 0.5 SOL

      await rhizomeProgram.methods
        .depositRoyalty(new anchor.BN(depositAmount))
        .accounts({
          royaltyConfig: royaltyConfigPDA,
          royaltyVault: royaltyVaultPDA,
          depositor: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const config = await rhizomeProgram.account.royaltyConfig.fetch(royaltyConfigPDA);
      expect(config.totalDeposited.toNumber()).to.equal(depositAmount);

      // Verify vault received the SOL
      const vaultBalance = await provider.connection.getBalance(royaltyVaultPDA);
      expect(vaultBalance).to.be.greaterThanOrEqual(depositAmount);
    });

    it("rejects zero deposit", async () => {
      try {
        await rhizomeProgram.methods
          .depositRoyalty(new anchor.BN(0))
          .accounts({
            royaltyConfig: royaltyConfigPDA,
            royaltyVault: royaltyVaultPDA,
            depositor: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected zero deposit");
      } catch (err) {
        expect(err.toString()).to.include("ZeroDeposit");
      }
    });
  });

  // ── Distribute royalties ──────────────────────────────────────────────

  describe("distribute_royalties", () => {
    it("distributes vault balance with correct platform fee deduction", async () => {
      const configBefore = await rhizomeProgram.account.royaltyConfig.fetch(royaltyConfigPDA);
      const platformBalanceBefore = await provider.connection.getBalance(platformWallet.publicKey);

      await rhizomeProgram.methods
        .distributeRoyalties()
        .accounts({
          royaltyConfig: royaltyConfigPDA,
          royaltyVault: royaltyVaultPDA,
          distributionPool: distributionPool.publicKey,
          platformWallet: platformWallet.publicKey,
          caller: creator.publicKey,
        })
        .rpc();

      const configAfter = await rhizomeProgram.account.royaltyConfig.fetch(royaltyConfigPDA);
      expect(configAfter.distributionCount).to.equal(configBefore.distributionCount + 1);
      expect(configAfter.totalDistributed.toNumber()).to.be.greaterThan(
        configBefore.totalDistributed.toNumber()
      );

      // Platform wallet should have received its fee
      const platformBalanceAfter = await provider.connection.getBalance(platformWallet.publicKey);
      expect(platformBalanceAfter).to.be.greaterThan(platformBalanceBefore);
    });

    // ── SEC-04: Platform wallet and caller constraints ────────────────

    it("rejects distribution with wrong platform_wallet (SEC-04)", async () => {
      // Deposit more SOL first so there's something to distribute
      await rhizomeProgram.methods
        .depositRoyalty(new anchor.BN(100_000_000))
        .accounts({
          royaltyConfig: royaltyConfigPDA,
          royaltyVault: royaltyVaultPDA,
          depositor: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const fakePlatformWallet = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        fakePlatformWallet.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      try {
        await rhizomeProgram.methods
          .distributeRoyalties()
          .accounts({
            royaltyConfig: royaltyConfigPDA,
            royaltyVault: royaltyVaultPDA,
            distributionPool: distributionPool.publicKey,
            platformWallet: fakePlatformWallet.publicKey, // Wrong wallet!
            caller: creator.publicKey,
          })
          .rpc();
        expect.fail("Should have rejected wrong platform wallet");
      } catch (err) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("rejects distribution from unauthorized caller (SEC-04)", async () => {
      const attacker = anchor.web3.Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        attacker.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      try {
        await rhizomeProgram.methods
          .distributeRoyalties()
          .accounts({
            royaltyConfig: royaltyConfigPDA,
            royaltyVault: royaltyVaultPDA,
            distributionPool: distributionPool.publicKey,
            platformWallet: platformWallet.publicKey,
            caller: attacker.publicKey, // Not the config creator!
          })
          .signers([attacker])
          .rpc();
        expect.fail("Should have rejected unauthorized caller");
      } catch (err) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("supports maximum 8 recipients with basis points summing to 10000", async () => {
      const content = "Rhizome 8 recipients test";
      const cHash = contentHash(content);
      const pHash = perceptualHash(content);
      const [ipPDA] = findIPAssetPDA(creator.publicKey, cHash);
      const [registryPDA] = findContentHashRegistryPDA(cHash);

      await sporeProgram.methods
        .registerIp(cHash, pHash, { video: {} }, "ar://eight_recipients", null, null, [73, 68], null)
        .accounts({
          ipAsset: ipPDA,
          contentHashRegistry: registryPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const [configPDA] = findRoyaltyConfigPDA(ipPDA);

      // 8 recipients: 7 x 1250 bps + 1 x 1250 bps = 10000 bps
      const recipients = [];
      for (let i = 0; i < 8; i++) {
        const wallet = anchor.web3.Keypair.generate();
        recipients.push({
          wallet: wallet.publicKey,
          shareBps: 1250, // 12.5% each
          role: i === 0 ? ({ creator: {} } as any) : ({ other: {} } as any),
        });
      }

      await rhizomeProgram.methods
        .configureRoyalty(recipients, 100, platformWallet.publicKey)
        .accounts({
          royaltyConfig: configPDA,
          ipAsset: ipPDA,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const config = await rhizomeProgram.account.royaltyConfig.fetch(configPDA);
      expect(config.recipientCount).to.equal(8);
    });
  });
});
