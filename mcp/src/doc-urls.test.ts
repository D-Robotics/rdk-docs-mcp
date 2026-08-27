import { describe, expect, it } from "vitest";
import { canonicalizeDocUrl } from "./doc-urls.js";

describe("canonicalizeDocUrl", () => {
  it("rewrites the retired /rdk_doc/ prefix onto /rdk_x_doc/", () => {
    expect(
      canonicalizeDocUrl("https://developer.d-robotics.cc/rdk_doc/Quick_start/hardware_introduction/rdk_x3"),
    ).toBe("https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3");
  });

  it("leaves current handbook urls unchanged", () => {
    const live = "https://developer.d-robotics.cc/rdk_s_doc/RDK";
    expect(canonicalizeDocUrl(live)).toBe(live);
  });
});
