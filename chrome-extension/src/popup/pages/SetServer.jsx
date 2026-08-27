import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NotelixDefaultServer } from "../consts";
import { getMetaVersion } from "../../api/meta";
import { getServer as getConfiguredServer } from "../../api/common";
import { getUser, setServer as saveServer } from "../../storage";
import { trySetAgentSyncParams } from "../../api/agent";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { PopupLayout } from "../components/PopupLayout";
import { normalizeServer, validateServer } from "../validation";

export const SetServer = () => {
  const navigate = useNavigate();
  const [server, setServer] = useState(NotelixDefaultServer);
  const [currentServer, setCurrentServer] = useState("");
  const [existingUser, setExistingUser] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getConfiguredServer(), getUser()]).then(
      ([configuredServer, user]) => {
        setServer(configuredServer);
        setCurrentServer(normalizeServer(configuredServer));
        setExistingUser(user);
      },
    );
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    const normalizedServer = normalizeServer(server);
    const validationError = validateServer(normalizedServer);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await getMetaVersion(normalizedServer);
      if (!response.data.notelix)
        throw new Error(
          "This address did not identify itself as a Notelix server.",
        );
      await saveServer(normalizedServer);
      await trySetAgentSyncParams();
      navigate(
        existingUser && normalizedServer === currentServer ? "/" : "/login",
        {
          replace: true,
        },
      );
    } catch (submitError) {
      setError(
        formatUiError(
          submitError,
          "We couldn't connect to a Notelix server at this address.",
        ),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <PopupLayout
      backTo={existingUser ? "/user-info" : undefined}
      eyebrow="First step"
      footer={
        <>
          <Icon name="shield" size={12} /> You can use the hosted demo or
          connect your own server
        </>
      }
      title="Choose where your notes live."
    >
      <StatusMessage title="Self-hosting friendly">
        Notelix stores highlights on the server you choose. Remote servers
        require HTTPS; local development may use HTTP.
      </StatusMessage>
      {existingUser && normalizeServer(server) !== currentServer && (
        <StatusMessage tone="warning" title="Switching libraries">
          Connecting another server signs you out here. Your existing highlights
          remain on the current server.
        </StatusMessage>
      )}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <form className="popup-form" onSubmit={submit}>
        <label className="nl-field" htmlFor="server-address">
          <span className="nl-field__label">Notelix server</span>
          <span className="nl-field__control nl-field__control--icon">
            <Icon name="globe" size={17} />
            <input
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              id="server-address"
              inputMode="url"
              placeholder="https://notes.example.com"
              required
              spellCheck="false"
              value={server}
              onChange={(event) => setServer(event.target.value)}
            />
          </span>
          <span className="nl-field__hint">
            We’ll verify the server before saving it.
          </span>
        </label>
        <button
          className="nl-button nl-button--wide"
          disabled={!server.trim() || pending}
          type="submit"
        >
          {pending && <span className="nl-spinner nl-spinner--small" />}
          {pending ? "Checking server…" : "Connect server"}
          {!pending && <Icon name="chevronRight" size={16} />}
        </button>
      </form>
    </PopupLayout>
  );
};
