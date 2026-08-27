import {
  calculatePopoverPlacement,
  pointerAnchorRect,
} from "./popoverPlacement";

describe("popover placement", () => {
  it("aligns the end of a popover with the selection focus", () => {
    expect(
      calculatePopoverPlacement({
        alignment: "end",
        anchorRect: {
          bottom: 120,
          height: 20,
          left: 180,
          right: 200,
          top: 100,
          width: 20,
        },
        popoverHeight: 30,
        popoverWidth: 140,
        preferredSide: "below",
        viewportHeight: 600,
        viewportWidth: 800,
      }),
    ).toEqual({ left: 60, side: "below", top: 130 });
  });

  it("flips above the anchor when there is not enough room below", () => {
    expect(
      calculatePopoverPlacement({
        alignment: "center",
        anchorRect: {
          bottom: 590,
          height: 10,
          left: 390,
          right: 410,
          top: 580,
          width: 20,
        },
        popoverHeight: 80,
        popoverWidth: 200,
        preferredSide: "below",
        viewportHeight: 600,
        viewportWidth: 800,
      }),
    ).toEqual({ left: 300, side: "above", top: 490 });
  });

  it("keeps wide popovers inside the viewport", () => {
    expect(
      calculatePopoverPlacement({
        alignment: "end",
        anchorRect: {
          bottom: 120,
          height: 20,
          left: 4,
          right: 24,
          top: 100,
          width: 20,
        },
        popoverHeight: 30,
        popoverWidth: 320,
        preferredSide: "below",
        viewportHeight: 600,
        viewportWidth: 360,
      }).left,
    ).toBe(12);
  });

  it("uses pointer coordinates instead of a multi-line highlight box", () => {
    expect(
      pointerAnchorRect(
        { clientX: 245, clientY: 180 },
        { bottom: 500, left: 20, right: 700, top: 40 },
      ),
    ).toEqual({
      bottom: 180,
      height: 0,
      left: 245,
      right: 245,
      top: 180,
      width: 0,
    });
  });
});
