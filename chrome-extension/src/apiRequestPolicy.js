const allowedAgentPaths = new Set([
  "/agentsync/resetData",
  "/agentsync/set",
  "/annotations/find",
  "/annotations/search",
]);

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch (_error) {
    return null;
  }
}

function isWithinConfiguredServer(target, configuredServer) {
  const server = parseHttpUrl(configuredServer);
  if (!server || target.origin !== server.origin) {
    return false;
  }
  const basePath = `${server.pathname.replace(/\/+$/, "")}/`;
  return target.pathname.startsWith(basePath);
}

export function isApiRequestAllowed(
  params,
  configuredServer,
  { allowServerProbe = false } = {}
) {
  if (
    !params ||
    !["GET", "POST"].includes(params.method) ||
    typeof params.url !== "string" ||
    params.url.length > 4096 ||
    (params.headers !== undefined &&
      (typeof params.headers !== "object" ||
        params.headers === null ||
        Array.isArray(params.headers)))
  ) {
    return false;
  }

  const target = parseHttpUrl(params.url);
  if (!target) {
    return false;
  }
  if (
    target.origin === "http://127.0.0.1:18565" &&
    allowedAgentPaths.has(target.pathname)
  ) {
    return true;
  }
  if (isWithinConfiguredServer(target, configuredServer)) {
    return true;
  }
  return (
    allowServerProbe &&
    params.method === "GET" &&
    target.pathname.endsWith("/meta/version")
  );
}
