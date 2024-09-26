import React from "react";
import ReactDOM from "react-dom";
import Search from "./app/components/Search";
import "./app/app.less";
import AnnotationsExplorer from "./app/components/AnnotationsExplorer";
import PasswordReset from "./app/components/PasswordReset";

ReactDOM.render(
  <div id="reset-password-container">
    <PasswordReset />
  </div>,
  document.getElementById("root")
);
