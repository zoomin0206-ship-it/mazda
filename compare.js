/* 路線二「我要比較」。比較項目讀自 題目與規則.json 的「比較」，車款讀自資料檔，不寫任何車名。 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let A, CFG, TRIMS, CARS, slots = [], picked = [];

  function init() {
    A = window.App;
    CFG = A.RULES["比較"];
    TRIMS = window.Engine.loadTrims(A.DATA, A.RULES);
    CARS = A.DATA["車款"].filter((c) => c.上架 !== false);
    $("go-compare").disabled = false;
    // 分享連結：?compare=版本id,版本id
    const m = location.search.match(/[?&]compare=([^&]+)/);
    if (m) open(decodeURIComponent(m[1]).split(","));
  }

  const maxSlots = () => (window.matchMedia && matchMedia("(min-width: 900px)").matches ? CFG.電腦最多 : CFG.手機最多);
  const trimById = (id) => TRIMS.find((t) => t.id === id);

  // ---------- 選車 ----------
  function open(ids) {
    ids = (ids || []).filter((id) => trimById(id));
    for (const k of Object.keys($("slots").dataset)) delete $("slots").dataset[k];
    slots = [];
    for (let i = 0; i < maxSlots(); i++) slots.push(ids[i] || null);
    if (ids.length >= 2) return view(ids.slice(0, maxSlots()));
    renderPick();
    A.show("compare-pick");
  }

  function priceRange(car) {
    const ps = TRIMS.filter((t) => t.車款id === car.id).map((t) => t.建議售價);
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? A.wan(lo) : `${A.wan(lo).replace(" 萬", "")}～${A.wan(hi)}`;
  }

  function renderPick() {
    const box = $("slots");
    box.innerHTML = "";
    slots.forEach((id, i) => {
      const t = id && trimById(id);
      const carId = t ? t.車款id : (box.dataset["car" + i] || "");
      const optional = i >= 2;
      const el = document.createElement("div");
      el.className = "slot";
      el.innerHTML = `
        <p class="slot-label">第 ${i + 1} 台${optional ? "（選填）" : ""}</p>
        <label class="select"><span>車款</span>
          <select data-i="${i}" data-kind="car">
            <option value="">請選擇車款</option>
            ${CARS.map((c) => `<option value="${c.id}" ${c.id === carId ? "selected" : ""}>${A.esc(c.名稱)}（${A.esc(c.車型分類)}｜${priceRange(c)}元）</option>`).join("")}
          </select></label>
        <label class="select"><span>版本</span>
          <select data-i="${i}" data-kind="trim" ${carId ? "" : "disabled"}>
            <option value="">${carId ? "請選擇版本" : "先選車款"}</option>
            ${TRIMS.filter((x) => x.車款id === carId).map((x) =>
              `<option value="${x.id}" ${x.id === id ? "selected" : ""}>${A.esc(x.名稱)}（${A.wan(x.建議售價)}元）</option>`).join("")}
          </select></label>`;
      box.appendChild(el);
      box.dataset["car" + i] = carId;
    });
    for (const sel of box.querySelectorAll("select")) sel.addEventListener("change", onSelect);
    const n = slots.filter(Boolean).length;
    $("do-compare").disabled = n < 2;
    $("do-compare").textContent = n < 2 ? `再選 ${2 - n} 台就可以比較` : `開始比較這 ${n} 台`;
  }

  function onSelect(e) {
    const i = +e.target.dataset.i;
    if (e.target.dataset.kind === "car") {
      $("slots").dataset["car" + i] = e.target.value;
      const trims = TRIMS.filter((t) => t.車款id === e.target.value);
      slots[i] = trims.length === 1 ? trims[0].id : null; // 只有一個版本就直接選好
    } else {
      slots[i] = e.target.value || null;
    }
    renderPick();
  }

  // ---------- 比較結果 ----------
  let current = [];
  function view(ids) {
    current = ids.map(trimById);
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

  function rowsFor(cat) {
    if (cat.類型 === "關鍵配備") {
      return A.DATA["關鍵配備清單"].map((k) => ({
        名稱: A.fname(k), 值: current.map((t) => t.關鍵配備[k]), 布林: true,
      }));
    }
    return cat.項目.map((it) => {
      const vals = current.map((t) => t[it.欄位]);
      let best = null;
      const nums = vals.filter((v) => typeof v === "number");
      if (it.較好 && nums.length === vals.length && new Set(nums).size > 1) {
        best = it.較好 === "大" ? Math.max(...nums) : Math.min(...nums);
      }
      const shown = vals.map((v, i) => fmtVal(it, v) + (it.欄位 === "行李廂L" && overseas(current[i]) && v ? "*" : ""));
      return { 名稱: it.名稱, 值: vals, 顯示: shown, best };
    });
  }

  const overseas = (t) => t.行李廂來源 && !t.行李廂來源.startsWith("台灣");

  // 同一款車不同版本：顯示資料檔裡該車款的「版本差異」
  function sameModelRows() {
    if (new Set(current.map((t) => t.車款id)).size !== 1) return null;
    const car = A.DATA["車款"].find((c) => c.id === current[0].車款id);
    const idx = current.map((t) => car.版本.findIndex((v) => v.id === t.id));
    return (car.版本差異 || []).map((d) => ({ 名稱: d.項目, 值: idx.map((i) => d.值[i]), 布林: true }));
  }

  function cell(v, isBool, shown, isBest) {
    if (isBool) {
      if (v === true) return `<span class="yes">✓ 有</span>`;
      if (v === false) return `<span class="no">—</span>`;
      return `<span>${A.esc(v)}</span>`;
    }
    return `<span class="${isBest ? "best" : ""}">${A.esc(shown)}${isBest ? " <b class='best-mark'>較優</b>" : ""}</span>`;
  }

  function renderView() {
    const n = current.length;
    const onlyDiff = $("only-diff").checked;
    $("cmp-head").style.setProperty("--n", n);
    $("cmp-head").innerHTML = current.map((t) =>
      `<div class="cmp-car"><b>${A.esc(t.車款)}</b><span>${A.esc(t.名稱)}</span></div>`).join("");
    $("cmp-summary").innerHTML = summary().map((p) => `<p>${p}</p>`).join("");

    const sections = [];
    const same = sameModelRows();
    if (same) sections.push({ 名稱: n === 2 ? "這兩個版本的差異" : "這幾個版本的差異", rows: same });
    for (const cat of CFG.分類) {
      if (same && cat.類型 === "關鍵配備") continue; // 同款比較時，版本差異已經涵蓋配備
      sections.push({ 名稱: cat.名稱, rows: rowsFor(cat) });
    }

    let html = "";
    for (const sec of sections) {
      const rows = sec.rows.filter((r) => !onlyDiff || new Set(r.值.map((v) => JSON.stringify(v))).size > 1);
      if (!rows.length) continue;
      html += `<h3 class="cmp-sec">${A.esc(sec.名稱)}</h3>`;
      for (const r of rows) {
        html += `<div class="cmp-row"><p class="cmp-label">${A.esc(r.名稱)}</p><div class="cmp-vals" style="--n:${n}">` +
          r.值.map((v, i) => `<div>${cell(v, r.布林, r.顯示 && r.顯示[i], r.best !== null && r.best !== undefined && v === r.best)}</div>`).join("") +
          `</div></div>`;
      }
    }
    if (!html) html = `<p class="note">這幾台在列出的項目上完全一樣。</p>`;
    $("cmp-table").innerHTML = html;
    const p = A.RULES["計算參數"];
    $("cmp-foot").textContent = `價格為台灣馬自達公告之建議售價。規格以台灣官方型錄為準。標示 * 的${A.RULES["結果頁文字"].海外數據註記}。` +
      `油錢以每年 ${A.fmt(p.每年行駛公里)} 公里、油價每公升 ${p.油價每公升} 元估算。本網站由 ${window.SITE.顧問職稱}個人製作，非台灣馬自達官方網站。`;
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
      const diff = t.建議售價 - base.建議售價;
      parts.push(diff ? `${name(t)} 比 ${name(base)} 貴 <b>${A.wan(diff)}元</b>。` : `${name(t)} 和 ${name(base)} 建議售價一樣。`);
      const gain = [], lose = [];
      for (const k of A.DATA["關鍵配備清單"]) {
        if (t.關鍵配備[k] && !base.關鍵配備[k]) gain.push(A.fname(k));
        if (!t.關鍵配備[k] && base.關鍵配備[k]) lose.push(A.fname(k));
      }
      if (gain.length) parts.push(`多了：${gain.join("、")}。`);
      if (lose.length) parts.push(`但少了：${lose.join("、")}。`);
      const dl = Math.round((t.全長 - base.全長) / 10);
      if (Math.abs(dl) >= 10) parts.push(`車身${dl > 0 ? "長" : "短"} ${Math.abs(dl)} 公分。`);
      if (t.行李廂L && base.行李廂L && Math.abs(t.行李廂L - base.行李廂L) >= 30) {
        const more = t.行李廂L > base.行李廂L;
        parts.push(`後車廂${more ? "大" : "小"} ${Math.abs(t.行李廂L - base.行李廂L)} L${overseas(t) || overseas(base) ? "*" : ""}。`);
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
    const list = current.map((t, i) => `${i + 1}. ${t.車款} ${t.名稱}`).join("\n");
    const full = `你好，我用選車小幫手比較了：\n${list}\n\n兩台都想實際試試看，想約時間試乘比較。`.replace("兩台", current.length === 2 ? "兩台" : "這幾台");
    const short = `選車小幫手比較：${current.map((t) => `${t.車款} ${t.名稱}`).join("／")}，想約試乘比較`;
    A.sendLineText(full, short);
  }

  // ---------- 綁定 ----------
  $("go-compare").addEventListener("click", () => open([]));
  $("do-compare").addEventListener("click", () => view(slots.filter(Boolean)));
  $("pick-back").addEventListener("click", () => A.show("home"));
  $("view-back").addEventListener("click", () => { renderPick(); A.show("compare-pick"); });
  $("only-diff").addEventListener("change", renderView);
  $("cmp-line").addEventListener("click", sendLine);
  $("cmp-home").addEventListener("click", () => A.show("home"));
  document.addEventListener("app-ready", init);
  window.Compare = { open };
})();
