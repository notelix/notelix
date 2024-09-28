import { useHistory } from "react-router-dom";
import React, { useState } from "react";
import { NotelixChromeStorageKey } from "../consts";
import { getKey } from "../../encryption";
import { makeClientSideEncryptionParams } from "../../encryption/utils";
import { changePassword, changePasswordRequest } from "../../api/user";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";

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
        // disabled={!oldPassword || !newPassword || !repeatNewPassword}
        onClick={async () => {
          // if (newPassword !== repeatNewPassword) {
          //   alert("passwords don't match");
          //   return;
          // }
          await changePasswordRequest();

          // getKey().then(async (key) => {
          //   const newClientSideEncryptionParams = key
          //     ? makeClientSideEncryptionParams(newPassword, { key })
          //     : null;
          //   await changePasswordRequest();
          //   // changePassword({
          //   //   newClientSideEncryptionParams,
          //   //   oldPassword,
          //   //   newPassword,
          //   // }).then(() => {
          //   //   alert("Password changed successfully");
          //   //   chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
          //   //     delete value[NotelixChromeStorageKey].notelixUser;
          //   //     delete value[NotelixChromeStorageKey].notelixPassword;
          //   //     chrome.storage.sync.set(value, () => {
          //   //       sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
          //   //       history.push("/login");
          //   //     });
          //   //   });
          //   // });
          // });
        }}
      >
        Submit
      </button>
    </div>
  );
};
