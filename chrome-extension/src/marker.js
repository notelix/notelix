import {Marker} from "@notelix/web-marker";
import {state} from "./state";
import {onEditNotesElementClick, showEditAnnotationPopover, updatePopoverPosOnHighlightSelect,} from "./dom";
import {pickBlackOrWhiteForeground} from "./utils/colors";
import commentsSvg from "./icons/comments.svg";

function convertAnnotationToSerializedRange(annotation) {
    return {
        uid: annotation.uid,
        text: annotation.data.text,
        textBefore: annotation.data.textBefore,
        textAfter: annotation.data.textAfter,
    };
}

function paintNotes(context) {
    clearInlineNotes(context.serializedRange.uid);
    const annotation = state.annotations[context.serializedRange.uid];
    if (annotation.data.notes) {
        const firstHighlightElement = Array.from(
            document.getElementsByTagName("web-marker-highlight")
        ).filter(
            (x) => x.getAttribute("highlight-id") === context.serializedRange.uid
        )[0];

        const inlineNotesRootElement = document.createElement("div");
        const expandedNotesElement = document.createElement("div");
        expandedNotesElement.className = "notelix-expanded-notes";
        const expandedNotesTextElement = document.createElement("div");
        expandedNotesElement.appendChild(expandedNotesTextElement);
        expandedNotesTextElement.innerText = annotation.data.notes;
        expandedNotesTextElement.style.backgroundColor = "#FFFFFFBB";

        inlineNotesRootElement.addEventListener("mouseover", () => {
            const clientRect = inlineNotesTextElement.getBoundingClientRect();
            if (clientRect.top >= document.documentElement.clientHeight / 2) {
                expandedNotesElement.style.removeProperty("bottom");
                expandedNotesElement.style.top = "0px";
            } else {
                expandedNotesElement.style.removeProperty("top");
                expandedNotesElement.style.bottom = "0px";
            }
            document.body.appendChild(expandedNotesElement);
        });
        inlineNotesRootElement.addEventListener("mouseleave", () => {
            if (expandedNotesElement) {
                expandedNotesElement.parentElement.removeChild(expandedNotesElement);
            }
        });
        inlineNotesRootElement.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            state.selectedAnnotationId = context.serializedRange.uid;
            onEditNotesElementClick();
            expandedNotesElement.parentElement.removeChild(expandedNotesElement);
        });
        inlineNotesRootElement.id = "notes-" + context.serializedRange.uid;
        inlineNotesRootElement.className =
            "web-marker-black-listed-element notelix-notes-inline";
        const inlineNotesTextElement = document.createElement("div");
        inlineNotesTextElement.innerText = annotation.data.notes.replace(
            /\n/g,
            " "
        );
        inlineNotesTextElement.className = "text";
        inlineNotesTextElement.style.setProperty(
            "background",
            annotation.data.color,
            "important"
        );
        const textWidth = 300;
        inlineNotesTextElement.style.setProperty(
            "max-width",
            `${textWidth}px`,
            "important"
        );
        inlineNotesTextElement.style.color = pickBlackOrWhiteForeground(
            annotation.data.color
        );
        inlineNotesRootElement.innerHTML = `<span class="comments-svg" style="background-color: transparent;border-color:transparent"><span style="visibility: hidden;display: inline-block;white-space:nowrap;width: 0;">notes</span>${commentsSvg}</span>`;
        inlineNotesRootElement.style.backgroundColor = "transparent";
        inlineNotesRootElement.appendChild(inlineNotesTextElement);
        firstHighlightElement.prepend(inlineNotesRootElement);
        inlineNotesRootElement.getElementsByTagName("svg")[0].style.fill =
            annotation.data.color;

        const inlineNotesCaretElement = document.createElement("div");
        inlineNotesCaretElement.className = "caret";
        inlineNotesCaretElement.style.setProperty(
            "background",
            annotation.data.color,
            "important"
        );
        inlineNotesRootElement.appendChild(inlineNotesCaretElement);

        if (inlineNotesTextElement) {
            // prevent text from growing out of the screen bounds
            const clientRect = inlineNotesTextElement.getBoundingClientRect();
            const maxRight = document.documentElement.clientWidth;
            if (clientRect.right > maxRight) {
                const diff = maxRight - clientRect.right;
                inlineNotesTextElement.style.marginLeft = diff + "px";
            }
        }
    }
}

export const marker = new Marker({
    rootElement: document.body,
    eventHandler: {
        onHighlightClick: (context, element) => {
            setTimeout(() => {
                state.selectedAnnotationId = context.serializedRange.uid;
                const range = marker.deserializeRange(
                    convertAnnotationToSerializedRange(
                        state.annotations[state.selectedAnnotationId]
                    )
                );
                updatePopoverPosOnHighlightSelect(range.getBoundingClientRect());
                showEditAnnotationPopover();
            });
        },
        onHighlightHoverStateChange: (context, element, hovering) => {
            if (hovering) {
                const inlineNotesElement = document.getElementById(
                    "notes-" + context.serializedRange.uid
                );
                if (inlineNotesElement) {
                    inlineNotesElement.style.zIndex = "100";
                }
                element.style.backgroundColor =
                    state.annotations[context.serializedRange.uid].data.color + "44";
            } else {
                const inlineNotesElement = document.getElementById(
                    "notes-" + context.serializedRange.uid
                );
                if (inlineNotesElement) {
                    inlineNotesElement.style.zIndex = "";
                }
                context.marker.highlightPainter.paintHighlight(context, element);
            }
        },
    },
    highlightPainter: {
        paintHighlight: (context, element) => {
            element.style.textDecoration = "underline";
            element.style["text-decoration-thickness"] = "2px";
            const annotation = state.annotations[context.serializedRange.uid];
            element.style.textDecorationColor = annotation.data.color;
            element.style.backgroundColor = annotation.data.color + "22";
        },
        afterPaintHighlight: (context) => {
            paintNotes(context);
        },
    },
});

function clearInlineNotes(uid) {
    const originalNotesElement = document.getElementById("notes-" + uid);
    if (originalNotesElement) {
        originalNotesElement.parentElement.removeChild(originalNotesElement);
    }
}

export {clearInlineNotes, convertAnnotationToSerializedRange};
