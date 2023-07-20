function isDarkReaderEnabled() {
    return !!document.getElementById("dark-reader-style");
}

function addOrRemoveDarkReaderClass(element) {
    const classNameToAdd = "dark-reader-enabled";
    let clsName = element.className;
    clsName = clsName.split(classNameToAdd).join("");

    const darkReaderEnabled = isDarkReaderEnabled();
    if (darkReaderEnabled) {
        clsName += " " + classNameToAdd;
    }
    clsName = clsName.replace(/\s+/g, " ");
    element.className = clsName;
}

module.exports = {addOrRemoveDarkReaderClass, isDarkReaderEnabled};
