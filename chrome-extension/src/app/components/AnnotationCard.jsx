import React from "react";
import { Icon } from "../../ui/Icon";
import { SafeHighlight } from "./SafeHighlight";

export function getAnnotationView(annotation, searchResult = false) {
  const data = searchResult ? annotation : annotation?.data || {};
  return {
    color: data.color || "#f4c95d",
    host: annotation?.host || safeHostname(annotation?.url),
    id: annotation?.id,
    notes: data.notes || "",
    text: data.text || "Untitled highlight",
    textAfter: data.textAfter || "",
    textBefore: data.textBefore || "",
    title: annotation?.title || annotation?.host || "Untitled page",
    uid: annotation?.uid,
    updatedAt: annotation?.updated_at || annotation?.created_at,
    url: safeAnnotationUrl(annotation?.url),
    formatted: searchResult ? annotation?._formatted || {} : null,
  };
}

export function safeAnnotationUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export function openAnnotation(view) {
  if (!view.url) return;
  const target = view.id
    ? `${view.url.split("#")[0]}#notelix:scroll:annotation_id:${view.id}`
    : view.url;
  window.open(target, "_blank", "noopener,noreferrer");
}

function ContextText({ view }) {
  if (view.formatted) {
    return (
      <>
        {view.textBefore}
        <mark style={{ "--annotation-color": view.color }}>
          <SafeHighlight value={view.formatted.text || view.text} />
        </mark>
        {view.textAfter}
      </>
    );
  }
  return (
    <>
      {view.textBefore}
      <mark style={{ "--annotation-color": view.color }}>{view.text}</mark>
      {view.textAfter}
    </>
  );
}

export function AnnotationCard({ annotation, onDelete, searchResult = false }) {
  const view = getAnnotationView(annotation, searchResult);
  const domainInitial = (view.host || view.title || "N")
    .slice(0, 1)
    .toUpperCase();
  return (
    <article
      className="annotation-card"
      style={{ "--annotation-color": view.color }}
    >
      <button
        aria-label={`Open highlight from ${view.title}`}
        className="annotation-card__open"
        disabled={!view.url}
        onClick={() => openAnnotation(view)}
        type="button"
      >
        <span className="annotation-card__source-icon">{domainInitial}</span>
        <span className="annotation-card__source-copy">
          <strong>{view.title}</strong>
          <span>{view.host || "Local document"}</span>
        </span>
        <Icon name="arrowUpRight" size={16} />
      </button>
      <blockquote className="annotation-card__quote">
        <ContextText view={view} />
      </blockquote>
      {view.notes && (
        <div className="annotation-card__note">
          <Icon name="note" size={15} />
          <span>
            {view.formatted ? (
              <SafeHighlight value={view.formatted.notes || view.notes} />
            ) : (
              view.notes
            )}
          </span>
        </div>
      )}
      <footer className="annotation-card__footer">
        <span className="annotation-card__color">
          <i /> Highlight
        </span>
        <button
          aria-label={`Delete highlight from ${view.title}`}
          className="annotation-card__delete"
          onClick={() => onDelete(annotation)}
          type="button"
        >
          <Icon name="trash" size={15} /> Delete
        </button>
      </footer>
    </article>
  );
}
