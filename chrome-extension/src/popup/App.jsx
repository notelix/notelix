import React from "react";

import { HashRouter, Route, Routes } from "react-router-dom";
import { LogIn } from "./pages/LogIn";
import { SetServer } from "./pages/SetServer";
import { SignUp } from "./pages/SignUp";
import { UserInfo } from "./pages/UserInfo";
import { Index } from "./pages/Index";
import { ChangePassword } from "./pages/ChangePassword";

const App = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/set-server" element={<SetServer />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/user-info" element={<UserInfo />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/" element={<Index />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
