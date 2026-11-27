/* 車款頁的「完整配備」分頁。
 * 資料：data/equipment/<車款>.json（由 tools/build_equipment_page.py 產生，來源是型錄解析＋士倫核對過的說明）
 * 一整條長頁面：每段開頭有深藍色標題帶、結尾有「看完了」分隔線；上方可選版本、點分類跳到那一段，往下滑會自動反白目前段落。
 * 依漏斗原則，這一頁不放 YouTube 連結。 */
(function () {
  "use strict";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cache = {};
  let D = null, sel = -1, root = null, cur = -2, lock = 0;

  async function load(carId) {
    if (carId in cache) return cache[carId];
    try {
      const r = await fetch(encodeURI((window.SITE.完整配備資料 || "data/equipment/") + carId + ".json"));
      cache[carId] = r.ok ? await r.json() : null;
    } catch (e) { cache[carId] = null; }
    return cache[carId];
  }

  const vname = (ix) => ix.length === D.版本.length ? "全車型" : ix.map((i) => D.版本[i]).join("、");
  function ver(it) {
    if (sel >= 0) { const n = it.細節.map((d) => d.附註[sel]).filter(Boolean); return `<div class="eq-ver">✓ ${esc(D.版本[sel])} 有${n.length ? "（" + esc(n.join("、")) + "）" : ""}</div>`; }
    const diff = it.細節.filter((d) => (it.細節.length > 1 && d.版本.length !== it.版本.length) || Object.keys(d.附註).length);
    return `<div class="eq-ver">${esc(vname(it.版本))}${diff.length ? `<details class="eq-more"><summary>各版本差異</summary><ul>${diff.map((d) =>
      `<li>${esc(d.名稱)}：${esc(vname(d.版本))}${Object.keys(d.附註).length ? "（" + Object.entries(d.附註).map(([i, n]) => D.版本[i] + " " + n).join("；") + "）" : ""}${d.選配 ? "（選配）" : ""}</li>`).join("")}</ul></details>` : ""}</div>`;
  }
  const act = (it) => it.作動.length ? `<details class="eq-more"><summary>作動條件</summary><ul>${it.作動.map((a) => `<li>${esc(a.功能)}：${esc(a.條件)}</li>`).join("")}</ul></details>` : "";
  // 說明文字排版：第一句當重點，其他句子變成條列；①②③ 拆成小清單；版本名稱、數字加強顯示（內容不刪減）
  const hl = (t) => esc(t).replace(/(Premium Plus|Premium Sport|Premium Captain Seat|Premium|Exclusive|Elite Plus|Elite|Ace Edition|Air Edition|Signature|全車型)( 起)?/g, '<span class="eq-v">$1$2</span>')
    .replace(/(\d+(?:\.\d+)?(?:～\d+)?\s*(?:吋|顆|段|公里|km\/h|喇叭|分鐘|L))/g, "<b>$1</b>");
  const sub = (ps) => `<ol class="eq-sub">${ps.map((p) => `<li>${hl(p.replace(/^[①②③④⑤⑥]/, "").replace(/[；;。]$/, ""))}</li>`).join("")}</ol>`;
  function fmt(txt) {
    const ss = txt.split(/(?<=[。；])/).map((x) => x.trim().replace(/；$/, "。")).filter(Boolean);
    const lp = (ss.shift() || "").split(/(?=[①②③④⑤⑥])/);
    const h0 = lp.shift();
    let L = `<p class="eq-lead${h0.length > 42 ? " long" : ""}">${hl(h0.replace(/[：:]$/, "").replace(/。$/, ""))}</p>` + (lp.length ? sub(lp) : "");
    const li = ss.map((x) => { const ps = x.split(/(?=[①②③④⑤⑥])/); return ps.length > 1 ? `<li>${hl(ps.shift().replace(/[：:]$/, ""))}${sub(ps)}</li>` : `<li>${hl(x.replace(/。$/, ""))}</li>`; });
    return L + (li.length ? `<ul class="eq-pts">${li.join("")}</ul>` : "");
  }
  const body = (it) => `${it.標籤 ? `<span class="eq-tag">${esc(it.標籤)}</span>` : ""}<div class="eq-d">${fmt(it.說明)}</div>${ver(it)}${act(it)}`;

  function sysList() {
    const sys = { "SBS 智慧防撞": "屬於 SBS 智慧防撞", "ELK 緊急車道偏移防止": "屬於 ELK 緊急車道偏移防止" };
    return `<section class="eq-sys"><h3>安全系統一覽</h3><p>型錄和廣告上常看到的系統名稱，對應到哪些配備：</p><ul><li><b>i-ACTIVSENSE 主動安全科技</b>：Mazda 所有駕駛輔助的總稱<ul>` +
      Object.entries(sys).map(([n, t]) => `<li>${n}：${D.items.filter((i) => i.標籤 === t).map((i) => esc(i.標題)).join("、") || "—"}</li>`).join("") + `</ul></li></ul></section>`;
  }

  function draw() {
    const vis = D.items.filter((i) => sel < 0 || i.版本.includes(sel));
    const sc = D.情境.filter((s) => vis.some((i) => i.情境 === s));
    root.querySelector(".eq-trims").innerHTML = [-1, ...D.版本.keys()].map((i) =>
      `<button type="button" class="eq-chip${i === sel ? " on" : ""}" data-sel="${i}">${i < 0 ? "全部版本" : esc(D.版本[i]) + `<small>${esc(D.售價[i])}</small>`}</button>`).join("");
    root.querySelector(".eq-nav").innerHTML = sc.map((s, k) => `<button type="button" class="eq-chip" data-k="${k}">${esc(s)}</button>`).join("");
    root.querySelector(".eq-main").innerHTML =
      `<p class="eq-hint">照「用車的一天」整理，買了這台車會有什麼，一次看懂。${sel >= 0 ? `目前只顯示 <b>${esc(D.版本[sel])}（${esc(D.售價[sel])}）</b>有的配備。` : "點上面的版本，只看那個版本有的配備。"}</p>` +
      sc.map((s, k) => {
        const its = vis.filter((i) => i.情境 === s), cards = its.filter((i) => i.層級 === "卡片"), lines = its.filter((i) => i.層級 !== "卡片");
        return `<section class="eq-scene" id="eq-s${k}"><div class="eq-band"><em>${k + 1}／${sc.length}</em><span>${esc(s)}</span><i>${its.length} 項</i></div>
          <p class="eq-hook">${esc(D.開場[s] || "")}</p>
          ${cards.length ? `<p class="eq-sec">重點配備</p>` + cards.map((i) => `<div class="eq-card"><div class="eq-t">${esc(i.標題)}</div>${body(i)}</div>`).join("") : ""}
          ${lines.length ? `<p class="eq-sec">${cards.length ? "其他配備（點一下看說明）" : "點一下看說明"}</p>` + lines.map((i) => `<details class="eq-line"><summary>${esc(i.標題)}</summary>${body(i)}</details>`).join("") : ""}
          <div class="eq-end">✓ ${esc(s)}看完了${k < sc.length - 1 ? `　·　下一段：${esc(sc[k + 1])} ↓` : ""}</div></section>`;
      }).join("") + sysList() +
      `<p class="eq-fine">依台灣馬自達 ${esc(D.車款)} 型錄規格配備表整理，配備與作動條件以實車和車主手冊為準。駕駛輔助系統都有作動條件限制，車主仍需依實際路況駕駛。</p>`;
    for (const b of root.querySelectorAll(".eq-trims .eq-chip")) b.addEventListener("click", () => { sel = +b.dataset.sel; draw(); });
    for (const b of root.querySelectorAll(".eq-nav .eq-chip")) b.addEventListener("click", () => go(+b.dataset.k));
    cur = -2; spy();
  }

  function mark(k) {
    const n = root.querySelector(".eq-nav");
    for (const b of n.querySelectorAll(".eq-chip")) {
      const on = +b.dataset.k === k; b.classList.toggle("here", on);
      if (on) n.scrollTo({ left: b.offsetLeft - n.clientWidth / 2 + b.offsetWidth / 2, behavior: "smooth" });
    }
  }
  // 完整配備的選版本／分類列，要黏在車款頁分頁列的正下方
  function fitTop() { const t = document.getElementById("mp-tabs"); if (root && t && t.offsetHeight) root.style.setProperty("--eq-top", t.offsetHeight + "px"); }
  addEventListener("resize", fitTop);
  function stickyBottom() { const s = root.querySelector(".eq-bar"); return s.getBoundingClientRect().bottom; }
  function go(k) {
    lock = Date.now(); cur = k; mark(k);
    const el = document.getElementById("eq-s" + k);
    const barH = root.querySelector(".eq-bar").offsetHeight + (parseFloat(getComputedStyle(root).getPropertyValue("--eq-top")) || 0);
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - barH - 6, behavior: "smooth" });
  }
  function spy() {
    fitTop();
    if (!root || root.closest("[hidden]") || Date.now() - lock < 900) return;
    const top = stickyBottom() + 12; let k = 0;
    root.querySelectorAll(".eq-scene").forEach((el, i) => { if (el.getBoundingClientRect().top <= top) k = i; });
    if (k !== cur) { cur = k; mark(k); }
  }
  addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });

  // 畫進指定的容器；回傳 false 表示這台車還沒有完整配備資料
  async function render(container, carId) {
    const data = await load(carId);
    if (!data) return false;
    D = data; sel = -1; root = container;
    container.innerHTML = `<div class="eq-bar"><p class="eq-lbl">選版本（官方建議售價）</p><div class="eq-chips eq-trims"></div>
      <p class="eq-lbl">分類</p><div class="eq-chips eq-nav"></div></div><div class="eq-main"></div>`;
    draw();
    return true;
  }
  window.Equip = { render, has: async (id) => !!(await load(id)) };
})();
