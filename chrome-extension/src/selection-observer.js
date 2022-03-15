/**
 * taken from https://github.com/hypothesis/client
 * LICENSE: notelix/chrome-extension/LICENSES/hypothesis.LICENSE
 */

/**
 * Return the current selection or `null` if there is no selection or it is empty.
 *
 * @param {Document} document
 * @return {Range|null}
 */
function selectedRange(document) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return null;
  }
  return range;
}

/**
 * An observer that watches for and buffers changes to the document's current selection.
 */
export class SelectionObserver {
  /**
   * Start observing changes to the current selection in the document.
   *
   * @param {(range: Range|null) => any} callback -
   *   Callback invoked with the selected region of the document when it has
   *   changed.
   * @param {Document} document_ - Test seam
   */
  constructor(callback, document_ = document) {
    let isMouseDown = false;

    this._pendingCallback = null;

    const scheduleCallback = (delay = 10) => {
      this._pendingCallback = setTimeout(() => {
        callback(selectedRange(document_));
      }, delay);
    };

    /** @param {Event} event */
    this._eventHandler = (event) => {
      if (event.type === "mousedown") {
        isMouseDown = true;
      }
      if (event.type === "mouseup") {
        isMouseDown = false;
      }

      // If the user makes a selection with the mouse, wait until they release
      // it before reporting a selection change.
      if (isMouseDown) {
        return;
      }

      this._cancelPendingCallback();

      // Schedule a notification after a short delay. The delay serves two
      // purposes:
      //
      // - If this handler was called as a result of a 'mouseup' event then the
      //   selection will not be updated until the next tick of the event loop.
      //   In this case we only need a short delay.
      //
      // - If the user is changing the selection with a non-mouse input (eg.
      //   keyboard or selection handles on mobile) this buffers updates and
      //   makes sure that we only report one when the update has stopped
      //   changing. In this case we want a longer delay.

      const delay = event.type === "mouseup" ? 10 : 100;
      scheduleCallback(delay);
    };

    this._document = document_;
    this._events = ["mousedown", "mouseup", "selectionchange"];
    for (let event of this._events) {
      document_.addEventListener(event, this._eventHandler);
    }

    // Report the initial selection.
    scheduleCallback(1);
  }

  _cancelPendingCallback() {
    if (this._pendingCallback) {
      clearTimeout(this._pendingCallback);
      this._pendingCallback = null;
    }
  }
}

/**
 * Returns true if the start point of a selection occurs after the end point,
 * in document order.
 *
 * @param {Selection} selection
 */
export function isSelectionBackwards(selection) {
  if (selection.focusNode === selection.anchorNode) {
    return selection.focusOffset < selection.anchorOffset;
  }

  const range = selection.getRangeAt(0);
  // Does not work correctly on iOS when selecting nodes backwards.
  // https://bugs.webkit.org/show_bug.cgi?id=220523
  return range.startContainer === selection.focusNode;
}

/**
 * Returns true if any part of `node` lies within `range`.
 *
 * @param {Range} range
 * @param {Node} node
 */
export function isNodeInRange(range, node) {
  try {
    const length = node.nodeValue?.length ?? node.childNodes.length;
    return (
      // Check start of node is before end of range.
      range.comparePoint(node, 0) <= 0 &&
      // Check end of node is after start of range.
      range.comparePoint(node, length) >= 0
    );
  } catch (e) {
    // `comparePoint` may fail if the `range` and `node` do not share a common
    // ancestor or `node` is a doctype.
    return false;
  }
}

/**
 * Iterate over all Node(s) which overlap `range` in document order and invoke
 * `callback` for each of them.
 *
 * @param {Range} range
 * @param {(n: Node) => any} callback
 */
export function forEachNodeInRange(range, callback) {
  const root = range.commonAncestorContainer;
  const nodeIter = /** @type {Document} */ (
    root.ownerDocument
  ).createNodeIterator(root, NodeFilter.SHOW_ALL);

  let currentNode;
  while ((currentNode = nodeIter.nextNode())) {
    if (isNodeInRange(range, currentNode)) {
      callback(currentNode);
    }
  }
}

/**
 * Returns the bounding rectangles of non-whitespace text nodes in `range`.
 *
 * @param {Range} range
 * @return {Array<DOMRect>} Array of bounding rects in viewport coordinates.
 */
export function getTextBoundingBoxes(range) {
  const whitespaceOnly = /^\s*$/;
  const textNodes = /** @type {Text[]} */ ([]);
  forEachNodeInRange(range, (node) => {
    if (
      node.nodeType === Node.TEXT_NODE &&
      !(/** @type {string} */ (node.textContent).match(whitespaceOnly))
    ) {
      textNodes.push(/** @type {Text} */ (node));
    }
  });

  /** @type {DOMRect[]} */
  let rects = [];
  textNodes.forEach((node) => {
    const nodeRange = node.ownerDocument.createRange();
    nodeRange.selectNodeContents(node);
    if (node === range.startContainer) {
      nodeRange.setStart(node, range.startOffset);
    }
    if (node === range.endContainer) {
      nodeRange.setEnd(node, range.endOffset);
    }
    if (nodeRange.collapsed) {
      // If the range ends at the start of this text node or starts at the end
      // of this node then do not include it.
      return;
    }

    // Measure the range and translate from viewport to document coordinates
    const viewportRects = Array.from(nodeRange.getClientRects());
    nodeRange.detach();
    rects = rects.concat(viewportRects);
  });
  return rects;
}

/**
 * Returns the rectangle, in viewport coordinates, for the line of text
 * containing the focus point of a Selection.
 *
 * Returns null if the selection is empty.
 *
 * @param {Selection} selection
 * @return {DOMRect|null}
 */
export function selectionFocusRect(selection) {
  if (selection.isCollapsed) {
    return null;
  }
  const textBoxes = getTextBoundingBoxes(selection.getRangeAt(0));
  if (textBoxes.length === 0) {
    return null;
  }

  if (isSelectionBackwards(selection)) {
    return textBoxes[0];
  } else {
    return textBoxes[textBoxes.length - 1];
  }
}
