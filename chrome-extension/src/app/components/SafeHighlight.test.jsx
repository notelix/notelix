import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeHighlight } from "./SafeHighlight";

describe("SafeHighlight", () => {
  it("preserves only Meilisearch emphasis markers", () => {
    const html = renderToStaticMarkup(
      <SafeHighlight value={"before <em>match</em> after"} />
    );

    expect(html).toBe("before <em>match</em> after");
  });

  it("renders user-supplied HTML as text", () => {
    const html = renderToStaticMarkup(
      <SafeHighlight
        value={'<img src=x onerror="alert(1)"> <em onclick="alert(2)">x</em>'}
      />
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("onclick=\"");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;em onclick=");
  });
});
