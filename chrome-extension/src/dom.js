import { Marker } from "@notelix/web-marker";
import trashSvg from "./icons/trash.svg";
import collapse from "./icons/sidebar-collapse.svg"
import expand from "./icons/sidebar-expand.svg"
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
import ReactDOM from 'react-dom';
import React from "react";
import Sidebar from "./app/components/Sidebar";
import "./sidebar.less";

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
    }">
      <span id="notelix-button-sidebar">${expand}</span>
      <span id="notelix-button-trash">${trashSvg}</span>
      <span id="notelix-button-notes">${commentsSvg}</span>
    </span>`
  );
  state.editAnnotationPopoverDom = document.getElementById(
    "notelix-edit-annotation-popover"
  );

  document.getElementById("notelix-button-sidebar").onpointerdown = () => {
    toggleSidebar(); // Call the function to toggle the sidebar
  };

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
  setTimeout(() => {
    hideEditAnnotationPopover();
  }, 250);
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
  const sidebar = document.getElementById("notelix-sidebar-container");
  var xOffset = 0;
  if (sidebar){
    xOffset = sidebar.classList.contains("visible") ? 300 : 0;
  }
  if (selectionIsBackwards) {
    if (isMobileOrTablet) {
      state.popoverPos.y = rect.top + window.scrollY + 80;
    } else {
      state.popoverPos.y = rect.top + window.scrollY - 20;
    }
  } else {
    if (isMobileOrTablet) {
      state.popoverPos.y = rect.top + rect.height + window.scrollY + 50;
    } else {
      state.popoverPos.y = rect.top + rect.height + window.scrollY + 30;
    }
  }
  if (selectionIsBackwards) {
    state.popoverPos.x = rect.left + window.scrollX + 70 - xOffset;
  } else {
    state.popoverPos.x = rect.right + window.scrollX - 70 - xOffset;
  }

  if (isMobileOrTablet) {
    state.popoverPos.x = document.documentElement.clientWidth / 2;
  }

  if (state.popoverPos.x < 76) {
    state.popoverPos.x = 76;
  }

  if (state.popoverPos.x > document.documentElement.clientWidth - 76) {
    state.popoverPos.x = document.documentElement.clientWidth - 76;
  }
}

export function updatePopoverPosOnHighlightSelect(rect) {
  const sidebar = document.getElementById("notelix-sidebar-container");
  var xOffset = 0;
  if (sidebar){
    xOffset = sidebar.classList.contains("visible") ? 300 : 0;
  }
  if (isMobileOrTablet) {
    state.popoverPos.y = rect.top + rect.height + window.scrollY + 50;
  } else {
    state.popoverPos.y = rect.top + rect.height + window.scrollY + 40;
  }
  state.popoverPos.x = rect.left + ( rect.width / 2 ) - xOffset;

  if (isMobileOrTablet) {
    state.popoverPos.x = document.documentElement.clientWidth / 2;
  }

  if (state.popoverPos.x < 76) {
    state.popoverPos.x = 76;
  }

  if (state.popoverPos.x > document.documentElement.clientWidth - 76) {
    state.popoverPos.x = document.documentElement.clientWidth - 76;
  }
  const lg = {
    state: state,
    x: state.popoverPos.x,
    y: state.popoverPos.y,
    xOffset: xOffset,
    rect: rect,
  }
  console.log(lg);
}

function toggleSidebar() {
  const sidebar = document.getElementById("notelix-sidebar-container");
  const wrapperId = "notelix-wrapper";
  const bodyWrapperId = "notelix-body-wrapper";

  if (sidebar) {
    // Toggle visibility by adding/removing the 'visible' class
    const isVisible = sidebar.classList.contains("visible");
    sidebar.classList.toggle("visible", !isVisible); // Add or remove the 'visible' class

    // Update sidebar icon
    const sideicon = document.getElementById("notelix-button-sidebar");
    sideicon.innerHTML = isVisible ? expand : collapse;

  } else {
    // Create wrapper for existing content and sidebar
    const existingContent = Array.from(document.body.children);
    const bodyWrapper = document.createElement("div");
    bodyWrapper.id = bodyWrapperId;
    bodyWrapper.style = document.body.style;
    bodyWrapper.style.width = "100%";
    bodyWrapper.style.position = "relative";

    // Move existing content into wrapper
    existingContent.forEach(child => {
      bodyWrapper.appendChild(child);
    });
    const wrapper = document.createElement("div");
    wrapper.id = wrapperId;
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "row";

    

    // Create sidebar
    const newSidebar = document.createElement("div");
    newSidebar.id = "notelix-sidebar-container";


    // Add a container for React
    const sidebarContent = document.createElement("div");
    sidebarContent.id = "sidebar-content";
    newSidebar.appendChild(sidebarContent); // Append the content div to the sidebar

    // Append sidebar to wrapper
    wrapper.appendChild(newSidebar); 
    wrapper.appendChild(bodyWrapper);
    document.body.appendChild(wrapper);
    // Render the Sidebar component into the 'sidebar-content' div
    ReactDOM.render(<Sidebar />, sidebarContent);

    // Optionally, add the 'visible' class immediately to show the sidebar
    // Alternatively, delay it to allow for CSS transition
    setTimeout(() => {
      newSidebar.classList.add("visible");
    }, 10); // Small delay to trigger the transition
  }
}

export function prepareDomElements() {
  prepareAnnotatePopoverDom();
  prepareEditAnnotationPopoverDom();
}
