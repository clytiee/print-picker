# Print Picker

选取网页里的任意元素，只把选中的那块交给浏览器打印（Ctrl/⌘+P → 目标选「另存为 PDF」即可导出 PDF）。

## 安装

1. 打开 `chrome://extensions`（Edge 用 `edge://extensions`），开启「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本目录 `print-picker`。
3. 想在内网/本地 `file://` 页面上用，需在扩展详情里打开「允许访问文件网址」。

## 用法

1. 打开目标页面，点工具栏的 Print Picker 图标，进入选取模式（页面变十字光标）。
2. 移动鼠标，蓝色框就是待打印区域；蓝色标签显示 `Print Picker · 元素名 · 宽 × 高`。
3. 按 **↑** 上选父级（可连续按，直到 `body`），按 **↓** 逐层退回。
4. 回车或鼠标左键确认 → 直接唤起浏览器打印对话框，只输出选中元素。
5. **Esc** 取消；选取模式下再点一次图标也是取消。

## 结构

```
manifest.json
icons/                   16/32/48/128 图标
LICENSE                  PolyForm Noncommercial 1.0.0
src/background.js        点击图标 → 向当前标签页注入选取脚本
src/content/picker.js    选取浮层 + 打印隔离逻辑（单文件，无外部依赖）
```

## 实现要点

- 浮层放在 Shadow DOM 里，且 `pointer-events: none`，不影响 `elementFromPoint` 命中页面的真实元素，也不会被站点样式污染。
- 打印时不给选中元素套克隆，而是**逐级隐藏兄弟节点**（`data-pp-hide` + `@media print { display:none !important }`），并给祖先链（`data-pp-chain`）还原 `position: static / overflow: visible / height: auto`，避免元素被固定定位或滚动容器裁成半页。
- 加了 `print-color-adjust: exact`，背景色、底纹按原样打印。
- 打印时清空 `html` / `body` 的底色（连带背景图、渐变），避免整页灰底被一起打印；只去掉选中元素自身的 `box-shadow`，内部卡片阴影保留。
- 选中元素的一级子节点若是并列的若干 `div`，从第二个起自动加分页（`break-before: page`），首个留在第一页；父容器是 flex/grid（会忽略分页规则）或子节点是行内级时，打印时临时转成块级让分页生效。
- 打印结束后（`afterprint` / 窗口重新获得焦点）移除临时样式并恢复滚动位置。

## 已知限制

- 只处理主框架，iframe 内的元素不在选取范围。
- 选中元素依赖父级布局时（如 flex 定宽卡片），打印宽度可能和屏幕不完全一致，可用 ↑ 多选一层。
- 元素内部若由 JS 分页/懒加载渲染，打印时不会补充未加载的部分。
