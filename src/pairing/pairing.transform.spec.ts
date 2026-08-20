import { describe, expect, it } from "vitest";
import { buildSignalingUrl } from "./pairing.transform";

describe("buildSignalingUrl", () => {
  it("returns the base URL unchanged when creating a room", () => {
    expect(buildSignalingUrl("ws://host/ws", {})).toBe("ws://host/ws");
  });

  it("appends the code as a query param when joining a room", () => {
    expect(buildSignalingUrl("ws://host/ws", { code: "ABC123" })).toBe(
      "ws://host/ws?code=ABC123",
    );
  });

  it("appends both code and token when reconnecting", () => {
    expect(buildSignalingUrl("ws://host/ws", { code: "ABC123", token: "tok" })).toBe(
      "ws://host/ws?code=ABC123&token=tok",
    );
  });
});
