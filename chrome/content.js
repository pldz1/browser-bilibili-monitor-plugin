// content.js
// 页面脚本：响应 popup 的查询，返回是否存在音视频（hasMedia）及播放状态（playing）

(function () {
  // 检测页面是否有音视频正在播放
  function getMediaInfo() {
    const elements = document.querySelectorAll("audio, video");
    const hasMedia = elements.length > 0;
    let playing = false;

    elements.forEach((media) => {
      if (!media.paused && !media.muted) {
        playing = true;
      }
    });

    return { hasMedia, playing };
  }

  // 监听 popup 发来的状态查询请求
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getStatus") {
      try {
        sendResponse(getMediaInfo());
      } catch (e) {
        console.error("获取媒体信息异常:", e);
        sendResponse({ hasMedia: false, playing: false, error: e.message });
      }
    }
    return true; // 保持异步响应
  });

  // 封装安全发送消息函数
  function safeSendMessage(data) {
    try {
      chrome.runtime.sendMessage(data);
    } catch (e) {
      if (
        e &&
        e.message &&
        e.message.includes("Extension context invalidated")
      ) {
        console.warn("扩展上下文已失效，停止发送消息");
        clearInterval(intervalId);
      } else {
        console.error("监测媒体播放异常:", e);
      }
    }
  }

  // 定时上报播放状态
  const intervalId = setInterval(() => {
    const info = getMediaInfo();
    safeSendMessage(info);
  }, 1000);

  // 页面卸载时清理定时器
  window.addEventListener("unload", () => {
    clearInterval(intervalId);
  });
})();
