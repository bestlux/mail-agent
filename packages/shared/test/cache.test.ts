import { describe, expect, it } from "vitest";
import { FileCache } from "../src/cache.js";

describe("file cache", () => {
  it("expires entries by ttl", async () => {
    const cache = new FileCache();
    await cache.clear();
    await cache.write("alpha", { ok: true }, 5);

    expect(await cache.read<{ ok: boolean }>("alpha")).toEqual({ ok: true });

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(await cache.read<{ ok: boolean }>("alpha")).toBeUndefined();
  });
});
