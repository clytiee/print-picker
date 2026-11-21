/* Print Picker 选项页 */
const DEFAULTS = { divPageBreak: false };

const input = document.getElementById("divPageBreak");
const hint = document.getElementById("hint");
let hintTimer = 0;

function flash(text) {
  hint.textContent = text;
  hint.classList.add("show");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove("show"), 1600);
}

chrome.storage.sync.get(DEFAULTS, (value) => {
  input.checked = value.divPageBreak === true;
});

input.addEventListener("change", () => {
  const enabled = input.checked;
  chrome.storage.sync.set({ divPageBreak: enabled }, () => {
    if (chrome.runtime.lastError) {
      flash("保存失败：" + chrome.runtime.lastError.message);
      return;
    }
    flash(enabled ? "已保存：分页已开启" : "已保存：分页已关闭");
  });
});
