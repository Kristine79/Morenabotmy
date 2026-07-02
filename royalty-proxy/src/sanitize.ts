const BRAND_PATTERNS = [
  /royalty\s*key/gi,
  /royaltykey/gi,
  /royalty\.key/gi,
  /api\.royaltykey\.ru/gi,
  /royaltykey\.(ru|com|io|net|org)/gi,
];

const REPLACEMENTS: [string | RegExp, string][] = [
  ...BRAND_PATTERNS.map((p) => [p, "Morena VPN"] as [RegExp, string]),
];

function deepSanitize(value: unknown): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const [pattern, replacement] of REPLACEMENTS) {
      s = s.replace(pattern, replacement);
    }
    return s;
  }

  if (Array.isArray(value)) {
    return value.map(deepSanitize);
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      let cleanKey = key;
      for (const [pattern, replacement] of REPLACEMENTS) {
        cleanKey = cleanKey.replace(pattern, replacement);
      }
      sanitized[cleanKey] = deepSanitize(val);
    }
    return sanitized;
  }

  return value;
}

export function sanitizeResponse(data: unknown): unknown {
  return deepSanitize(data);
}
