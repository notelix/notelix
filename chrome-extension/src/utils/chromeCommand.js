export function sendChromeCommandToEveryTab(cmd) {
  chrome.tabs.query({ active: true }, function (tabs) {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        command: cmd,
      });
    });
  });
}
