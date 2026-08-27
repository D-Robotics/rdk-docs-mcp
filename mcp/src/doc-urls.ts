const DOCS_HOST = "developer.d-robotics.cc";
const RETIRED_PREFIX = "/rdk_doc";
const CURRENT_PREFIX = "/rdk_x_doc";

export function canonicalizeDocUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== DOCS_HOST) return url;
    if (parsed.pathname === RETIRED_PREFIX || parsed.pathname.startsWith(`${RETIRED_PREFIX}/`)) {
      parsed.pathname = `${CURRENT_PREFIX}${parsed.pathname.slice(RETIRED_PREFIX.length)}`;
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}
