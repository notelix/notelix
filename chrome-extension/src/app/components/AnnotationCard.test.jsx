import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnnotationCard,
  getAnnotationView,
  safeAnnotationUrl,
} from "./AnnotationCard";

const annotation = {
  id: 7,
  uid: "annotation-7",
  host: "example.com",
  title: "Thoughtful reading",
  url: "https://example.com/essay",
  data: {
    color: "#eeff00",
    notes: "Connect this to the research plan.",
    text: "A useful passage",
    textBefore: "Before ",
    textAfter: " after.",
  },
};

describe("AnnotationCard", () => {
  it("normalizes annotation data for a consistent product view", () => {
    expect(getAnnotationView(annotation)).toMatchObject({
      host: "example.com",
      notes: "Connect this to the research plan.",
      text: "A useful passage",
      title: "Thoughtful reading",
      url: "https://example.com/essay",
    });
  });

  it("allows only navigable web and local-file URLs", () => {
    expect(safeAnnotationUrl("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(safeAnnotationUrl("file:///tmp/notes.txt")).toBe(
      "file:///tmp/notes.txt",
    );
    expect(safeAnnotationUrl("javascript:alert(1)")).toBe("");
    expect(safeAnnotationUrl("not a URL")).toBe("");
  });

  it("renders accessible actions and escapes user content", () => {
    const html = renderToStaticMarkup(
      <AnnotationCard
        annotation={{
          ...annotation,
          title: '<img src=x onerror="alert(1)">',
          data: { ...annotation.data, text: "<script>bad()</script>" },
        }}
        onDelete={() => undefined}
      />,
    );

    expect(html).toContain("Open highlight from");
    expect(html).toContain("Delete highlight from");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});
