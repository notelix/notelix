import "./styles.less";
import "babel-polyfill";
import {prepareDomElements} from "./dom";
import {whenUrlChanges} from "./utils/whenUrlChanges";
import {marker} from "./marker";
import {loadAllAnnotationsData} from "./service";
import {registerHotkeys} from "./hotkeys";
import {reactToSelection} from "./selection";
import {registerChromeRuntimeMessageListeners} from "./chrome";
import {getNormalizedUrl} from "./utils/getNormalizedUrl";
import {IGNORE_DOMAINS} from "./consts";

setTimeout(() => {
    if (IGNORE_DOMAINS.some(url => getNormalizedUrl().includes(url))) {
        // console.debug(`${window.location.href} has been ignored on content load`);
        return;
    }

    if (document.body.className.indexOf("notelix-initialized") >= 0) {
        return;
    } else {
        document.body.className = document.body.className + " notelix-initialized";
    }

    if (
        !(
            window.NotelixEmbeddedConfig &&
            window.NotelixEmbeddedConfig.disableLoadAllAnnotationsDataWhenUrlChanges
        )
    ) {
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

    // doTrySetAgentSyncParamsLoop();

    // window.NotelixAPI = {
    //     loadAllAnnotationsData,
    // };

    if (window.NotelixEmbeddedConfig && window.NotelixEmbeddedConfig.onReady) {
        window.NotelixEmbeddedConfig.onReady();
    }
});
