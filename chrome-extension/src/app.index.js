import React from "react";
import ReactDOM from "react-dom";
import "toastr/toastr.less";
import Search from "./app/components/Search";

ReactDOM.render(
  <div>
    <h1>Search</h1>
    <Search />
  </div>,
  document.getElementById("root")
);
