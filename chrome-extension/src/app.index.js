import React from "react";
import ReactDOM from "react-dom";
import Search from "./app/components/Search";
import "./app/app.less";
import AnnotationsExplorer from "./app/components/AnnotationsExplorer";

ReactDOM.render(
  <div
    className="notelix-app-root"
    style={{ display: "flex", flexDirection: "column", height: "100vh" }}
  >
    <div className="navbar">
      <Search />
    </div>
    <div style={{ flexGrow: "1", overflowY: "auto" }}>
      <AnnotationsExplorer />
    </div>
  </div>,
  document.getElementById("root")
);
