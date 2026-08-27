import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { trySetAgentSyncParams } from "../../api/agent";
import { clearEncryptionKey, clearLegacyPassword } from "../../encryption";
import { clearUser, getServer, getUser } from "../../storage";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { PopupLayout, PopupLoading } from "../components/PopupLayout";

export const UserInfo = () => {
  const [notelixServer, setNotelixServer] = useState("");
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getUser(), getServer()])
      .then(([user, server]) => {
        setUserInfo(user);
        setNotelixServer(server);
      })
      .catch((loadError) => setError(formatUiError(loadError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && !userInfo) {
      navigate("/login", { replace: true });
    }
  }, [loading, navigate, userInfo]);

  if (loading) return <PopupLoading label="Loading your workspace…" />;
  if (!userInfo) {
    return <PopupLoading label="Returning to sign in…" />;
  }

  const showApp = () => {
    window.open(chrome.runtime.getURL("app.html"), "_blank", "noopener");
  };

  const logout = async () => {
    setPending(true);
    setError("");
    try {
      await clearEncryptionKey();
      await clearLegacyPassword();
      await clearUser();
      sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
      await trySetAgentSyncParams();
      navigate("/login", { replace: true });
    } catch (logoutError) {
      setError(
        formatUiError(
          logoutError,
          "We couldn't finish signing out. Please try again.",
        ),
      );
      setConfirmLogout(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <PopupLayout
      footer={
        <>
          <Icon name="highlighter" size={12} /> Select text on any page to save
          your first highlight
        </>
      }
    >
      <div className="popup-profile">
        <span className="popup-avatar">
          {userInfo.name?.slice(0, 1) || "N"}
        </span>
        <div className="popup-profile__copy">
          <h1>{userInfo.name}</h1>
          <p>Connected and ready</p>
        </div>
      </div>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <button className="popup-primary-action" onClick={showApp} type="button">
        <span className="popup-primary-action__icon">
          <Icon name="bookOpen" size={19} />
        </span>
        <span className="popup-primary-action__copy">
          <strong>Open your library</strong>
          <span>Search, revisit, and organize every highlight.</span>
        </span>
        <Icon name="arrowUpRight" size={17} />
      </button>
      <div className="popup-menu">
        <button
          className="popup-menu__item"
          onClick={() => navigate("/change-password")}
          type="button"
        >
          <Icon name="lock" size={16} /> Security & password{" "}
          <Icon name="chevronRight" size={15} />
        </button>
        <button
          className="popup-menu__item"
          onClick={() => navigate("/set-server")}
          type="button"
        >
          <Icon name="server" size={16} /> Server settings{" "}
          <Icon name="chevronRight" size={15} />
        </button>
        <button
          className="popup-menu__item popup-menu__item--danger"
          onClick={() => setConfirmLogout(true)}
          type="button"
        >
          <Icon name="logOut" size={16} /> Sign out
        </button>
      </div>
      <div className="popup-tip">
        <span className="popup-tip__number">1</span>
        <p>
          <strong>Highlight anything.</strong> Select text, then choose a color.
          Click a saved highlight to add a private note.
        </p>
      </div>
      <div className="popup-server">
        <Icon name="server" size={14} />
        <span className="popup-server__address">{notelixServer}</span>
        {userInfo.client_side_encryption && (
          <span title="Client-side encryption enabled">
            <Icon name="lock" size={13} />
          </span>
        )}
      </div>
      <ConfirmDialog
        confirmLabel="Sign out"
        description="Your highlights remain safely stored. Local credentials and encryption material will be removed from this browser."
        onCancel={() => setConfirmLogout(false)}
        onConfirm={logout}
        open={confirmLogout}
        pending={pending}
        title="Sign out of Notelix?"
      />
    </PopupLayout>
  );
};
