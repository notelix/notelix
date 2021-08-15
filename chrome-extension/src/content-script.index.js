import "./styles.less";
import "toastr/toastr.less";
import "babel-polyfill";
import { prepareDomElements } from "./dom";
import { whenUrlChanges } from "./utils/whenUrlChanges";
import { marker } from "./marker";
import { loadAllAnnotationsData } from "./service";
import {
  registerChromeRuntimeMessageListeners,
  registerHotkeys,
} from "./hotkeys";
import { addPointerUpEventListeners } from "./pointerevents";
import { COMMAND_REFRESH_ANNOTATIONS } from "./consts";
import { NotelixChromeStorageKey } from "./popup/consts";
import { state } from "./state";

setTimeout(() => {
  whenUrlChanges(() => {
    setTimeout(() => {
      loadAllAnnotationsData();
    });
  });
  registerChromeRuntimeMessageListeners();
  prepareDomElements();
  marker.addEventListeners();
  registerHotkeys();
  addPointerUpEventListeners();
});
