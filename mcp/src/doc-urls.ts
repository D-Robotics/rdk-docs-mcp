const DOCS_HOST = "developer.d-robotics.cc";
const PREFIX_REDIRECTS = [
  ["/rdk_doc", "/rdk_x_doc"],
  ["/oe_llm_s600_doc", "/oe_llm_doc"],
] as const;

export function canonicalizeDocUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== DOCS_HOST) return url;
    for (const [retired, current] of PREFIX_REDIRECTS) {
      if (parsed.pathname === retired || parsed.pathname.startsWith(`${retired}/`)) {
        parsed.pathname = `${current}${parsed.pathname.slice(retired.length)}`;
        return parsed.toString();
      }
    }
    return url;
  } catch {
    return url;
  }
}
