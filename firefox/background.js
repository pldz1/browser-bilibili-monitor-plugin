// background.js
// 后台脚本：定时检查已跟踪标签页的媒体播放并恢复
let trackedTabs = new Set();
const CHECK_INTERVAL = 1000; // 检查间隔：1秒
let maskElementSelector = "";
let maskElementEnabled = false;
const storageLocal = chrome.storage?.local;

function getAllTabs() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabs || []);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      storageLocal.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result || {});
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function runResumeInTab(tabId) {
  const selectorForCode =
    maskElementEnabled && typeof maskElementSelector === "string"
      ? maskElementSelector.trim()
      : "";
  const code = `(function () {
    try {
      const selector = ${JSON.stringify(selectorForCode)};
      const maskEnabled = ${maskElementEnabled ? "true" : "false"};
      document.querySelectorAll("audio, video").forEach((media) => {
        if (!media.paused) return;
        if (maskEnabled && selector) {
          try {
            const mask = document.querySelector(selector);
            if (mask) {
              mask.style.display = "none";
            }
          } catch (err) {
            console.error("遮罩元素查询失败:", err);
          }
        }
        try {
          const playResult = media.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch((err) => console.error("播放恢复失败:", err));
          }
        } catch (err) {
          console.error("播放恢复失败:", err);
        }
      });
    } catch (e) {
      console.error("注入脚本异常:", e);
    }
  })();`;

  return new Promise((resolve) => {
    if (chrome.tabs && chrome.tabs.executeScript) {
      chrome.tabs.executeScript(
        tabId,
        { code },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "脚本注入失败:",
              chrome.runtime.lastError.message
            );
          }
          resolve();
        }
      );
      return;
    }
    console.error("脚本注入失败: 缺少 executeScript API");
    resolve();
  });
}

// 定时检查已跟踪的标签页
function checkAllTabs() {
  getAllTabs()
    .then((tabs) => {
      tabs
        .filter(
          (tab) => trackedTabs.has(tab.id) && /^https?:\/\//.test(tab.url)
        )
        .sort((a, b) => a.index - b.index)
        .forEach((tab) => {
          void runResumeInTab(tab.id);
        });
    })
    .catch((e) => {
      console.error("检查标签页异常:", e);
    });
}

// 接收来自 popup 的消息，更新跟踪集合
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === "toggleTrack" && typeof message.tabId === "number") {
      if (message.enable) trackedTabs.add(message.tabId);
      else trackedTabs.delete(message.tabId);
      sendResponse({ success: true });
    }
  } catch (e) {
    console.error("消息处理异常:", e);
    sendResponse({ success: false, error: e.message });
  }
  return true;
});

// 启动定时任务
setInterval(checkAllTabs, CHECK_INTERVAL);

async function loadMaskSettings() {
  try {
    const result = await storageGet([
      "maskElementSelector",
      "maskElementEnabled",
    ]);
    maskElementSelector = (result.maskElementSelector || "").trim();
    maskElementEnabled = !!result.maskElementEnabled;
  } catch (e) {
    console.error("遮罩设置读取失败:", e);
    maskElementSelector = "";
    maskElementEnabled = false;
  }
}

loadMaskSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.prototype.hasOwnProperty.call(changes, "maskElementSelector")) {
    maskElementSelector = (
      changes.maskElementSelector.newValue || ""
    ).trim();
  }
  if (Object.prototype.hasOwnProperty.call(changes, "maskElementEnabled")) {
    maskElementEnabled = !!changes.maskElementEnabled.newValue;
  }
});
