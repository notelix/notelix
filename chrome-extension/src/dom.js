import { Marker } from "@notelix/web-marker";
import trashSvg from "./icons/trash.svg";
import commentsSvg from "./icons/comments.svg";
import { state } from "./state";
import { addOrRemoveDarkReaderClass } from "./integration/dark-reader";
import {
  highlighterColors,
  pickBlackOrWhiteForeground,
} from "./utils/colors";
import { doSaveAnnotation } from "./service";
import makeid from "./utils/makeid";
import { getNormalizedUrl } from "./utils/getNormalizedUrl";
import {
  clearInlineNotes,
  convertAnnotationToSerializedRange,
  marker,
  paintNotes,
} from "./marker";
import { deleteAnnotation } from "./api/annotations";
import { isMobileOrTablet } from "./mobile";
import { isTrustedUserInteraction } from "./trustedUserInteraction";
import { embeddedCopy } from "./embeddedLocale";
import { placePopover } from "./utils/popoverPlacement";

const dialogShadowStyles = `
  *, *::before, *::after { box-sizing: border-box; }
  .surface { align-items: center; display: flex; height: 100%; justify-content: center; width: 100%; }
  .card { all: initial; background: #fff; border: 1px solid #d9d9d9; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,.16); box-sizing: border-box; color: #222; display: block; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; max-width: 360px; padding: 18px; width: calc(100% - 32px); }
  header { display: block; margin-bottom: 14px; }
  h2 { color: #222; font-size: 16px; font-weight: 600; line-height: 1.4; margin: 0; }
  label { color: #444; display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  textarea { all: initial; background: #fff; border: 1px solid #d5d5d5; border-radius: 5px; box-sizing: border-box; color: #222; display: block; font-family: inherit; font-size: 14px; height: 104px; line-height: 1.55; padding: 9px 10px; resize: vertical; width: 100%; }
  textarea:focus { border-color: var(--notelix-dialog-accent, #ff6797); box-shadow: 0 0 0 2px var(--notelix-dialog-accent-soft, rgba(255,103,151,.14)); outline: 0; }
  textarea::placeholder { color: #999; }
  p { color: #555; font-size: 13px; line-height: 1.65; margin: 0; }
  footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
  button { all: initial; align-items: center; border: 1px solid transparent; border-radius: 5px; box-sizing: border-box; cursor: pointer; display: inline-flex; font-family: inherit; font-size: 13px; font-weight: 500; height: 34px; justify-content: center; padding: 0 14px; }
  button:disabled { cursor: wait; opacity: .6; }
  button:focus-visible { box-shadow: 0 0 0 2px var(--notelix-dialog-accent-soft, rgba(255,103,151,.2)); outline: 0; }
  .secondary { background: #fff; border-color: #d5d5d5; color: #333; }
  .primary { background: var(--notelix-dialog-accent, #ff6797); color: var(--notelix-dialog-accent-foreground, #fff); }
  .danger-button { background: #c63f4d; color: #fff; }
  .error { color: #b53242; display: block; font-size: 12px; line-height: 1.45; margin-top: 8px; }
  .error:empty { display: none; }
  :host(.dark-reader-enabled) .card { background: #252525; border-color: #494949; color: #f5f5f5; }
  :host(.dark-reader-enabled) h2, :host(.dark-reader-enabled) label { color: #f5f5f5; }
  :host(.dark-reader-enabled) p { color: #d0d0d0; }
  :host(.dark-reader-enabled) textarea { background: #303030; border-color: #555; color: #f5f5f5; }
  :host(.dark-reader-enabled) .secondary { background: #303030; border-color: #555; color: #f5f5f5; }
  @media (max-width: 520px) { .surface { align-items: flex-end; } .card { margin-bottom: 8px; max-width: none; width: calc(100% - 16px); } }
`;

function consumeTrustedPointer(event, callback) {
  if (!isTrustedUserInteraction(event)) return;
  event.preventDefault();
  event.stopPropagation();
  callback();
}

function prepareAnnotatePopoverDom() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="${isMobileOrTablet ? "mobile-or-tablet" : ""}" id="notelix-annotate-popover" role="toolbar" aria-label="${embeddedCopy.highlightColors}">
      <span class="notelix-toolbar-colors">
        ${highlighterColors
          .map(
            (color, index) =>
              `<button class="color" type="button" aria-label="${embeddedCopy.highlightColor(embeddedCopy.colorNames[index])}" title="${embeddedCopy.colorNames[index]}" style="--notelix-color: ${color}" data-color="${color}"></button>`,
          )
          .join("")}
      </span>
    </div>`,
  );
  state.annotatePopoverDom = document.getElementById(
    "notelix-annotate-popover",
  );
  addOrRemoveDarkReaderClass(state.annotatePopoverDom);
  state.annotatePopoverDom.querySelectorAll(".color").forEach((node) => {
    node.onpointerdown = (event) =>
      consumeTrustedPointer(event, () =>
        onHighlightElementClick(node.getAttribute("data-color")),
      );
  });
}

function prepareEditAnnotationPopoverDom() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="notelix-edit-annotation-popover" class="notelix-button ${isMobileOrTablet ? "mobile-or-tablet" : ""}" role="toolbar" aria-label="${embeddedCopy.highlightActions}">
      <button id="notelix-button-trash" type="button" aria-label="${embeddedCopy.deleteHighlight}" title="${embeddedCopy.deleteHighlight}">${trashSvg}</button>
      <button id="notelix-button-notes" type="button" aria-label="${embeddedCopy.editNote}" title="${embeddedCopy.editNote}">${commentsSvg}</button>
    </div>`,
  );
  state.editAnnotationPopoverDom = document.getElementById(
    "notelix-edit-annotation-popover",
  );
  addOrRemoveDarkReaderClass(state.editAnnotationPopoverDom);
  document.getElementById("notelix-button-trash").onpointerdown = (event) =>
    consumeTrustedPointer(event, onDeleteAnnotationElementClick);
  document.getElementById("notelix-button-notes").onpointerdown = (event) =>
    consumeTrustedPointer(event, onEditNotesElementClick);
}

function prepareNotesEditorDom() {
  const host = document.createElement("div");
  host.id = "notelix-notes-backdrop";
  host.className = "notelix-dialog-backdrop";
  host.setAttribute("aria-hidden", "true");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${dialogShadowStyles}</style>
    <div class="surface">
      <section class="card" role="dialog" aria-modal="true" aria-labelledby="notelix-notes-title">
        <header><h2 id="notelix-notes-title">${embeddedCopy.editNote}</h2></header>
        <form>
          <label for="notelix-notes-text">${embeddedCopy.noteLabel}</label>
          <textarea id="notelix-notes-text" maxlength="32768" placeholder="${embeddedCopy.notePlaceholder}"></textarea>
          <div id="notelix-notes-error" class="error" role="alert"></div>
          <footer>
            <button id="notelix-notes-cancel" class="secondary" type="button">${embeddedCopy.cancel}</button>
            <button id="notelix-notes-save" class="primary" type="submit">${embeddedCopy.save}</button>
          </footer>
        </form>
      </section>
    </div>`;
  document.body.appendChild(host);
  addOrRemoveDarkReaderClass(host);
  state.notesEditorDom = host;
  state.notesEditorRoot = root;
  const form = root.querySelector("form");
  form.onsubmit = (event) => {
    event.preventDefault();
    saveNotesFromEditor();
  };
  root.getElementById("notelix-notes-cancel").onclick = hideNotesEditor;
  root.querySelector(".surface").onpointerdown = (event) => {
    if (
      event.target === root.querySelector(".surface") &&
      isTrustedUserInteraction(event)
    )
      hideNotesEditor();
  };
}

function prepareDeleteDialogDom() {
  const host = document.createElement("div");
  host.id = "notelix-delete-backdrop";
  host.className = "notelix-dialog-backdrop";
  host.setAttribute("aria-hidden", "true");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${dialogShadowStyles}</style>
    <div class="surface">
      <section class="card" role="alertdialog" aria-modal="true" aria-labelledby="notelix-delete-title" aria-describedby="notelix-delete-description">
        <header><h2 id="notelix-delete-title">${embeddedCopy.deleteTitle}</h2></header>
        <p id="notelix-delete-description">${embeddedCopy.deleteDescription}</p>
        <div id="notelix-delete-error" class="error" role="alert"></div>
        <footer>
          <button id="notelix-delete-cancel" class="secondary" type="button">${embeddedCopy.cancel}</button>
          <button id="notelix-delete-confirm" class="danger-button" type="button">${embeddedCopy.delete}</button>
        </footer>
      </section>
    </div>`;
  document.body.appendChild(host);
  addOrRemoveDarkReaderClass(host);
  state.deleteDialogDom = host;
  state.deleteDialogRoot = root;
  root.getElementById("notelix-delete-cancel").onclick = hideDeleteDialog;
  root.getElementById("notelix-delete-confirm").onclick =
    performDeleteAnnotation;
  root.querySelector(".surface").onpointerdown = (event) => {
    if (
      event.target === root.querySelector(".surface") &&
      isTrustedUserInteraction(event)
    )
      hideDeleteDialog();
  };
}

function showDialog(element) {
  addOrRemoveDarkReaderClass(element);
  element.classList.add("notelix-dialog-visible");
  element.setAttribute("aria-hidden", "false");
}

function hideDialog(element) {
  element.classList.remove("notelix-dialog-visible");
  element.setAttribute("aria-hidden", "true");
}

function hideNotesEditor() {
  hideDialog(state.notesEditorDom);
  state.notesEditorRoot.getElementById("notelix-notes-error").textContent = "";
}

function hideDeleteDialog() {
  hideDialog(state.deleteDialogDom);
  state.deleteDialogRoot.getElementById("notelix-delete-error").textContent =
    "";
}

export function showAnnotatePopover() {
  placeCurrentPopover(state.annotatePopoverDom, "flex");
  addOrRemoveDarkReaderClass(state.annotatePopoverDom);
  setTimeout(() => {
    state.annotatePopoverDom.style.display = "flex";
  });
  setTimeout(hideEditAnnotationPopover, 250);
}

export function hideAnnotatePopover() {
  setTimeout(() => {
    state.annotatePopoverDom.style.display = "none";
  });
}

let lastShowEditAnnotationPopoverTimestamp = 0;

export function showEditAnnotationPopover() {
  lastShowEditAnnotationPopoverTimestamp = Date.now();
  placeCurrentPopover(state.editAnnotationPopoverDom, "flex");
  addOrRemoveDarkReaderClass(state.editAnnotationPopoverDom);
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "flex";
  });
}

export function hideEditAnnotationPopover() {
  if (Date.now() - lastShowEditAnnotationPopoverTimestamp < 150) return;
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "none";
  });
}

export function onEditNotesElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (!annotation) return;
  const accent = /^#[0-9a-f]{6}$/i.test(annotation.data.color)
    ? annotation.data.color
    : highlighterColors[0];
  state.notesEditorDom.style.setProperty("--notelix-dialog-accent", accent);
  state.notesEditorDom.style.setProperty(
    "--notelix-dialog-accent-soft",
    `${accent}33`,
  );
  state.notesEditorDom.style.setProperty(
    "--notelix-dialog-accent-foreground",
    pickBlackOrWhiteForeground(accent),
  );
  hideAnnotatePopover();
  state.editAnnotationPopoverDom.style.display = "none";
  const textarea = state.notesEditorRoot.getElementById("notelix-notes-text");
  textarea.value = annotation.data.notes || "";
  showDialog(state.notesEditorDom);
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

async function saveNotesFromEditor() {
  let annotation = state.annotations[state.selectedAnnotationId];
  if (!annotation) {
    hideNotesEditor();
    return;
  }
  const saveButton = state.notesEditorRoot.getElementById("notelix-notes-save");
  const errorElement = state.notesEditorRoot.getElementById(
    "notelix-notes-error",
  );
  const value = state.notesEditorRoot
    .getElementById("notelix-notes-text")
    .value.trim();
  const backup = annotation;
  annotation = { ...annotation, data: { ...annotation.data, notes: value } };
  saveButton.disabled = true;
  saveButton.textContent = embeddedCopy.saving;
  errorElement.textContent = "";
  state.annotations[annotation.uid] = annotation;
  repaintAnnotation(annotation);
  try {
    await doSaveAnnotation(annotation);
    hideNotesEditor();
  } catch {
    state.annotations[annotation.uid] = backup;
    repaintAnnotation(backup);
    errorElement.textContent = embeddedCopy.saveError;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = embeddedCopy.save;
  }
}

function repaintAnnotation(annotation) {
  const serializedRange = convertAnnotationToSerializedRange(annotation);
  clearInlineNotes(annotation.uid);
  marker.unpaint(serializedRange);
  marker.paint(serializedRange);
  paintNotes({ serializedRange });
}

export function onDeleteAnnotationElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (!annotation) return;
  hideAnnotatePopover();
  state.editAnnotationPopoverDom.style.display = "none";
  const description = annotation.data?.notes
    ? embeddedCopy.deleteWithNote
    : embeddedCopy.deleteDescription;
  state.deleteDialogRoot.getElementById(
    "notelix-delete-description",
  ).textContent = description;
  showDialog(state.deleteDialogDom);
  setTimeout(() =>
    state.deleteDialogRoot.getElementById("notelix-delete-cancel").focus(),
  );
}

async function performDeleteAnnotation() {
  const annotationId = state.selectedAnnotationId;
  const annotation = state.annotations[annotationId];
  if (!annotation) {
    hideDeleteDialog();
    return;
  }
  const confirmButton = state.deleteDialogRoot.getElementById(
    "notelix-delete-confirm",
  );
  const errorElement = state.deleteDialogRoot.getElementById(
    "notelix-delete-error",
  );
  confirmButton.disabled = true;
  confirmButton.textContent = embeddedCopy.deleting;
  errorElement.textContent = "";
  try {
    await deleteAnnotation({ uid: annotationId });
    if (annotation.data?.notes) clearInlineNotes(annotationId);
    marker.unpaint(convertAnnotationToSerializedRange(annotation));
    delete state.annotations[annotationId];
    hideDeleteDialog();
  } catch {
    errorElement.textContent = embeddedCopy.deleteError;
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = embeddedCopy.delete;
  }
}

export function onHighlightElementClick(color) {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const uid = makeid();
  const serializedRange = marker.serializeRange(range, {
    charsToKeepForTextBeforeAndTextAfter: 128,
    uid,
  });
  if (!serializedRange) return;
  Marker.clearSelection();

  const { text, textBefore, textAfter } = serializedRange;
  const annotation = {
    uid,
    data: { color, notes: "", text, textBefore, textAfter },
  };
  state.annotations[annotation.uid] = annotation;
  marker.paint(convertAnnotationToSerializedRange(annotation));
  doSaveAnnotation(annotation).catch(() => {
    marker.unpaint(convertAnnotationToSerializedRange(annotation));
    delete state.annotations[annotation.uid];
  });
}

export function updatePopoverPlacementOnSelectionChange(
  rect,
  selectionIsBackwards,
) {
  const mobileAnchor = selectionIsBackwards
    ? {
        bottom: rect.top,
        height: 0,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      }
    : rect;
  state.popoverPlacement = {
    alignment: isMobileOrTablet
      ? "viewport-center"
      : selectionIsBackwards
        ? "start"
        : "end",
    anchorRect: isMobileOrTablet ? mobileAnchor : rect,
    gap: isMobileOrTablet ? (selectionIsBackwards ? 60 : 30) : 10,
    preferredSide: isMobileOrTablet
      ? "below"
      : selectionIsBackwards
        ? "above"
        : "below",
  };
  placeCurrentPopover(state.annotatePopoverDom, "flex");
}

export function updatePopoverPlacementOnHighlightSelect(rect) {
  state.popoverPlacement = {
    alignment: isMobileOrTablet ? "viewport-center" : "end",
    anchorRect: rect,
    gap: isMobileOrTablet ? 25 : 5,
    preferredSide: "below",
  };
  placeCurrentPopover(state.editAnnotationPopoverDom, "flex");
}

function placeCurrentPopover(element, measurementDisplay) {
  if (!state.popoverPlacement) return;
  placePopover(element, {
    ...state.popoverPlacement,
    measurementDisplay,
  });
}

function registerDialogKeyboardHandling() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.notesEditorDom?.classList.contains("notelix-dialog-visible"))
      hideNotesEditor();
    if (state.deleteDialogDom?.classList.contains("notelix-dialog-visible"))
      hideDeleteDialog();
  });
}

export function prepareDomElements() {
  prepareAnnotatePopoverDom();
  prepareEditAnnotationPopoverDom();
  prepareNotesEditorDom();
  prepareDeleteDialogDom();
  registerDialogKeyboardHandling();
}

export { hideDeleteDialog, hideNotesEditor, saveNotesFromEditor };
