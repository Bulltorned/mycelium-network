"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import anchor from "@coral-xyz/anchor";
import type { Program as ProgramT, AnchorProvider as AnchorProviderT } from "@coral-xyz/anchor";
const { Program, AnchorProvider } = anchor;
import { PROGRAM_IDS } from "@/lib/constants";
import {
  DisplayIPAsset,
  IPTypeKey,
  IPStatusKey,
  extractEnumKey,
  bytesToHex,
  countryCodeToString,
} from "@/lib/types";
import sporeIdl from "@/lib/idl/mycelium_spore.json";

/**
 * Convert an Anchor-fetched IPAsset account to the frontend's DisplayIPAsset type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anchorAccountToDisplayAsset(pubkey: string, account: any): DisplayIPAsset {
  const ipType = extractEnumKey<IPTypeKey>(account.ipType);
  const status = extractEnumKey<IPStatusKey>(account.status);

  return {
    pubkey,
    creator: account.creator.toBase58(),
    contentHash: bytesToHex(Array.from(account.contentHash)),
    perceptualHash: bytesToHex(Array.from(account.perceptualHash)),
    ipType,
    metadataUri: account.metadataUri,
    registrationSlot: account.registrationSlot.toNumber(),
    registrationTimestamp: new Date(account.registrationTimestamp.toNumber() * 1000),
    parentIp: account.parentIp ? account.parentIp.toBase58() : null,
    status,
    licenseCount: account.licenseCount,
    disputeCount: account.disputeCount,
    version: account.version,
    niceClass: account.niceClass ?? null,
    berneCategory: account.berneCategory ?? null,
    countryOfOrigin: countryCodeToString(Array.from(account.countryOfOrigin)),
    wipoAligned: account.wipoAligned,
  };
}

export function useMyAssets() {
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();

  return useQuery({
    queryKey: ["my-assets", publicKey?.toBase58()],
    queryFn: async (): Promise<DisplayIPAsset[]> => {
      if (!publicKey) return [];

      // Create a read-only Anchor provider for account deserialization.
      // The wallet adapter's signTransaction is not needed for reads,
      // but AnchorProvider requires a wallet interface.
      const provider = new AnchorProvider(
        connection,
        wallet?.adapter as any,
        { commitment: "confirmed" }
      );
      const program = new Program(sporeIdl as any, provider);

      // Fetch all IPAsset accounts filtered by creator (current owner).
      // Offset: 8 (discriminator) + 32 (original_creator) = 40 is where creator starts.
      const accounts = await (program.account as any).ipAsset.all([
        {
          memcmp: {
            offset: 8 + 32,
            bytes: publicKey.toBase58(),
          },
        },
      ]);

      return accounts
        .map((acc) =>
          anchorAccountToDisplayAsset(acc.publicKey.toBase58(), acc.account)
        )
        .sort(
          (a, b) =>
            b.registrationTimestamp.getTime() - a.registrationTimestamp.getTime()
        );
    },
    enabled: !!publicKey,
    refetchInterval: 30_000,
  });
}
