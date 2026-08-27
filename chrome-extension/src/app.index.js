import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Search from "./app/components/Search";
import AnnotationsExplorer from "./app/components/AnnotationsExplorer";
import { Brand } from "./ui/Brand";
import { Icon } from "./ui/Icon";
import { getServer, getUser } from "./storage";
import "./app/app.less";

function initialTheme() {
  const stored = localStorage.getItem("notelix-theme");
  if (["light", "dark"].includes(stored)) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function App() {
  const [theme, setTheme] = useState(initialTheme);
  const [user, setUser] = useState(null);
  const [server, setServer] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("notelix-theme", theme);
  }, [theme]);

  useEffect(() => {
    Promise.all([getUser(), getServer()])
      .then(([nextUser, nextServer]) => {
        setUser(nextUser);
        setServer(nextServer);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const openSettings = () => {
    window.open(
      chrome.runtime.getURL("extension-options.html#/user-info"),
      "_blank",
      "noopener",
    );
  };

  if (authLoading) {
    return (
      <div className="app-auth-state" role="status">
        <Brand subtitle="Reading workspace" />
        <span className="nl-spinner" />
        <p>Opening your library…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-auth-state">
        <Brand subtitle="Reading workspace" />
        <span className="app-auth-state__icon">
          <Icon name="lock" size={23} />
        </span>
        <h1>Sign in to open your library.</h1>
        <p>
          Your account keeps highlights separated and synced with the server you
          choose.
        </p>
        <button
          className="nl-button"
          onClick={() =>
            window.open(
              chrome.runtime.getURL("extension-options.html#/login"),
              "_blank",
              "noopener",
            )
          }
          type="button"
        >
          Open Notelix sign in <Icon name="arrowUpRight" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand subtitle="Reading workspace" />
        <nav aria-label="Primary navigation" className="app-nav">
          <button
            aria-current="page"
            className="app-nav__item is-active"
            type="button"
          >
            <Icon name="bookOpen" size={18} /> Library
          </button>
        </nav>
        <div className="app-sidebar__guide">
          <span>
            <Icon name="sparkles" size={17} />
          </span>
          <strong>Capture an idea</strong>
          <p>
            Select text on any webpage and choose a color. It appears here
            automatically.
          </p>
        </div>
        <div className="app-sidebar__server">
          <span className="app-status-dot" />
          <span>
            <strong>Connected</strong>
            <small title={server}>{server || "Loading server…"}</small>
          </span>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__mobile-brand">
            <Brand compact />
          </div>
          <Search onDeleted={() => setRefreshToken((value) => value + 1)} />
          <div className="app-topbar__actions">
            <button
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
              className="nl-button nl-button--secondary nl-button--icon"
              onClick={() =>
                setTheme((value) => (value === "dark" ? "light" : "dark"))
              }
              title={`Use ${theme === "dark" ? "light" : "dark"} theme`}
              type="button"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            </button>
            <button
              className="app-account"
              onClick={openSettings}
              title="Open account settings"
              type="button"
            >
              <span>{user?.name?.slice(0, 1) || "N"}</span>
              <span className="app-account__copy">
                <strong>{user?.name || "Notelix user"}</strong>
                <small>Account settings</small>
              </span>
              <Icon name="settings" size={16} />
            </button>
          </div>
        </header>
        <AnnotationsExplorer refreshToken={refreshToken} />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

export { App, initialTheme };
