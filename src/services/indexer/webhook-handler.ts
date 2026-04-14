/**
 * Mycelium Protocol -- Helius Webhook Handler
 *
 * Express router that receives enhanced transaction webhooks from Helius,
 * checks idempotency via processed_transactions table, and routes to
 * program-specific event parsers.
 *
 * Design:
 * - Responds 200 immediately (Helius retries on >5s timeout)
 * - Idempotent: duplicate transactions are skipped via signature check
 * - Parse errors logged but don't cause retries (respond 200 anyway)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { createHelius } from "helius-sdk";
import { query } from "../db/pool.js";
import {
  parseSporeEvent,
  parseHyphaEvent,
  parseRhizomeEvent,
  parseMeridianEvent,
  PROGRAM_IDS,
} from "./event-parser.js";

/**
 * Helius enhanced transaction shape (subset of fields we use).
 */
interface HeliusTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  instructions?: Array<{
    programId: string;
    data?: string;
    accounts?: string[];
    innerInstructions?: Array<{
      programId: string;
      data?: string;
      accounts?: string[];
    }>;
  }>;
}

/**
 * Map program IDs to their parser functions.
 */
const PARSER_MAP: Record<
  string,
  (
    ix: { data?: string; accounts?: string[]; programId?: string },
    slot: number,
    timestamp: number,
    txSignature: string
  ) => Promise<void>
> = {
  [PROGRAM_IDS.SPORE]: parseSporeEvent,
  [PROGRAM_IDS.HYPHA]: parseHyphaEvent,
  [PROGRAM_IDS.RHIZOME]: parseRhizomeEvent,
  [PROGRAM_IDS.MERIDIAN]: parseMeridianEvent,
};

/**
 * Create an Express router with the Helius webhook endpoint.
 *
 * POST /webhooks/helius
 *   - Receives array of enhanced transactions from Helius
 *   - Checks idempotency per signature
 *   - Routes instructions to program-specific parsers
 *   - Always responds 200 (prevents Helius retries on parse errors)
 */
export function createWebhookRouter(): Router {
  const router = Router();

  router.post(
    "/webhooks/helius",
    async (req: Request, res: Response): Promise<void> => {
      // Respond 200 immediately to prevent Helius timeout retries
      res.status(200).json({ received: true });

      try {
        const transactions: HeliusTransaction[] = Array.isArray(req.body)
          ? req.body
          : [req.body];

        for (const tx of transactions) {
          if (!tx.signature) continue;

          // Idempotency check: skip already-processed transactions
          const existing = await query(
            "SELECT 1 FROM processed_transactions WHERE signature = $1",
            [tx.signature]
          );

          if (existing.rows.length > 0) {
            console.error(
              `[mycelium-webhook] Skipping duplicate tx: ${tx.signature}`
            );
            continue;
          }

          // Process all instructions in the transaction
          const instructions = tx.instructions ?? [];
          for (const ix of instructions) {
            const parser = PARSER_MAP[ix.programId];
            if (parser) {
              try {
                await parser(ix, tx.slot, tx.timestamp, tx.signature);
              } catch (parseErr) {
                const msg =
                  parseErr instanceof Error
                    ? parseErr.message
                    : String(parseErr);
                console.error(
                  `[mycelium-webhook] Parse error for ${ix.programId} in tx ${tx.signature}: ${msg}`
                );
                // Continue processing other instructions
              }
            }

            // Also check inner instructions (CPI calls)
            if (ix.innerInstructions) {
              for (const inner of ix.innerInstructions) {
                const innerParser = PARSER_MAP[inner.programId];
                if (innerParser) {
                  try {
                    await innerParser(
                      inner,
                      tx.slot,
                      tx.timestamp,
                      tx.signature
                    );
                  } catch (parseErr) {
                    const msg =
                      parseErr instanceof Error
                        ? parseErr.message
                        : String(parseErr);
                    console.error(
                      `[mycelium-webhook] Inner parse error for ${inner.programId}: ${msg}`
                    );
                  }
                }
              }
            }
          }

          // Mark transaction as processed (after all instructions handled)
          await query(
            "INSERT INTO processed_transactions (signature, slot) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [tx.signature, tx.slot]
          );

          console.error(
            `[mycelium-webhook] Processed tx: ${tx.signature} slot=${tx.slot}`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[mycelium-webhook] Handler error: ${message}`);
        // Already responded 200 above -- error only logged
      }
    }
  );

  return router;
}

/**
 * Register a Helius webhook to receive enhanced transactions
 * for all four Mycelium programs.
 *
 * Call this once during deployment to set up the webhook.
 * Helius will POST enhanced transactions to the provided URL.
 */
export async function registerHeliusWebhook(
  apiKey: string,
  webhookUrl: string
): Promise<void> {
  const helius = createHelius(apiKey);

  try {
    const response = await helius.createWebhook({
      webhookURL: webhookUrl,
      transactionTypes: ["ANY" as any],
      accountAddresses: [
        PROGRAM_IDS.SPORE,
        PROGRAM_IDS.HYPHA,
        PROGRAM_IDS.RHIZOME,
        PROGRAM_IDS.MERIDIAN,
      ],
      webhookType: "enhanced" as any,
    });

    console.error(
      `[mycelium-webhook] Registered Helius webhook: url=${webhookUrl} id=${JSON.stringify(response)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to register Helius webhook: ${message}`);
  }
}
