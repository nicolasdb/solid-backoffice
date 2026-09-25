/**
 * A throwaway Community Solid Server: in memory, gone when the run ends.
 *
 * Same major version as the provider (pocpod0 runs `solidproject/community-server:7`),
 * with the stock memory config. Never point these tests at the real provider:
 * they create accounts and write ACLs.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

export interface Server {
  base: string;
  stop(): Promise<void>;
}

export async function startServer(port = Number(process.env.PODS_PORT ?? 3456)): Promise<Server> {
  const base = `http://localhost:${port}/`;
  const bin = resolve(process.cwd(), "node_modules/.bin/community-solid-server");
  const child: ChildProcess = spawn(
    bin,
    ["-p", String(port), "-b", base, "-c", "@css:config/default.json", "-l", "warn"],
    // Not the test runner's environment: with NODE_ENV=test, CSS's OIDC
    // discovery answers 500 ("jest is not defined").
    { stdio: ["ignore", "ignore", "pipe"], env: { PATH: process.env.PATH, HOME: process.env.HOME } }
  );
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr += String(d)));

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`The test server exited:\n${stderr}`);
    try {
      if ((await fetch(base + ".account/")).ok) break;
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`The test server did not start within 60 s:\n${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    base,
    stop: () =>
      new Promise<void>((done) => {
        if (child.exitCode !== null) return done();
        child.once("exit", () => done());
        child.kill();
      }),
  };
}
