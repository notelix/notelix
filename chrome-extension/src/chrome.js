import { COMMAND_REFRESH_ANNOTATIONS } from "./consts";
import { state } from "./state";
import {
  clearInlineComments,
  convertAnnotationToSerializedRange,
  marker,
} from "./marker";
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
          clearInlineComments(key);
          marker.unpaint(
            convertAnnotationToSerializedRange(state.annotations[key])
          );
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
