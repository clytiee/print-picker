/* Print Picker — 点击工具栏图标时把选取脚本注入当前标签页 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  const url = tab.url || "";
  // chrome:// 、扩展商店等页面不允许注入
  if (!/^(http|https|file):/i.test(url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/picker.js"]
    });
  } catch (err) {
    console.warn("[Print Picker] 注入失败：", err);
  }
});
