import { Link, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { login } from "../../api/user";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { trySetAgentSyncParams } from "../../api/agent";
import { ensureLocalEncryptionKey } from "../../encryption";
import { clearServer, getServer, setUser } from "../../storage";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { PopupLayout } from "../components/PopupLayout";
import { PasswordField } from "../components/PasswordField";

export const LogIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notelixServer, setNotelixServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getServer().then(setNotelixServer);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const resp = await login({ username: username.trim(), password });
      await ensureLocalEncryptionKey(resp, password);
      await setUser(resp);
      sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
      navigate("/");
      trySetAgentSyncParams();
    } catch (submitError) {
      setError(
        formatUiError(
          submitError,
          "We couldn't sign you in. Check your details and server connection.",
        ),
      );
    } finally {
      setPending(false);
    }
  };

  const changeServer = async () => {
    await clearServer();
    await trySetAgentSyncParams();
    navigate("/set-server");
  };

  return (
    <PopupLayout
      eyebrow="Welcome back"
      footer={
        <>
          <Icon name="lock" size={12} /> Credentials stay in this browser
          profile
        </>
      }
      title="Your highlights are waiting."
    >
      <div className="popup-server">
        <Icon name="server" size={15} />
        <span className="popup-server__address">
          {notelixServer || "Loading server…"}
        </span>
        <button className="nl-link-button" onClick={changeServer} type="button">
          Change
        </button>
      </div>
      {location.state?.message && (
        <StatusMessage tone="success">{location.state.message}</StatusMessage>
      )}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <form className="popup-form" onSubmit={submit}>
        <label className="nl-field" htmlFor="login-username">
          <span className="nl-field__label">Username</span>
          <span className="nl-field__control nl-field__control--icon">
            <Icon name="user" size={17} />
            <input
              autoComplete="username"
              autoFocus
              id="login-username"
              maxLength={255}
              placeholder="Your username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </span>
        </label>
        <PasswordField
          autoComplete="current-password"
          id="login-password"
          label="Password"
          maxLength={1024}
          placeholder="Your password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="popup-form__actions">
          <button
            className="nl-button"
            disabled={!username.trim() || !password || pending}
            type="submit"
          >
            {pending && <span className="nl-spinner nl-spinner--small" />}
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <span>
            New to Notelix? <Link to="/signup">Create account</Link>
          </span>
        </div>
      </form>
    </PopupLayout>
  );
};
