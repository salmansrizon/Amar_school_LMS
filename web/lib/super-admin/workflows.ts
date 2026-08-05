// Pure helper (#289): next stage sequence for a workflow definition — max + 1
// (gap-safe), or 1 when it has no stages. Keeps the unique (definition_key, seq)
// intact without a read-modify race on the client.
export function nextSeq(existing: readonly number[]): number {
  return existing.length ? Math.max(...existing) + 1 : 1
}
