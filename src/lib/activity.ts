/**
 * The ActivityStreams messages of the handshake (solid-kit ADR 006 §2), as
 * Turtle. Pure: no fetch, no auth, so the test server's cast can send the same
 * messages the app sends.
 *
 * Member side: `as:Join`, `as:Announce`, and `as:Undo` of an announcement
 * when sharing stops. Collective side: `as:Accept`,
 * `as:Reject`, `as:Remove`, whose `as:object` is the message they answer (or
 * the member removed) and whose `as:target` is the group.
 */
import { DataFactory, Writer } from "n3";
import { NS } from "./vocab";

export type ActivityType = "Join" | "Announce" | "Accept" | "Reject" | "Remove" | "Undo";

function activity(type: ActivityType, fields: {
  actor: string;
  object: string;
  target?: string;
  summary?: string;
  published?: Date;
}): string {
  const { namedNode, literal, quad } = DataFactory;
  const self = namedNode("");
  const writer = new Writer({ prefixes: { as: NS.as, xsd: NS.xsd } });
  writer.addQuad(quad(self, namedNode(NS.rdf + "type"), namedNode(NS.as + type)));
  writer.addQuad(quad(self, namedNode(NS.as + "actor"), namedNode(fields.actor)));
  writer.addQuad(quad(self, namedNode(NS.as + "object"), namedNode(fields.object)));
  if (fields.target) writer.addQuad(quad(self, namedNode(NS.as + "target"), namedNode(fields.target)));
  if (fields.summary) writer.addQuad(quad(self, namedNode(NS.as + "summary"), literal(fields.summary)));
  writer.addQuad(
    quad(
      self,
      namedNode(NS.as + "published"),
      literal((fields.published ?? new Date()).toISOString(), namedNode(NS.xsd + "dateTime"))
    )
  );
  let out = "";
  writer.end((err, result) => {
    if (err) throw err;
    out = result;
  });
  return out;
}

/** "I ask to join": the member's side of the handshake, sent to the collective's inbox. */
export function buildJoin(actor: string, group: string, name: string | null, published?: Date): string {
  return activity("Join", {
    actor,
    object: group,
    summary: name ? `${name} asks to join.` : undefined,
    published,
  });
}

/** "This is published": the bundle URI, which the collective's agent now follows. */
export function buildAnnounce(actor: string, bundle: string, group: string, published?: Date): string {
  return activity("Announce", { actor, object: bundle, target: group, published });
}

/**
 * "This is no longer published": sent to the collective's inbox once the
 * member's grant is gone. The announcement it undoes is described in place
 * (`[ a as:Announce; as:object <bundle>; as:target <group> ]`): the member
 * does not know where the collective kept the original.
 */
export function buildUndoAnnounce(actor: string, bundle: string, group: string, published?: Date): string {
  const { namedNode, literal, quad, blankNode } = DataFactory;
  const self = namedNode("");
  const announce = blankNode("announce");
  const writer = new Writer({ prefixes: { as: NS.as, xsd: NS.xsd } });
  writer.addQuad(quad(self, namedNode(NS.rdf + "type"), namedNode(NS.as + "Undo")));
  writer.addQuad(quad(self, namedNode(NS.as + "actor"), namedNode(actor)));
  writer.addQuad(quad(self, namedNode(NS.as + "object"), announce));
  writer.addQuad(quad(self, namedNode(NS.as + "target"), namedNode(group)));
  writer.addQuad(quad(self, namedNode(NS.as + "published"), literal((published ?? new Date()).toISOString(), namedNode(NS.xsd + "dateTime"))));
  writer.addQuad(quad(announce, namedNode(NS.rdf + "type"), namedNode(NS.as + "Announce")));
  writer.addQuad(quad(announce, namedNode(NS.as + "object"), namedNode(bundle)));
  writer.addQuad(quad(announce, namedNode(NS.as + "target"), namedNode(group)));
  let out = "";
  writer.end((err, result) => {
    if (err) throw err;
    out = result;
  });
  return out;
}

/** The collective's answer to a join request, sent to the requester's inbox. */
export function buildAnswer(
  type: "Accept" | "Reject",
  actor: string,
  join: string,
  group: string,
  published?: Date,
  /** Why, in the admin's words (`as:summary`): shown to the person with the answer. */
  reason?: string
): string {
  return activity(type, { actor, object: join, target: group, published, summary: reason?.trim() || undefined });
}

/** "You are no longer listed": sent to a removed member's inbox, with the admin's reason when given. */
export function buildRemove(actor: string, member: string, group: string, published?: Date, reason?: string): string {
  return activity("Remove", { actor, object: member, target: group, published, summary: reason?.trim() || undefined });
}
