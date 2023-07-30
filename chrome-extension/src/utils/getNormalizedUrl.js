export function getNormalizedUrl() {
  let href = window.location.href;
  const indexOfHash = href.indexOf("#");
  const indexOfQuestion = href.indexOf("?");

  if (indexOfHash > 0 && indexOfQuestion > 0 && indexOfHash < indexOfQuestion) {
    href = href.substr(0, indexOfHash) + href.substr(indexOfQuestion);
  } else if (indexOfHash > 0) {
    href = href.substr(0, indexOfHash);
  }

  return href;
}
