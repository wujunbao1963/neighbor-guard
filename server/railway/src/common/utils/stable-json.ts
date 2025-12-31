/**
 * Deterministic JSON stringify used for payload hashing.
 * Ensures object keys are sorted, so semantically equivalent payloads hash the same.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = sortRecursively(obj[k]);
    }
    return out;
  }

  return value;
}
