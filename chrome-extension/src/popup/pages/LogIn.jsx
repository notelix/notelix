import { Link, useHistory } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { NotelixChromeStorageKey } from "../consts";
import { login } from "../../api/user";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { trySetEdgeSyncParams } from "../../api/edge";

export const LogIn = () => {
  const history = useHistory();
  const [notelixServer, setNotelixServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      setNotelixServer(value[NotelixChromeStorageKey].notelixServer);
    });
  }, []);

  const submit = () => {
    login({ username, password }).then((resp) => {
      chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
        value[NotelixChromeStorageKey] = value[NotelixChromeStorageKey] || {};
        value[NotelixChromeStorageKey].notelixUser = resp;
        value[NotelixChromeStorageKey].notelixPassword = password;
        chrome.storage.sync.set(value, () => {
          sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
          alert("Login successful");
          history.push("/");
          trySetEdgeSyncParams();
        });
      });
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
            chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
              delete value[NotelixChromeStorageKey].notelixServer;
              chrome.storage.sync.set(value, () => {
                history.push("/set-server");
              });
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
      <Link to="/signup">
        <a style={{ marginLeft: 12 }}>Sign Up</a>
      </Link>
    </div>
  );
};
