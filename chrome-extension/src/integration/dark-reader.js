function isDarkReaderEnabled() {
  return !!document.getElementById("dark-reader-style");
}

function addOrRemoveDarkReaderClass(annotatePopoverDom) {
  // support for the dark reader chrome extension
  const classNameToAdd = "dark-reader-enabled";
  let clsName = annotatePopoverDom.className;
  clsName = clsName.split(classNameToAdd).join("");

  const darkReaderEnabled = isDarkReaderEnabled();
  if (darkReaderEnabled) {
    clsName += " " + classNameToAdd;
  }
  clsName = clsName.replace(/\s+/g, " ");
  annotatePopoverDom.className = clsName;
}

module.exports = { addOrRemoveDarkReaderClass, isDarkReaderEnabled };
