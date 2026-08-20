import { describe, expect, it } from "vitest";
import { hasConnectivity, getNetworkType } from "./network.service";
import type { NetworkInformation } from "./network.service";

describe("hasConnectivity", () => {
  it("is false when the browser reports offline", () => {
    expect(hasConnectivity({ onLine: false })).toBe(false);
  });

  it("is true when the browser reports online", () => {
    expect(hasConnectivity({ onLine: true })).toBe(true);
  });
});

describe("getNetworkType", () => {
  it("returns unknown when offline", () => {
    expect(getNetworkType({ onLine: false })).toBe("unknown");
  });

  it("reports wifi when the Network Information API says so", () => {
    const connection: NetworkInformation = { type: "wifi", effectiveType: "4g" };
    expect(getNetworkType({ onLine: true, connection })).toBe("wifi");
  });

  it("reports the effective cellular generation when not on wifi", () => {
    const connection: NetworkInformation = { type: "cellular", effectiveType: "3g" };
    expect(getNetworkType({ onLine: true, connection })).toBe("3g");
  });

  it("falls back to 4g for the effectiveType bucket that also covers 5G", () => {
    // El Network Information API no distingue 5G de 4G: ambos caen en el
    // mismo bucket "4g" (el de mejor calidad medida). Ver comentario en
    // network.service.ts.
    const connection: NetworkInformation = { type: "cellular", effectiveType: "4g" };
    expect(getNetworkType({ onLine: true, connection })).toBe("4g");
  });

  it("returns unknown when the Network Information API is not available", () => {
    expect(getNetworkType({ onLine: true })).toBe("unknown");
  });
});
