import React from "react";

import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { LogIn } from "./pages/LogIn";
import { SetServer } from "./pages/SetServer";
import { SignUp } from "./pages/SignUp";
import { UserInfo } from "./pages/UserInfo";
import { Index } from "./pages/Index";
import { ChangePassword } from "./pages/ChangePassword";

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

const App = () => {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const storedTheme = localStorage.getItem("notelix-theme");
      document.documentElement.dataset.theme = ["light", "dark"].includes(
        storedTheme,
      )
        ? storedTheme
        : media.matches
          ? "dark"
          : "light";
    };
    applyTheme();
    media.addEventListener?.("change", applyTheme);
    return () => media.removeEventListener?.("change", applyTheme);
  }, []);

  return (
    <HashRouter>
      <ScrollToTop />
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
