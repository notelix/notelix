import { embeddedTheme } from "../embeddedLocale";

function isDarkReaderEnabled() {
  return !!document.getElementById("dark-reader-style");
}

export function isEmbeddedDarkTheme(
  theme = embeddedTheme,
  darkReaderEnabled = isDarkReaderEnabled(),
) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return darkReaderEnabled;
}

export function addOrRemoveDarkReaderClass(element) {
  const classNameToAdd = "dark-reader-enabled";
  let clsName = element.className;
  clsName = clsName.split(classNameToAdd).join("");

  if (isEmbeddedDarkTheme()) {
    clsName += " " + classNameToAdd;
  }
  clsName = clsName.replace(/\s+/g, " ");
  element.className = clsName;
}

export { isDarkReaderEnabled };
