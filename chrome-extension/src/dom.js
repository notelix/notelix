import trashSvg from "./icons/trash.svg";
import commentsSvg from "./icons/comments.svg";
import { state } from "./state";
import { addOrRemoveDarkReaderClass } from "./integration/dark-reader";
import { highlighterColors } from "./utils/colors";
import { doSaveAnnotation } from "./service";
import makeid from "./utils/makeid";
import { getNormalizedUrl } from "./utils/getNormalizedUrl";
import { marker } from "./marker";
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
    `<span id="notelix-edit-annotation-popover" class="notelix-button"><span id="notelix-button-trash">${trashSvg}</span><span id="notelix-button-comment">${commentsSvg}</span><span id="notelix-annotation-comments"></span></span>`
  );
  state.editAnnotationPopoverDom = document.getElementById(
    "notelix-edit-annotation-popover"
  );

  document.getElementById("notelix-button-trash").onpointerdown = () => {
    onDeleteAnnotationElementClick();
  };

  document.getElementById("notelix-button-comment").onpointerdown =
    document.getElementById("notelix-annotation-comments").onpointerdown =
      () => {
        const annotation = state.annotations[state.selectedAnnotationId];

        const comments = annotation.notes || "";
        const value = prompt("write comments", comments);
        if (value === null) {
          return;
        }

        doSaveAnnotation({
          ...annotation,
          notes: value,
        }).then(() => {
          marker.unpaint(annotation);
          marker.paint(annotation);
        });

        hideEditAnnotationPopover();
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

  const source = state.annotations[state.selectedAnnotationId];
  const commentsDom = document.getElementById("notelix-annotation-comments");
  if (source && source.notes) {
    commentsDom.innerText = source.notes;
    commentsDom.style.display = "block";
  } else {
    commentsDom.innerText = "";
    commentsDom.style.display = "none";
  }
}

export function hideEditAnnotationPopover() {
  setTimeout(() => {
    state.editAnnotationPopoverDom.style.display = "none";
  });
}

export function onDeleteAnnotationElementClick() {
  const annotation = state.annotations[state.selectedAnnotationId];
  if (annotation && annotation.notes) {
    if (!confirm("The comments will also be deleted with it")) {
      return;
    }
  }

  deleteAnnotation({
    url: getNormalizedUrl(),
    uid: state.selectedAnnotationId,
  }).then(() => {
    marker.unpaint(annotation);
    delete state.annotations[state.selectedAnnotationId];
  });

  hideEditAnnotationPopover();
}

export function onHighlightElementClick(color) {
  const selection = document.getSelection();
  const range = selection.getRangeAt(0);
  const annotation = marker.serializeRange(range, {
    charsToKeepForTextBeforeAndTextAfter: 32,
    uid: makeid(),
  });
  if (!annotation) {
    return;
  }

  doSaveAnnotation({
    ...annotation,
    color,
    range,
  }).then(() => {
    marker.paint(annotation);
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
