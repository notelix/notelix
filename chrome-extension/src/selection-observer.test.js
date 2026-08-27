import { focusRectFromTextBoxes } from "./selection-observer";

describe("range focus rectangle", () => {
  it("uses the last text rectangle for a forward selection or highlight", () => {
    const first = { bottom: 20, left: 10, right: 100, top: 5 };
    const last = { bottom: 40, left: 10, right: 70, top: 25 };

    expect(focusRectFromTextBoxes([first, last])).toBe(last);
  });

  it("uses the first text rectangle for a backwards selection", () => {
    const first = { bottom: 20, left: 10, right: 100, top: 5 };
    const last = { bottom: 40, left: 10, right: 70, top: 25 };

    expect(focusRectFromTextBoxes([first, last], true)).toBe(first);
  });
});
