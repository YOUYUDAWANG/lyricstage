const isPrivateIPv4 = (hostname: string): boolean => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
};

const isPrivateIPv6 = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || /^fe[89ab]/u.test(normalized);
};

export const isLocalProviderHostV1 = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || isPrivateIPv4(normalized)
    || isPrivateIPv6(normalized);
};

export const sanitizeProviderEndpointV1 = (value: unknown): string | undefined => {
  const endpoint = typeof value === "string" ? value.trim() : "";
  if (!endpoint || endpoint.length > 500) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalProviderHostV1(url.hostname))) return undefined;
    return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
  } catch { return undefined; }
};
