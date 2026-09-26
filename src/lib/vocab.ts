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
   * PROVISIONAL. The same namespace the pull procedure's provenance.ttl uses.
   * It lives on the HyperScope pod although the pattern is generic; moving it
   * is an open question in ADR 006, and every term that uses it is here, so the
   * move is one line.
   */
  hs: "https://pod.nicolasdb.eu/hyperscope/vocab#",
} as const;
