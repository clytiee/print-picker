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
      border: 2px dashed #2F6FEB; border-radius: 3px;
      background: rgba(47, 111, 235, .06);
      pointer-events: none; display: none;
    }
    .pp-sel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; }
    .pp-selbox {
      position: absolute; top: 0; left: 0; box-sizing: border-box;
      border: 2px solid #2F6FEB; border-radius: 3px;
      background: rgba(47, 111, 235, .13);
      pointer-events: none;
    }
    .pp-badge {
      position: absolute; top: -10px; left: -10px; box-sizing: border-box;
      min-width: 18px; height: 18px; padding: 0 3px;
      border-radius: 9px; background: #1f4fd0; color: #fff;
      font: 600 11px/18px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      text-align: center;
    }
    /* 每个选中块右上角的上下级切换按钮 */
    .pp-nav {
      position: absolute; top: -10px; right: -10px;
      display: flex; gap: 3px; pointer-events: auto; z-index: 3;
    }
    .pp-navbtn {
      all: unset; box-sizing: border-box; display: block; width: 18px; height: 18px;
      border-radius: 4px; background: #1f4fd0; color: #fff;
      font: 700 12px/18px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      text-align: center; cursor: pointer; user-select: none;
      pointer-events: auto;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .2);
    }
    .pp-navbtn:hover { background: #2F6FEB; }
    .pp-navbtn[data-disabled] { opacity: .4; cursor: default; }
    .pp-navbtn.pp-delbtn { background: #ef9a97; color: #fff; }
    .pp-navbtn.pp-delbtn:hover { background: #f4aeab; }
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
    /* 选择器输入条 */
    .pp-inputbar {
      position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
      display: none; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 8px;
      background: rgba(17, 24, 39, .95); color: #f3f4f6;
      font: 12.5px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      box-shadow: 0 8px 22px rgba(0, 0, 0, .28); white-space: nowrap;
      pointer-events: auto;
    }
    .pp-input {
      all: unset; box-sizing: border-box; display: block;
      width: 320px; max-width: 56vw; padding: 5px 9px;
      border: 1.5px solid #2F6FEB; border-radius: 5px;
      background: #fff; color: #111827; cursor: text; user-select: text;
      font: 12.5px/1.5 ui-monospace, "Cascadia Code", Consolas, monospace;
    }
    .pp-input.pp-bad { border-color: #e5534b; }
    .pp-input::placeholder { color: #9aa3ae; }
    .pp-hint { flex: none; opacity: .85; }
    .pp-hint.pp-err { color: #ffb4ae; }
  `;

  const PRINT_CSS = `
    @page { margin: 12mm; }
    @media print {
      [${HIDE_ATTR}] { display: none !important; }
      /* 兜底：任何残留的选取浮层都不进入打印 */
      #pp-root { display: none !important; }
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
    `<div class="pp-sel"></div>` +
    `<div class="pp-box"></div>` +
    `<div class="pp-tag"><span class="pp-brand">Print Picker</span><span class="pp-name"></span><span class="pp-dim"></span></div>` +
    `<div class="pp-bar"><span class="pp-key">Ctrl</span>点击多选<span class="pp-key">↑</span>` +
    `<span class="pp-key">Tab</span>选上级<span class="pp-key">↓</span>回下层` +
    `<span class="pp-key">/</span>选择器<span class="pp-key">Enter</span>打印` +
    `<span class="pp-key">Esc</span>取消</div>` +
    `<div class="pp-inputbar">` +
    `<input class="pp-input" type="text" spellcheck="false" autocomplete="off" ` +
    `placeholder="CSS 选择器，如 main .card">` +
    `<span class="pp-hint"></span></div>`;

  const selLayer = shadow.querySelector(".pp-sel");
  const boxEl = shadow.querySelector(".pp-box");
  const tagEl = shadow.querySelector(".pp-tag");
  const barEl = shadow.querySelector(".pp-bar");
  const inputBarEl = shadow.querySelector(".pp-inputbar");
  const inputEl = shadow.querySelector(".pp-input");
  const hintEl = shadow.querySelector(".pp-hint");
  const nameEl = shadow.querySelector(".pp-name");
  const dimEl = shadow.querySelector(".pp-dim");
  const selections = []; // [{ el, box, badge }]

  /* ---------- 工具 ---------- */

  // 选择器输入框是否打开
  let selectorOpen = false;

  // 打印态 = 已有选中项，且已经松开 Ctrl/⌘
  let ctrlHeld = false;
  function inPrintMode() {
    return selections.length > 0 && !ctrlHeld;
  }

  // 打印态光标：换成打印机光标，提示「点一下就打」
  let printCursorUrl = "";
  try {
    printCursorUrl = chrome.runtime.getURL("icons/print32.png");
  } catch (e) { /* 扩展上下文失效时退回默认光标 */ }

  function applyCursor() {
    let cursor = "crosshair";
    if (selectorOpen) cursor = "default";
    else if (inPrintMode() && printCursorUrl) cursor = `url("${printCursorUrl}") 16 16, pointer`;
    cursorStyle.textContent =
      `html, html * { cursor: ${cursor} !important; ` +
      `-webkit-user-select: none !important; user-select: none !important; }`;
  }

  function refreshUI() {
    applyCursor();
    updateBar();
    queuePaint();
  }

  function updateBar() {
    if (!barEl) return;
    if (inPrintMode()) {
      barEl.innerHTML =
        `<span class="pp-key">点击</span>任意位置打印已选 ${selections.length} 块` +
        `<span class="pp-key">↑</span><span class="pp-key">Tab</span>调整刚选的` +
        `<span class="pp-key">Ctrl</span>点击增删<span class="pp-key">Esc</span>取消`;
    } else if (selections.length) {
      barEl.innerHTML =
        `已选 ${selections.length} 块 · 松开 Ctrl 后点击任意位置打印` +
        `<span class="pp-key">↑</span><span class="pp-key">Tab</span>调整刚选的` +
        `<span class="pp-key">Ctrl</span>点击增删<span class="pp-key">Esc</span>取消`;
    } else {
      barEl.innerHTML =
        `<span class="pp-key">Ctrl</span>点击多选` +
        `<span class="pp-key">↑</span><span class="pp-key">Tab</span>选上级` +
        `<span class="pp-key">↓</span>回下层<span class="pp-key">Enter</span>打印` +
        `<span class="pp-key">Esc</span>取消`;
    }
  }

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
    syncSelections();
    // 打印态：不再跟随鼠标，只显示已选区域的实线框
    if (inPrintMode()) {
      boxEl.style.display = "none";
      tagEl.style.display = "none";
      return;
    }
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

    nameEl.textContent =
      describe(el) + (selections.length ? ` · 已选 ${selections.length}` : "");
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

  /* ---------- 多选 ---------- */

  function makeSelBox() {
    const box = document.createElement("div");
    box.className = "pp-selbox";
    const badge = document.createElement("div");
    badge.className = "pp-badge";
    const nav = document.createElement("div");
    nav.className = "pp-nav";
    const up = document.createElement("button");
    up.className = "pp-navbtn";
    up.type = "button";
    up.textContent = "↑";
    up.setAttribute("data-pp-nav", "up");
    up.title = "选上级";
    const down = document.createElement("button");
    down.className = "pp-navbtn";
    down.type = "button";
    down.textContent = "↓";
    down.setAttribute("data-pp-nav", "down");
    down.title = "回下层";
    nav.appendChild(up);
    nav.appendChild(down);
    const del = document.createElement("button");
    del.className = "pp-navbtn pp-delbtn";
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("data-pp-nav", "del");
    del.title = "移出这一块";
    nav.appendChild(del);
    // 按钮的点击直接绑在自己身上（Shadow DOM 内），不依赖外部捕获阶段的识别
    nav.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      const btn = ev.target && ev.target.closest ? ev.target.closest(".pp-navbtn") : null;
      if (btn) onNavButtonClick(btn);
    });
    nav.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    nav.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); });
    nav.addEventListener("mouseup", (ev) => { ev.stopPropagation(); });
    box.appendChild(badge);
    box.appendChild(nav);
    selLayer.appendChild(box);
    return { box, badge, nav, btnUp: up, btnDown: down, btnDel: del };
  }

  function syncSelections() {
    for (let i = selections.length - 1; i >= 0; i--) {
      if (!selections[i].el.isConnected) {
        selections[i].box.remove();
        selections.splice(i, 1);
      }
    }
    selections.forEach((s, i) => {
      const r = s.el.getBoundingClientRect();
      s.box.style.transform = `translate(${Math.round(r.left)}px,${Math.round(r.top)}px)`;
      s.box.style.width = Math.round(Math.max(0, r.width)) + "px";
      s.box.style.height = Math.round(Math.max(0, r.height)) + "px";
      s.box.style.display = r.width && r.height ? "block" : "none";
      s.badge.textContent = String(i + 1);
      updateNavState(s);
    });
  }

  // 到顶/到底时把对应按钮置灰
  function updateNavState(s) {
    if (!s.btnUp || !s.btnDown) return;
    const len = (s.navChain || []).length;
    const canUp = s.navIdx + 1 < len;
    const canDown = s.navIdx > 0;
    setDisabled(s.btnUp, !canUp);
    setDisabled(s.btnDown, !canDown);
  }

  function setDisabled(btn, disabled) {
    if (disabled) btn.setAttribute("data-disabled", "");
    else btn.removeAttribute("data-disabled");
  }

  function toggleSelection(el) {
    const i = selections.findIndex((s) => s.el === el);
    if (i >= 0) {
      selections[i].box.remove();
      selections.splice(i, 1);
    } else {
      const { box, badge, btnUp, btnDown, btnDel } = makeSelBox();
      selections.push({ el, box, badge, btnUp, btnDown, btnDel, navChain: buildChain(el), navIdx: 0 });
    }
    syncSelections();
    refreshUI();
  }

  // ↑↓：调整某一块（默认是「刚选中」的那块）的层级
  function stepSelection(up, s) {
    s = s || selections[selections.length - 1];
    if (!s) return false;
    if (!s.navChain) {
      s.navChain = buildChain(s.el);
      s.navIdx = 0;
    }
    const next = up ? s.navIdx + 1 : s.navIdx - 1;
    if (next < 0 || next >= s.navChain.length) return true; // 已经到头，什么都不做
    const el = s.navChain[next];
    if (!el) return true;
    // 目标已经是另一个选中块，就不动，避免出现重复选中
    if (selections.some((x) => x.el === el)) return true;
    s.navIdx = next;
    s.el = el;
    syncSelections();
    refreshUI();
    return true;
  }

  // 点击某个选中块角上的 ↑/↓/× 按钮
  function onNavButtonClick(btn) {
    let s = selections.find(
      (x) => x.btnUp === btn || x.btnDown === btn || x.btnDel === btn
    );
    // 兜底：能按 DOM 归属反推出是哪一块
    if (!s) {
      const box = btn.closest ? btn.closest(".pp-selbox") : null;
      if (box) s = selections.find((x) => x.box === box);
    }
    if (!s) return;
    if (btn.hasAttribute("data-disabled")) return;
    const kind = btn.getAttribute("data-pp-nav");
    if (kind === "del") {
      s.box.remove();
      const i = selections.indexOf(s);
      if (i >= 0) selections.splice(i, 1);
      syncSelections();
      refreshUI();
      return;
    }
    stepSelection(kind === "up", s);
  }

  // 事件是否落在自家的 ↑/↓ 按钮上（事件穿过 Shadow DOM，需要看 composedPath）
  function navButtonFromEvent(e) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    for (const node of path) {
      if (node && node.classList && node.classList.contains("pp-navbtn")) return node;
    }
    return null;
  }

  // 按坐标判断是不是点在某个选中块的按钮上（不依赖命中测试，最稳）
  function navButtonAtPoint(x, y) {
    for (const s of selections) {
      const btns = [s.btnUp, s.btnDown, s.btnDel];
      for (const btn of btns) {
        if (!btn || !btn.isConnected) continue;
        const r = btn.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return btn;
      }
    }
    return null;
  }

  /* ---------- 选择器输入 ---------- */

  function querySelectorMatches(text) {
    const v = (text || "").trim();
    if (!v) return { ok: true, els: [] };
    let els;
    try {
      els = Array.from(document.querySelectorAll(v));
    } catch (err) {
      return { ok: false, els: [] };
    }
    // 排除自家浮层节点
    els = els.filter((el) => el !== host && el.isConnected && !host.contains(el));
    return { ok: true, els };
  }

  function setHint(text, isErr) {
    if (!hintEl) return;
    hintEl.textContent = text;
    if (isErr) hintEl.classList.add("pp-err");
    else hintEl.classList.remove("pp-err");
  }

  function openSelector() {
    if (selectorOpen) return;
    selectorOpen = true;
    locked = false;
    inputEl.value = "";
    inputEl.classList.remove("pp-bad");
    setHint("Enter 确认 · Esc 取消", false);
    barEl.style.display = "none";
    inputBarEl.style.display = "flex";
    applyCursor();
    try { inputEl.focus(); } catch (e) { /* ignore */ }
  }

  function closeSelector() {
    if (!selectorOpen) return;
    selectorOpen = false;
    inputBarEl.style.display = "none";
    barEl.style.display = "";
    try { inputEl.blur(); } catch (e) { /* ignore */ }
    refreshUI();
  }

  function onSelectorInput() {
    const r = querySelectorMatches(inputEl.value);
    if (!r.ok) {
      inputEl.classList.add("pp-bad");
      setHint("无效的选择器", true);
      return;
    }
    inputEl.classList.remove("pp-bad");
    if (!(inputEl.value || "").trim()) {
      setHint("Enter 确认 · Esc 取消", false);
      return;
    }
    if (!r.els.length) {
      setHint("没有匹配到元素", true);
      return;
    }
    setHint(r.els.length === 1 ? "找到 1 个" : `找到 ${r.els.length} 个`, false);
    // 实时预览第一个命中
    setTarget(r.els[0]);
    locked = false;
    queuePaint();
  }

  function commitSelector() {
    const r = querySelectorMatches(inputEl.value);
    if (!r.ok) {
      inputEl.classList.add("pp-bad");
      setHint("无效的选择器", true);
      return;
    }
    if (!r.els.length) {
      setHint("没有匹配到元素", true);
      return;
    }
    const els = r.els;
    if (els.length === 1) {
      setTarget(els[0]);
      locked = false;
      closeSelector();
      return;
    }
    // 多个命中：整批加入多选（已在多选里的跳过）
    els.forEach((el) => {
      if (selections.some((s) => s.el === el)) return;
      const { box, badge, btnUp, btnDown, btnDel } = makeSelBox();
      selections.push({ el, box, badge, btnUp, btnDown, btnDel, navChain: buildChain(el), navIdx: 0 });
    });
    setTarget(els[0]);
    locked = false;
    closeSelector();
  }

  // 事件是否落在某个自家 UI 容器上（Shadow DOM 内，需要 composedPath）
  function shadowHit(e, cls) {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    for (const node of path) {
      if (node && node.classList && node.classList.contains(cls)) return node;
    }
    return null;
  }

  /* ---------- 交互 ---------- */

  function onMouseMove(e) {
    // 选择器输入中：鼠标不改目标，保持预览
    if (selectorOpen) return;
    // 打印态下鼠标不再改选，避免点击时目标被换掉；按着 Ctrl 时恢复跟随
    if (inPrintMode() || locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || el.getRootNode() === shadow) return;
    setTarget(el);
  }

  function onClick(e) {
    // 选择器输入条上的点击：放行，交给输入框自己
    if (shadowHit(e, "pp-inputbar")) return;
    // 输入中点到页面别处：取消输入，不动选中项，也不打印
    if (selectorOpen) {
      block(e);
      closeSelector();
      return;
    }
    // 点在选中块角上的 ↑/↓/× 按钮：先按坐标判定（最可靠），再用事件路径兜底
    const navBtn = navButtonAtPoint(e.clientX, e.clientY) || navButtonFromEvent(e);
    if (navBtn) {
      block(e);
      onNavButtonClick(navBtn);
      return;
    }
    block(e);
    // 兜底：如果 Ctrl 的 keyup 没收到（比如焦点切走了），用点击事件里的修饰键状态纠正
    if (!e.ctrlKey && !e.metaKey && ctrlHeld) {
      ctrlHeld = false;
    }
    if (!locked) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (hit && hit !== host && hit.getRootNode() !== shadow) setTarget(hit);
    }
    const el = chain[index];
    if (!el || !el.isConnected) return;
    // Ctrl/⌘ + 点击 = 加入或移出多选，不触发打印
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(el);
      return;
    }
    confirm();
  }

  function onKeyDown(e) {
    // 选择器输入中：所有按键都交给输入框本身（Enter/Esc 由它的监听处理）
    if (selectorOpen) return;
    const k = e.key;
    // "/" 打开选择器输入
    if (k === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      block(e);
      openSelector();
      return;
    }
    // Ctrl/⌘ 按下 → 回到选取态（可继续增删），不拦截按键本身
    if (k === "Control" || k === "Meta") {
      if (!ctrlHeld) {
        ctrlHeld = true;
        refreshUI();
      }
      return;
    }
    // ↑ / Tab = 选上级；↓ / Shift+Tab = 退回下层
    const up = k === "ArrowUp" || (k === "Tab" && !e.shiftKey);
    const down = k === "ArrowDown" || (k === "Tab" && e.shiftKey);
    if (up) {
      block(e);
      if (selections.length) { stepSelection(true); return; }
      if (!chain.length) return;
      index = Math.min(index + 1, chain.length - 1);
      locked = true;
      queuePaint();
    } else if (down) {
      block(e);
      if (selections.length) { stepSelection(false); return; }
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

  // 松开 Ctrl/⌘ → 进入打印态：光标变打印机，点任意位置即打印
  function onKeyUp(e) {
    if (e.key !== "Control" && e.key !== "Meta") return;
    if (ctrlHeld) {
      ctrlHeld = false;
      refreshUI();
    }
  }

  // 鼠标按下类事件：落在自家按钮上就不拦截，交给按钮自己的监听
  function onPressBlock(e) {
    if (shadowHit(e, "pp-inputbar")) return; // 输入框内放行
    if (navButtonFromEvent(e)) return;
    block(e);
  }

  on("mousemove", onMouseMove);
  on("click", onClick);
  on("mousedown", onPressBlock);
  on("mouseup", onPressBlock);
  on("pointerdown", onPressBlock);
  on("dblclick", block);
  on("auxclick", block);
  on("contextmenu", block);
  on("dragstart", block);
  on("selectstart", block);
  on("keydown", onKeyDown);
  on("keyup", onKeyUp);
  on("scroll", queuePaint, true);
  on("resize", queuePaint, true);

  // 选择器输入框自己的事件
  inputEl.addEventListener("input", onSelectorInput);
  inputEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      ev.stopPropagation();
      commitSelector();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeSelector();
    }
  });
  inputEl.addEventListener("mousedown", (ev) => ev.stopPropagation());
  inputEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  inputEl.addEventListener("click", (ev) => ev.stopPropagation());

  const cursorStyle = document.createElement("style");
  cursorStyle.id = CURSOR_STYLE_ID;
  document.documentElement.appendChild(cursorStyle);
  document.documentElement.appendChild(host);
  updateBar();
  applyCursor();

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

  const DEFAULT_SETTINGS = { divPageBreak: false };

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (v) => {
          resolve(Object.assign({}, DEFAULT_SETTINGS, v || {}));
        });
      } catch (e) {
        resolve(Object.assign({}, DEFAULT_SETTINGS));
      }
    });
  }

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

  // 并列一级 div 分页：从第二个起各自另起一页
  function markPageBreaks(el) {
    const kids = Array.from(el.children).filter((c) => c.tagName === "DIV");
    if (kids.length < 2) return;
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

  function printOnly(roots, settings) {
    const scroll = { x: window.scrollX, y: window.scrollY };

    // 打印前把选取浮层、提示条、十字光标彻底移出页面
    const overlay = document.getElementById("pp-root");
    if (overlay) overlay.remove();
    const cursorEl = document.getElementById(CURSOR_STYLE_ID);
    if (cursorEl) cursorEl.remove();

    // 保留集合：所有选中元素及其祖先链的并集
    const keep = new Set();
    for (const root of roots) {
      let n = root;
      while (n && n !== document.documentElement) {
        keep.add(n);
        n = n.parentElement;
      }
    }

    // 逐级隐藏不在保留集合里的兄弟节点
    for (const node of keep) {
      const parent = node.parentElement;
      if (!parent || parent === document.documentElement) continue;
      for (const sib of Array.from(parent.children)) {
        if (!keep.has(sib)) sib.setAttribute(HIDE_ATTR, "1");
      }
    }
    // body 之外的兄弟节点（保留 head 等）
    for (const sib of Array.from(document.documentElement.children)) {
      if (sib === document.body || keep.has(sib)) continue;
      if (["HEAD", "STYLE", "LINK", "SCRIPT"].includes(sib.tagName)) continue;
      sib.setAttribute(HIDE_ATTR, "1");
    }

    // 标记祖先链，打印时恢复文档流
    keep.forEach((n) => n.setAttribute(CHAIN_ATTR, "1"));
    roots.forEach((r) => r.setAttribute(ROOT_ATTR, "1"));

    // 一级子节点若是并列的若干 div，则从第二个起各自另起一页（选项页可开启，默认关闭）
    if (settings.divPageBreak === true) {
      roots.forEach(markPageBreaks);
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
    // 有多选时打印全部选中项，否则打印当前指向的这一块
    const roots = selections.length
      ? selections.map((s) => s.el).filter((el) => el && el.isConnected)
      : [chain[index]].filter((el) => el && el.isConnected);

    if (!roots.length) {
      cancel();
      return;
    }
    // 先撤掉选取框与提示，再等两次重绘让页面画干净，最后才唤起打印窗口
    detach();
    delete window[KEY];
    loadSettings().then((settings) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => printOnly(roots, settings));
      });
    });
  }

  window[KEY] = { cancel };
})();
