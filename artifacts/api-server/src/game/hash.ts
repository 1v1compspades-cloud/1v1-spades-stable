import { createHash } from "node:crypto";

/**
 * Canonical JSON serializer with sorted object keys. Used so that two
 * states with identical content but different insertion order produce the
 * same hash — important for the audit log's `prev_hash`/`new_hash` chain.
 *
 * Not a general-purpose stable stringifier: assumes plain JSON-able values
 * (no Date, no Map, no functions). GameState satisfies that contract.
 */
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k]));
  return "{" + parts.join(",") + "}";
}

/**
 * Stable sha256 of any JSON-serializable value. Hex-encoded. Used purely
 * for audit/debug — not for any auth or integrity-checking purpose.
 */
export function hashState(value: unknown): string {
  return createHash("sha256").update(canonicalJSON(value)).digest("hex");
}
