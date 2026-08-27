import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deleteAnnotation, findAnnotations } from "../../api/annotations";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { AnnotationCard } from "./AnnotationCard";
import { EmptyState, LoadingRows } from "./EmptyState";
import "./AnnotationsExplorer.less";

function labelFor(value, fallback) {
  return value?.trim?.() || fallback;
}

function countFor(item) {
  const value = Number(item?.count || 0);
  return Number.isFinite(value) ? value : 0;
}

export default function AnnotationsExplorer({ refreshToken = 0 }) {
  const [sites, setSites] = useState([]);
  const [pages, setPages] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedPage, setSelectedPage] = useState("");
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const totalHighlights = useMemo(
    () => sites.reduce((total, site) => total + countFor(site), 0),
    [sites],
  );

  const loadAnnotations = useCallback(async (host, title) => {
    setLoadingAnnotations(true);
    setError("");
    try {
      const result = await findAnnotations({
        selectors: { host, title },
        groupBy: "",
      });
      setAnnotations(result.data.list || []);
    } catch (loadError) {
      setAnnotations([]);
      setError(
        formatUiError(loadError, "We couldn't load highlights for this page."),
      );
    } finally {
      setLoadingAnnotations(false);
    }
  }, []);

  const selectPage = useCallback(
    (host, title) => {
      setSelectedPage(title);
      loadAnnotations(host, title);
    },
    [loadAnnotations],
  );

  const loadPages = useCallback(
    async (host, preferredPage = "") => {
      setSelectedSite(host);
      setSelectedPage("");
      setPages([]);
      setAnnotations([]);
      setLoadingPages(true);
      setError("");
      try {
        const result = await findAnnotations({
          selectors: { host },
          groupBy: "title",
        });
        const nextPages = result.data.list || [];
        setPages(nextPages);
        const nextPage =
          nextPages.find((item) => item.title === preferredPage)?.title ??
          nextPages[0]?.title;
        if (nextPage !== undefined) selectPage(host, nextPage);
      } catch (loadError) {
        setError(
          formatUiError(loadError, "We couldn't load pages from this site."),
        );
      } finally {
        setLoadingPages(false);
      }
    },
    [selectPage],
  );

  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    setError("");
    try {
      const result = await findAnnotations({ selectors: {}, groupBy: "host" });
      const nextSites = result.data.list || [];
      setSites(nextSites);
      if (!nextSites.length) {
        setSelectedSite("");
        setSelectedPage("");
        setPages([]);
        setAnnotations([]);
        return;
      }
      const nextSite =
        nextSites.find((item) => item.host === selectedSite)?.host ??
        nextSites[0].host;
      await loadPages(nextSite, selectedPage);
    } catch (loadError) {
      setSites([]);
      setError(formatUiError(loadError, "We couldn't load your library."));
    } finally {
      setLoadingSites(false);
    }
  }, [loadPages, selectedPage, selectedSite]);

  useEffect(() => {
    loadSites();
    // refreshToken intentionally triggers a complete data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAnnotation(deleteTarget);
      setAnnotations((current) =>
        current.filter((item) => item.uid !== deleteTarget.uid),
      );
      setSites((current) =>
        current
          .map((item) =>
            item.host === selectedSite
              ? { ...item, count: Math.max(0, countFor(item) - 1) }
              : item,
          )
          .filter((item) => countFor(item) > 0),
      );
      setPages((current) =>
        current
          .map((item) =>
            item.title === selectedPage
              ? { ...item, count: Math.max(0, countFor(item) - 1) }
              : item,
          )
          .filter((item) => countFor(item) > 0),
      );
      setDeleteTarget(null);
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
    <section className="library" aria-label="Highlight library">
      <div className="library__summary">
        <div>
          <span className="library__eyebrow">Library</span>
          <h1>Your reading memory</h1>
          <p>
            {totalHighlights
              ? `${totalHighlights.toLocaleString()} saved highlight${totalHighlights === 1 ? "" : "s"} across ${sites.length} site${sites.length === 1 ? "" : "s"}.`
              : "Everything you highlight will collect here."}
          </p>
        </div>
        <button
          className="nl-button nl-button--secondary nl-button--small"
          disabled={loadingSites}
          onClick={loadSites}
          type="button"
        >
          <Icon
            className={loadingSites ? "is-spinning" : ""}
            name="refresh"
            size={15}
          />{" "}
          Refresh
        </button>
      </div>

      {error && <StatusMessage tone="danger">{error}</StatusMessage>}

      {loadingSites ? (
        <LoadingRows count={5} />
      ) : !sites.length ? (
        <EmptyState
          description="Select text on any webpage, then choose a highlight color. Your saved passage will appear here automatically."
          icon="highlighter"
          title="Your library is ready"
        />
      ) : (
        <div className="library-browser">
          <aside
            className="library-column library-column--sites"
            aria-label="Sites"
          >
            <div className="library-column__header">
              <span>Sites</span>
              <strong>{sites.length}</strong>
            </div>
            <label className="library-mobile-select">
              <span>Site</span>
              <select
                value={selectedSite}
                onChange={(event) => loadPages(event.target.value)}
              >
                {sites.map((item) => (
                  <option key={item.host || "none"} value={item.host}>
                    {labelFor(item.host, "Unknown site")} · {countFor(item)}
                  </option>
                ))}
              </select>
            </label>
            <div className="library-list">
              {sites.map((item) => (
                <button
                  aria-pressed={selectedSite === item.host}
                  className={`library-list__item ${selectedSite === item.host ? "is-active" : ""}`}
                  key={item.host || "none"}
                  onClick={() => loadPages(item.host)}
                  type="button"
                >
                  <span className="library-list__avatar">
                    {labelFor(item.host, "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="library-list__copy">
                    <strong>{labelFor(item.host, "Unknown site")}</strong>
                    <small>{countFor(item)} highlights</small>
                  </span>
                  <Icon name="chevronRight" size={15} />
                </button>
              ))}
            </div>
          </aside>

          <aside
            className="library-column library-column--pages"
            aria-label="Pages"
          >
            <div className="library-column__header">
              <span>Pages</span>
              <strong>{pages.length}</strong>
            </div>
            {loadingPages ? (
              <LoadingRows count={4} />
            ) : (
              <>
                <label className="library-mobile-select">
                  <span>Page</span>
                  <select
                    value={selectedPage}
                    onChange={(event) =>
                      selectPage(selectedSite, event.target.value)
                    }
                  >
                    {pages.map((item, index) => (
                      <option key={`${item.title}-${index}`} value={item.title}>
                        {labelFor(item.title, "Untitled page")} ·{" "}
                        {countFor(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="library-list">
                  {pages.map((item, index) => (
                    <button
                      aria-pressed={selectedPage === item.title}
                      className={`library-list__item library-list__item--page ${selectedPage === item.title ? "is-active" : ""}`}
                      key={`${item.title}-${index}`}
                      onClick={() => selectPage(selectedSite, item.title)}
                      type="button"
                    >
                      <span className="library-list__copy">
                        <strong>{labelFor(item.title, "Untitled page")}</strong>
                        <small>{countFor(item)} highlights</small>
                      </span>
                      <Icon name="chevronRight" size={15} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          <div className="library-results" aria-live="polite">
            <div className="library-results__header">
              <div>
                <span>Selected page</span>
                <h2>{labelFor(selectedPage, "Choose a page")}</h2>
              </div>
              {!!annotations.length && (
                <span>
                  {annotations.length} result
                  {annotations.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {loadingAnnotations ? (
              <LoadingRows count={3} />
            ) : !annotations.length ? (
              <EmptyState
                description="Choose another page or add a highlight while reading."
                title="No highlights on this page"
              />
            ) : (
              <div className="annotation-grid">
                {annotations.map((item) => (
                  <AnnotationCard
                    annotation={item}
                    key={item.uid || item.id}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </div>
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
    </section>
  );
}

export { countFor, labelFor };
