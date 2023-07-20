import React from "react";

import {HashRouter, Route, Switch} from "react-router-dom";
import {LogIn} from "./pages/LogIn";
import {SetServer} from "./pages/SetServer";
import {SignUp} from "./pages/SignUp";
import {UserInfo} from "./pages/UserInfo";
import {Index} from "./pages/Index";
import {ChangePassword} from "./pages/ChangePassword";

const App = () => {
    return (
        <HashRouter>
            <Switch>
                <Route path="/set-server">
                    <SetServer/>
                </Route>
                <Route path="/signup">
                    <SignUp/>
                </Route>
                <Route path="/user-info">
                    <UserInfo/>
                </Route>
                <Route path="/login">
                    <LogIn/>
                </Route>
                <Route path="/change-password">
                    <ChangePassword/>
                </Route>
                <Route path="/">
                    <Index/>
                </Route>
            </Switch>
        </HashRouter>
    );
};

export default App;
