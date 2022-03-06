import "./styles.less";
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
import { doTrySetAgentSyncParamsLoop } from "./api/agent";

setTimeout(() => {
  if (document.body.className.indexOf("notelix-initialized") >= 0) {
    return;
  } else {
    document.body.className = document.body.className + " notelix-initialized";
  }
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
  doTrySetAgentSyncParamsLoop();
});
