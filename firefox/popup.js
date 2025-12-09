// popup.js
// 弹出页面脚本：展示标签页序号及标题，仅含音视频的标签页显示开关

const storageLocal = chrome.storage?.local;

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query(queryInfo, (tabs) => {
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

function storageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      storageLocal.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    if (chrome.scripting && chrome.scripting.executeScript) {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["content.js"],
        },
        () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        }
      );
      return;
    }
    if (chrome.tabs && chrome.tabs.executeScript) {
      chrome.tabs.executeScript(
        tabId,
        { file: "content.js" },
        () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        }
      );
      return;
    }
    reject(new Error("无法注入脚本：缺少可用的 API"));
  });
}

// 封装获取媒体存在性的函数，处理未注入错误
async function getTabMediaInfo(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "getStatus" }, async (resp) => {
      if (chrome.runtime.lastError) {
        // 未注入 content.js，则动态注入后重试
        try {
          await injectContentScript(tabId);
          chrome.tabs.sendMessage(tabId, { action: "getStatus" }, (resp2) => {
            if (chrome.runtime.lastError) return resolve({ hasMedia: false });
            resolve({ hasMedia: !!resp2.hasMedia });
          });
        } catch (e) {
          resolve({ hasMedia: false });
        }
      } else {
        resolve({ hasMedia: !!resp.hasMedia });
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const tabsContainer = document.getElementById("tabs");
  const errorBox = document.getElementById("error");
  const maskInput = document.getElementById("mask-selector");
  const maskCheckbox = document.getElementById("mask-enabled");
  tabsContainer.innerHTML = "<p>加载中...</p>";

  try {
    let tabs = await queryTabs({});
    if (!tabs || tabs.length === 0) {
      tabsContainer.innerHTML = "<p>未发现标签页。</p>";
      return;
    }

    const {
      checkedTabs = {},
      maskElementSelector = "",
      maskElementEnabled = false,
    } = await storageGet([
      "checkedTabs",
      "maskElementSelector",
      "maskElementEnabled",
    ]);

    if (maskInput) maskInput.value = maskElementSelector || "";
    if (maskCheckbox) maskCheckbox.checked = !!maskElementEnabled;

    let currentMaskSelector = maskElementSelector?.trim() || "";
    let currentMaskEnabled = !!maskElementEnabled;
    const persistMaskSettings = async (selectorValue, enabled) => {
      const normalizedSelector = (selectorValue || "").trim();
      if (
        normalizedSelector === currentMaskSelector &&
        enabled === currentMaskEnabled
      ) {
        return;
      }
      try {
        await storageSet({
          maskElementSelector: normalizedSelector,
          maskElementEnabled: enabled,
        });
        currentMaskSelector = normalizedSelector;
        currentMaskEnabled = enabled;
      } catch {
        errorBox.textContent = "遮罩设置保存失败，请重试。";
        errorBox.style.display = "block";
      }
    };

    if (maskInput) {
      maskInput.addEventListener("input", (e) => {
        const enabled =
          maskCheckbox && typeof maskCheckbox.checked === "boolean"
            ? maskCheckbox.checked
            : currentMaskEnabled;
        void persistMaskSettings(e.target.value, enabled);
      });
    }

    if (maskCheckbox) {
      maskCheckbox.addEventListener("change", (e) => {
        const selectorValue =
          maskInput && typeof maskInput.value === "string"
            ? maskInput.value
            : currentMaskSelector;
        void persistMaskSettings(selectorValue, e.target.checked);
      });
    }

    tabs.sort((a, b) => a.index - b.index);
    tabsContainer.innerHTML = "";

    for (let idx = 0; idx < tabs.length; idx++) {
      const tab = tabs[idx];
      const { hasMedia } = await getTabMediaInfo(tab.id);

      const div = document.createElement("div");
      div.className = "tab";

      // 左侧：序号 & 标题
      const left = document.createElement("div");
      left.className = "tab-left";
      const num = document.createElement("span");
      num.className = "tab-number";
      num.textContent = idx + 1;
      const info = document.createElement("div");
      info.className = "tab-info";
      info.textContent = tab.title || tab.url;
      left.append(num, info);

      // 右侧：仅有媒体时显示开关
      const right = document.createElement("div");
      right.className = "tab-right";
      if (hasMedia) {
        const label = document.createElement("label");
        label.className = "switch";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!checkedTabs[tab.id];
        const slider = document.createElement("span");
        slider.className = "slider";
        label.append(checkbox, slider);
        checkbox.addEventListener("change", async (e) => {
          try {
            await new Promise((res) =>
              chrome.runtime.sendMessage(
                {
                  action: "toggleTrack",
                  tabId: tab.id,
                  enable: e.target.checked,
                },
                res
              )
            );
            const newChecked = { ...checkedTabs };
            if (e.target.checked) newChecked[tab.id] = true;
            else delete newChecked[tab.id];
            await storageSet({ checkedTabs: newChecked });
          } catch {
            errorBox.textContent = "操作失败，请重试。";
            errorBox.style.display = "block";
          }
        });
        right.append(label);
      }

      div.append(left, right);
      tabsContainer.append(div);
    }
  } catch (err) {
    errorBox.textContent = "加载失败，请刷新。";
    errorBox.style.display = "block";
    tabsContainer.innerHTML = "";
  }
});
