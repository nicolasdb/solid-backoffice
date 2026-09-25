/**
 * The cast: every role in docs/explanation/membership.md, created fresh for
 * each run. Pods are set up the way docs/how-to/set-up-a-collective.md says,
 * so a failure here is also a finding about that guide.
 *
 *   hyperscope  collective, run by its own account
 *   hsagent     HyperScope's agent (the WebID members grant Read to)
 *   amina       member: accepted, sharing output2/hyperscope/
 *   neil        newcomer: an account and nothing else
 *   ines        applicant: declared HyperScope, has an inbox, sent an as:Join
 *   outsider    signed in, unrelated
 *   network     a second collective, for J6
 */
import type { Session } from "@inrupt/solid-client-authn-node";
import { createPerson, signIn, type Person } from "./accounts";
import { buildJoin } from "../../src/lib/activity";

const HS = "https://pod.nicolasdb.eu/hyperscope/vocab#";
export const ROLES = ["hyperscope", "hsagent", "amina", "neil", "ines", "outsider", "network"] as const;
export type Role = (typeof ROLES)[number];
export type Cast = Record<Role, Person>;

async function put(s: Session, url: string, body: string, type = "text/turtle"): Promise<void> {
  const res = await s.fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  if (!res.ok) throw new Error(`PUT ${url}: ${res.status} ${await res.text()}`);
}

async function patchProfile(s: Session, webId: string, triples: string): Promise<void> {
  const doc = webId.split("#")[0];
  const body = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
_:p a solid:InsertDeletePatch; solid:inserts { ${triples} }.`;
  const res = await s.fetch(doc, { method: "PATCH", headers: { "Content-Type": "text/n3" }, body });
  if (!res.ok) throw new Error(`PATCH ${doc}: ${res.status} ${await res.text()}`);
}

/** Hand-written ACL, as ADR 003 says; `extra` is authorizations after the owner's. */
function acl(target: string, owner: string, container: boolean, extra: string[]): string {
  const on = container ? `acl:accessTo <${target}>; acl:default <${target}>` : `acl:accessTo <${target}>`;
  return [
    "@prefix acl: <http://www.w3.org/ns/auth/acl#>.",
    `<#owner> a acl:Authorization; acl:agent <${owner}>; ${on}; acl:mode acl:Read, acl:Write, acl:Control.`,
    ...extra.map((e, i) => `<#g${i}> a acl:Authorization; ${on}; ${e}.`),
  ].join("\n");
}

function config(name: string, slug: string, agent: string): string {
  return `@prefix hs: <${HS}>. @prefix foaf: <http://xmlns.com/foaf/0.1/>. @prefix ldp: <http://www.w3.org/ns/ldp#>.
<#${slug}> a hs:Collective, foaf:Group; foaf:name "${name}"; hs:roster <membres.ttl>;
  ldp:inbox <inbox/>; hs:agent <${agent}>; hs:bundleFolder "output2/${slug}/".`;
}

/** A collective's pod, by the how-to: config, roster, inbox, and their ACLs. */
async function setUpCollective(
  s: Session, owner: Person, name: string, slug: string, agent: string, members: Record<string, string>
): Promise<void> {
  const p = owner.pod;
  await put(s, p + "config.ttl", config(name, slug, agent));
  await put(s, p + "config.ttl.acl", acl("config.ttl", owner.webId, false, [
    "acl:agentClass acl:AuthenticatedAgent; acl:mode acl:Read",
  ]));
  const lines = Object.entries(members).flatMap(([webId, nick]) => [
    `<config.ttl#${slug}> <http://xmlns.com/foaf/0.1/member> <${webId}>.`,
    `<${webId}> <http://xmlns.com/foaf/0.1/nick> "${nick}".`,
  ]);
  await put(s, p + "membres.ttl", lines.join("\n"));
  await put(s, p + "membres.ttl.acl", acl("membres.ttl", owner.webId, false, [
    ...Object.keys(members).map((m) => `acl:agent <${m}>; acl:mode acl:Read`),
    `acl:agent <${agent}>; acl:mode acl:Read`,
  ]));
  await put(s, p + "inbox/", "");
  await put(s, p + "inbox/.acl", acl("./", owner.webId, true, [
    "acl:agentClass acl:AuthenticatedAgent; acl:mode acl:Append",
    `acl:agent <${agent}>; acl:mode acl:Read`,
  ]));
}

/** A person's own inbox, as slice A creates it. */
async function setUpInbox(s: Session, person: Person): Promise<void> {
  await put(s, person.pod + "inbox/", "");
  await put(s, person.pod + "inbox/.acl", acl("./", person.webId, true, [
    "acl:agentClass acl:AuthenticatedAgent; acl:mode acl:Append",
  ]));
  await patchProfile(s, person.webId, `<${person.webId}> <http://www.w3.org/ns/ldp#inbox> <${person.pod}inbox/>.`);
}

export async function createCast(base: string): Promise<Cast> {
  const cast = {} as Cast;
  for (const role of ROLES) cast[role] = await createPerson(base, role);
  const as = async (r: Role) => signIn(base, cast[r]);
  const hsGroup = cast.hyperscope.pod + "config.ttl#hyperscope";

  const hs = await as("hyperscope");
  await setUpCollective(hs, cast.hyperscope, "HyperScope", "hyperscope", cast.hsagent.webId, {
    [cast.amina.webId]: "amina",
  });
  await hs.logout();

  const net = await as("network");
  await setUpCollective(net, cast.network, "Fablab network", "network", cast.network.webId, {});
  await net.logout();

  const amina = await as("amina");
  await patchProfile(amina, cast.amina.webId,
    `<${cast.amina.webId}> <http://xmlns.com/foaf/0.1/name> "Amina"; <http://www.w3.org/ns/org#memberOf> <${hsGroup}>.`);
  await setUpInbox(amina, cast.amina);
  const shared = cast.amina.pod + "output2/hyperscope/";
  await put(amina, shared + "notes.md", "# Notes\n\nShared with HyperScope.\n", "text/markdown");
  await put(amina, shared + ".acl", acl("./", cast.amina.webId, true, [
    `acl:agent <${cast.hsagent.webId}>; acl:mode acl:Read`,
  ]));
  await amina.logout();

  const ines = await as("ines");
  await patchProfile(ines, cast.ines.webId,
    `<${cast.ines.webId}> <http://xmlns.com/foaf/0.1/name> "Inès"; <http://www.w3.org/ns/org#memberOf> <${hsGroup}>.`);
  await setUpInbox(ines, cast.ines);
  const join = await ines.fetch(cast.hyperscope.pod + "inbox/", {
    method: "POST", headers: { "Content-Type": "text/turtle" }, body: buildJoin(cast.ines.webId, hsGroup, "Inès"),
  });
  if (!join.ok) throw new Error(`POST join: ${join.status} ${await join.text()}`);
  await ines.logout();

  return cast;
}
