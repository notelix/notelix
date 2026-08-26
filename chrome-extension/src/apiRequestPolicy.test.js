import { isApiRequestAllowed } from "./apiRequestPolicy";

describe("background API request policy", () => {
  it("allows only paths under the configured server", () => {
    expect(
      isApiRequestAllowed(
        { method: "POST", url: "https://notes.example/api/users/login" },
        "https://notes.example/api"
      )
    ).toBe(true);
    expect(
      isApiRequestAllowed(
        { method: "GET", url: "https://notes.example/api-evil/secrets" },
        "https://notes.example/api"
      )
    ).toBe(false);
    expect(
      isApiRequestAllowed(
        { method: "GET", url: "https://other.example/api/meta/version" },
        "https://notes.example/api"
      )
    ).toBe(false);
  });

  it("limits local-agent access to its required endpoints", () => {
    for (const path of [
      "/agentsync/resetData",
      "/agentsync/set",
      "/annotations/find",
      "/annotations/search",
    ]) {
      expect(
        isApiRequestAllowed(
          { method: "POST", url: `http://127.0.0.1:18565${path}` },
          "https://notes.example"
        )
      ).toBe(true);
    }
    expect(
      isApiRequestAllowed(
        { method: "GET", url: "http://127.0.0.1:18565/meta/health" },
        "https://notes.example"
      )
    ).toBe(false);
  });

  it("allows server probes only when explicitly enabled", () => {
    const request = {
      method: "GET",
      url: "http://self-hosted.example/base/meta/version",
    };
    expect(isApiRequestAllowed(request, "https://notes.example")).toBe(false);
    expect(
      isApiRequestAllowed(request, "https://notes.example", {
        allowServerProbe: true,
      })
    ).toBe(true);
  });

  it("rejects malformed requests and URLs containing credentials", () => {
    for (const request of [
      null,
      { method: "DELETE", url: "https://notes.example/annotations/delete" },
      { method: "GET", url: "not a URL" },
      { method: "GET", url: "file:///etc/passwd" },
      { method: "GET", url: "https://user:pass@notes.example/private" },
      { method: "GET", url: "https://notes.example", headers: [] },
    ]) {
      expect(isApiRequestAllowed(request, "https://notes.example")).toBe(false);
    }
  });
});
