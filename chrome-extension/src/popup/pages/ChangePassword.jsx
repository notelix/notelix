import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearEncryptionKey,
  clearLegacyPassword,
  getKey,
} from "../../encryption";
import { makePasswordChangeClientSideEncryptionParams } from "../../encryption/utils";
import { changePassword } from "../../api/user";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { clearUser } from "../../storage";
import { resetAgentData } from "../../api/agentControl";
import { Icon } from "../../ui/Icon";
import { StatusMessage, formatUiError } from "../../ui/StatusMessage";
import { PopupLayout } from "../components/PopupLayout";
import { PasswordField } from "../components/PasswordField";

export const ChangePassword = () => {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== repeatNewPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setPending(true);
    setError("");
    try {
      const key = await getKey();
      const newClientSideEncryptionParams =
        makePasswordChangeClientSideEncryptionParams(newPassword, key);
      await changePassword({
        newClientSideEncryptionParams,
        oldPassword,
        newPassword,
      });
      await clearEncryptionKey();
      await clearLegacyPassword();
      await clearUser();
      await resetAgentData().catch(() => undefined);
      sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
      navigate("/login", {
        replace: true,
        state: { message: "Password updated. Sign in again on this browser." },
      });
    } catch (submitError) {
      setError(
        formatUiError(
          submitError,
          "We couldn't update your password. Check your current password and try again.",
        ),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <PopupLayout
      backTo="/user-info"
      eyebrow="Account security"
      footer={
        <>
          <Icon name="lock" size={12} /> Changing your password signs out every
          active session
        </>
      }
      title="Update your password."
    >
      <StatusMessage>
        If client-side encryption is enabled, your local key will be safely
        rewrapped with the new password.
      </StatusMessage>
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <form className="popup-form" onSubmit={submit}>
        <PasswordField
          autoComplete="current-password"
          autoFocus
          id="current-password"
          label="Current password"
          maxLength={1024}
          placeholder="Current password"
          required
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
        />
        <PasswordField
          autoComplete="new-password"
          hint="At least 8 characters; use a unique passphrase."
          id="new-password"
          label="New password"
          maxLength={1024}
          minLength={8}
          placeholder="New password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <PasswordField
          autoComplete="new-password"
          id="repeat-new-password"
          label="Repeat new password"
          maxLength={1024}
          placeholder="Repeat new password"
          required
          value={repeatNewPassword}
          onChange={(event) => setRepeatNewPassword(event.target.value)}
        />
        <button
          className="nl-button nl-button--wide"
          disabled={
            !oldPassword ||
            newPassword.length < 8 ||
            !repeatNewPassword ||
            pending
          }
          type="submit"
        >
          {pending && <span className="nl-spinner nl-spinner--small" />}
          {pending ? "Updating password…" : "Update password"}
        </button>
      </form>
    </PopupLayout>
  );
};
