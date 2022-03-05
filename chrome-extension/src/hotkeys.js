import { state } from "./state";
import {
  hideAnnotatePopover,
  onDeleteAnnotationElementClick,
  onHighlightElementClick,
} from "./dom";
import { highlighterColors } from "./utils/colors";
import { COMMAND_REFRESH_ANNOTATIONS } from "./consts";
import { marker } from "./marker";
import { NotelixChromeStorageKey } from "./popup/consts";
import { loadAllAnnotationsData } from "./service";

export function registerChromeRuntimeMessageListeners() {
  if (window.notelixSaasConfig) {
    return;
  }
  chrome.runtime.onMessage.addListener(function (request) {
    if (request.command === COMMAND_REFRESH_ANNOTATIONS) {
      setTimeout(() => {
        Object.keys(state.annotations).forEach((key) => {
          marker.unpaint(state.annotations[key]);
          delete state.annotations[key];
        });
        chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
          value[NotelixChromeStorageKey] = value[NotelixChromeStorageKey] || {};
          if (value[NotelixChromeStorageKey].notelixUser) {
            loadAllAnnotationsData();
          }
        });
      }, 1000);
    }
  });
}

export function registerHotkeys() {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.shiftKey || e.ctrlKey || e.altKey) {
      return;
    }
    if (e.code.startsWith("Digit")) {
      if (state.annotatePopoverDom.style.display === "none") {
        return;
      }
      const key = +e.code.replace("Digit", "");
      if (key > 6) {
        return;
      }
      onHighlightElementClick(highlighterColors[+key - 1]);
      hideAnnotatePopover();
      e.preventDefault();
    } else if (e.code === "Backspace") {
      if (
        state.editAnnotationPopoverDom.style.display === "none" ||
        !state.selectedAnnotationId
      ) {
        return;
      }
      onDeleteAnnotationElementClick();
      e.preventDefault();
    }
  });
}
