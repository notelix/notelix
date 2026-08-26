import { useNavigate } from "react-router-dom";
import React, { useState } from "react";
import { NotelixDefaultServer } from "../consts";
import { getMetaVersion } from "../../api/meta";
import { setServer as saveServer } from "../../storage";

export const SetServer = () => {
  const navigate = useNavigate();
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

              saveServer(_server).then(() => navigate("/login"));
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
