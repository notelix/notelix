import React from "react";
import ReactDOM from "react-dom";
import "./app/app.less";
import PasswordReset from "./app/components/PasswordReset";

ReactDOM.render(
  <div id="reset-password-container">
    <PasswordReset />
  </div>,
  document.getElementById("root")
);
