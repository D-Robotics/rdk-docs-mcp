import { describe, expect, it } from "vitest";
import { docInManual, listManuals, resolveManual } from "./catalog.js";

describe("catalog", () => {
  it("lists the manuals published on the RDK doc center portal", () => {
    const manuals = listManuals();
    const ids = manuals.map((m) => m.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "rdk-x",
        "rdk-s",
        "rdk-ultra",
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
    expect(resolveManual("ultra")?.id).toBe("rdk-ultra");
    expect(resolveManual("studio")?.id).toBe("rdk-studio");
    expect(resolveManual("unknown-board")).toBeUndefined();
  });

  it("keeps only Ultra pages from the shared legacy index", () => {
    const ultra = resolveManual("ultra");
    expect(ultra?.includePath).toBeTruthy();
    expect(docInManual(ultra!, "https://developer.d-robotics.cc/rdk_doc/Quick_start/install_os/rdk_ultra")).toBe(true);
    expect(docInManual(ultra!, "https://developer.d-robotics.cc/rdk_doc/Basic_Application/multi_media_sp_dev_api/RDK_Ultra/decoder_api")).toBe(true);
    expect(docInManual(ultra!, "https://developer.d-robotics.cc/rdk_doc/rdk_s/Advanced_development/linux_development/kernel_headers")).toBe(false);
    expect(docInManual(ultra!, "https://developer.d-robotics.cc/rdk_doc/rdk_s/Algorithm_Application/Python_Sample/Ultralytics_YOLO11")).toBe(false);
    expect(docInManual(resolveManual("rdk-x")!, "https://developer.d-robotics.cc/rdk_x_doc/RDK")).toBe(true);
  });
});
