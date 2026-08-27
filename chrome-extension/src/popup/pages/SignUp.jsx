import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "../../api/user";
import { makeClientSideEncryptionParams } from "../../encryption/utils";
import { NotelixDefaultServer } from "../consts";
import { getServer } from "../../api/common";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { PopupLayout } from "../components/PopupLayout";
import { PasswordField } from "../components/PasswordField";
import { passwordScore } from "../validation";

export const SignUp = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [enableClientSideEncryption, setEnableClientSideEncryption] =
    useState(false);
  const [repeatPassword, setRepeatPassword] = useState("");
  const [understandsEncryption, setUnderstandsEncryption] = useState(false);
  const [server, setServer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const score = useMemo(() => passwordScore(password), [password]);

  useEffect(() => {
    getServer().then(setServer);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== repeatPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (enableClientSideEncryption && !understandsEncryption) {
      setError(
        "Confirm that you understand the encryption recovery requirement.",
      );
      return;
    }

    setPending(true);
    setError("");
    try {
      const client_side_encryption = enableClientSideEncryption
        ? makeClientSideEncryptionParams(password)
        : null;
      await signUp({
        username: username.trim(),
        password,
        enableClientSideEncryption,
        client_side_encryption,
      });
      navigate("/login", {
        replace: true,
        state: { message: "Account created. Sign in to start highlighting." },
      });
    } catch (submitError) {
      setError(
        formatUiError(
          submitError,
          "We couldn't create your account. Please try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <PopupLayout
      backTo="/login"
      eyebrow="Create account"
      footer={
        <>
          <Icon name="shield" size={12} /> You choose where your highlight data
          is stored
        </>
      }
      title="Build a private reading memory."
    >
      {server === NotelixDefaultServer && (
        <StatusMessage tone="warning" title="Evaluation server">
          The public server is for trying Notelix and may be reset. Self-host
          before storing important highlights.
        </StatusMessage>
      )}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <form className="popup-form" onSubmit={submit}>
        <label className="nl-field" htmlFor="signup-username">
          <span className="nl-field__label">Username</span>
          <span className="nl-field__control nl-field__control--icon">
            <Icon name="user" size={17} />
            <input
              autoComplete="username"
              autoFocus
              id="signup-username"
              maxLength={255}
              placeholder="Choose a username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </span>
        </label>
        <PasswordField
          autoComplete="new-password"
          hint="At least 8 characters. A longer, unique passphrase is best."
          id="signup-password"
          label="Password"
          maxLength={1024}
          minLength={8}
          placeholder="Create a password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div
          aria-label={`Password strength ${score} of 4`}
          className="popup-password-meter"
          data-score={score}
        >
          <span />
          <span />
          <span />
          <span />
        </div>
        <PasswordField
          autoComplete="new-password"
          id="signup-repeat-password"
          label="Repeat password"
          maxLength={1024}
          placeholder="Repeat your password"
          required
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
        />
        <div className="popup-switch-card">
          <label className="popup-switch-row">
            <input
              checked={enableClientSideEncryption}
              onChange={(event) => {
                setEnableClientSideEncryption(event.target.checked);
                if (!event.target.checked) setUnderstandsEncryption(false);
              }}
              type="checkbox"
            />
            <span className="popup-switch" />
            <span className="popup-switch-copy">
              <strong>Client-side encryption</strong>
              <span>
                Encrypt content before it leaves this browser. Search requires
                the optional local agent.
              </span>
            </span>
          </label>
          {enableClientSideEncryption && (
            <>
              <StatusMessage tone="warning" title="No password recovery">
                Nobody—including your server administrator—can restore encrypted
                data if you forget this password.
              </StatusMessage>
              <label className="popup-acknowledgement">
                <input
                  checked={understandsEncryption}
                  onChange={(event) =>
                    setUnderstandsEncryption(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>I understand and will store this password safely.</span>
              </label>
            </>
          )}
        </div>
        <button
          className="nl-button nl-button--wide"
          disabled={
            !username.trim() ||
            password.length < 8 ||
            !repeatPassword ||
            pending ||
            (enableClientSideEncryption && !understandsEncryption)
          }
          type="submit"
        >
          {pending && <span className="nl-spinner nl-spinner--small" />}
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </PopupLayout>
  );
};
