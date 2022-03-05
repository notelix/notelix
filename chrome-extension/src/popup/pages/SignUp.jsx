import React, { useState } from "react";
import { signUp } from "../../api/user";
import { useHistory } from "react-router-dom";
import { makeClientSideEncryptionParams } from "../../encryption/utils";

export const SignUp = () => {
  const history = useHistory();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [enableClientSideEncryption, setEnableClientSideEncryption] =
    useState(false);
  const [repeatPassword, setRepeatPassword] = useState("");

  let submit = () => {
    if (password !== repeatPassword) {
      alert("passwords don't match");
      return;
    }

    let client_side_encryption = null;
    if (enableClientSideEncryption) {
      if (
        !confirm(
          "client-side encryption is enabled, you must remember your password, or else nobody will be able to access your data!"
        )
      ) {
        return;
      }

      if (
        !confirm(
          "With client-side encryption enabled, if you wish to use advanced features such as searching, you will need to run a local agent! (using docker-compose)"
        )
      ) {
        return;
      }

      client_side_encryption = makeClientSideEncryptionParams(password);
    }

    signUp({
      username,
      password,
      enableClientSideEncryption,
      client_side_encryption,
    }).then(() => {
      history.push("/login");
      alert("Sign up successful");
    });
  };

  return (
    <div>
      <h1>Sign Up</h1>
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
      <input
        type="password"
        placeholder={"repeat password"}
        value={repeatPassword}
        onChange={(e) => setRepeatPassword(e.target.value)}
      />

      <div className="float-right">
        <input
          type="checkbox"
          id="enableClientSideEncryption"
          checked={enableClientSideEncryption}
          onChange={(e) => setEnableClientSideEncryption(e.target.checked)}
        />
        <label className="label-inline" htmlFor="enableClientSideEncryption">
          Enable client-side encryption
          <span
            style={{
              cursor: "pointer",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              marginLeft: 6,
            }}
            onClick={(e) => {
              alert(
                "Enable client-side encryption\n\nWhen enabled, your data will be encrypted before it is transmitted to the server. Nobody (even the server admin) will be able to access your data without your password, you must remember your password."
              );
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            (help)
          </span>
        </label>
      </div>

      <button
        disabled={!username || !password || !repeatPassword}
        onClick={submit}
      >
        Submit
      </button>
    </div>
  );
};
