import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { trySetAgentSyncParams } from "../../api/agent";
import { clearEncryptionKey, clearLegacyPassword } from "../../encryption";
import { clearUser, getServer, getUser } from "../../storage";

export const UserInfo = () => {
  const [notelixServer, setNotelixServer] = useState("");
  const [userInfo, setUserInfo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getUser().then(setUserInfo);
    getServer().then(setNotelixServer);
  }, []);

  if (!userInfo) {
    return <div />;
  }

  const changePassword = () => {
    navigate("/change-password");
  };

  const showApp = () => {
    window.open("/app.html");
  };

  const logout = async () => {
    if (!confirm("Do you want to logout?")) {
      return;
    }
    await clearEncryptionKey();
    await clearLegacyPassword();
    await clearUser();
    sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
    navigate("/");
    trySetAgentSyncParams();
  };

  return (
    <div>
      <div>Notelix Server: {notelixServer}</div>
      <div>
        Logged In as <b>{userInfo.name}</b>
      </div>

      <div style={{ marginTop: 6 }}>
        <a onClick={showApp}>App</a>
        <a style={{ marginLeft: 20 }} onClick={changePassword}>
          Change Password
        </a>
        <a style={{ marginLeft: 20 }} onClick={logout}>
          Logout
        </a>
      </div>
    </div>
  );
};
