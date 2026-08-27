import React, { useEffect, useRef, useState } from "react";
import {
  deleteAnnotation,
  findAnnotations,
  search,
} from "../../api/annotations";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { AnnotationCard } from "./AnnotationCard";
import { EmptyState, LoadingRows } from "./EmptyState";
import "./Search.less";

export default function Search({ onDeleted }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);
  const trimmedQuery = query.trim();
  const open = !!trimmedQuery;

  useEffect(() => {
    const focusSearch = (event) => {
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && open) {
        setQuery("");
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [open]);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await search(trimmedQuery);
        if (active) setResults(response.data?.results?.hits || []);
      } catch (searchError) {
        if (active) {
          setResults([]);
          setError(
            formatUiError(searchError, "Search is temporarily unavailable."),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const result = await findAnnotations({
        groupBy: "",
        selectors: { id: deleteTarget.id },
      });
      const annotation = result.data.list[0];
      if (!annotation) throw new Error("Highlight no longer exists.");
      await deleteAnnotation(annotation);
      setResults((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      onDeleted?.();
    } catch (deleteError) {
      setError(
        formatUiError(deleteError, "We couldn't delete this highlight."),
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="app-search">
      <div className="app-search__control">
        <Icon name="search" size={18} />
        <input
          aria-controls="notelix-search-results"
          aria-expanded={open}
          aria-label="Search highlights and notes"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search highlights and notes"
          ref={inputRef}
          role="combobox"
          type="search"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear search"
            onClick={() => setQuery("")}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
      {open && (
        <div
          className="app-search-overlay"
          id="notelix-search-results"
          role="dialog"
          aria-label="Search results"
        >
          <div
            className="app-search-overlay__backdrop"
            onClick={() => setQuery("")}
          />
          <section className="app-search-results">
            <header>
              <div>
                <span>Search results</span>
                <h2>
                  {trimmedQuery.length < 2
                    ? "Keep typing…"
                    : `“${trimmedQuery}”`}
                </h2>
              </div>
              {!loading && trimmedQuery.length >= 2 && (
                <strong>{results.length} found</strong>
              )}
            </header>
            {error && <StatusMessage tone="danger">{error}</StatusMessage>}
            {trimmedQuery.length < 2 ? (
              <EmptyState
                description="Enter at least two characters to search passages, notes, and page titles."
                icon="search"
                title="Search your reading memory"
              />
            ) : loading ? (
              <LoadingRows count={4} />
            ) : !results.length ? (
              <EmptyState
                description="Try another phrase or a word from the note you wrote."
                icon="search"
                title="No matching highlights"
              />
            ) : (
              <div className="app-search-results__grid">
                {results.map((hit) => (
                  <AnnotationCard
                    annotation={hit}
                    key={hit.id}
                    onDelete={setDeleteTarget}
                    searchResult
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog
        confirmLabel="Delete highlight"
        description="This removes the highlight and its note from every synced browser. This action cannot be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        open={!!deleteTarget}
        pending={deleting}
        title="Delete this highlight?"
      />
    </div>
  );
}
