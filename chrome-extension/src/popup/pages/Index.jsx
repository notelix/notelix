import {useHistory} from "react-router-dom";
import {useEffect} from "react";
import {NotelixChromeStorageKey, NotelixDefaultServer} from "../consts";

export const Index = () => {
    const history = useHistory();
    useEffect(() => {
        chrome.storage.sync.get(NotelixChromeStorageKey, (value) => {
            value[NotelixChromeStorageKey] = value[NotelixChromeStorageKey] || {};
            const {notelixServer, notelixUser} = value[NotelixChromeStorageKey];
            if (!notelixServer) {
                value[NotelixChromeStorageKey].notelixServer = NotelixDefaultServer;
                chrome.storage.sync.set(value, () => {
                    history.push("/login");
                });
            } else if (!notelixUser) {
                history.push("/login");
            } else {
                history.push("/user-info");
            }
        });
    }, []);

    return null;
};
