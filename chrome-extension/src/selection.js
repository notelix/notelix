import {
  hideAnnotatePopover,
  hideEditAnnotationPopover,
  showAnnotatePopover,
  updateSelectionRectAccordingToRange,
} from "./dom";
import { SelectionObserver } from "./selection-observer";

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

const outOfAllowedRootElement =
  window.notelixSaasConfig && window.notelixSaasConfig.rootElementClassName
    ? (range) => {
        let ptr = range.commonAncestorContainer;
        while (ptr) {
          if (
            ptr.className &&
            ptr.className.indexOf(
              window.notelixSaasConfig.rootElementClassName
            ) >= 0
          ) {
            return false;
          }
          ptr = ptr.parentElement;
        }
        return true;
      }
    : () => false;

export function reactToSelection() {
  let callback = () => {
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
      isRangeInContentEditable(range) ||
      outOfAllowedRootElement(range)
    ) {
      hideAnnotatePopover();
      hideEditAnnotationPopover();
    } else {
      updateSelectionRectAccordingToRange(range);
      showAnnotatePopover();
    }
  };

  new SelectionObserver((range) => {
    callback();
  });
}
