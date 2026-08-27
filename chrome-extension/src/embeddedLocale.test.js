import {
  normalizeEmbeddedLanguage,
  normalizeEmbeddedTheme,
} from "./embeddedLocale";

describe("embedded preferences", () => {
  test.each([
    [undefined, "en"],
    ["", "en"],
    ["fr", "en"],
    ["en", "en"],
    ["en-US", "en"],
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-Hans", "zh-CN"],
  ])("normalizes language %p to %s", (configured, expected) => {
    expect(normalizeEmbeddedLanguage(configured)).toBe(expected);
  });

  test.each([
    [undefined, "auto"],
    ["", "auto"],
    ["sepia", "auto"],
    ["auto", "auto"],
    ["LIGHT", "light"],
    ["dark", "dark"],
  ])("normalizes theme %p to %s", (configured, expected) => {
    expect(normalizeEmbeddedTheme(configured)).toBe(expected);
  });
});
