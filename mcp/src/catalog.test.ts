import { describe, expect, it } from "vitest";
import { listManuals, resolveManual } from "./catalog.js";

describe("catalog", () => {
  it("lists the manuals published on the RDK doc center portal", () => {
    const manuals = listManuals();
    const ids = manuals.map((m) => m.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "rdk-x",
        "rdk-s",
        "tros",
        "model-zoo",
        "case-s600",
        "magicbox",
        "stereo-camera",
        "bmi088",
        "rdk-studio",
        "xburn",
        "oe-s",
        "oe-llm-s100",
        "oe-llm-s600",
        "oe-x5",
        "oe-x3",
        "x5-sdk",
      ]),
    );
    expect(manuals.length).toBeGreaterThanOrEqual(16);

    for (const manual of manuals) {
      expect(manual.homeUrl).toMatch(/^https:\/\/developer\.d-robotics\.cc\//);
      expect(manual.title.length).toBeGreaterThan(0);
    }
  });

  it("marks published manuals searchable, including Rspress OE-S / OE LLM", () => {
    expect(resolveManual("rdk-x")?.searchable).toBe(true);
    expect(resolveManual("oe-s")?.indexKind).toBe("rspress");
    expect(resolveManual("oe-llm-s100")?.searchable).toBe(true);
    expect(resolveManual("oe-llm-s600")?.searchable).toBe(true);
    expect(resolveManual("x5-sdk")?.searchable).toBe(true);
  });

  it("resolves aliases such as x5, s100, tros, studio", () => {
    expect(resolveManual("x5")?.id).toBe("rdk-x");
    expect(resolveManual("s100")?.id).toBe("rdk-s");
    expect(resolveManual("tros")?.id).toBe("tros");
    expect(resolveManual("studio")?.id).toBe("rdk-studio");
    expect(resolveManual("unknown-board")).toBeUndefined();
  });
});
