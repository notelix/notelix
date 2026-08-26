import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { NotelixChromeStorageKey, NotelixDefaultServer } from "../consts";

export const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
      value[NotelixChromeStorageKey] = value[NotelixChromeStorageKey] || {};
      const { notelixServer, notelixUser } = value[NotelixChromeStorageKey];
      if (!notelixServer) {
        value[NotelixChromeStorageKey].notelixServer = NotelixDefaultServer;
        chrome.storage.sync.set(value, () => {
          navigate("/login");
        });
      } else if (!notelixUser) {
        navigate("/login");
      } else {
        navigate("/user-info");
      }
    });
  }, [navigate]);

  return null;
};
