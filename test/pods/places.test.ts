import { describe, it, expect, vi, inject, beforeEach } from "vitest";
import { current, actAs } from "./as";

vi.mock("../../src/lib/auth", () => ({
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => current.fetch(input, init),
}));

const { listFolder, effectiveAccess, readFile } = await import("../../src/lib/files");
const { readAccess, forgetAclLocations } = await import("../../src/lib/acl");
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
