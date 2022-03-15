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
import Swal from "sweetalert2";
import { isMobileOrTablet } from "./mobile";
import sleep from "./utils/sleep";
import { isSelectionBackwards } from "./selection-observer";

function prepareAnnotatePopoverDom() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<span class="${
      isMobileOrTablet ? "mobile-or-tablet" : ""
    }" id="notelix-annotate-popover">${highlighterColors
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
    `<span id="notelix-edit-annotation-popover" class="notelix-button ${
      isMobileOrTablet ? "mobile-or-tablet" : ""
    }"><span id="notelix-button-trash">${trashSvg}</span><span id="notelix-button-notes">${commentsSvg}</span></span>`
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
  state.annotatePopoverDom.style.top = state.popoverPos.y + "px";
  state.annotatePopoverDom.style.left = state.popoverPos.x + "px";
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

let lastShowEditAnnotationPopoverTimestamp = 0;
export function showEditAnnotationPopover() {
  lastShowEditAnnotationPopoverTimestamp = +new Date();
  state.editAnnotationPopoverDom.style.top = state.popoverPos.y + "px";
  state.editAnnotationPopoverDom.style.left = state.popoverPos.x + "px";
  addOrRemoveDarkReaderClass(state.editAnnotationPopoverDom);
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "flex";
  });
}

export function hideEditAnnotationPopover() {
  if (+new Date() - lastShowEditAnnotationPopoverTimestamp < 150) {
    return;
  }
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "none";
  });
}

export async function onEditNotesElementClick() {
  let annotation = state.annotations[state.selectedAnnotationId];
  hideAnnotatePopover();
  hideEditAnnotationPopover();
  await sleep(200);
  const { value } = await Swal.fire({
    input: "textarea",
    inputLabel: "Write some notes..",
    inputValue: annotation.data.notes || "",
    allowOutsideClick: false,
  });

  if (value === undefined) {
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

export async function onDeleteAnnotationElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (annotation && annotation.data && annotation.data.notes) {
    hideAnnotatePopover();
    hideEditAnnotationPopover();
    await sleep(200);
    const { isConfirmed } = await Swal.fire({
      title: "Are you sure?",
      text: "The notes will also be deleted with it",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
    });
    if (!isConfirmed) {
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
    if (isMobileOrTablet) {
      state.popoverPos.y = rect.top + window.scrollY + 80;
    } else {
      state.popoverPos.y = rect.top + window.scrollY - 10;
    }
  } else {
    if (isMobileOrTablet) {
      state.popoverPos.y = rect.top + rect.height + window.scrollY + 50;
    } else {
      state.popoverPos.y = rect.top + rect.height + window.scrollY + 30;
    }
  }
  if (selectionIsBackwards) {
    state.popoverPos.x = rect.left + window.scrollX + 70;
  } else {
    state.popoverPos.x = rect.right + window.scrollX - 70;
  }

  if (isMobileOrTablet) {
    state.popoverPos.x = screen.width / 2;
  }
}

export function updatePopoverPosOnHighlightSelect(rect) {
  if (isMobileOrTablet) {
    state.popoverPos.y = rect.top + rect.height + window.scrollY + 50;
  } else {
    state.popoverPos.y = rect.top + rect.height + window.scrollY + 30;
  }
  state.popoverPos.x = rect.left + rect.width / 2;

  if (isMobileOrTablet) {
    state.popoverPos.x = screen.width / 2;
  }
}

export function prepareDomElements() {
  prepareAnnotatePopoverDom();
  prepareEditAnnotationPopoverDom();
}
