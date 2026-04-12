"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { findIPAssetPDA, findContentHashRegistryPDA } from "@/lib/pda";
import { IPTypeKey, toAnchorEnum } from "@/lib/types";
import sporeIdl from "@/lib/idl/mycelium_spore.json";

interface RegisterParams {
  contentHash: Uint8Array;
  perceptualHash: Uint8Array;
  ipType: IPTypeKey;
  metadataUri: string;
  countryOfOrigin: string;
  niceClass?: number;
}

export function useRegisterIP() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, wallet } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [ipAssetPDA, setIpAssetPDA] = useState<string | null>(null);

  const register = useCallback(
    async (params: RegisterParams) => {
      if (!publicKey || !sendTransaction || !wallet) {
        setError("Wallet not connected");
        return;
      }

      setIsLoading(true);
      setError(null);
      setTxSignature(null);

      try {
        const [pda] = findIPAssetPDA(publicKey, params.contentHash);
        const [contentHashRegistryPda] = findContentHashRegistryPDA(params.contentHash);
        setIpAssetPDA(pda.toBase58());

        // Create Anchor provider and program for building the transaction
        const provider = new AnchorProvider(
          connection,
          wallet.adapter as never,
          { commitment: "confirmed" }
        );
        const program = new Program(sporeIdl as never, provider);

        const countryBytes = Array.from(
          Buffer.from(params.countryOfOrigin.slice(0, 2), "ascii")
        );

        // Build the transaction using the IDL client
        const tx = await program.methods
          .registerIp(
            Array.from(params.contentHash) as number[],
            Array.from(params.perceptualHash) as number[],
            toAnchorEnum(params.ipType),
            params.metadataUri,
            params.niceClass ?? null,
            null, // berneCategory: Option<u8> = None
            countryBytes as number[],
            null, // firstUseDate: Option<i64> = None
          )
          .accounts({
            ipAsset: pda,
            contentHashRegistry: contentHashRegistryPda,
            creator: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
        setTxSignature(sig);

        return { signature: sig, pda: pda.toBase58() };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Registration failed";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey, sendTransaction, wallet, connection]
  );

  return { register, isLoading, error, txSignature, ipAssetPDA };
}
