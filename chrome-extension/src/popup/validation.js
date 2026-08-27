export function passwordScore(value) {
  if (!value) return 0;
  let score = value.length >= 8 ? 1 : 0;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^a-zA-Z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

export function normalizeServer(value) {
  return value.trim().replace(/\/+$/, "");
}

export function validateServer(value) {
  try {
    const url = new URL(normalizeServer(value));
    if (!["http:", "https:"].includes(url.protocol)) {
      return "Use an HTTP or HTTPS address.";
    }
    if (url.username || url.password || url.search || url.hash) {
      return "Use a server origin without credentials, query parameters, or a fragment.";
    }
    if (url.pathname && url.pathname !== "/") {
      return "Use the server origin without a path.";
    }
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    ) {
      return "Remote servers must use HTTPS.";
    }
    return "";
  } catch {
    return "Enter a complete address such as https://notes.example.com.";
  }
}
