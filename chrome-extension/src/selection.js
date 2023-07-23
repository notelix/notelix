import {
    hideAnnotatePopover,
    hideEditAnnotationPopover,
    showAnnotatePopover,
    updatePopoverPosOnSelectionChange,
} from "./dom";
import {isSelectionBackwards, selectionFocusRect, SelectionObserver,} from "./selection-observer";
import {state} from "./state";
import {isSiteUsable} from "./utils/isSiteUsable";

function isRangeInContentEditable(range) {
    let ptr = range.commonAncestorContainer;
    while (ptr) {
        if (ptr.isContentEditable) {
            return true;
        }
        ptr = ptr.parentElement;
    }
    return false;
}

const outOfAllowedRootElement =
    window.NotelixEmbeddedConfig &&
    window.NotelixEmbeddedConfig.rootElementClassName
        ? (range) => {
            let ptr = range.commonAncestorContainer;
            while (ptr) {
                if (
                    ptr.className &&
                    ptr.className.indexOf(
                        window.NotelixEmbeddedConfig.rootElementClassName
                    ) >= 0
                ) {
                    return false;
                }
                ptr = ptr.parentElement;
            }
            return true;
        }
        : () => false;

export function reactToSelection() {
    let callback = () => {
        const selection = document.getSelection();
        let range = null;
        try {
            range = selection.getRangeAt(0);
        } catch (e) {
        }

        if (
            !selection.toString() ||
            !selection.rangeCount ||
            selection.isCollapsed ||
            !range ||
            isRangeInContentEditable(range) ||
            outOfAllowedRootElement(range)
        ) {
            hideAnnotatePopover();
            hideEditAnnotationPopover();
        } else {
            hideEditAnnotationPopover();
            showAnnotatePopover();
        }
    };

    new SelectionObserver((range) => {
        callback();
    });
}

const selectionChangingCssClass = "selection-changing";
let lastSelectionChangeTime = 0;

function setSelectionChanging(changing) {
    isSiteUsable(() => {
        if (changing) {
            if (document.body.className.indexOf(selectionChangingCssClass) < 0) {
                document.body.className = document.body.className + " " + selectionChangingCssClass;
            }
        } else {
            document.body.className = document.body.className.replace(
                /\s*selection-changing\s*/g,
                ""
            );
        }
    });
}

const onSelectionChange = () => {
    isSiteUsable(() => {
        lastSelectionChangeTime = new Date();
        setSelectionChanging(true);

        setTimeout(() => {
            if (new Date() - lastSelectionChangeTime > 300) {
                setSelectionChanging(false);
            }
        }, 350);

        const selection = document.getSelection();
        let range = null;
        try {
            range = selection.getRangeAt(0);
        } catch (e) {
        }
        if (!range) {
            return;
        }

        const rect = selectionFocusRect(selection);
        if (rect) {
            updatePopoverPosOnSelectionChange(rect, isSelectionBackwards(selection));
            state.annotatePopoverDom.style.top = state.popoverPos.y + "px";
            state.annotatePopoverDom.style.left = state.popoverPos.x + "px";
        }
    });
};

document.addEventListener("selectstart", onSelectionChange);
document.addEventListener("selectstart", () => {
    hideAnnotatePopover();
});

document.addEventListener("selectionchange", onSelectionChange);
document.addEventListener("pointerup", () => {
    setSelectionChanging(false);
});
