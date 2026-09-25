import type { TestProject } from "vitest/node";
import { startServer, type Server } from "./server";
import { createCast, type Cast } from "./cast";

declare module "vitest" {
  export interface ProvidedContext {
    base: string;
    cast: Cast;
  }
}

let server: Server | undefined;

export async function setup(project: TestProject): Promise<void> {
  server = await startServer();
  project.provide("base", server.base);
  project.provide("cast", await createCast(server.base));
}

export async function teardown(): Promise<void> {
  await server?.stop();
}
