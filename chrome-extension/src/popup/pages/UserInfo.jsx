import React, {useEffect, useState} from "react";
import {NotelixChromeStorageKey} from "../consts";
import {useHistory} from "react-router-dom";
import {COMMAND_REFRESH_ANNOTATIONS} from "../../consts";
import {sendChromeCommandToEveryTab} from "../../utils/chromeCommand";

export const UserInfo = () => {
    const [notelixServer, setNotelixServer] = useState("");
    const [userInfo, setUserInfo] = useState(null);
    const history = useHistory();

    useEffect(() => {
        chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
            setUserInfo(value[NotelixChromeStorageKey].notelixUser);
            setNotelixServer(value[NotelixChromeStorageKey].notelixServer);
        });
    }, []);

    if (!userInfo) {
        return <div/>;
    }

    const changePassword = () => {
        history.push("/change-password");
    };

    const showApp = () => {
        window.open("/app.html");
    };

    const logout = () => {
        if (!confirm("Do you want to logout?")) {
            return;
        }
        chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
            delete value[NotelixChromeStorageKey].notelixUser;
            delete value[NotelixChromeStorageKey].notelixPassword;
            chrome.storage.sync.set(value, () => {
                sendChromeCommandToEveryTab(COMMAND_REFRESH_ANNOTATIONS);
                history.push("/");
                // trySetAgentSyncParams();
            });
        });
    };

    return (
        <div>
            <div>Notelix Server: {notelixServer}</div>
            <div>
                Logged In as <b>{userInfo.name}</b>
            </div>

            <div style={{marginTop: 6}}>
                <a onClick={showApp}>App</a>
                <a style={{marginLeft: 20}} onClick={changePassword}>
                    Change Password
                </a>
                <a style={{marginLeft: 20}} onClick={logout}>
                    Logout
                </a>
            </div>
        </div>
    );
};
