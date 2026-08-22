import { listManuals, resolveManual } from "./catalog.js";
import { scoreDocsFirstMix } from "./eval.js";
import type { HttpGet } from "./http.js";
import { getPage, listToc, searchDocs } from "./service.js";

export type UsabilityResult = {
  id: string;
  pass: boolean;
  reason: string;
};

async function check(
  id: string,
  run: () => Promise<{ pass: boolean; reason: string }>,
): Promise<UsabilityResult> {
  try {
    const result = await run();
    return { id, ...result };
  } catch (error) {
    return {
      id,
      pass: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runUsabilityChecks(http: HttpGet): Promise<UsabilityResult[]> {
  const results: UsabilityResult[] = [];

  results.push(
    await check("catalog-covers-manuals-and-forum", async () => {
      const manuals = listManuals();
      const ids = new Set(manuals.map((manual) => manual.id));
      const required = ["rdk-x", "rdk-s", "tros", "rdk-studio", "xburn", "oe-s", "x5-sdk"];
      const missing = required.filter((id) => !ids.has(id));
      if (missing.length > 0) {
        return { pass: false, reason: `missing manuals: ${missing.join(", ")}` };
      }
      return { pass: true, reason: `${manuals.length} manuals` };
    }),
  );

  results.push(
    await check("alias-x5-studio-s100", async () => {
      const aliases = [
        ["x5", "rdk-x"],
        ["studio", "rdk-studio"],
        ["s100", "rdk-s"],
        ["sdk", "x5-sdk"],
      ] as const;
      const broken = aliases.filter(([alias, id]) => resolveManual(alias)?.id !== id);
      if (broken.length > 0) {
        return { pass: false, reason: `aliases failed: ${broken.map(([alias]) => alias).join(", ")}` };
      }
      return { pass: true, reason: "x5 / studio / s100 / sdk aliases resolve" };
    }),
  );

  results.push(
    await check("mixed-search-docs-first", async () => {
      const search = await searchDocs({ query: "WiFi", source: "all", limit: 8 }, http);
      const score = scoreDocsFirstMix(search.hits, 8);
      const first = search.hits[0];
      return {
        pass: score.pass,
        reason: `${score.reason}${first ? ` · ${first.title}` : ""}`,
      };
    }),
  );

  results.push(
    await check("named-manual-is-docs-only", async () => {
      const search = await searchDocs({ query: "PoE", manual: "x5", limit: 5 }, http);
      const leaked = search.hits.filter((hit) => hit.source !== "docs" || hit.manual !== "rdk-x");
      if (search.hits.length === 0) {
        return { pass: false, reason: "x5 PoE search returned nothing" };
      }
      if (leaked.length > 0) {
        return { pass: false, reason: `forum or other manual leaked: ${leaked[0]?.url}` };
      }
      return { pass: true, reason: `${search.hits.length} rdk-x docs only` };
    }),
  );

  results.push(
    await check("forum-only-still-works", async () => {
      const search = await searchDocs({ query: "S100 WiFi", manual: "forum", limit: 5 }, http);
      if (search.hits.length === 0) {
        return { pass: false, reason: "forum search returned nothing" };
      }
      if (search.hits.some((hit) => hit.source !== "forum")) {
        return { pass: false, reason: "forum-only search included docs" };
      }
      if (!search.hits.some((hit) => hit.url.includes("forum.d-robotics.cc"))) {
        return { pass: false, reason: "no official forum URL" };
      }
      return { pass: true, reason: search.hits[0]?.title ?? "forum hit" };
    }),
  );

  results.push(
    await check("list-toc-x5", async () => {
      const toc = await listToc({ manual: "x5" }, http);
      const pages = toc.pages.filter((page) => page.url.includes("developer.d-robotics.cc"));
      if (pages.length < 20) {
        return { pass: false, reason: `x5 toc too small: ${pages.length}` };
      }
      return { pass: true, reason: `${pages.length} x5 pages` };
    }),
  );

  results.push(
    await check("get-page-official-and-forum", async () => {
      const doc = await getPage(
        { url: "https://developer.d-robotics.cc/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE" },
        http,
      );
      const topic = await getPage({ url: "https://forum.d-robotics.cc/t/topic/33210", maxChars: 4000 }, http);
      if (!doc.markdown.includes("PoE") && !doc.markdown.includes("POE")) {
        return { pass: false, reason: "official PoE page missing PoE" };
      }
      if (!topic.markdown.toLowerCase().includes("wifi")) {
        return { pass: false, reason: "forum topic 33210 missing wifi" };
      }
      return { pass: true, reason: `opened ${doc.title} + ${topic.title}` };
    }),
  );

  results.push(
    await check("forum-category-page", async () => {
      const page = await getPage(
        { url: "https://forum.d-robotics.cc/c/39-category/yykf/7", maxChars: 8000 },
        http,
      );
      if (!page.markdown.includes("forum.d-robotics.cc/t/")) {
        return { pass: false, reason: "category page had no topic links" };
      }
      return { pass: true, reason: `opened ${page.title}` };
    }),
  );

  results.push(
    await check("real-developer-experience-has-forum", async () => {
      const search = await searchDocs(
        { query: "开发者论坛 社区 经验分享", source: "all", limit: 8 },
        http,
      );
      if (!search.hits.some((hit) => hit.source === "forum")) {
        return { pass: false, reason: "forum-intent query returned no forum hits" };
      }
      if (search.hits[0]?.source !== "docs" && search.hits.some((hit) => hit.source === "docs")) {
        return { pass: false, reason: `docs existed but first hit was ${search.hits[0]?.source}` };
      }
      return { pass: true, reason: `docs first, forum supplement · ${search.hits.find((hit) => hit.source === "forum")?.title}` };
    }),
  );

  results.push(
    await check("s100-studio-sdk-searchable", async () => {
      const probes = [
        { query: "开机", manual: "s100", host: "/rdk_s_doc/" },
        { query: "Studio", manual: "studio", host: "/rdk_studio_doc/" },
        { query: "开发环境", manual: "sdk", host: "/x5_sdk_doc/" },
      ];
      const failed: string[] = [];
      for (const probe of probes) {
        const search = await searchDocs({ query: probe.query, manual: probe.manual, limit: 5 }, http);
        if (!search.hits.some((hit) => hit.url.includes(probe.host))) {
          failed.push(`${probe.manual} ${probe.query}`);
        }
      }
      if (failed.length > 0) {
        return { pass: false, reason: `no official hit: ${failed.join(", ")}` };
      }
      return { pass: true, reason: "s100 / studio / sdk returned official URLs" };
    }),
  );

  results.push(
    await check("best-practice-first-hits", async () => {
      const probes = [
        {
          id: "cases",
          query: "案例 示例 应用",
          manual: "case-s600",
          first: ["/case_doc/case"],
        },
        {
          id: "s100-burn",
          query: "S100 烧录镜像",
          manual: "s100",
          first: ["s100-xburn"],
        },
        {
          id: "forum-experience",
          query: "开发者论坛 社区 经验分享",
          source: "all" as const,
          first: undefined,
          requireForum: true,
        },
        {
          id: "s100-gpio",
          query: "GPIO",
          manual: "s100",
          first: ["driver_gpio_dev"],
        },
        {
          id: "tros-cross",
          query: "交叉编译",
          manual: "tros",
          first: ["cross_compile"],
        },
        {
          id: "s100-wifi",
          query: "WiFi",
          manual: "s100",
          first: ["network_bluetooth"],
        },
      ];
      const failed: string[] = [];
      for (const probe of probes) {
        const search = await searchDocs(
          { query: probe.query, manual: probe.manual, source: probe.source, limit: 8 },
          http,
        );
        const first = search.hits[0];
        if (!first) {
          failed.push(`${probe.id}: empty`);
          continue;
        }
        if (probe.first && !probe.first.some((needle) => first.url.includes(needle))) {
          failed.push(`${probe.id}: ${first.url}`);
        }
        if (probe.first && first.role !== "official-start") {
          failed.push(`${probe.id}: role=${first.role ?? "none"}`);
        }
        if (probe.requireForum) {
          if (first.source !== "docs") failed.push(`${probe.id}: first was ${first.source}`);
          if (!search.hits.some((hit) => hit.source === "forum")) failed.push(`${probe.id}: no forum`);
        }
      }
      if (failed.length > 0) {
        return { pass: false, reason: failed.join(" · ") };
      }
      return { pass: true, reason: "cases / S100 burn / forum-intent first hits are official" };
    }),
  );

  return results;
}
