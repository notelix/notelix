export function getNormalizedUrl() {
  let href = window.location.href;
  let indexOfHash = href.indexOf("#");
  let indexOfQuestion = href.indexOf("?");
  if (indexOfHash > 0 && indexOfQuestion > 0 && indexOfHash < indexOfQuestion) {
    return href.substr(0, indexOfHash) + href.substr(indexOfQuestion);
  } else if (indexOfHash > 0) {
    return href.substr(0, indexOfHash);
  } else {
    return href;
  }
}
