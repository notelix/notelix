import { getNormalizedUrl } from "./utils/getNormalizedUrl";
import { state } from "./state";
import { marker } from "./marker";
import { queryAnnotationsByUrl, saveAnnotation } from "./api/annotations";

function scrollToAnnotationIfNeeded() {
  const match = (window.location.hash || "").match(
    /#notelix:scroll:annotation_id:(\d+)/
  );
  if (!match) {
    return;
  }

  const annotationId = +match[1];
  const annotationUid = Object.keys(state.annotations).filter(
    (x) => state.annotations[x].id === annotationId
  )[0];
  if (!annotationUid) {
    return;
  }

  const element = Array.from(
    document.getElementsByTagName("web-marker-highlight")
  ).filter(
    (element) => element.getAttribute("highlight-id") === annotationUid
  )[0];
  if (!element) {
    return;
  }

  window.scrollTo({
    top: element.getBoundingClientRect().y + window.scrollY - 60,
    left: 0,
    behavior: "smooth",
  });
}

export function loadAllAnnotationsData() {
  let startTime = 0;
  let failureCount = 0;
  return queryAnnotationsByUrl(getNormalizedUrl(), {
    onDataReceivedCallback: () => {
      startTime = +new Date();
    },
  }).then((list) => {
    list
      .sort((a, b) => b.data.text.length - a.data.text.length)
      .map((item) => {
        state.annotations[item.uid] = item;

        try {
          marker.paint(state.annotations[item.uid]);
        } catch (e) {
          failureCount++;
          console.warn(e);
          retryPaintMarker(0, item.uid);
        }
      });
    const endTime = +new Date();
    console.log(
      `[Notelix]: loaded ${list.length} marks in ${
        endTime - startTime
      }ms, ${failureCount} failed`
    );
    scrollToAnnotationIfNeeded();
  });
}

export function doSaveAnnotation(annotation) {
  return saveAnnotation({
    ...annotation,
    url: getNormalizedUrl(),
    notes: annotation.notes || "",
    range: undefined,
  });
}

function retryPaintMarker(retryCount, uid) {
  setTimeout(() => {
    try {
      marker.paint(state.annotations[uid]);
    } catch (e) {
      if (retryCount < 10) {
        retryPaintMarker(retryCount + 1, uid);
      } else {
        // give up
        delete state.annotations[uid];
      }
    }
  }, (retryCount * 0.5 + 1) * (1 + Math.random()) * 1000);
}
