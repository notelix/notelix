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
import { trySetEdgeSyncParams } from "./api/edge";

setTimeout(() => {
  trySetEdgeSyncParams();
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
