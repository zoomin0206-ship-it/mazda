/* 路線二「我要比較」。比較項目讀自 題目與規則.json 的「比較」，車款、配備讀自資料檔，不寫任何車名。
 * 手機：車款標籤、版本卡片都可以左右滑動；電腦：直接並排。 */
(function () {
  "use strict";
  const carType = (x) => (x.endsWith("車") ? x : x + "車"); // 轎車／掀背車／休旅車
  const $ = (id) => document.getElementById(id);
  let A, CFG, TRIMS, CARS, ITEMS;
  let slots = [];        // 每格：{ car: 車款id, trim: 版本id }
  let current = [];      // 比較中的版本

  function init() {
    A = window.App;
    CFG = A.RULES["比較"];
    TRIMS = window.Engine.loadTrims(A.DATA, A.RULES);
    CARS = A.DATA["車款"].filter((c) => c.上架 !== false);
    ITEMS = A.DATA["配備對照清單"] || [];
    $("go-compare").disabled = false;
    const m = location.search.match(/[?&]compare=([^&]+)/);
    if (m) open(decodeURIComponent(m[1]).split(","));
  }

  const isWide = () => !!(window.matchMedia && matchMedia("(min-width: 900px)").matches);
  const maxSlots = () => (isWide() ? CFG.電腦最多 : CFG.手機最多);
  const trimById = (id) => TRIMS.find((t) => t.id === id);
  const trimsOf = (carId) => TRIMS.filter((t) => t.車款id === carId);
  const carById = (id) => CARS.find((c) => c.id === id);
  const img = (t, cls) => {
    const c = A.colorOf(t);                       // 結果頁選過的顏色；沒選過就是預設色
    const src = c ? c.圖片 : t.圖片;
    return src ? `<img class="${cls}" src="${A.esc(src)}" alt="${A.esc(t.車款)}" loading="lazy">` : "";
  };

  // ---------- 開啟 ----------
  function open(ids) {
    ids = (ids || []).filter(trimById).slice(0, maxSlots());
    if (ids.length >= 2) return view(ids);
    slots = [0, 1].map((i) => {
      const t = ids[i] && trimById(ids[i]);
      return { car: t ? t.車款id : null, trim: t ? t.id : null };
    });
    renderPick();
    A.show("compare-pick");
  }

  // ---------- 版本卡片：比上一個版本多了什麼 ----------
  function fmtEq(item, v) {
    if (v === true) return "有";
    if (v === false || v === null || v === undefined) return "—";
    return typeof v === "number" ? `${v}${item.key === "氣囊" ? " 具" : ""}` : String(v);
  }

  function previousTrim(t) {
    // 同車款、同車身，比它便宜的版本中最貴的那一個
    const same = trimsOf(t.車款id).filter((x) => x.車身類型 === t.車身類型 && x.建議售價 < t.建議售價);
    return same.length ? same.reduce((a, b) => (b.建議售價 > a.建議售價 ? b : a)) : null;
  }

  function addedVs(t, prev) {
    const out = [];
    if (prev.驅動 !== t.驅動) out.push(t.驅動.includes("四輪") ? "四輪驅動" : t.驅動);
    if (prev.引擎 !== t.引擎) out.push(t.引擎);
    for (const it of ITEMS) {
      const a = prev.配備 && prev.配備[it.key], b = t.配備 && t.配備[it.key];
      if (b === a || b === false || b === null || b === undefined) continue;
      if (b === true) out.push(it.名稱);
      else if (!a) out.push(it.名稱.includes(String(b)) ? it.名稱 : `${it.名稱}（${fmtEq(it, b)}）`); // 從無到有
      else out.push(`${it.名稱}升級：${fmtEq(it, b)}`);                                              // 規格升級
    }
    return out;
  }

  function trimCard(t, selected, slotIdx) {
    const prev = previousTrim(t);
    let body;
    if (prev) {
      const add = addedVs(t, prev);
      const shown = add.slice(0, 5);
      body = add.length
        ? `<p class="tc-sub">比 ${A.esc(prev.名稱)} 多了：</p><ul>${shown.map((x) => `<li>${A.esc(x)}</li>`).join("")}` +
          (add.length > shown.length ? `<li class="more">等共 ${add.length} 項</li>` : "") + `</ul>`
        : `<p class="tc-sub">主要配備和 ${A.esc(prev.名稱)} 相同，差在外觀細節</p>`;
    } else {
      const car = carById(t.車款id);
      body = `<p class="tc-sub">入門版本，基本配備就有：</p><ul>${(car.全車系標配重點 || []).slice(0, 4).map((x) => `<li>${A.esc(x)}</li>`).join("")}</ul>`;
    }
    return `<button type="button" class="trim-card${selected ? " on" : ""}" data-slot="${slotIdx}" data-trim="${t.id}" aria-pressed="${selected}">
      <span class="tc-check" aria-hidden="true"></span>
      <span class="tc-name">${A.esc(t.名稱)}</span>
      <span class="tc-price">${A.wan(t.建議售價)}元</span>${body}</button>`;
  }

  // ---------- 選車畫面 ----------
  function renderPick() {
    const box = $("slots");
    box.style.setProperty("--n", slots.length);
    box.innerHTML = slots.map((s, i) => {
      const optional = i >= 2;
      const models = CARS.map((c) => `<button type="button" class="model-chip${s.car === c.id ? " on" : ""}" data-slot="${i}" data-car="${c.id}" aria-pressed="${s.car === c.id}">
          ${c.圖片 ? `<img src="${A.esc(c.圖片)}" alt="" loading="lazy">` : ""}<b>${A.esc(c.名稱)}</b><span>${A.esc(c.車型分類)}</span></button>`).join("");
      const n = s.car ? trimsOf(s.car).length : 0;
      const trims = s.car ? trimsOf(s.car).map((t) => trimCard(t, s.trim === t.id, i)).join("") : "";
      return `<div class="slot">
        <div class="slot-top"><p class="slot-label">第 ${i + 1} 台${optional ? "（選填）" : ""}</p>
          ${optional ? `<button type="button" class="slot-x" data-remove="${i}" aria-label="移除第 ${i + 1} 台">×</button>` : ""}</div>
        <p class="slot-step">① 選車款<span class="swipe-hint">左右滑動</span></p>
        <div class="swipe models">${models}</div>
        ${s.car ? `<p class="slot-step">② 選版本${n > 1 ? `<span class="swipe-hint">共 ${n} 個版本，左右滑動</span>` : ""}</p><div class="swipe trims">${trims}</div>` : ""}
      </div>`;
    }).join("") + (slots.length < maxSlots() ? `<button type="button" class="slot-add" id="slot-add">＋ 再加一台比較</button>` : "");

    for (const b of box.querySelectorAll(".model-chip")) b.addEventListener("click", () => {
      const i = +b.dataset.slot, ts = trimsOf(b.dataset.car);
      slots[i] = { car: b.dataset.car, trim: ts.length === 1 ? ts[0].id : null };
      renderPick();
    });
    for (const b of box.querySelectorAll(".trim-card")) b.addEventListener("click", () => {
      slots[+b.dataset.slot].trim = b.dataset.trim;
      renderPick();
    });
    for (const b of box.querySelectorAll(".slot-x")) b.addEventListener("click", () => {
      slots.splice(+b.dataset.remove, 1);
      renderPick();
    });
    const add = $("slot-add");
    if (add) add.addEventListener("click", () => { slots.push({ car: null, trim: null }); renderPick(); });

    // 已選的車款、版本在橫向滑動列中捲到看得到的位置（不影響整頁捲動）
    requestAnimationFrame(() => {   // 等畫面顯示出來才量得到寬度
      for (const el of box.querySelectorAll(".swipe .on")) {
        const row = el.parentElement;
        row.scrollLeft = el.offsetLeft - (row.clientWidth - el.clientWidth) / 2;
      }
    });
    const n = slots.filter((s) => s.trim).length;
    $("do-compare").disabled = n < 2;
    $("do-compare").textContent = n < 2 ? `再選 ${2 - n} 台就可以比較` : `開始比較這 ${n} 台`;
  }

  // ---------- 比較結果 ----------
  function view(ids) {
    current = ids.map(trimById).filter(Boolean);
    renderView();
    A.show("compare-view");
  }

  function fmtVal(item, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (item.格式 === "萬元") return A.wan(v) + "元";
    if (item.格式 === "元") return A.fmt(v) + " 元";
    if (typeof v === "number") return A.fmt(v) + (item.單位 ? " " + item.單位 : "");
    return String(v);
  }
  const overseas = (t) => t.行李廂來源 && !t.行李廂來源.startsWith("台灣");

  function specRows(cat) {
    return cat.項目.map((it) => {
      const vals = current.map((t) => t[it.欄位]);
      let best = null;
      const nums = vals.filter((v) => typeof v === "number");
      if (it.較好 && nums.length === vals.length && new Set(nums).size > 1) {
        best = it.較好 === "大" ? Math.max(...nums) : Math.min(...nums);
      }
      return {
        名稱: it.名稱, 值: vals, best,
        顯示: vals.map((v, i) => fmtVal(it, v) + (it.欄位 === "行李廂L" && overseas(current[i]) && v ? "*" : "")),
      };
    });
  }

  function equipSections() {
    const groups = [];
    for (const it of ITEMS) {
      let g = groups.find((x) => x.名稱 === it.分類);
      if (!g) groups.push((g = { 名稱: it.分類, rows: [] }));
      const vals = current.map((t) => (t.配備 ? t.配備[it.key] : null));
      g.rows.push({ 名稱: it.名稱, 值: vals, 布林: true, 常問: it.常問 });
    }
    return groups;
  }

  function sameModelRows() {
    if (new Set(current.map((t) => t.車款id)).size !== 1) return null;
    const car = A.DATA["車款"].find((c) => c.id === current[0].車款id);
    const idx = current.map((t) => car.版本.findIndex((v) => v.id === t.id));
    return (car.版本差異 || [])
      .map((d) => ({ 名稱: d.項目, 值: idx.map((i) => d.值[i]), 布林: true }))
      .filter((r) => !r.值.every((v) => v === false)); // 只有其他版本才有、這幾台都沒有的項目不顯示
  }

  function cell(r, i) {
    const v = r.值[i];
    if (r.布林) {
      if (v === true) return `<span class="yes">✓ 有</span>`;
      if (v === false) return `<span class="no">—</span>`;
      if (v === null || v === undefined) return `<span class="na">型錄未標示</span>`;
      return `<span>${A.esc(typeof v === "number" ? v + (r.名稱 === "氣囊" ? " 具" : "") : v)}</span>`;
    }
    const isBest = r.best !== null && r.best !== undefined && r.值[i] === r.best;
    return `<span class="${isBest ? "best" : ""}">${A.esc(r.顯示[i])}${isBest ? " <b class='best-mark'>較優</b>" : ""}</span>`;
  }

  function renderView() {
    const n = current.length;
    const onlyDiff = $("only-diff").checked;
    const canAdd = n < maxSlots();
    $("cmp-head").style.setProperty("--n", n + (canAdd ? 1 : 0));
    $("cmp-head").innerHTML = current.map((t, i) => `<div class="cmp-car">
        <button type="button" class="cmp-x" data-i="${i}" aria-label="移除 ${A.esc(t.車款)}">×</button>
        ${img(t, "cmp-img")}<b>${A.esc(t.車款)}</b><span>${A.esc(t.名稱)}</span>
        <span class="cmp-price">${A.wan(t.建議售價)}元</span></div>`).join("") +
      (canAdd ? `<button type="button" class="cmp-add" id="cmp-add"><b>＋</b><span>加一台</span></button>` : "");
    $("cmp-summary").innerHTML = summary().map((p) => `<p>${p}</p>`).join("");

    const same = sameModelRows();
    const sections = [];
    if (same) sections.push({ 名稱: n === 2 ? "這兩個版本的差異" : "這幾個版本的差異", rows: same });
    for (const cat of CFG.分類) {
      if (cat.類型 === "配備對照") { if (!same) sections.push(...equipSections()); continue; }
      sections.push({ 名稱: cat.名稱, rows: specRows(cat) });
    }

    let html = "";
    const nav = [];
    sections.forEach((sec, k) => {
      const rows = sec.rows.filter((r) => {
        const differs = new Set(r.值.map((v) => JSON.stringify(v))).size > 1;
        if (onlyDiff) return differs;
        const allNo = r.值.every((v) => v === false || v === null || v === undefined);
        return !(r.布林 && allNo && !r.常問); // 顯示全部時，大家都沒有的冷門配備也不列
      });
      if (!rows.length) return;
      nav.push(`<button type="button" data-target="cmp-sec-${k}">${A.esc(sec.名稱)}</button>`);
      html += `<h3 class="cmp-sec" id="cmp-sec-${k}">${A.esc(sec.名稱)}</h3>`;
      for (const r of rows) {
        html += `<div class="cmp-row"><p class="cmp-label">${A.esc(r.名稱)}</p><div class="cmp-vals" style="--n:${n}">` +
          r.值.map((_, i) => `<div>${cell(r, i)}</div>`).join("") + `</div></div>`;
      }
    });
    $("cmp-nav").innerHTML = nav.join("");
    $("cmp-table").innerHTML = html || `<p class="note">這幾台在列出的項目上完全一樣。</p>`;
    $("cmp-cta-lead").textContent = n === 2 ? "兩台都想試試看？" : "這幾台都想試試看？";
    const p = A.RULES["計算參數"];
    $("cmp-foot").textContent = `價格為台灣馬自達公告之建議售價。規格、配備以台灣官方型錄為準；車輛圖片來源：台灣馬自達官網。標示 * 的${A.RULES["結果頁文字"].海外數據註記}。` +
      `油錢以每年 ${A.fmt(p.每年行駛公里)} 公里、油價每公升 ${p.油價每公升} 元估算。本網站由 ${window.SITE.顧問職稱}個人製作，非台灣馬自達官方網站。`;

    for (const b of $("cmp-nav").querySelectorAll("button")) b.addEventListener("click", () => {
      const el = $(b.dataset.target);
      const headH = $("cmp-head").offsetHeight + 8;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - headH, behavior: "smooth" });
    });
    for (const b of document.querySelectorAll(".cmp-x")) b.addEventListener("click", () => {
      const ids = current.map((t) => t.id).filter((_, i) => i !== +b.dataset.i);
      if (ids.length >= 2) view(ids);
      else open(ids);
    });
    const add = $("cmp-add");
    if (add) add.addEventListener("click", () => {
      slots = current.map((t) => ({ car: t.車款id, trim: t.id })).concat([{ car: null, trim: null }]);
      renderPick();
      A.show("compare-pick");
    });
  }

  // ---------- 一句話結論 ----------
  function summary() {
    const sorted = [...current].sort((a, b) => a.建議售價 - b.建議售價);
    const base = sorted[0];
    const name = (t) => `<b>${A.esc(t.車款)} ${A.esc(t.名稱)}</b>`;
    const out = [];
    const mechH = A.RULES["機械車位"].不知道時採用的高度;
    for (const t of sorted.slice(1)) {
      const parts = [];
      if (t.車身類型 !== base.車身類型) {   // 車型不同是最大的差別，先講
        const desc = (type) => {
          const o = A.RULES["題目"].find((q) => q.id === "body").選項.find((x) => x.車身類型 === type);
          return o ? `（${o.文字.split("：")[1]}）` : "";
        };
        parts.push(`${name(t)} 是${carType(t.車身類型)}${desc(t.車身類型)}，${name(base)} 是${carType(base.車身類型)}${desc(base.車身類型)}。`);
      }
      const diff = t.建議售價 - base.建議售價;
      const who = parts.length ? "價格上，前者" : `${name(t)} 比 ${name(base)} `;
      parts.push(diff ? `${who}貴 <b>${A.wan(diff)}元</b>。` : `${parts.length ? "兩台" : `${name(t)} 和 ${name(base)} `}建議售價一樣。`);
      const gain = [], lose = [];
      if (t.驅動 !== base.驅動 && t.驅動.includes("四輪")) gain.push("四輪驅動");
      const has = (v) => v === true || (typeof v === "string" && v !== "");
      for (const it of ITEMS) {
        const a = base.配備 && base.配備[it.key], b = t.配備 && t.配備[it.key];
        if (has(b) && a === false) gain.push(it.名稱);
        if (b === false && has(a)) lose.push(it.名稱);
        if (it.亮點關鍵字 && typeof a === "string" && typeof b === "string") {     // 例如音響升級成 BOSE
          if (b.includes(it.亮點關鍵字) && !a.includes(it.亮點關鍵字)) gain.push(it.亮點名稱);
          if (a.includes(it.亮點關鍵字) && !b.includes(it.亮點關鍵字)) lose.push(it.亮點名稱);
        }
      }
      const list = (arr) => arr.slice(0, 6).join("、") + (arr.length > 6 ? ` 等 ${arr.length} 項` : "");
      if (gain.length) parts.push(`多了：${list(gain)}。`);
      if (lose.length) parts.push(`但少了：${list(lose)}。`);
      const dl = Math.round((t.全長 - base.全長) / 10);
      if (Math.abs(dl) >= 10) parts.push(`車身${dl > 0 ? "長" : "短"} ${Math.abs(dl)} 公分。`);
      if (t.行李廂L && base.行李廂L && Math.abs(t.行李廂L - base.行李廂L) >= 30) {
        parts.push(`後車廂${t.行李廂L > base.行李廂L ? "大" : "小"} ${Math.abs(t.行李廂L - base.行李廂L)} L${overseas(t) || overseas(base) ? "*" : ""}。`);
      }
      if (t.座位數 !== base.座位數) parts.push(`座位 ${t.座位數} 人（${base.座位數} 人）。`);
      if (Math.abs(t.馬力ps - base.馬力ps) / base.馬力ps >= 0.1) parts.push(`馬力 ${t.馬力ps} ps（${base.馬力ps} ps）。`);
      const dc = t.每年養車成本 - base.每年養車成本;
      if (Math.abs(dc) >= 3000) parts.push(`每年稅金＋油錢${dc > 0 ? "多" : "少"}約 ${A.fmt(Math.round(Math.abs(dc) / 1000) * 1000)} 元。`);
      out.push(parts.join(""));
    }
    for (const t of current) {
      if (t.全高 > mechH && current.some((x) => x.全高 <= mechH)) {
        out.push(`提醒：${name(t)} 車高 ${A.fmt(t.全高)} mm，停不進最常見限高 ${A.fmt(mechH)} mm 的機械車位。`);
      }
    }
    return out;
  }

  // ---------- LINE ----------
  function sendLine() {
    const col = (t) => { const c = A.colorOf(t); return c ? `（${c.名稱}）` : ""; };
    const list = current.map((t, i) => `${i + 1}. ${t.車款} ${t.名稱}${col(t)}`).join("\n");
    const full = `你好，我用選車小幫手比較了：\n${list}\n\n${current.length === 2 ? "兩台" : "這幾台"}都想實際試試看，想約時間試乘比較。`;
    const short = `選車小幫手比較：${current.map((t) => `${t.車款} ${t.名稱}`).join("／")}，想約試乘比較`;
    A.sendLineText(full, short);
  }

  // ---------- 綁定 ----------
  $("go-compare").addEventListener("click", () => open([]));
  $("do-compare").addEventListener("click", () => view(slots.filter((s) => s.trim).map((s) => s.trim)));
  $("pick-back").addEventListener("click", () => A.show("home"));
  $("view-back").addEventListener("click", () => {
    slots = current.map((t) => ({ car: t.車款id, trim: t.id }));
    renderPick();
    A.show("compare-pick");
  });
  $("only-diff").addEventListener("change", renderView);
  $("cmp-line").addEventListener("click", sendLine);
  $("cmp-home").addEventListener("click", () => A.show("home"));
  document.addEventListener("app-ready", init);
  window.Compare = { open };
})();
