import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Pods against a pod held in memory: the real files.ts, acl.ts and read.ts
 * run, only authFetch answers from `pod` below. What is pinned: the list
 * never waits, reads no rules until asked, memory draws first, nothing is
 * redrawn under someone typing, what a file holds is shown safely, and each
 * level of the iceberg opens only when asked (··· menu, then the drawer).
 */
const POD = "https://pod.example/amina/";
const WEBID = POD + "profile/card#me";
const AGENT = "https://pod.example/hs/agent#me";

type Doc = { status?: number; body?: string; type?: string; etag?: string };
let pod: Record<string, Doc> = {};
/** URLs whose answers wait until `release()`. */
let held: ((url: string) => boolean) | null = null;
let waiting: (() => void)[] = [];
const release = () => {
  held = null;
  waiting.splice(0).forEach((go) => go());
};
const requests: string[] = [];
/** What the chips offer: HyperScope, with a member who left. */
const NEIL = "https://pod.example/neil/profile/card#me";
const INES = "https://pod.example/ines/profile/card#me";
const HS = { name: "HyperScope", agent: AGENT, members: [{ webId: INES, label: "Inès" }], left: [{ webId: NEIL, label: "neil" }] };
let groups: { name: string; agent: string; members: { webId: string; label: string }[]; left: { webId: string; label: string }[] }[] = [];

/** Writes the pod received, in order, with their conditions. */
const writes: { method: string; url: string; ifMatch?: string; ifNoneMatch?: string; body?: string }[] = [];
let version = 0;

async function answer(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  requests.push(`${method} ${url}`);
  if (held?.(url)) await new Promise<void>((go) => waiting.push(go));
  const doc = pod[url];
  const sent = (init.headers ?? {}) as Record<string, string>;
  if (method === "PUT" || method === "DELETE") {
    writes.push({ method, url, ifMatch: sent["If-Match"], ifNoneMatch: sent["If-None-Match"], body: init.body as string | undefined });
    const exists = doc && !doc.status;
    if (sent["If-Match"] && (!exists || doc.etag !== sent["If-Match"])) return new Response(null, { status: 412 });
    if (sent["If-None-Match"] === "*" && exists) return new Response(null, { status: 412 });
    if (method === "DELETE") delete pod[url];
    else {
      const raw = init.body as { text?: () => Promise<string> } | string | undefined;
      const body = typeof raw === "object" && raw?.text ? await raw.text() : String(raw ?? "");
      pod[url] = { body, type: sent["Content-Type"], etag: `"w${++version}"` };
    }
    return new Response(null, { status: method === "DELETE" ? 205 : 201 });
  }
  const headers: Record<string, string> = { Link: `<${url}.acl>; rel="acl"${url === POD ? ', <http://www.w3.org/ns/pim/space#Storage>; rel="type"' : ""}` };
  if (!doc || doc.status === 404) return new Response(null, { status: 404, headers });
  if (doc.status && doc.status >= 400) return new Response(null, { status: doc.status, headers });
  if (doc.etag) headers.ETag = doc.etag;
  headers["Content-Type"] = doc.type ?? "text/turtle";
  const match = (init.headers as Record<string, string> | undefined)?.["If-None-Match"];
  if (match && match === doc.etag) return new Response(null, { status: 304, headers });
  return new Response(method === "HEAD" ? null : (doc.body ?? ""), { status: 200, headers });
}
vi.mock("./lib/auth", () => ({ authFetch: (url: string, init?: RequestInit) => answer(url, init) }));

const { mountPlaces, showPlaces, forgetPlaces, whoCanRead, when, sortItems } = await import("./places");
const { forgetReads } = await import("./lib/read");

const acl = (target: string, folder: boolean, extra = "") => `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner> a acl:Authorization; acl:agent <${WEBID}>; acl:accessTo <${target}>; ${folder ? `acl:default <${target}>;` : ""} acl:mode acl:Read, acl:Write, acl:Control.
${extra}`;
const listing = (names: string[]) =>
  `@prefix ldp: <http://www.w3.org/ns/ldp#>. @prefix dc: <http://purl.org/dc/terms/>.
${names.map((n) => `<${n}> a ldp:Resource; dc:modified "2026-09-25T10:00:00Z".`).join("\n")}
${names.length ? `<> ldp:contains ${names.map((n) => `<${n}>`).join(", ")}.` : ""}`;

function standardPod(): Record<string, Doc> {
  return {
    [POD]: { body: listing(["projects/", "README"]), etag: '"root1"' },
    [POD + ".acl"]: { body: acl("./", true), etag: '"racl"' },
    [POD + "projects/"]: { body: listing(["drafts/", "readme.md", "data.json", "logo.png", "public.md", "report.pdf"]), etag: '"p1"' },
    [POD + "projects/drafts/"]: { body: listing([]), etag: '"d1"' },
    [POD + "projects/drafts/.acl"]: {
      body: acl("./", true, `<#g> a acl:Authorization; acl:agent <${AGENT}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`),
      etag: '"dacl"',
    },
    [POD + "projects/readme.md"]: { body: "# Projects\n\n<script>alert(1)</script>[x](javascript:alert(2))", type: "text/markdown", etag: '"m"' },
    [POD + "projects/data.json"]: { body: '{"a":1}', type: "application/json", etag: '"j"' },
    [POD + "projects/logo.png"]: { body: "png", type: "image/png", etag: '"i"' },
    [POD + "projects/report.pdf"]: { body: "%PDF", type: "application/pdf", etag: '"pdf"' },
    [POD + "projects/public.md"]: { body: "# Public", type: "text/markdown", etag: '"pub"' },
    [POD + "projects/public.md.acl"]: {
      body: acl("public.md", false, `<#p> a acl:Authorization; acl:agentClass <http://xmlns.com/foaf/0.1/Agent>; acl:accessTo <public.md>; acl:mode acl:Read.`),
      etag: '"pacl"',
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
let app: HTMLElement;

async function open(path: string): Promise<void> {
  window.history.replaceState(null, "", `/#/p/${path}`);
  await showPlaces({ name: "places", path });
}

function row(name: string): HTMLElement {
  return [...app.querySelectorAll<HTMLElement>("tr[data-url]")].find((r) => r.querySelector(".item-name")!.textContent!.trim() === name)!;
}

beforeEach(() => {
  localStorage.clear();
  pod = standardPod();
  held = null;
  waiting = [];
  requests.length = 0;
  writes.length = 0;
  groups = [];
  forgetPlaces();
  forgetReads();
  app = document.createElement("div");
  document.body.replaceChildren(app);
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

/** The mount's first reading, to wait on. */
let reading: Promise<void> = Promise.resolve();

async function mount(path = ""): Promise<void> {
  window.history.replaceState(null, "", `/#/p/${path}`);
  reading = mountPlaces(app, { name: "places", path }, { webId: WEBID, podUrl: POD, names: new Map([[AGENT, "HyperScope's agent"]]), loadGroups: async () => groups });
  await settle();
}

function names(): string[] {
  return [...app.querySelectorAll("tr[data-url] .item-name")].map((c) => c.textContent!.trim());
}

function menuFor(url: string): void {
  app.querySelector<HTMLButtonElement>(`[data-menu="${url}"]`)!.click();
}

describe("C1 — a folder of your pod", () => {
  it("shows the list at once, then each folder's count as it is read", async () => {
    held = (url) => url === POD + "projects/drafts/";
    await mount("projects/");
    await settle();
    expect(row("readme.md")).toBeTruthy();
    expect(row("drafts/").querySelector("[data-count]")!.textContent).toBe("…");
    release();
    await reading;
    expect(row("drafts/").querySelector("[data-count]")!.textContent).toBe("0 items");
    expect(app.querySelector("thead")!.textContent).toMatch(/Name[\s\S]*Size[\s\S]*Last modified/);
  });

  it("reads no rules to draw the list", async () => {
    await mount("projects/");
    await reading;
    expect(requests.filter((r) => r.includes(".acl") || r.startsWith("HEAD"))).toEqual([]);
    expect(app.querySelector(".item-menu, .drawer")).toBeNull();
  });

  it("draws a folder seen before at once, and revalidates", async () => {
    await mount("projects/");
    await reading;
    await open("");
    requests.length = 0;
    held = () => true;
    const back = open("projects/");
    await settle();
    expect(row("readme.md")).toBeTruthy(); // from memory, while the pod is asked
    release();
    await back;
    expect(requests).toContain(`GET ${POD}projects/`);
  });

  it("never redraws under someone using a field", async () => {
    await mount("projects/");
    await reading;
    pod[POD + "projects/"] = { body: listing(["newer.md"]), etag: '"p3"' };
    held = (url) => url === POD + "projects/";
    const read = showPlaces({ name: "places", path: "projects/" }, false);
    await settle();
    app.querySelector<HTMLSelectElement>("#place-picker")!.focus(); // drawn from memory; now in use
    release();
    await read;
    expect(row("newer.md")).toBeUndefined();
    expect(row("readme.md")).toBeTruthy();

    (document.activeElement as HTMLElement).blur();
    await showPlaces({ name: "places", path: "projects/" }, false);
    expect(row("newer.md")).toBeTruthy();
  });

  it("says a folder cannot be read, with a way to try again", async () => {
    pod[POD + "projects/"] = { status: 403 };
    await mount("projects/");
    await reading;
    expect(app.querySelector('[role="alert"]')!.textContent).toMatch(/403/);
    expect(app.querySelector("#places-retry")).toBeTruthy();
  });

  it("opens an item's menu only when asked: who can access it in words, then Escape gives focus back", async () => {
    await mount("projects/");
    await reading;
    menuFor(POD + "projects/drafts/");
    expect(document.activeElement!.id).toBe("menu-title");
    await until(() => app.querySelector("#change-access:not([disabled])"));
    const menu = app.querySelector<HTMLElement>(".item-menu")!;
    expect(menu.textContent).toContain("You and HyperScope's agent (can read).");
    expect(menu.textContent).toContain("Its own rules.");
    expect(menu.querySelector(".is-apart [data-change=delete]")).toBeTruthy(); // set apart

    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(app.querySelector(".item-menu")).toBeNull();
    expect(document.activeElement!.getAttribute("data-menu")).toBe(POD + "projects/drafts/");
  });

  it("says an item follows its folder, and names your pod by its last part", async () => {
    await mount("projects/");
    await reading;
    menuFor(POD + "projects/readme.md");
    await until(() => app.querySelector("#change-access:not([disabled])"));
    expect(app.querySelector(".item-menu")!.textContent).toMatch(/Only you\.\s*Same as My pod\./);
    expect(app.querySelector(".places-side")!.textContent).toContain("…/amina/");
  });
});

describe("C1 — columns", () => {
  it("sorts by a column, folders first, and turns the order around on a second click", async () => {
    pod[POD + "projects/"] = {
      body: `@prefix ldp: <http://www.w3.org/ns/ldp#>. @prefix dc: <http://purl.org/dc/terms/>.
<b.md> a ldp:Resource; dc:modified "2026-09-20T10:00:00Z".
<a.md> a ldp:Resource; dc:modified "2026-09-25T10:00:00Z".
<z/> a ldp:Container; dc:modified "2026-09-01T10:00:00Z".
<> ldp:contains <b.md>, <a.md>, <z/>.`,
      etag: '"s"',
    };
    pod[POD + "projects/z/"] = { body: listing([]), etag: '"z"' };
    await mount("projects/");
    await reading;
    expect(names()).toEqual(["z/", "a.md", "b.md"]); // newest change first
    app.querySelector<HTMLButtonElement>('[data-sort="name"]')!.click();
    expect(names()).toEqual(["z/", "a.md", "b.md"]);
    app.querySelector<HTMLButtonElement>('[data-sort="name"]')!.click();
    expect(names()).toEqual(["z/", "b.md", "a.md"]);
    expect(app.querySelector('th[aria-sort="descending"]')!.textContent).toContain("Name");
    expect(document.activeElement!.getAttribute("data-sort")).toBe("name");
  });

  it("hides, shows and reorders columns, kept in this browser only", async () => {
    await mount("projects/");
    await reading;
    app.querySelector<HTMLButtonElement>("#columns")!.click();
    choose('[data-col="size"]', undefined, false);
    choose('[data-col="type"]');
    app.querySelector<HTMLButtonElement>('[data-col-up="type"]')!.click(); // before Last modified
    const heads = [...app.querySelectorAll("thead th")].map((th) => th.textContent!.replace(/[↑↓▾]/g, "").trim());
    expect(heads).toEqual(["Name", "Type", "Last modified", "Columns"]);
    expect(row("readme.md").textContent).toContain("Markdown");
    expect(JSON.parse(localStorage.getItem("backoffice.pods.columns")!).hidden).toContain("size");
    expect(writes).toHaveLength(0);
  });

  it("reads who can access each row only when that column is shown, one walk for the folder", async () => {
    await mount("projects/");
    await reading;
    app.querySelector<HTMLButtonElement>("#columns")!.click();
    choose('[data-col="access"]');
    await until(() => row("public.md").querySelector("[data-rules]")!.textContent === "Anyone");
    await until(() => row("readme.md").querySelector("[data-rules]")!.textContent === "Only you");
    expect(row("drafts/").querySelector("[data-rules]")!.textContent).toBe("You · HyperScope's agent");
    expect(requests.filter((r) => r === `HEAD ${POD}`).length).toBe(1);
  });

  it("sorts folders by how many items they hold", () => {
    const item = (name: string, isFolder: boolean, size: number | null) => ({ url: POD + name, name, isFolder, modified: null, size, type: null });
    const counts: Record<string, number> = { [POD + "big/"]: 9, [POD + "small/"]: 1 };
    const sorted = sortItems(
      [item("small/", true, null), item("a.txt", false, 5), item("big/", true, null), item("b.txt", false, 50)],
      { key: "size", dir: "desc" },
      (u) => counts[u] ?? null
    );
    expect(sorted.map((i) => i.name)).toEqual(["big/", "small/", "b.txt", "a.txt"]);
  });
});

describe("C1 — a file opens in Preview", () => {
  it("renders Markdown without what could run", async () => {
    await mount("projects/readme.md");
    await reading;
    const preview = app.querySelector(".preview")!;
    expect(preview.querySelector("h1")!.textContent).toBe("Projects");
    expect(preview.innerHTML).not.toMatch(/<script|href="javascript:/);
  });

  it("pretty-prints JSON, shows images, and offers the rest as a download", async () => {
    await mount("projects/data.json");
    await reading;
    expect(app.querySelector("pre.preview")!.textContent).toBe('{\n  "a": 1\n}');

    await open("projects/logo.png");
    expect(app.querySelector<HTMLImageElement>(".preview img")!.src).toBe("blob:fake");

    await open("projects/report.pdf");
    expect(app.querySelector(".preview")!.textContent).toMatch(/No preview for application\/pdf/);
    app.querySelector<HTMLButtonElement>("#download")!.click();
    await settle();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("opens full width, its access in its ··· menu", async () => {
    await mount("projects/public.md");
    await reading;
    expect(app.querySelector(".places-side")).toBeNull();
    expect(app.querySelector(".places-grid")!.classList.contains("is-wide")).toBe(true);
    menuFor(POD + "projects/public.md");
    await until(() => app.querySelector("#change-access:not([disabled])"));
    expect(app.querySelector(".item-menu")!.textContent).toContain("You and anyone with the link (can read).");
  });
});

describe("C1 — words", () => {
  const names = new Map([[AGENT, "HyperScope's agent"]]);
  const none = { agents: [], public: [], authenticated: [] };
  it("says who can read in a few words", () => {
    expect(whoCanRead(none, names)).toBe("Only you");
    expect(whoCanRead({ ...none, public: ["read"] }, names)).toBe("Anyone");
    expect(whoCanRead({ ...none, authenticated: ["append"] }, names)).toBe("You · anyone signed in can leave a message");
    expect(whoCanRead({ ...none, agents: [{ webId: AGENT, modes: ["read"] }, { webId: "https://x.example/me", modes: ["read"] }] }, names)).toBe("You · 2 people");
  });

  it("dates like a person would", () => {
    const now = new Date("2026-09-26T12:00:00");
    expect(when(new Date("2026-09-26T09:05:00"), now)).toBe("Today, 09:05");
    expect(when(new Date("2026-09-25T18:40:00"), now)).toBe("Yesterday, 18:40");
    expect(when(new Date("2026-09-01T10:00:00"), now)).toBe("1 Sept 2026");
  });
});

/** Waits until `check` holds: the panel reads its rules after the list is drawn. */
async function until(check: () => unknown): Promise<void> {
  for (let i = 0; i < 50 && !check(); i++) await settle();
  expect(check()).toBeTruthy();
}

/** The drawer for `item` (or the folder itself): ··· first, then "Change who can access it". */
async function panelFor(folder: string, item?: string): Promise<HTMLElement> {
  await mount(folder);
  await reading;
  menuFor(POD + (item ?? folder));
  await until(() => app.querySelector("#change-access:not([disabled])"));
  app.querySelector<HTMLButtonElement>("#change-access")!.click();
  await until(() => app.querySelector("#access fieldset"));
  return app.querySelector<HTMLElement>(".drawer")!;
}

function choose(selector: string, value?: string, checked = true): void {
  const el = app.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  if (value !== undefined) el.value = value;
  else (el as HTMLInputElement).checked = checked;
  el.dispatchEvent(new Event("change"));
}

async function save(): Promise<void> {
  app.querySelector<HTMLFormElement>("#access")!.requestSubmit();
  await until(() => writes.length || app.querySelector("#access .error"));
  await settle();
}

describe("C2 — who can access it: one panel for folders and files", () => {
  it("shows a folder's named people and saves Can edit as Read + Append + Write, never Control", async () => {
    await panelFor("projects/drafts/");
    const radio = app.querySelector<HTMLInputElement>('input[value="people"]')!;
    expect(radio.checked).toBe(true);
    expect(app.querySelector(".person")!.textContent).toContain("HyperScope's agent");
    expect(app.querySelector<HTMLButtonElement>("#access-save")!.disabled).toBe(true);

    choose(`select[data-person="${AGENT}"]`, "edit");
    await save();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "PUT", url: POD + "projects/drafts/.acl", ifMatch: '"dacl"' });
    expect(writes[0].body).toMatch(new RegExp(`acl:agent <${AGENT}>;[\\s\\S]*?acl:mode acl:Read, acl:Append, acl:Write\\.`));
    expect(writes[0].body!.match(/acl:Control/g)).toHaveLength(1); // the owner's, only
  });

  it("Only me removes every named person", async () => {
    await panelFor("projects/drafts/");
    choose('input[value="me"]');
    await save();
    expect(writes[0].body).not.toContain(AGENT);
  });

  it("gives an item that follows its folder rules of its own, starting from them", async () => {
    await panelFor("projects/", "projects/readme.md");
    expect(app.querySelector<HTMLInputElement>('input[value="inherit"]')!.checked).toBe(true);
    expect(app.querySelector(".inherit-card")!.textContent).toMatch(/Same as My pod: only you\./);
    choose('input[value="link"]');
    expect(app.querySelector("#access")!.textContent).toMatch(/stops following My pod/);
    await save();
    expect(writes[0]).toMatchObject({ method: "PUT", url: POD + "projects/readme.md.acl", ifNoneMatch: "*" });
    expect(writes[0].body).toContain("acl:agentClass foaf:Agent");
    expect(writes[0].body).toContain("acl:accessTo <./readme.md>");
  });

  it("fills in one member's WebID from a chip, never the collective", async () => {
    groups = [HS];
    await panelFor("projects/drafts/");
    await until(() => app.querySelector(`[data-add="${INES}"]`));
    app.querySelector<HTMLButtonElement>(`[data-add="${INES}"]`)!.click();
    expect(app.querySelector(`select[data-person="${INES}"]`)).toBeTruthy();
    await save();
    expect(writes[0].body).toContain(`acl:agent <${INES}>`);
    expect(writes[0].body).not.toMatch(/agentGroup|config\.ttl/);
  });

  it("flags someone who left the collective but still has access", async () => {
    groups = [HS];
    pod[POD + "projects/drafts/.acl"].body += `\n<#n> a acl:Authorization; acl:agent <${NEIL}>; acl:accessTo <./>; acl:default <./>; acl:mode acl:Read.`;
    await panelFor("projects/drafts/");
    await until(() => app.querySelector(".person .is-warn"));
    expect(app.querySelector(".person .is-warn")!.textContent).toBe("Left HyperScope. Still has access until removed.");
  });

  it("refuses a WebID that is not one, and yourself", async () => {
    await panelFor("projects/drafts/");
    const add = (value: string) => {
      app.querySelector<HTMLInputElement>("#add-webid")!.value = value;
      app.querySelector<HTMLButtonElement>("#add-person")!.click();
      return app.querySelector("#access .error")?.textContent ?? "";
    };
    expect(add("not a webid")).toMatch(/not a WebID/);
    expect(add(WEBID)).toMatch(/That is you/);
    expect(writes).toHaveLength(0);
  });

  it("writes nothing when the rules changed after the panel read them", async () => {
    await panelFor("projects/drafts/");
    choose('input[value="me"]');
    pod[POD + "projects/drafts/.acl"].etag = '"someone-else"';
    app.querySelector<HTMLFormElement>("#access")!.requestSubmit();
    await until(() => document.querySelector(".toast"));
    expect(document.querySelector(".toast")!.textContent).toMatch(/changed after this screen read them/);
    expect(writes).toHaveLength(0);
  });

  it("inherits from its parent again: its own rules removed, with If-Match", async () => {
    await panelFor("projects/", "projects/public.md");
    choose('input[value="inherit"]');
    expect(app.querySelector("#access")!.textContent).toMatch(/Saving removes the rules of its own: it follows My pod again/);
    expect(writes).toHaveLength(0);
    await save();
    expect(writes[0]).toEqual({ method: "DELETE", url: POD + "projects/public.md.acl", ifMatch: '"pacl"', ifNoneMatch: undefined, body: undefined });
  });

  it("opens the parent's access from an item that inherits it", async () => {
    await panelFor("projects/", "projects/readme.md");
    app.querySelector<HTMLButtonElement>(`[data-open-access="${POD}"]`)!.click();
    await until(() => app.querySelector("#drawer-title")!.textContent === "Who can access My pod" && app.querySelector("#access fieldset"));
    expect(document.activeElement!.id).toBe("drawer-title");
  });

  it("never offers to inherit on the pod root, and shows the technical rules read only", async () => {
    await panelFor("");
    expect(app.querySelector('input[value="inherit"]')).toBeNull();
    expect(app.querySelector("#technical pre")!.textContent).toContain("acl:Authorization");
    expect(app.querySelector("#technical textarea")).toBeNull();
  });

  it("locks the panel on rules it has no words for", async () => {
    pod[POD + "projects/drafts/.acl"].body += `\n<#g> a acl:Authorization; acl:agentGroup <https://x.example/g#team>; acl:accessTo <./>; acl:mode acl:Read.`;
    await panelFor("projects/drafts/");
    expect(app.querySelector("#access-save")).toBeNull();
    expect(app.querySelector("#access .is-warn")!.textContent).toMatch(/no words for/);
  });
});

describe("C3 — writing files", () => {
  const type = (selector: string, value: string) => {
    const el = app.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event("input"));
  };

  it("creates a folder only where nothing is yet, and refuses a name with a slash", async () => {
    await mount("projects/");
    await reading;
    app.querySelector<HTMLButtonElement>("#new-folder")!.click();
    expect(document.activeElement!.id).toBe("new-name");

    type("#new-name", "a/b");
    app.querySelector<HTMLFormElement>("#create-form")!.requestSubmit();
    await until(() => app.querySelector("#create-form .error"));
    expect(app.querySelector("#create-form .error")!.textContent).toMatch(/slash/);
    expect(writes).toHaveLength(0);

    type("#new-name", "ideas");
    app.querySelector<HTMLFormElement>("#create-form")!.requestSubmit();
    await until(() => writes.length);
    expect(writes[0]).toMatchObject({ method: "PUT", url: POD + "projects/ideas/", ifNoneMatch: "*" });
  });

  it("creates a file and opens it in the editor", async () => {
    await mount("projects/");
    await reading;
    app.querySelector<HTMLButtonElement>("#new-file")!.click();
    type("#new-name", "plan.md");
    app.querySelector<HTMLFormElement>("#create-form")!.requestSubmit();
    await until(() => location.hash === "#/p/projects/plan.md");
    expect(writes[0]).toMatchObject({ method: "PUT", url: POD + "projects/plan.md", ifNoneMatch: "*", body: "# plan\n" });
    await showPlaces({ name: "places", path: "projects/plan.md" });
    expect(app.querySelector<HTMLTextAreaElement>("#source")!.value).toBe("# plan\n");
  });

  it("uploads each file under its own name, never over one already there", async () => {
    await mount("projects/");
    await reading;
    const input = app.querySelector<HTMLInputElement>("#upload-input")!;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "new.txt", { type: "text/plain" }), new File(["y"], "readme.md", { type: "text/markdown" })],
    });
    input.dispatchEvent(new Event("change"));
    await until(() => document.querySelector(".toast"));
    expect(writes.map((w) => [w.url, w.ifNoneMatch])).toEqual([
      [POD + "projects/new.txt", "*"],
      [POD + "projects/readme.md", "*"],
    ]);
    expect(pod[POD + "projects/readme.md"].body).toContain("# Projects");
    expect(document.querySelector(".toast")!.textContent).toMatch(/1 of 2 uploaded.*readme\.md is already there/);
  });

  it("edits beside the preview and saves only over the version opened", async () => {
    await mount("projects/readme.md");
    await reading;
    app.querySelector<HTMLButtonElement>("#edit")!.click();
    expect(app.querySelector(".editor")!.classList.contains("is-side")).toBe(true);
    expect(app.querySelector<HTMLButtonElement>("#editor-save")!.disabled).toBe(true);

    type("#source", "# Projects, renamed");
    expect(app.querySelector<HTMLElement>("#unsaved")!.hidden).toBe(false);
    app.querySelector<HTMLButtonElement>("#editor-save")!.click();
    await until(() => document.querySelector(".toast"));
    expect(writes[0]).toMatchObject({ method: "PUT", url: POD + "projects/readme.md", ifMatch: '"m"', body: "# Projects, renamed" });
    expect(app.querySelector<HTMLElement>("#unsaved")!.hidden).toBe(true);
  });

  it("writes nothing over someone else's change, keeps your text, and lets you choose", async () => {
    await mount("projects/readme.md");
    await reading;
    app.querySelector<HTMLButtonElement>("#edit")!.click();
    type("#source", "mine");
    pod[POD + "projects/readme.md"] = { body: "theirs", type: "text/markdown", etag: '"theirs"' };
    app.querySelector<HTMLButtonElement>("#editor-save")!.click();
    await until(() => app.querySelector("#save-over"));
    expect(pod[POD + "projects/readme.md"].body).toBe("theirs");
    expect(app.querySelector<HTMLTextAreaElement>("#source")!.value).toBe("mine");

    app.querySelector<HTMLButtonElement>("#save-over")!.click();
    await until(() => pod[POD + "projects/readme.md"].body === "mine");
    expect(writes.at(-1)!.ifMatch).toBe('"theirs"');
  });

  it("keeps unsaved text while you look elsewhere, and asks before closing it", async () => {
    await mount("projects/readme.md");
    await reading;
    app.querySelector<HTMLButtonElement>("#edit")!.click();
    type("#source", "half written");
    await open("projects/");
    await open("projects/readme.md");
    expect(app.querySelector<HTMLTextAreaElement>("#source")!.value).toBe("half written");

    app.querySelector<HTMLButtonElement>("#editor-close")!.click();
    expect(app.querySelector("#discard")).toBeTruthy();
    app.querySelector<HTMLButtonElement>("#keep-editing")!.click();
    expect(app.querySelector<HTMLTextAreaElement>("#source")!.value).toBe("half written");
    app.querySelector<HTMLButtonElement>("#editor-close")!.click();
    app.querySelector<HTMLButtonElement>("#discard")!.click();
    expect(app.querySelector("#source")).toBeNull();
    expect(app.querySelector(".preview h1")!.textContent).toBe("Projects");
    expect(writes).toHaveLength(0);
  });

  it("offers Edit only for text it can show", async () => {
    await mount("projects/logo.png");
    await reading;
    expect(app.querySelector("#edit")).toBeNull();
  });
});

describe("C4 — rename, move, delete", () => {
  async function select(folder: string, item: string): Promise<void> {
    await mount(folder);
    await reading;
    menuFor(POD + item);
    await until(() => app.querySelector("[data-change]"));
  }

  it("renames a file with its rules: copy, rules before content, then delete", async () => {
    await select("projects/", "projects/public.md");
    app.querySelector<HTMLButtonElement>('[data-change="rename"]')!.click();
    const input = app.querySelector<HTMLInputElement>("#rename-name")!;
    expect(input.value).toBe("public.md");
    input.value = "open.md";
    app.querySelector<HTMLFormElement>("#change-form")!.requestSubmit();
    await until(() => document.querySelector(".toast")?.textContent?.includes("Moved"));
    expect(writes.map((w) => `${w.method} ${w.url.slice(POD.length)}`)).toEqual([
      "PUT projects/open.md",
      "PUT projects/open.md.acl",
      "PUT projects/open.md",
      "DELETE projects/public.md",
      "DELETE projects/public.md.acl",
    ]);
    expect(pod[POD + "projects/open.md"].body).toBe("# Public");
    expect(pod[POD + "projects/open.md.acl"].body).toContain("acl:agentClass foaf:Agent");
  });

  it("asks before deleting a folder, with how many items are inside", async () => {
    await select("", "projects/");
    app.querySelector<HTMLButtonElement>('[data-change="delete"]')!.click();
    await until(() => app.querySelector("#change-form")!.textContent!.includes("items inside"));
    expect(app.querySelector("#change-form")!.textContent).toMatch(/Delete projects and the 6 items inside\? This cannot be undone\./);
    expect(writes).toHaveLength(0);
    app.querySelector<HTMLButtonElement>("#delete-confirm")!.click();
    await until(() => document.querySelector(".toast")?.textContent?.includes("Deleted"));
    expect(writes.every((w) => w.method === "DELETE")).toBe(true);
    expect(writes.at(-1)!.url).toBe(POD + "projects/");
  });

  it("offers as destinations the folders seen, never the item itself or where it is", async () => {
    await mount("");
    await reading;
    await open("projects/");
    menuFor(`${POD}projects/drafts/`);
    await until(() => app.querySelector("[data-change]"));
    app.querySelector<HTMLButtonElement>('[data-change="move"]')!.click();
    const options = [...app.querySelectorAll<HTMLOptionElement>("#move-to option")].map((o) => o.textContent);
    expect(options).toEqual(["My pod"]);
  });

  it("never offers to move or delete the pod itself", async () => {
    await mount("");
    await reading;
    menuFor(POD);
    expect(app.querySelector("[data-change]")).toBeNull();
    expect(app.querySelector(".item-menu")!.textContent).toMatch(/Your pod itself cannot be moved or deleted/);
  });
});

describe("C5 — following", () => {
  const X = "https://other.example/xavier/shared/";
  const LIST = POD + "settings/following.ttl";
  const followingTtl = (entries: string) => `@prefix hs: <https://pod.nicolasdb.eu/hyperscope/vocab#>. @prefix schema: <http://schema.org/>. @prefix dct: <http://purl.org/dc/terms/>.
${entries}`;
  const xavier = `<#x> a hs:Followed; schema:url <${X}>; dct:title "Xavier's folder"; schema:abstract "2 items: guide.md, plan.pdf"; dct:modified "2026-09-20T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>.`;

  async function go(route: { name: "following" } | { name: "followed"; address: string }): Promise<void> {
    window.history.replaceState(null, "", "/");
    reading = mountPlaces(app, route, { webId: WEBID, podUrl: POD, names: new Map(), loadGroups: async () => [] });
    await reading;
  }

  beforeEach(() => {
    pod[LIST] = { body: followingTtl(xavier), etag: '"f1"' };
    pod[X] = { body: listing(["guide.md", "plan.pdf"]), etag: '"x1"' };
    pod[X + "guide.md"] = { body: "# Fablab guide\n\nHow it works.", type: "text/markdown", etag: '"g"' };
  });

  it("lists what you follow from your own pod only, never reading theirs", async () => {
    await go({ name: "following" });
    expect(app.querySelector(".fcard")!.textContent).toContain("Xavier's folder");
    expect(app.querySelector(".fcard")!.textContent).toContain("2 items: guide.md, plan.pdf");
    expect(requests.filter((r) => !r.includes(POD))).toEqual([]);
    expect(app.querySelector(".places-side")!.textContent).toContain("Xavier's folder");
  });

  it("with nothing followed yet, shows the form at once, with nothing to cancel", async () => {
    pod[LIST] = { status: 404 };
    await go({ name: "following" });
    await until(() => app.querySelector("#follow-form"));
    expect(app.querySelector("#follow-open, #follow-cancel, .fcard")).toBeNull();
  });

  it("keeps an address only once your WebID could read it", async () => {
    await go({ name: "following" });
    app.querySelector<HTMLButtonElement>("#follow-open")!.click();
    const input = app.querySelector<HTMLInputElement>("#follow-address")!;
    input.value = "https://other.example/private/";
    pod["https://other.example/private/"] = { status: 403 };
    app.querySelector<HTMLFormElement>("#follow-form")!.requestSubmit();
    await until(() => app.querySelector("#follow-form .error"));
    expect(app.querySelector("#follow-form .error")!.textContent).toMatch(/cannot read this address \(403\)/);
    expect(writes).toHaveLength(0);

    app.querySelector<HTMLInputElement>("#follow-address")!.value = X + "guide.md";
    app.querySelector<HTMLFormElement>("#follow-form")!.requestSubmit();
    await until(() => writes.length && app.querySelectorAll(".fcard").length === 2);
    expect(writes[0]).toMatchObject({ method: "PUT", url: LIST, ifMatch: '"f1"' });
    expect(writes[0].body).toContain("Fablab guide");
  });

  it("opens a followed folder read only, and says its owner may see the reads", async () => {
    await go({ name: "followed", address: X });
    expect(app.querySelector(".pill")!.textContent).toBe("Read only");
    expect(app.textContent).toMatch(/other\.example may see these reads in its access log/);
    expect([...app.querySelectorAll(".item-name")].map((c) => c.textContent!.trim())).toEqual(["guide.md", "plan.pdf"]);
    expect(app.querySelector("#new-folder, #upload, #edit, [data-change]")).toBeNull();
    // What was seen changed ("2 items" stays, the date moved): kept on your pod.
    await until(() => writes.length);
    expect(writes[0]).toMatchObject({ method: "PUT", url: LIST, ifMatch: '"f1"' });
  });

  it("says an address can no longer be read, and keeps it", async () => {
    pod[X] = { status: 403 };
    await go({ name: "followed", address: X });
    expect(app.querySelector('[role="alert"]')!.textContent).toMatch(/cannot be read now/);
    await until(() => writes.length);
    expect(writes[0].body).toContain("unreadableSince");
    expect(writes[0].body).toContain(X);
  });

  it("unfollows, with a way to undo it", async () => {
    await go({ name: "followed", address: X });
    await until(() => writes.length); // the visit
    writes.length = 0;
    app.querySelector<HTMLButtonElement>("#unfollow")!.click();
    await until(() => document.querySelector(".toast-undo"));
    expect(pod[LIST].body).not.toContain(X);
    document.querySelector<HTMLButtonElement>(".toast-undo")!.click();
    await until(() => pod[LIST].body!.includes(X));
  });

  it("marks a favourite", async () => {
    await go({ name: "followed", address: X });
    await until(() => writes.length);
    app.querySelector<HTMLButtonElement>("#favourite")!.click();
    await until(() => pod[LIST].body!.includes("favourite"));
    await until(() => app.querySelector("#favourite")?.getAttribute("aria-pressed") === "true");
  });
});

describe("C6 — the technical rules, edited by hand", () => {
  const ACL = POD + "projects/drafts/.acl";

  async function editRaw(): Promise<HTMLTextAreaElement> {
    await panelFor("projects/drafts/");
    app.querySelector<HTMLButtonElement>("#raw-edit")!.click();
    return app.querySelector<HTMLTextAreaElement>("#raw-acl")!;
  }

  async function typeRaw(text: string): Promise<void> {
    const area = app.querySelector<HTMLTextAreaElement>("#raw-acl")!;
    area.value = text;
    area.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 350)); // the checks follow typing after a pause
  }

  it("says what changes in the panel's words, and writes only on the second tap", async () => {
    const area = await editRaw();
    const next = area.value.replace(/(acl:agent <https:\/\/pod\.example\/hs\/agent#me>;[\s\S]*?acl:mode) acl:Read\./, "$1 acl:Read, acl:Append.");
    expect(next).not.toBe(area.value);
    await typeRaw(next);
    expect(app.querySelector(".technical")!.textContent).toContain("HyperScope's agent: can read becomes read and add.");

    app.querySelector<HTMLButtonElement>("#raw-save")!.click();
    expect(writes).toHaveLength(0);
    expect(app.querySelector("#raw-save")!.textContent).toBe("Save anyway: I checked these rules");
    app.querySelector<HTMLButtonElement>("#raw-save")!.click();
    await until(() => writes.length);
    expect(writes[0]).toMatchObject({ method: "PUT", url: ACL, ifMatch: '"dacl"', body: next });
  });

  it("typing again after the first tap asks for two taps again", async () => {
    const area = await editRaw();
    await typeRaw(area.value + "\n");
    app.querySelector<HTMLButtonElement>("#raw-save")!.click();
    await typeRaw(area.value + "\n\n");
    expect(app.querySelector("#raw-save")!.textContent).toBe("Save");
  });

  it("will not save rules that are not Turtle, or that take your Control away", async () => {
    const area = await editRaw();
    const original = area.value;
    await typeRaw(original + "\n<#broken> a");
    expect(app.querySelector<HTMLButtonElement>("#raw-save")!.disabled).toBe(true);
    expect(app.querySelector(".checks-list")!.textContent).toMatch(/Not valid Turtle/);

    await typeRaw(original.replace("acl:Read, acl:Write, acl:Control", "acl:Read, acl:Write"));
    expect(app.querySelector<HTMLButtonElement>("#raw-save")!.disabled).toBe(true);
    expect(app.querySelector(".checks-list")!.textContent).toMatch(/You would lose Control/);
  });

  it("writes nothing when the rules changed after they were opened", async () => {
    const area = await editRaw();
    await typeRaw(area.value + "\n");
    pod[ACL].etag = '"someone-else"';
    app.querySelector<HTMLButtonElement>("#raw-save")!.click();
    app.querySelector<HTMLButtonElement>("#raw-save")!.click();
    await until(() => app.querySelector(".technical .error"));
    expect(app.querySelector(".technical .error")!.textContent).toMatch(/changed after this screen read them/);
    expect(pod[ACL].etag).toBe('"someone-else"');
  });

  it("offers no hand editing for rules an item only follows", async () => {
    await panelFor("projects/", "projects/readme.md");
    expect(app.querySelector("#raw-edit")).toBeNull();
    expect(app.querySelector("#technical")!.textContent).toMatch(/give it rules of its own first/);
  });
});
