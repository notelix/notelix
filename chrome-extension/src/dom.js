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

function prepareAnnotatePopoverDom() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<span id="notelix-annotate-popover">${highlighterColors
      .map(
        (color) =>
          `<span class="color" style="background-color: ${color}" data-color="${color}"></span>`
      )
      .join("")}</span>`
  );
  state.annotatePopoverDom = document.getElementById(
    "notelix-annotate-popover"
  );
  state.annotatePopoverDom.childNodes.forEach((node) => {
    node.onpointerdown = () => {
      onHighlightElementClick(node.getAttribute("data-color"));
    };
  });
}

function prepareEditAnnotationPopoverDom() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<span id="notelix-edit-annotation-popover" class="notelix-button"><span id="notelix-button-trash">${trashSvg}</span><span id="notelix-button-notes">${commentsSvg}</span></span>`
  );
  state.editAnnotationPopoverDom = document.getElementById(
    "notelix-edit-annotation-popover"
  );

  document.getElementById("notelix-button-trash").onpointerdown = () => {
    onDeleteAnnotationElementClick();
  };

  document.getElementById("notelix-button-notes").onpointerdown = () => {
    onEditNotesElementClick();
  };
}

export function showAnnotatePopover() {
  const { x, y } = getPopoverPos();
  state.annotatePopoverDom.style.top = y + "px";
  state.annotatePopoverDom.style.left = x + "px";
  addOrRemoveDarkReaderClass(state.annotatePopoverDom);
  setTimeout(() => {
    state.annotatePopoverDom.style.display = "flex";
  });
}

export function hideAnnotatePopover() {
  setTimeout(() => {
    state.annotatePopoverDom.style.display = "none";
  });
}

export function showEditAnnotationPopover() {
  const { x, y } = getPopoverPos();
  state.editAnnotationPopoverDom.style.top = y + "px";
  state.editAnnotationPopoverDom.style.left = x + "px";
  addOrRemoveDarkReaderClass(state.editAnnotationPopoverDom);
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "flex";
  });
}

export function hideEditAnnotationPopover() {
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "none";
  });
}

export function onEditNotesElementClick() {
  let annotation = state.annotations[state.selectedAnnotationId];

  const value = prompt("Write some notes..", annotation.data.notes);
  if (value === null) {
    return;
  }

  const backup = state.annotations[annotation.uid];
  annotation = {
    ...annotation,
    data: {
      ...annotation.data,
      notes: value,
    },
  };
  state.annotations[annotation.uid] = annotation;
  marker.unpaint(
    convertAnnotationToSerializedRange(state.annotations[annotation.uid])
  );
  marker.paint(
    convertAnnotationToSerializedRange(state.annotations[annotation.uid])
  );
  doSaveAnnotation(annotation).catch(() => {
    state.annotations[annotation.uid] = backup;
    marker.unpaint(
      convertAnnotationToSerializedRange(state.annotations[annotation.uid])
    );
    marker.paint(
      convertAnnotationToSerializedRange(state.annotations[annotation.uid])
    );
  });

  hideEditAnnotationPopover();
}

export function onDeleteAnnotationElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (annotation && annotation.data && annotation.data.notes) {
    if (!confirm("The notes will also be deleted with it")) {
      return;
    }
    clearInlineNotes(state.selectedAnnotationId);
  }

  marker.unpaint(convertAnnotationToSerializedRange(annotation));
  const backup = state.annotations[state.selectedAnnotationId];
  delete state.annotations[state.selectedAnnotationId];
  deleteAnnotation({
    url: getNormalizedUrl(),
    uid: state.selectedAnnotationId,
  }).catch(() => {
    state.annotations[state.selectedAnnotationId] = backup;
    marker.paint(convertAnnotationToSerializedRange(annotation));
  });

  hideEditAnnotationPopover();
}

export function onHighlightElementClick(color) {
  const selection = document.getSelection();
  const range = selection.getRangeAt(0);
  const uid = makeid();
  let serializedRange = marker.serializeRange(range, {
    charsToKeepForTextBeforeAndTextAfter: 128,
    uid,
  });
  if (!serializedRange) {
    return;
  }

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

function getPopoverPos() {
  let y = state.selectionRect.top;
  let x = state.selectionRect.left + state.selectionRect.width / 2;
  let minY = window.scrollY + 100;
  if (y < minY) {
    y = state.selectionRect.top + state.selectionRect.height + 38;
  }
  return { x, y };
}

export function updateSelectionRectAccordingToRange(range) {
  let pos = range.getBoundingClientRect();
  state.selectionRect.top = pos.top + window.scrollY;
  state.selectionRect.left = pos.left + window.scrollX;
  state.selectionRect.width = pos.width;
  state.selectionRect.height = pos.height;
  if (state.selectionRect.width === 0) {
    state.selectionRect.width = 400;
    state.selectionRect.top = state.selectionRect.top - 10;
    state.selectionRect.left = state.selectionRect.left - 200;
  }
}

export function prepareDomElements() {
  prepareAnnotatePopoverDom();
  prepareEditAnnotationPopoverDom();
}
