import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { listFolder, effectiveAccess, readFile, createFolder, createFile, uploadFile, saveFile } = await import("../../src/lib/files");
const aclLib = await import("../../src/lib/acl");
const { readAccess, forgetAclLocations } = aclLib;
const { forgetReads } = await import("../../src/lib/read");

const cast = inject("cast");
const amina = cast.amina;
const projects = amina.pod + "projects/";

beforeEach(async () => {
  forgetReads();
  forgetAclLocations();
  await actAs("amina");
});

/** Slice C1 on a real server: what the file browser reads, as Amina. */
describe("browsing your pod (C1)", () => {
  it("lists a folder with what CSS says of each item, folders first", async () => {
    const items = await listFolder(projects);
    expect(items.map((i) => i.name)).toEqual(["drafts/", "data.json", "logo.png", "notes.txt", "public.md", "readme.md"]);
    const readme = items.find((i) => i.name === "readme.md")!;
    expect(readme.type).toBe("text/markdown");
    expect(readme.size).toBeGreaterThan(0);
    expect(readme.modified).toBeInstanceOf(Date);
    const root = await listFolder(amina.pod);
    expect(root.some((i) => i.name.endsWith(".acl"))).toBe(false);
  });

  it("tells own rules from inherited ones, and where inherited ones come from", async () => {
    expect((await readAccess(projects + "public.md", amina.webId)).public).toEqual(["read"]);
    expect((await readAccess(projects, amina.webId)).inherited).toBe(true);

    const memo = new Map();
    const readme = await effectiveAccess(projects + "readme.md", amina.webId, amina.pod, memo);
    expect(readme?.from).toBe(amina.pod);
    const drafted = await effectiveAccess(projects + "drafts/idea.md", amina.webId, amina.pod, memo);
    expect(drafted?.from).toBe(projects + "drafts/");
    expect(drafted?.access.agents).toEqual([{ webId: cast.hsagent.webId, modes: ["read"] }]);
  });

  it("revalidates a folder it has read: CSS answers 304 and the list is the same", async () => {
    const statuses: number[] = [];
    const signedIn = current.fetch;
    current.fetch = async (input, init) => {
      const res = await signedIn(input, init);
      if (String(input) === projects) statuses.push(res.status);
      return res;
    };
    const first = await listFolder(projects);
    const second = await listFolder(projects);
    current.fetch = signedIn;
    expect(statuses).toEqual([200, 304]);
    expect(second).toEqual(first);
  });

  it("reads each kind of file for Preview", async () => {
    expect(await readFile(projects + "readme.md")).toMatchObject({ kind: "markdown", text: expect.stringContaining("# Projects") });
    expect(await readFile(projects + "data.json")).toMatchObject({ kind: "json", text: '{"projects":2}' });
    const logo = await readFile(projects + "logo.png");
    expect(logo.kind).toBe("image");
    expect(logo.blob!.size).toBe(68);
  });

  it("says a stranger cannot read your folders, and your agent's folder is readable by it", async () => {
    await actAs("outsider");
    await expect(listFolder(projects)).rejects.toMatchObject({ status: 403 });
    await actAs("hsagent");
    expect((await readFile(projects + "drafts/idea.md")).text).toContain("# Idea");
    await expect(readFile(projects + "readme.md")).rejects.toMatchObject({ status: 403 });
  });
});

/** Slice C2: the permissions panel's writes, as Amina, checked by who can read. */
describe("who can read it (C2)", () => {
  const { setAccess, setPublicAccess, removeOwnRules, getAccess } = aclLib;
  const notes = projects + "notes.txt";
  const neilStatus = async (url: string) => {
    await actAs("neil");
    const status = (await current.fetch(url)).status;
    await actAs("amina");
    return status;
  };

  it("gives an inherited file rules of its own for one person, then restores them from the folder", async () => {
    expect(await neilStatus(notes)).toBe(403);
    await setAccess(notes, amina.webId, { agents: [{ webId: cast.neil.webId, modes: ["read"] }], public: [], authenticated: [] }, null);
    expect(await neilStatus(notes)).toBe(200);
    expect(await neilStatus(projects + "readme.md")).toBe(403);

    const own = await getAccess(notes, amina.webId);
    await removeOwnRules(notes, own.etag);
    expect((await getAccess(notes, amina.webId)).inherited).toBe(true);
    expect(await neilStatus(notes)).toBe(403);
  });

  it("makes a file readable by anyone with the link, signed in or not", async () => {
    const data = projects + "data.json";
    expect((await fetch(data)).status).toBe(401);
    await setPublicAccess(data, amina.webId, ["read"]);
    expect((await fetch(data)).status).toBe(200);
    await setPublicAccess(data, amina.webId, []);
    expect((await fetch(data)).status).toBe(401);
  });

  it("writes nothing over rules that changed after they were read", async () => {
    const drafts = projects + "drafts/";
    const before = await getAccess(drafts, amina.webId);
    await setAccess(drafts, amina.webId, { agents: before.agents, public: [], authenticated: ["append"] }, before.etag);
    await expect(
      setAccess(drafts, amina.webId, { agents: [], public: [], authenticated: [] }, before.etag)
    ).rejects.toMatchObject({ code: "conflict" });
    const after = await getAccess(drafts, amina.webId);
    expect(after.agents).toEqual(before.agents);
    await setAccess(drafts, amina.webId, { agents: before.agents, public: [], authenticated: [] }, after.etag);
  });

  it("never removes a pod root's rules", async () => {
    const root = await getAccess(amina.pod, amina.webId);
    await expect(removeOwnRules(amina.pod, root.etag)).rejects.toThrow(/root/);
    expect((await getAccess(amina.pod, amina.webId)).inherited).toBe(false);
  });
});

/** Slice C3: new folders, new files, uploads and saves on a real server. */
describe("writing files (C3)", () => {
  const work = amina.pod + "work/";

  it("creates a folder and a file, and never over one already there", async () => {
    expect(await createFolder(amina.pod, "work")).toBe(work);
    await expect(createFolder(amina.pod, "work")).rejects.toMatchObject({ code: "exists" });
    const url = await createFile(work, "plan é.md", "# Plan\n");
    expect(url).toBe(work + "plan%20%C3%A9.md");
    const items = await listFolder(work);
    expect(items.map((i) => [i.name, i.type])).toEqual([["plan é.md", "text/markdown"]]);
    await expect(createFile(work, "plan é.md", "other")).rejects.toMatchObject({ code: "exists" });
    expect((await readFile(url)).text).toBe("# Plan\n");
  });

  it("uploads a file from the device with its type", async () => {
    const url = await uploadFile(work, new File([new Uint8Array([1, 2, 3])], "data.bin", { type: "application/octet-stream" }));
    const file = await readFile(url);
    expect(file.kind).toBe("other");
    expect(file.blob!.size).toBe(3);
  });

  it("saves over the version opened, and refuses when someone saved in between", async () => {
    const url = work + "plan%20%C3%A9.md";
    const opened = await readFile(url);
    const other = await readFile(url);
    await saveFile(url, "# Plan, mine\n", opened.etag, opened.contentType);
    await expect(saveFile(url, "# Plan, theirs\n", other.etag, other.contentType)).rejects.toMatchObject({ code: "conflict" });
    expect((await readFile(url)).text).toBe("# Plan, mine\n");
  });
});

/** Slice C4: a move carries contents and rules; a failure halfway leaves the source whole. */
describe("rename, move, delete (C4)", () => {
  const work = amina.pod + "work/";
  const statusAs = async (role: "hsagent" | "outsider", url: string) => {
    await actAs(role);
    const status = (await current.fetch(url)).status;
    await actAs("amina");
    return status;
  };

  it("stops a move halfway without losing anything", async () => {
    const { move } = await import("../../src/lib/move");
    const signedIn = current.fetch;
    let puts = 0;
    current.fetch = async (input, init) => {
      if (init?.method === "PUT" && ++puts === 3) return new Response(null, { status: 500 });
      return signedIn(input, init);
    };
    await expect(move(projects + "drafts/", work + "drafts/", amina.webId, amina.pod)).rejects.toMatchObject({ code: "copy-failed" });
    current.fetch = signedIn;
    expect((await listFolder(projects + "drafts/")).map((i) => i.name)).toEqual(["idea.md"]);
    expect(await statusAs("hsagent", projects + "drafts/idea.md")).toBe(200);
    expect((await current.fetch(work + "drafts/")).status).toBe(404);
  });

  it("moves a folder with its contents and rules: the agent reads it at the new place", async () => {
    const { move } = await import("../../src/lib/move");
    await move(projects + "drafts/", work + "drafts/", amina.webId, amina.pod);
    expect((await current.fetch(projects + "drafts/")).status).toBe(404);
    expect((await listFolder(work + "drafts/")).map((i) => i.name)).toEqual(["idea.md"]);
    expect(await statusAs("hsagent", work + "drafts/idea.md")).toBe(200);
    expect(await statusAs("outsider", work + "drafts/idea.md")).toBe(403);
  });

  it("renames a file with rules of its own; they name the new file", async () => {
    const { move } = await import("../../src/lib/move");
    await move(amina.pod + "private.txt", amina.pod + "secret.txt", amina.webId, amina.pod);
    const access = await aclLib.getAccess(amina.pod + "secret.txt", amina.webId);
    expect(access.inherited).toBe(false);
    expect((await current.fetch(amina.pod + "private.txt")).status).toBe(404);
    expect((await readFile(amina.pod + "secret.txt")).text).toBe("Only me.\n");
  });

  it("counts what a folder holds, then deletes it all", async () => {
    const { countInside, deleteTree } = await import("../../src/lib/move");
    expect(await countInside(work, amina.webId)).toBe(4); // plan é.md, data.bin, drafts/, drafts/idea.md
    await deleteTree(work, amina.pod);
    expect((await current.fetch(work)).status).toBe(404);
    await expect(deleteTree(amina.pod + "profile/", amina.pod)).rejects.toMatchObject({ code: "refused" });
  });
});

/** Slice C5: following what the network shared with Amina, kept on her own pod. */
describe("following (C5)", () => {
  const shared = cast.network.pod + "shared/";

  it("follows an address her WebID can read, and refuses one it cannot", async () => {
    const { follow, readFollowing } = await import("../../src/lib/following");
    await expect(follow(amina.pod, cast.hyperscope.pod + "inbox/")).rejects.toMatchObject({ code: "unreadable", status: 403 });
    expect(await readFollowing(amina.pod)).toEqual([]);

    const entry = await follow(amina.pod, shared);
    expect(entry).toMatchObject({ title: "shared", excerpt: "1 item: guide.md" });
    expect((await readFollowing(amina.pod)).map((f) => f.address)).toEqual([shared]);
    await expect(follow(amina.pod, shared)).rejects.toMatchObject({ code: "already" });
  });

  it("keeps the list private to her", async () => {
    const list = amina.pod + "settings/following.ttl";
    expect((await current.fetch(list)).status).toBe(200);
    await actAs("outsider");
    expect((await current.fetch(list)).status).toBe(403);
    expect((await fetch(list)).status).toBe(401);
  });

  it("keeps what a visit saw, marks a favourite, and unfollows", async () => {
    const { readFollowing, recordVisit, summarise, setFavourite, unfollow } = await import("../../src/lib/following");
    const [entry] = await readFollowing(amina.pod);
    await recordVisit(amina.pod, entry, { summary: { ...(await summarise(shared)), title: "Fablab network" } });
    await setFavourite(amina.pod, shared, true);
    expect((await readFollowing(amina.pod))[0]).toMatchObject({ title: "Fablab network", favourite: true });
    await unfollow(amina.pod, shared);
    expect(await readFollowing(amina.pod)).toEqual([]);
  });
});

/** Slice C6: the technical rules edited by hand, for what the panel has no word for. */
describe("the technical rules, edited by hand (C6)", () => {
  it("gives Neil Read + Append on a folder: he can add to it, not change it", async () => {
    const { createFolder } = await import("../../src/lib/files");
    const { setAccess, getAccess, saveRawAcl } = aclLib;
    const drop = await createFolder(amina.pod, "drop");
    await setAccess(drop, amina.webId, { agents: [], public: [], authenticated: [] }, null);
    const own = await getAccess(drop, amina.webId);
    const text = (await (await current.fetch(own.aclUrl)).text()) +
      `\n<#neil> a <http://www.w3.org/ns/auth/acl#Authorization>;
        <http://www.w3.org/ns/auth/acl#agent> <${cast.neil.webId}>;
        <http://www.w3.org/ns/auth/acl#accessTo> <./>; <http://www.w3.org/ns/auth/acl#default> <./>;
        <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Append>.`;
    await saveRawAcl(drop, amina.webId, text, own.etag);
    expect((await getAccess(drop, amina.webId)).agents).toEqual([{ webId: cast.neil.webId, modes: ["read", "append"] }]);

    await actAs("neil");
    const posted = await current.fetch(drop, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "from Neil" });
    expect(posted.status).toBe(201);
    expect((await current.fetch(drop, { method: "DELETE" })).status).toBe(403);
    await actAs("amina");
  });

  it("refuses rules that would lock Amina out, and writes nothing", async () => {
    const { getAccess, saveRawAcl } = aclLib;
    const drop = amina.pod + "drop/";
    const own = await getAccess(drop, amina.webId);
    const text = await (await current.fetch(own.aclUrl)).text();
    await expect(saveRawAcl(drop, amina.webId, text.replace(", acl:Control", ""), own.etag)).rejects.toThrow(/lock yourself out/);
    expect((await getAccess(drop, amina.webId)).etag).toBe(own.etag);
  });
});
