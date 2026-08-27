import { isEmbeddedDarkTheme } from "./dark-reader";

describe("embedded theme", () => {
  test.each([
    ["light", true, false],
    ["light", false, false],
    ["dark", true, true],
    ["dark", false, true],
    ["auto", true, true],
    ["auto", false, false],
  ])(
    "resolves %s with Dark Reader=%s to dark=%s",
    (theme, darkReaderEnabled, expected) => {
      expect(isEmbeddedDarkTheme(theme, darkReaderEnabled)).toBe(expected);
    },
  );
});
