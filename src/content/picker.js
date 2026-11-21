/* Print Picker — 元素选取 + 只打印选中元素
 * 交互：鼠标悬停高亮 → ↑ 选上级 / ↓ 回下层 → Enter 打印 / Esc 取消
 */
(() => {
  "use strict";

  const KEY = "__printPicker__";
  // 再次触发 = 关闭当前选取
  if (window[KEY]) {
    try { window[KEY].cancel(); } catch (e) { /* ignore */ }
    return;
  }

  const HIDE_ATTR = "data-pp-hide";
  const CHAIN_ATTR = "data-pp-chain";
  const PAGE_ATTR = "data-pp-page";     // 需要分页的并列子节点
  const PBLOCK_ATTR = "data-pp-pblock"; // 行内元素转块级，否则分页不生效
  const BLOCK_ATTR = "data-pp-block";   // flex/grid 容器转块级
  const ROOT_ATTR = "data-pp-root";     // 选中元素本身
  const PRINT_STYLE_ID = "pp-print-style";
  const CURSOR_STYLE_ID = "pp-cursor-style";

  const UI_CSS = `
    .pp-box {
      position: absolute; top: 0; left: 0; box-sizing: border-box;
      border: 2px solid #2F6FEB; border-radius: 3px;
      background: rgba(47, 111, 235, .08);
      pointer-events: none; display: none;
    }
    .pp-tag {
      position: absolute; top: 0; left: 0; box-sizing: border-box;
      display: none; align-items: center; gap: 6px; max-width: 70vw;
      padding: 4px 9px; border-radius: 4px;
      background: #2F6FEB; color: #fff;
      font: 12px/1.35 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      white-space: nowrap; overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, .18);
    }
    .pp-brand { font-weight: 600; flex: none; }
    .pp-name { min-width: 0; opacity: .92; overflow: hidden; text-overflow: ellipsis; }
    .pp-dim { flex: none; opacity: .72; }
    .pp-bar {
      position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
      padding: 8px 16px; border-radius: 999px;
      background: rgba(17, 24, 39, .93); color: #f3f4f6;
      font: 12.5px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      box-shadow: 0 8px 22px rgba(0, 0, 0, .28); white-space: nowrap;
    }
    .pp-key {
      display: inline-block; padding: 0 5px; margin: 0 2px 0 10px;
      border-radius: 4px; background: rgba(255, 255, 255, .14); font-weight: 600;
    }
  `;

  const PRINT_CSS = `
    @page { margin: 12mm; }
    @media print {
      [${HIDE_ATTR}] { display: none !important; }
      /* 清掉页面底色（含渐变/背景图），避免连带打印出整页灰底 */
      html, body {
        background: #fff !important;
        background-color: #fff !important;
        background-image: none !important;
      }
      /* 只保留选中元素：祖先链还原为正常文档流，避免被固定定位、滚动容器裁切 */
      [${CHAIN_ATTR}] {
        overflow: visible !important;
        height: auto !important;
        max-height: none !important;
        position: static !important;
        float: none !important;
        transform: none !important;
      }
      [${CHAIN_ATTR}], [${CHAIN_ATTR}] * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* 并列一级子节点：从第二个起各自另起一页 */
      [${PAGE_ATTR}] { break-before: page !important; page-break-before: always !important; }
      [${PBLOCK_ATTR}] { display: block !important; }
      [${BLOCK_ATTR}] { display: block !important; }
      /* 只去掉选中元素自身的投影，内部卡片的阴影保留 */
      [${ROOT_ATTR}] { box-shadow: none !important; }
    }
  `;

  const listeners = [];
  let target = null;   // 指针最初命中的元素
  let chain = [];      // target 及以上的祖先链
  let index = 0;       // 当前指向 chain 的位置
  let locked = false;  // 按过 ↑ 后暂停跟随鼠标
  let alive = true;
  let rafId = 0;

  /* ---------- 浮层 ---------- */

  const host = document.createElement("div");
  host.id = "pp-root";
  host.style.cssText =
    "all:initial;position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    `<style>${UI_CSS}</style>` +
    `<div class="pp-box"></div>` +
    `<div class="pp-tag"><span class="pp-brand">Print Picker</span><span class="pp-name"></span><span class="pp-dim"></span></div>` +
    `<div class="pp-bar"><span class="pp-key">↑</span>选上级<span class="pp-key">↓</span>回下层` +
    `<span class="pp-key">Enter</span>打印<span class="pp-key">Esc</span>取消</div>`;

  const boxEl = shadow.querySelector(".pp-box");
  const tagEl = shadow.querySelector(".pp-tag");
  const nameEl = shadow.querySelector(".pp-name");
  const dimEl = shadow.querySelector(".pp-dim");

  /* ---------- 工具 ---------- */

  function on(type, fn, opts) {
    window.addEventListener(type, fn, opts || true);
    listeners.push([type, fn, opts || true]);
  }

  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function isOurs(node) {
    return !node || node === host || node === document.documentElement;
  }

  function buildChain(el) {
    const out = [];
    let n = el;
    while (n && n !== document.documentElement) {
      out.push(n);
      n = n.parentElement;
    }
    return out;
  }

  function describe(el) {
    if (el === document.body) return "body";
    const tag = (el.tagName || "?").toLowerCase();
    const id = el.id ? "#" + el.id : "";
    const raw = typeof el.className === "string"
      ? el.className
      : (el.getAttribute && el.getAttribute("class")) || "";
    const names = raw.trim().split(/\s+/).filter((c) => c && !c.startsWith("pp-")).slice(0, 2);
    return tag + id + (names.length ? "." + names.join(".") : "");
  }

  /* ---------- 绘制 ---------- */

  function paint() {
    const el = chain[index];
    if (!alive || !el || !el.isConnected) {
      boxEl.style.display = "none";
      tagEl.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();

    boxEl.style.display = "block";
    boxEl.style.transform = `translate(${Math.round(r.left)}px,${Math.round(r.top)}px)`;
    boxEl.style.width = Math.round(Math.max(0, r.width)) + "px";
    boxEl.style.height = Math.round(Math.max(0, r.height)) + "px";

    nameEl.textContent = describe(el);
    dimEl.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    tagEl.style.display = "flex";

    const tagW = tagEl.offsetWidth || 200;
    const tagH = tagEl.offsetHeight || 20;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - tagW - 8));
    let top = r.top - tagH - 6;
    if (top < 4) top = r.top + 4;
    top = Math.min(Math.max(4, top), window.innerHeight - tagH - 4);
    tagEl.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  }

  function queuePaint() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      paint();
    });
  }

  function setTarget(el) {
    if (!el || el === target) return;
    target = el;
    chain = buildChain(el);
    index = 0;
    locked = false;
    queuePaint();
  }

  /* ---------- 交互 ---------- */

  function onMouseMove(e) {
    if (locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    setTarget(el);
  }

  function onClick(e) {
    block(e);
    if (!locked) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== host) setTarget(el);
    }
    confirm();
  }

  function onKeyDown(e) {
    const k = e.key;
    if (k === "ArrowUp") {
      block(e);
      if (!chain.length) return;
      index = Math.min(index + 1, chain.length - 1);
      locked = true;
      queuePaint();
    } else if (k === "ArrowDown") {
      block(e);
      if (!chain.length) return;
      index = Math.max(index - 1, 0);
      if (index === 0) locked = false;
      queuePaint();
    } else if (k === "Enter") {
      block(e);
      confirm();
    } else if (k === "Escape") {
      block(e);
      cancel();
    }
  }

  on("mousemove", onMouseMove);
  on("click", onClick);
  on("mousedown", block);
  on("mouseup", block);
  on("pointerdown", block);
  on("dblclick", block);
  on("auxclick", block);
  on("contextmenu", block);
  on("dragstart", block);
  on("selectstart", block);
  on("keydown", onKeyDown);
  on("scroll", queuePaint, true);
  on("resize", queuePaint, true);

  const cursorStyle = document.createElement("style");
  cursorStyle.id = CURSOR_STYLE_ID;
  cursorStyle.textContent =
    "html, html * { cursor: crosshair !important; -webkit-user-select: none !important; user-select: none !important; }";
  document.documentElement.appendChild(cursorStyle);
  document.documentElement.appendChild(host);

  /* ---------- 收尾 ---------- */

  function detach() {
    if (!alive) return;
    alive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    for (const [type, fn, opts] of listeners) window.removeEventListener(type, fn, opts);
    listeners.length = 0;
    host.remove();
    const cs = document.getElementById(CURSOR_STYLE_ID);
    if (cs) cs.remove();
  }

  function cancel() {
    detach();
    delete window[KEY];
  }

  /* ---------- 打印 ---------- */

  function cleanupPrint() {
    const style = document.getElementById(PRINT_STYLE_ID);
    if (style) style.remove();
    document.querySelectorAll(`[${HIDE_ATTR}]`).forEach((n) => n.removeAttribute(HIDE_ATTR));
    document.querySelectorAll(`[${CHAIN_ATTR}]`).forEach((n) => n.removeAttribute(CHAIN_ATTR));
    document.querySelectorAll(`[${PAGE_ATTR}]`).forEach((n) => n.removeAttribute(PAGE_ATTR));
    document.querySelectorAll(`[${PBLOCK_ATTR}]`).forEach((n) => n.removeAttribute(PBLOCK_ATTR));
    document.querySelectorAll(`[${BLOCK_ATTR}]`).forEach((n) => n.removeAttribute(BLOCK_ATTR));
    document.querySelectorAll(`[${ROOT_ATTR}]`).forEach((n) => n.removeAttribute(ROOT_ATTR));
  }

  function printOnly(el) {
    const scroll = { x: window.scrollX, y: window.scrollY };

    // 逐级隐藏兄弟节点：只剩下 el 这一支
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib !== node) sib.setAttribute(HIDE_ATTR, "1");
      }
      node = node.parentElement;
    }
    // body 之外的兄弟节点（保留 head 等）
    for (const sib of Array.from(document.documentElement.children)) {
      if (sib === document.body) continue;
      if (["HEAD", "STYLE", "LINK", "SCRIPT"].includes(sib.tagName)) continue;
      sib.setAttribute(HIDE_ATTR, "1");
    }

    // 标记祖先链，打印时恢复文档流
    let n = el;
    while (n && n !== document.documentElement) {
      n.setAttribute(CHAIN_ATTR, "1");
      n = n.parentElement;
    }
    el.setAttribute(ROOT_ATTR, "1");

    // 一级子节点若是并列的若干 div，则从第二个起各自另起一页
    const kids = Array.from(el.children).filter((c) => c.tagName === "DIV");
    if (kids.length > 1) {
      // 父容器是 flex/grid 时，分页规则会被忽略，打印时退回块级
      if (/flex|grid/.test(getComputedStyle(el).display)) el.setAttribute(BLOCK_ATTR, "1");

      kids.slice(1).forEach((kid) => {
        kid.setAttribute(PAGE_ATTR, "1");
        // 行内级子节点撑不开分页，先转成块级
        const d = getComputedStyle(kid).display;
        if (/^(inline|inline-block|inline-flex|inline-grid|inline-table|table-cell)$/.test(d)) {
          kid.setAttribute(PBLOCK_ATTR, "1");
        }
      });
    }

    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = PRINT_CSS;
    document.documentElement.appendChild(style);

    window.scrollTo(0, 0);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", onFocus);
      cleanupPrint();
      window.scrollTo(scroll.x, scroll.y);
    };
    const onFocus = () => setTimeout(finish, 300);

    window.addEventListener("afterprint", finish);
    window.addEventListener("focus", onFocus);
    setTimeout(finish, 90000); // 兜底

    window.print();
  }

  function confirm() {
    const el = chain[index];
    if (!el || !el.isConnected) {
      cancel();
      return;
    }
    detach();
    delete window[KEY];
    printOnly(el);
  }

  window[KEY] = { cancel };
})();
