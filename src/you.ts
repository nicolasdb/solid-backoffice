/**
 * You (tabs third pass, docs/layout-brief.md), under the avatar: your name,
 * agent and inbox, and your profile document itself, read only. Each step
 * edits one line of `profile/card` (foaf:name, acl:delegates, ldp:inbox);
 * joining a collective adds org:memberOf. The source shows those lines
 * marked, so what the steps do is never hidden: what you see is what the pod
 * holds. Editing it by hand is Pods' job (its editor saves with If-Match);
 * a broken card can break sign-in, so not here.
 *
 * Every write here is on the signed-in user's own pod.
 */
import { isValidWebId } from "./lib/acl";
import { createInbox } from "./lib/newcomer";
import { NS, profileDocOf, profileEdits, updateOwnProfile, type Collective, type MemberDeclaration } from "./lib/collective";
import { readTurtle } from "./lib/read";
import { describePodError } from "./lib/pod";
import { announce } from "./ui/a11y";
import { esc, toast } from "./ui/patterns";
import { bindButton, bindForm } from "./bind";
import { routeHref } from "./router";
import { copyable } from "./steps";
import type { Loaded, ViewContext } from "./onboarding";

/** Your profile document as the pod holds it, or why it could not be read. */
export type Source = { text: string } | { error: string };

export async function readSource(webId: string): Promise<Source> {
  try {
    const res = await readTurtle(profileDocOf(webId));
    if (!res.ok) return { error: `Could not read your profile (${res.status}).` };
    return { text: await res.text() };
  } catch (err) {
    return { error: describePodError(err) };
  }
}

/** The lines the steps on this page write, by predicate. */
const MARKS: Record<string, string> = {
  [NS.foaf + "name"]: "Your name",
  [NS.acl + "delegates"]: "Your agent",
  [NS.ldp + "inbox"]: "Your inbox",
  [NS.org + "memberOf"]: "A collective you joined",
};

/**
 * The document's lines, each with the step that wrote it, if any. A line is
 * marked when a predicate on it is one of MARKS, written in full (`<…#name>`)
 * or with a prefix the document declares (`foaf:name`).
 */
export function sourceLines(text: string, names: Map<string, string> = new Map()): { line: string; mark: string | null }[] {
  const prefixes = new Map<string, string>();
  for (const m of text.matchAll(/@prefix\s+([A-Za-z][\w-]*)?:\s*<([^>]*)>/g)) prefixes.set(m[1] ?? "", m[2]);
  for (const m of text.matchAll(/PREFIX\s+([A-Za-z][\w-]*)?:\s*<([^>]*)>/gi)) prefixes.set(m[1] ?? "", m[2]);
  return text.split("\n").map((line) => {
    if (/^\s*(@prefix|PREFIX)\b/i.test(line)) return { line, mark: null };
    const terms = [
      ...[...line.matchAll(/<([^>\s]*)>/g)].map((m) => m[1]),
      ...[...line.matchAll(/(?:^|[\s;,])([A-Za-z][\w-]*)?:([A-Za-z_][\w-]*)/g)].map((m) => (prefixes.get(m[1] ?? "") ?? "\u0000") + m[2]),
    ];
    const predicate = terms.find((t) => t in MARKS);
    if (!predicate) return { line, mark: null };
    if (predicate === NS.org + "memberOf") {
      const joined = [...names].find(([iri]) => terms.includes(iri));
      if (joined) return { line, mark: `Joined ${joined[1]}` };
    }
    return { line, mark: MARKS[predicate] };
  });
}

/**
 * One line of the "You" checklist (layout A, as drawn): a dot, what it is,
 * and its value. Open it to change it. A step still to do starts open, so its
 * action is in sight.
 */
function youRow(title: string, done: boolean, value: string, body: string, optional = false): string {
  const dot = done ? "is-done" : "is-todo";
  const status = value || (done ? "Done" : optional ? "Optional" : "To do");
  return `
    <details class="you-row step-host${done ? " is-done" : ""}"${done || optional ? "" : " open"}>
      <summary>
        <span class="dot ${dot}" aria-hidden="true"></span>
        <span class="you-title">${esc(title)}</span>
        <span class="you-value">${esc(status)}</span>
      </summary>
      <div class="you-body stack">
        ${body}
        <p class="step-error error" role="alert" hidden></p>
      </div>
    </details>`;
}


export function renderYouView(data: Loaded, webId: string, podUrl: string, source: Source): string {
  const { profile, unadvertisedInbox, run } = data;
  const names = new Map<string, string>([
    ...(run ? [[run.collective.group, run.collective.name] as [string, string]] : []),
    ...data.collectives.map((c) => [c.collective.group, c.collective.name] as [string, string]),
  ]);
  const doc = profileDocOf(webId);
  const inPod = doc.startsWith(podUrl) ? doc.slice(podUrl.length) : null;
  const src =
    "error" in source
      ? `<p class="error" role="alert">${esc(source.error)}</p>`
      : `<pre class="source" aria-label="Your profile document"><code>${sourceLines(source.text, names)
          .map(({ line, mark }) =>
            mark
              ? `<span class="src-line is-marked"><span class="src-mark">${esc(mark)}</span>${esc(line)}</span>`
              : `<span class="src-line">${esc(line) || " "}</span>`
          )
          .join("")}</code></pre>`;
  return `
    <div class="you-grid">
      <div class="stack">
        <div class="you-head">
          <h1 data-view-title>${esc(profile.name ?? "You")}</h1>
          ${copyable(webId, "WebID copied.")}
          <p class="meta">Everything here is written in your profile, on your own pod. Collectives read it; they never write it.</p>
        </div>
        <div class="you-card">
          ${stepName(profile)}
          ${stepInbox(profile, unadvertisedInbox)}
          ${stepAgent(profile, run?.collective ?? null)}
        </div>
      </div>
      <section class="stack you-source" aria-labelledby="source-title">
        <div class="source-head">
          <h2 class="section-title" id="source-title">Source · ${esc(inPod ?? doc)}</h2>
          ${inPod !== null ? `<a href="${routeHref({ name: "places", path: inPod })}">Open in Pods</a>` : ""}
        </div>
        ${src}
        <p class="meta">Your profile as your pod holds it, read just now. The marked lines are what the steps beside it wrote. Read only here; in Pods, its editor saves only if nobody changed it meanwhile.</p>
      </section>
    </div>`;
}

export function bindYou(app: HTMLElement, data: Loaded, ctx: ViewContext): void {
  const { webId, podUrl, rerender } = ctx;
  const { unadvertisedInbox } = data;

  bindForm(app, "#name-form", async (form) => {
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    if (!name) throw new Error("Write the name people know you by.");
    await updateOwnProfile(webId, profileEdits.setName(name));
    announce("Name saved.");
  }, rerender);

  bindForm(app, "#agent-form", async (form) => {
    const agent = (form.elements.namedItem("agent") as HTMLInputElement).value.trim();
    if (!isValidWebId(agent)) throw new Error("That is not a WebID: it should start with https:// and have no spaces.");
    if (agent === webId) throw new Error("That is your own WebID. Your agent has a WebID of its own.");
    await updateOwnProfile(webId, profileEdits.addDelegate(agent));
    announce("Agent declared.");
  }, rerender);

  app.querySelectorAll<HTMLButtonElement>("[data-add-agent]").forEach((button) =>
    bindButton(button, async () => {
      await updateOwnProfile(webId, profileEdits.addDelegate(button.dataset.addAgent!));
      announce("Agent declared.");
    }, rerender)
  );

  app.querySelectorAll<HTMLButtonElement>("[data-remove-agent]").forEach((button) =>
    bindButton(button, async () => {
      const agent = button.dataset.removeAgent!;
      await updateOwnProfile(webId, profileEdits.removeDelegate(agent));
      toast("Agent removed from your profile.", {
        undo: () => void updateOwnProfile(webId, profileEdits.addDelegate(agent)).then(rerender),
      });
    }, rerender)
  );

  const inboxButton = app.querySelector<HTMLButtonElement>("#make-inbox");
  if (inboxButton) {
    bindButton(inboxButton, async () => {
      await createInbox(webId, unadvertisedInbox ?? new URL("inbox/", podUrl).href);
      announce("Inbox ready.");
    }, rerender);
  }
}

/** Steps of You still to do: a name and an inbox (the agent is optional). */
export function youTodo(profile: MemberDeclaration): number {
  return (profile.name ? 0 : 1) + (profile.inbox ? 0 : 1);
}

function stepName(profile: MemberDeclaration): string {
  return youRow(
    "Your name",
    Boolean(profile.name),
    profile.name ?? "",
    `<p class="lead">The name your collectives show next to your work.</p>
     <form id="name-form" class="field">
       <label for="name">Name</label>
       <input id="name" name="name" type="text" value="${esc(profile.name ?? "")}" required />
       <div><button type="submit"${profile.name ? ' class="ghost"' : ""}>Save</button></div>
     </form>`
  );
}

/**
 * Agents the pods already name, offered with one click. Today: a collective
 * account's own agent (`hs:agent` in its config.ttl). WebIDs linked to the
 * account on our provider come with the provider layer (slice D).
 */
function agentSuggestions(profile: MemberDeclaration, run: Collective | null): string[] {
  return run && !profile.delegates.includes(run.agent) ? [run.agent] : [];
}

function stepAgent(profile: MemberDeclaration, run: Collective | null): string {
  const suggested = agentSuggestions(profile, run)
    .map(
      (agent) => `<li><code>${esc(agent)}</code>
        <button class="ghost" data-add-agent="${esc(agent)}">Add</button></li>`
    )
    .join("");
  const list = profile.delegates
    .map(
      (agent) => `<li><code>${esc(agent)}</code>
        <button class="ghost" data-remove-agent="${esc(agent)}">Remove</button></li>`
    )
    .join("");
  return youRow(
    "Your agent",
    profile.delegates.length > 0,
    "",
    `<p class="lead">
       If an AI agent works for you, say so here, so that what it writes is
       credited to you. This gives it no access to anything.
     </p>
     ${list ? `<ul class="plain-list">${list}</ul>` : ""}
     ${suggested ? `<p class="meta">Named in your collective's config.ttl:</p><ul class="plain-list">${suggested}</ul>` : ""}
     <form id="agent-form" class="field">
       <label for="agent">Your agent's WebID</label>
       <input id="agent" name="agent" type="url" placeholder="https://…/profile/card#me" required />
       <div><button type="submit" class="ghost">Add</button></div>
     </form>`,
    true
  );
}

function stepInbox(profile: MemberDeclaration, unadvertised: string | null): string {
  if (profile.inbox) {
    return youRow(
      "Your inbox",
      true,
      "",
      `<p class="lead">Collectives answer your requests here.</p>
       <p><code>${esc(profile.inbox)}</code></p>`
    );
  }
  if (unadvertised) {
    return youRow(
      "Your inbox",
      false,
      "",
      `<p class="lead">
         You already have <code>${esc(unadvertised)}</code>, but your profile does
         not say it is your inbox, so nobody can find it. Using it lets anyone
         signed in leave you a message there, without reading the others.
       </p>
       <p><button id="make-inbox">Use this inbox</button></p>`
    );
  }
  return youRow(
    "Your inbox",
    false,
    "",
    `<p class="lead">
       A folder where anyone signed in can leave you a message but not read
       the others. Collectives answer your requests here.
     </p>
     <p><button id="make-inbox">Create my inbox</button></p>`
  );
}
