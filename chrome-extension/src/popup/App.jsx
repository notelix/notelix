import React from "react";

import { HashRouter, Route, Switch } from "react-router-dom";
import { LogIn } from "./pages/LogIn";
import { SignUp } from "./pages/SignUp";
import { UserInfo } from "./pages/UserInfo";
import { Index } from "./pages";

const App = () => {
  return (
    <div>
      <HashRouter>
      <Switch>
        <Route path="/signup">
          <SignUp />
        </Route>
        <Route path="/user-info">
          <UserInfo />
        </Route>
        <Route path="/login">
          <LogIn />
        </Route>
        <Route path="/">
          <Index />
        </Route>
      </Switch>
    </HashRouter>
    </div>
  );
};

export default App;
