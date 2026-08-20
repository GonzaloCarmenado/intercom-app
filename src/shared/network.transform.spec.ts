import { describe, expect, it } from "vitest";
import { pickBestNetwork } from "./network.transform";

describe("pickBestNetwork", () => {
  it("prefers wifi over any cellular generation", () => {
    expect(pickBestNetwork(["4g", "wifi", "3g"])).toBe("wifi");
  });

  it("prefers 5g over 4g and 3g", () => {
    expect(pickBestNetwork(["3g", "5g", "4g"])).toBe("5g");
  });

  it("prefers 4g over 3g", () => {
    expect(pickBestNetwork(["3g", "4g"])).toBe("4g");
  });

  it("returns the only candidate when there is just one", () => {
    expect(pickBestNetwork(["3g"])).toBe("3g");
  });

  it("returns null when there are no candidates", () => {
    expect(pickBestNetwork([])).toBeNull();
  });
});
