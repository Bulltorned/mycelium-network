/**
 * Jurisdiction adapter registry.
 *
 * Every adapter is registered here. Lookup by Jurisdiction enum value.
 * Adding a new jurisdiction: implement JurisdictionAdapter, add to the map.
 */

import type { Jurisdiction } from "../mep-schema.js";
import type { JurisdictionAdapter } from "./base.js";
import { IndonesiaAdapter } from "./indonesia.js";

export { IndonesiaAdapter } from "./indonesia.js";
export type { JurisdictionAdapter, ExpertWitnessDoc } from "./base.js";

export function getAdapter(jurisdiction: Jurisdiction): JurisdictionAdapter {
  switch (jurisdiction) {
    case "Indonesia":
      return new IndonesiaAdapter();
    case "Kenya":
    case "Colombia":
    case "WIPOArbitration":
    case "International":
      throw new Error(
        `Jurisdiction adapter for "${jurisdiction}" not yet implemented. ` +
          `Indonesia is the v1.0 flagship; others land in v1.1.`,
      );
    default: {
      const exhaustive: never = jurisdiction;
      throw new Error(`Unknown jurisdiction: ${exhaustive}`);
    }
  }
}
