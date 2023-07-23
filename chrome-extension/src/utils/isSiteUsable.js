import {NotelixChromeStorageKey} from "../popup/consts";
import {getNormalizedUrl} from "./getNormalizedUrl";

export function isSiteUsable(callback) {
    return chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
        const normalizedUrl = getNormalizedUrl();
        const domainsToIgnore = value[NotelixChromeStorageKey].domainsToIgnore;

        if (!domainsToIgnore.some(url => normalizedUrl.includes(url))) {
            callback();
        }
    });
}
