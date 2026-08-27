const DEFAULT_GAP = 10;
const DEFAULT_VIEWPORT_PADDING = 12;

function clamp(value, minimum, maximum) {
  if (maximum < minimum) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRect(rect) {
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const width = Number(rect?.width) || 0;
  const height = Number(rect?.height) || 0;

  return {
    bottom: Number.isFinite(rect?.bottom) ? rect.bottom : top + height,
    height,
    left,
    right: Number.isFinite(rect?.right) ? rect.right : left + width,
    top,
    width,
  };
}

export function pointerAnchorRect(event, fallbackRect) {
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    return {
      bottom: event.clientY,
      height: 0,
      left: event.clientX,
      right: event.clientX,
      top: event.clientY,
      width: 0,
    };
  }
  return normalizeRect(fallbackRect);
}

export function calculatePopoverPlacement({
  alignment = "center",
  anchorRect,
  gap = DEFAULT_GAP,
  popoverHeight,
  popoverWidth,
  preferredSide = "below",
  viewportHeight,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
  viewportWidth,
}) {
  const anchor = normalizeRect(anchorRect);
  const width = Math.max(0, Number(popoverWidth) || 0);
  const height = Math.max(0, Number(popoverHeight) || 0);
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap - height;
  const fitsBelow = belowTop + height <= viewportHeight - viewportPadding;
  const fitsAbove = aboveTop >= viewportPadding;
  let side = preferredSide === "above" ? "above" : "below";

  if (side === "below" && !fitsBelow && fitsAbove) side = "above";
  if (side === "above" && !fitsAbove && fitsBelow) side = "below";

  let left;
  if (alignment === "start") {
    left = anchor.left;
  } else if (alignment === "end") {
    left = anchor.right - width;
  } else if (alignment === "viewport-center") {
    left = (viewportWidth - width) / 2;
  } else {
    left = anchor.left + (anchor.width - width) / 2;
  }

  return {
    left: clamp(left, viewportPadding, viewportWidth - viewportPadding - width),
    side,
    top: clamp(
      side === "above" ? aboveTop : belowTop,
      viewportPadding,
      viewportHeight - viewportPadding - height,
    ),
  };
}

function measurePopover(element, measurementDisplay) {
  const previousDisplay = element.style.display;
  const previousVisibility = element.style.visibility;
  const hidden = getComputedStyle(element).display === "none";

  element.style.visibility = "hidden";
  if (hidden) element.style.display = measurementDisplay;
  const rect = element.getBoundingClientRect();
  if (hidden) element.style.display = previousDisplay;
  element.style.visibility = previousVisibility;

  return rect;
}

export function placePopover(
  element,
  {
    alignment,
    anchorRect,
    coordinateOrigin,
    gap,
    measurementDisplay = "block",
    preferredSide,
    viewportPadding,
  },
) {
  if (!element || !anchorRect) return null;

  const popoverRect = measurePopover(element, measurementDisplay);
  const placement = calculatePopoverPlacement({
    alignment,
    anchorRect,
    gap,
    popoverHeight: popoverRect.height,
    popoverWidth: popoverRect.width,
    preferredSide,
    viewportHeight: document.documentElement.clientHeight,
    viewportPadding,
    viewportWidth: document.documentElement.clientWidth,
  });
  const offset = coordinateOrigin
    ? { left: -coordinateOrigin.left, top: -coordinateOrigin.top }
    : { left: window.scrollX, top: window.scrollY };

  element.style.left = `${placement.left + offset.left}px`;
  element.style.top = `${placement.top + offset.top}px`;
  element.style.removeProperty("bottom");
  element.dataset.notelixPlacement = placement.side;
  return placement;
}
