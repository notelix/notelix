import { useHistory } from "react-router-dom";
import React, { useState } from "react";
import { NotelixChromeStorageKey } from "../../popup/consts";
import { getKey } from "../../encryption";
import { makeClientSideEncryptionParams } from "../../encryption/utils";
import { changePassword } from "../../api/user";
import { sendChromeCommandToEveryTab } from "../../utils/chromeCommand";
import { COMMAND_REFRESH_ANNOTATIONS } from "../../consts";
import './PasswordReset.css'; // Import the CSS file

export default class PasswordReset extends React.Component {

  state = {
    newPassword: "",
    repeatNewPassword: "",
  };

  render() {
    return (
      <div className="password-reset-container">
        <h1>Reset Password</h1>
        <input
          className="password-input"
          value={this.state.newPassword}
          type="password"
          placeholder={"New Password"}
          onChange={(e) => {
            this.setState({
              newPassword: e.target.value,
              repeatNewPassword: this.state.repeatNewPassword,
            });
          }}
        />
        <input
          className="password-input"
          value={this.state.repeatNewPassword}
          type="password"
          placeholder={"Repeat New Password"}
          onChange={(e) => {
            this.setState({
              newPassword: this.state.newPassword,
              repeatNewPassword: e.target.value,
            });
          }}
        />

        <button
          className="submit-button"
          disabled={!this.state.newPassword || !this.state.repeatNewPassword}
          onClick={async () => {
            if (this.state.newPassword !== this.state.repeatNewPassword) {
              alert("Passwords don't match");
              return;
            }

            getKey().then((key) => {
              const newClientSideEncryptionParams = key
                ? makeClientSideEncryptionParams(this.state.newPassword, { key })
                : null;
  
              changePassword({
                newClientSideEncryptionParams: newClientSideEncryptionParams,
                newPassword: this.state.newPassword,
              }).then(() => {
                alert("Password changed successfully");
                chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
                  delete value[NotelixChromeStorageKey].notelixUser;
                  delete value[NotelixChromeStorageKey].notelixPassword;
                  chrome.storage.sync.set(value, () => {
                    sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
                    history.push("/login");
                  });
                });
              });
            });
          }}
        >
          Submit
        </button>
      </div>
    );
  }
}
