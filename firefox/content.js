// content.js
// 页面脚本：响应 popup 的查询，返回是否存在音视频（hasMedia）及播放状态（playing）

(function () {
  const extensionRuntime =
    (typeof chrome !== "undefined" && chrome.runtime) ||
    (typeof browser !== "undefined" && browser.runtime);

  if (!extensionRuntime) {
    console.error("无法访问扩展运行时，content.js 未初始化。");
    return;
  }

  function getMediaInfo() {
    const elements = document.querySelectorAll("audio, video");
    const hasMedia = elements.length > 0;
    let playing = false;
    elements.forEach((media) => {
      if (!media.paused && !media.muted) playing = true;
    });
    return { hasMedia, playing };
  }

  function safeSendMessage(payload) {
    try {
      const result = extensionRuntime.sendMessage(payload);
      if (result && typeof result.catch === "function") {
        result.catch((err) => {
          console.error("发送消息失败:", err);
        });
      }
    } catch (e) {
      console.error("发送消息异常:", e);
    }
  }

  // 监听状态查询
  extensionRuntime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getStatus") {
      try {
        sendResponse(getMediaInfo());
      } catch (e) {
        console.error("获取媒体信息异常:", e);
        sendResponse({ hasMedia: false, playing: false, error: e.message });
      }
    }
    return true;
  });

  // 周期性向后台汇报播放状态
  setInterval(() => {
    try {
      const info = getMediaInfo();
      safeSendMessage(info);
    } catch (e) {
      console.error("监测媒体播放异常:", e);
    }
  }, 1000);
})();
