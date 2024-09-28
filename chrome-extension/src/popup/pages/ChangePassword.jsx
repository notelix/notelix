import { useHistory } from "react-router-dom";
import React, { useState } from "react";
import { changePasswordRequest } from "../../api/user";

export const ChangePassword = () => {
  const history = useHistory();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatNewPassword, setRepeatNewPassword] = useState("");

  return (
    <div>
      <h1>Change Password</h1>
      <input
        value={oldPassword}
        type="password"
        placeholder={"Old Password"}
        onChange={(e) => {
          setOldPassword(e.target.value);
        }}
      />
      <input
        value={newPassword}
        type="password"
        placeholder={"New Password"}
        onChange={(e) => {
          setNewPassword(e.target.value);
        }}
      />
      <input
        value={repeatNewPassword}
        type="password"
        placeholder={"Repeat New Password"}
        onChange={(e) => {
          setRepeatNewPassword(e.target.value);
        }}
      />

      <button
        onClick={async () => {
          await changePasswordRequest();
        }}
      >
        Submit
      </button>
    </div>
  );
};
