import { describe, expect, it } from "vitest";
import { consumeDeleteConfirmation, issueDeleteConfirmation } from "../src/confirmation.js";

describe("delete confirmations", () => {
  it("issues then consumes a confirmation token", async () => {
    const confirmation = await issueDeleteConfirmation("personal", ["m1", "m2"], 1000);
    const consumed = await consumeDeleteConfirmation(confirmation.token, "personal", ["m1", "m2"]);

    expect(consumed.token).toBe(confirmation.token);
  });
});
