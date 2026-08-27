import { Marker } from "@notelix/web-marker";
import trashSvg from "./icons/trash.svg";
import commentsSvg from "./icons/comments.svg";
import { state } from "./state";
import { addOrRemoveDarkReaderClass } from "./integration/dark-reader";
import { highlighterColors } from "./utils/colors";
import { doSaveAnnotation } from "./service";
import makeid from "./utils/makeid";
import { getNormalizedUrl } from "./utils/getNormalizedUrl";
import {
  clearInlineNotes,
  convertAnnotationToSerializedRange,
  marker,
} from "./marker";
import { deleteAnnotation } from "./api/annotations";
import { isMobileOrTablet } from "./mobile";
import { isTrustedUserInteraction } from "./trustedUserInteraction";

const colorNames = ["Rose", "Amber", "Yellow", "Green", "Blue", "Violet"];
const dialogShadowStyles = `
  *, *::before, *::after { box-sizing: border-box; }
  .surface { align-items: center; display: flex; height: 100%; justify-content: center; width: 100%; }
  .card { all: initial; background: #fff; border: 1px solid #e0e2e9; border-radius: 17px; box-shadow: 0 30px 80px rgba(18,20,34,.22),0 8px 22px rgba(18,20,34,.12); box-sizing: border-box; color: #1d2130; display: block; font-family: Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; max-width: 430px; padding: 21px; width: calc(100% - 40px); }
  header { align-items: center; display: flex; gap: 11px; margin-bottom: 17px; }
  header > div { display: grid; gap: 3px; }
  header span:not(.symbol) { color: #6558d7; font-size: 8px; font-weight: 800; letter-spacing: .12em; }
  h2 { color: #1d2130; font-size: 15px; font-weight: 750; letter-spacing: -.01em; margin: 0; }
  .symbol { align-items: center; background: #eeecff; border-radius: 9px; color: #5648d7; display: flex; flex: 0 0 auto; font-size: 16px; height: 36px; justify-content: center; width: 36px; }
  .symbol.danger { background: #fff0f2; color: #c63f4d; font-weight: 800; }
  label { color: #303545; display: block; font-size: 10px; font-weight: 750; margin-bottom: 6px; }
  textarea { all: initial; background: #f8f8fb; border: 1px solid #d9dce6; border-radius: 10px; box-sizing: border-box; color: #202433; display: block; font-family: inherit; font-size: 12px; height: 126px; line-height: 1.55; padding: 11px 12px; resize: vertical; width: 100%; }
  textarea:focus { border-color: #6558d7; box-shadow: 0 0 0 3px rgba(101,88,215,.13); outline: 0; }
  textarea::placeholder { color: #959aaa; }
  p { color: #5f6678; font-size: 12px; line-height: 1.55; margin: 4px 0 0; }
  footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 17px; }
  button { all: initial; align-items: center; border: 1px solid transparent; border-radius: 9px; box-sizing: border-box; cursor: pointer; display: inline-flex; font-family: inherit; font-size: 10px; font-weight: 750; height: 37px; justify-content: center; padding: 0 14px; }
  button:disabled { cursor: wait; opacity: .6; }
  button:focus-visible { box-shadow: 0 0 0 3px rgba(101,88,215,.18); outline: 0; }
  .secondary { background: #fff; border-color: #dadee7; color: #303545; }
  .primary { background: #5648d7; color: #fff; }
  .danger-button { background: #c63f4d; color: #fff; }
  .error { color: #b53242; display: block; font-size: 10px; line-height: 1.45; margin-top: 8px; }
  .error:empty { display: none; }
  :host(.dark-reader-enabled) .card { background: #1e202a; border-color: #343744; color: #f1f2f7; }
  :host(.dark-reader-enabled) h2, :host(.dark-reader-enabled) label { color: #f1f2f7; }
  :host(.dark-reader-enabled) p { color: #b6bac8; }
  :host(.dark-reader-enabled) textarea { background: #282b37; border-color: #3a3e4c; color: #f1f2f7; }
  :host(.dark-reader-enabled) .secondary { background: #282b37; border-color: #3a3e4c; color: #f1f2f7; }
  @media (max-width: 520px) { .surface { align-items: flex-end; } .card { border-radius: 17px 17px 12px 12px; margin-bottom: 10px; max-width: none; width: calc(100% - 20px); } }
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
    `<div class="${isMobileOrTablet ? "mobile-or-tablet" : ""}" id="notelix-annotate-popover" role="toolbar" aria-label="Highlight colors">
      <span class="notelix-toolbar-label">Highlight</span>
      <span class="notelix-toolbar-colors">
        ${highlighterColors
          .map(
            (color, index) =>
              `<button class="color" type="button" aria-label="Highlight in ${colorNames[index]}" title="${colorNames[index]}" style="--notelix-color: ${color}" data-color="${color}"></button>`,
          )
          .join("")}
      </span>
    </div>`,
  );
  state.annotatePopoverDom = document.getElementById(
    "notelix-annotate-popover",
  );
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
    `<div id="notelix-edit-annotation-popover" class="notelix-button ${isMobileOrTablet ? "mobile-or-tablet" : ""}" role="toolbar" aria-label="Highlight actions">
      <button id="notelix-button-notes" type="button" aria-label="Edit private note" title="Edit note">${commentsSvg}<span>Note</span></button>
      <button id="notelix-button-trash" type="button" aria-label="Delete highlight" title="Delete highlight">${trashSvg}<span>Delete</span></button>
    </div>`,
  );
  state.editAnnotationPopoverDom = document.getElementById(
    "notelix-edit-annotation-popover",
  );
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
        <header><span class="symbol">✦</span><div><span>PRIVATE NOTE</span><h2 id="notelix-notes-title">Add context to this highlight</h2></div></header>
        <form>
          <label for="notelix-notes-text">Your note</label>
          <textarea id="notelix-notes-text" maxlength="32768" placeholder="Why did this passage matter?"></textarea>
          <div id="notelix-notes-error" class="error" role="alert"></div>
          <footer>
            <button id="notelix-notes-cancel" class="secondary" type="button">Cancel</button>
            <button id="notelix-notes-save" class="primary" type="submit">Save note</button>
          </footer>
        </form>
      </section>
    </div>`;
  document.body.appendChild(host);
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
        <header><span class="symbol danger">!</span><div><span>REMOVE HIGHLIGHT</span><h2 id="notelix-delete-title">Delete this highlight?</h2></div></header>
        <p id="notelix-delete-description">This removes the highlight from every synced browser. This action cannot be undone.</p>
        <div id="notelix-delete-error" class="error" role="alert"></div>
        <footer>
          <button id="notelix-delete-cancel" class="secondary" type="button">Cancel</button>
          <button id="notelix-delete-confirm" class="danger-button" type="button">Delete highlight</button>
        </footer>
      </section>
    </div>`;
  document.body.appendChild(host);
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
  state.annotatePopoverDom.style.top = state.popoverPos.y + "px";
  state.annotatePopoverDom.style.left = state.popoverPos.x + "px";
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
  state.editAnnotationPopoverDom.style.top = state.popoverPos.y + "px";
  state.editAnnotationPopoverDom.style.left = state.popoverPos.x + "px";
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
  saveButton.textContent = "Saving…";
  errorElement.textContent = "";
  state.annotations[annotation.uid] = annotation;
  repaintAnnotation(annotation);
  try {
    await doSaveAnnotation(annotation);
    hideNotesEditor();
  } catch {
    state.annotations[annotation.uid] = backup;
    repaintAnnotation(backup);
    errorElement.textContent =
      "The note could not be saved. Check your connection and try again.";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save note";
  }
}

function repaintAnnotation(annotation) {
  marker.unpaint(convertAnnotationToSerializedRange(annotation));
  marker.paint(convertAnnotationToSerializedRange(annotation));
}

export function onDeleteAnnotationElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (!annotation) return;
  hideAnnotatePopover();
  state.editAnnotationPopoverDom.style.display = "none";
  const description = annotation.data?.notes
    ? "This also removes the private note attached to this highlight from every synced browser."
    : "This removes the highlight from every synced browser. This action cannot be undone.";
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
  confirmButton.textContent = "Deleting…";
  errorElement.textContent = "";
  try {
    await deleteAnnotation({ url: getNormalizedUrl(), uid: annotationId });
    if (annotation.data?.notes) clearInlineNotes(annotationId);
    marker.unpaint(convertAnnotationToSerializedRange(annotation));
    delete state.annotations[annotationId];
    hideDeleteDialog();
  } catch {
    errorElement.textContent =
      "The highlight could not be deleted. Check your connection and try again.";
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = "Delete highlight";
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

export function updatePopoverPosOnSelectionChange(rect, selectionIsBackwards) {
  if (selectionIsBackwards) {
    state.popoverPos.y =
      rect.top + window.scrollY + (isMobileOrTablet ? 80 : -20);
  } else {
    state.popoverPos.y =
      rect.top + rect.height + window.scrollY + (isMobileOrTablet ? 50 : 30);
  }
  state.popoverPos.x = selectionIsBackwards
    ? rect.left + window.scrollX + 70
    : rect.right + window.scrollX - 70;
  constrainPopoverX();
}

export function updatePopoverPosOnHighlightSelect(rect) {
  state.popoverPos.y =
    rect.top + rect.height + window.scrollY + (isMobileOrTablet ? 50 : 40);
  state.popoverPos.x = rect.left + rect.width / 2;
  constrainPopoverX();
}

function constrainPopoverX() {
  if (isMobileOrTablet)
    state.popoverPos.x = document.documentElement.clientWidth / 2;
  state.popoverPos.x = Math.max(
    76,
    Math.min(document.documentElement.clientWidth - 76, state.popoverPos.x),
  );
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
