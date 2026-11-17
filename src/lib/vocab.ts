/** The vocabularies the backoffice reads and writes. No imports, so node-side test code can use it. */
export const NS = {
  foaf: "http://xmlns.com/foaf/0.1/",
  org: "http://www.w3.org/ns/org#",
  acl: "http://www.w3.org/ns/auth/acl#",
  ldp: "http://www.w3.org/ns/ldp#",
  as: "https://www.w3.org/ns/activitystreams#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  schema: "http://schema.org/",
  /**
   * The collectives' vocabulary (solid-kit ADR 006 §7, amended 2026-11-17;
   * the terms are solid-kit `docs/vocab/vocab.ttl`). Everything this app
   * WRITES uses it, and only it.
   */
  sc: "https://w3id.org/solid-collective/vocab#",
  /**
   * The provisional namespace every document used before §7, on HyperScope's
   * pod. READ ONLY: documents on pods nobody here can rewrite still carry it
   * (each collective's config.ttl until its owner edits it, a member's
   * settings files until this app saves them again, snapshots for ever).
   * Never written: a file read in it is written back in `sc:`.
   */
  hsLegacy: "https://pod.nicolasdb.eu/hyperscope/vocab#",
} as const;

/**
 * A term in both namespaces, the current one first: what a parser accepts.
 * Only for terms whose local name did not change (`bundleFolder` became
 * `suggestedFolder`, so that pair is spelled out where it is read).
 */
export function scTerm(local: string): [current: string, legacy: string] {
  return [NS.sc + local, NS.hsLegacy + local];
}
