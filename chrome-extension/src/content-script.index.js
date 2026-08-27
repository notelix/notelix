import "./styles.less";
import { prepareDomElements } from "./dom";
import { whenUrlChanges } from "./utils/whenUrlChanges";
import { marker } from "./marker";
import { loadAllAnnotationsData } from "./service";
import { registerHotkeys } from "./hotkeys";
import { reactToSelection } from "./selection";
import { doTrySetAgentSyncParamsLoop } from "./api/agent";
import { registerChromeRuntimeMessageListeners } from "./chrome";
import { shouldDeferToEmbeddedPage } from "./embeddedPage";

setTimeout(() => {
  if (
    shouldDeferToEmbeddedPage({
      embeddedConfig: window.NotelixEmbeddedConfig,
      pathname: window.location.pathname,
      scriptSources: [...document.scripts].map((script) => script.src),
    })
  ) {
    return;
  }
  if (document.body.className.indexOf("notelix-initialized") >= 0) {
    return;
  } else {
    document.body.className = document.body.className + " notelix-initialized";
  }

  if (!(
    window.NotelixEmbeddedConfig &&
    window.NotelixEmbeddedConfig.disableLoadAllAnnotationsDataWhenUrlChanges
  )) {
    whenUrlChanges(() => {
      setTimeout(() => {
        loadAllAnnotationsData();
      });
    });
  }

  registerChromeRuntimeMessageListeners();
  prepareDomElements();
  marker.addEventListeners();
  registerHotkeys();
  reactToSelection();
  doTrySetAgentSyncParamsLoop();

  window.NotelixAPI = {
    loadAllAnnotationsData,
  };

  if (window.NotelixEmbeddedConfig && window.NotelixEmbeddedConfig.onReady) {
    window.NotelixEmbeddedConfig.onReady();
  }
});
