import { useHistory } from "react-router-dom";
import React, { useState } from "react";
import axios from "axios";
import { NotelixChromeStorageKey, NotelixDefaultServer } from "../consts";
import { getMetaVersion } from "../../api/meta";

export const SetServer = () => {
  const history = useHistory();
  const [server, setServer] = useState(NotelixDefaultServer);
  return (
    <div>
      <h1>Setup</h1>
      <input
        value={server}
        placeholder={"Notelix Server Address"}
        onChange={(e) => {
          setServer(e.target.value);
        }}
      />

      <button
        onClick={() => {
          let _server = server.trim();
          if (_server.endsWith("/")) {
            _server = _server.substr(0, _server.length - 1);
          }

          getMetaVersion(_server)
            .then((response) => {
              if (!response.data.notelix) {
                throw "invalid server response";
              }

              chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
                value[NotelixChromeStorageKey] =
                  value[NotelixChromeStorageKey] || {};
                value[NotelixChromeStorageKey].notelixServer = _server;
                chrome.storage.sync.set(value, () => {
                  history.push("/login");
                });
              });
            })
            .catch(() => {
              alert("Failed to connect to server");
            });
        }}
      >
        OK
      </button>
    </div>
  );
};
