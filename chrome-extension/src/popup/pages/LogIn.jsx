import { Link, useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { login } from "../../api/user";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { trySetAgentSyncParams } from "../../api/agent";
import { ensureLocalEncryptionKey } from "../../encryption";
import {
  clearServer,
  getServer,
  setUser,
} from "../../storage";

export const LogIn = () => {
  const navigate = useNavigate();
  const [notelixServer, setNotelixServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    getServer().then(setNotelixServer);
  }, []);

  const submit = () => {
    login({ username, password }).then(async (resp) => {
      await ensureLocalEncryptionKey(resp, password);
      await setUser(resp);
      sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
      alert("Login successful");
      navigate("/");
      trySetAgentSyncParams();
    });
  };

  return (
    <div>
      <h1>Login</h1>

      <div>
        {notelixServer}{" "}
        <a
          onClick={(e) => {
            e.preventDefault();

            if (!confirm("Do you want to change to another Notelix server?")) {
              return;
            }
            clearServer().then(async () => {
              await trySetAgentSyncParams();
              navigate("/set-server");
            });
          }}
          style={{ float: "right", marginBottom: 8 }}
        >
          Change Server
        </a>
      </div>
      <input
        type="text"
        placeholder={"username"}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder={"password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button disabled={!username || !password} onClick={submit}>
        Log In
      </button>
      <Link to="/signup" style={{ marginLeft: 12 }}>
        Sign Up
      </Link>
    </div>
  );
};
