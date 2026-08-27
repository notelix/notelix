import { shouldDeferToEmbeddedPage } from "./embeddedPage";

describe("embedded playground ownership", () => {
  it("defers an isolated extension script to the page integration", () => {
    expect(
      shouldDeferToEmbeddedPage({
        embeddedConfig: undefined,
        pathname: "/embedded/",
        scriptSources: ["https://notes.example/assets/embedded.js"],
      }),
    ).toBe(true);
  });

  it("allows the configured page script and ordinary extension pages", () => {
    expect(
      shouldDeferToEmbeddedPage({
        embeddedConfig: { staticToken: "configured" },
        pathname: "/embedded/",
        scriptSources: ["https://notes.example/assets/embedded.js"],
      }),
    ).toBe(false);
    expect(
      shouldDeferToEmbeddedPage({
        embeddedConfig: undefined,
        pathname: "/article",
        scriptSources: ["https://notes.example/assets/embedded.js"],
      }),
    ).toBe(false);
  });
});
