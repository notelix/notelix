import { getNormalizedUrl } from "./getNormalizedUrl";

let lastUrl;

export function whenUrlChanges(callback) {
  setInterval(() => {
    const currentUrl = getNormalizedUrl();
    if (lastUrl !== currentUrl) {
      callback();
    }
    lastUrl = currentUrl;
  }, 500);
}
