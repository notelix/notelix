import { COMMAND_REFRESH_ANNOTATIONS } from "./consts";
import { state } from "./state";
import {
  clearInlineNotes,
  convertAnnotationToSerializedRange,
  marker,
} from "./marker";
import { loadAllAnnotationsData } from "./service";
import { getUser } from "./storage";

export function registerChromeRuntimeMessageListeners() {
  if (window.NotelixEmbeddedConfig) {
    return;
  }
  chrome.runtime.onMessage.addListener(function (request) {
    if (request.command === COMMAND_REFRESH_ANNOTATIONS) {
      setTimeout(() => {
        Object.keys(state.annotations).forEach((key) => {
          clearInlineNotes(key);
          marker.unpaint(
            convertAnnotationToSerializedRange(state.annotations[key])
          );
          delete state.annotations[key];
        });
        getUser().then((user) => {
          if (user) {
            loadAllAnnotationsData();
          }
        });
      }, 1000);
    }
  });
}
