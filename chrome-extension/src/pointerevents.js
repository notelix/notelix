import {
  hideAnnotatePopover,
  hideEditAnnotationPopover,
  showAnnotatePopover,
  updateSelectionRectAccordingToRange,
} from "./dom";

function isRangeInContentEditable(range) {
  let ptr = range.commonAncestorContainer;
  while (ptr) {
    if (ptr.isContentEditable) {
      return true;
    }
    ptr = ptr.parentElement;
  }
  return false;
}

export function addPointerUpEventListeners() {
  window.addEventListener("pointerup", (e) => {
    setTimeout(() => {
      const selection = document.getSelection();
      let range = null;
      try {
        range = selection.getRangeAt(0);
      } catch (e) {}

      if (
        !selection.toString() ||
        !selection.rangeCount ||
        selection.isCollapsed ||
        !range ||
        isRangeInContentEditable(range)
      ) {
        hideAnnotatePopover(e);
        hideEditAnnotationPopover();
      } else {
        updateSelectionRectAccordingToRange(range);
        showAnnotatePopover(e);
      }
    });
  });
}
