/* 單一車款介紹頁。
 * ⚙️ 自動區塊：從車款資料產生（版本階梯、台灣生活資訊、常被比較的車），改款時自動更新。
 * ✍️ 士倫觀點：讀自 車款介紹.json，空白的區塊自動隱藏。
 * 依漏斗原則，這一頁不放 YouTube 影片或連回 YouTube 的連結。 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let A, TRIMS, CARS, INTRO = {};
  let current = null;   // 目前的車款
  let heroTrim = null;  // 開場大圖使用的版本

  async function init() {
    A = window.App;
    TRIMS = window.Engine.loadTrims(A.DATA, A.RULES);
    CARS = A.DATA["車款"].filter((c) => c.上架 !== false);
    try { INTRO = await (await fetch(encodeURI(window.SITE.車款介紹))).json(); } catch (e) { INTRO = {}; }
    $("go-models").disabled = false;
    const m = location.search.match(/[?&]car=([^&]+)/);
    if (m && CARS.some((c) => c.id === decodeURIComponent(m[1]))) openModel(decodeURIComponent(m[1]));
  }

  const trimsOf = (id) => TRIMS.filter((t) => t.車款id === id);
  const esc = (s) => A.esc(s);
  const wan = (n) => A.wan(n);
  const priceRange = (ts) => {
    const ps = ts.map((t) => t.建議售價), lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? `${wan(lo)}元` : `${wan(lo).replace(" 萬", "")}～${wan(hi)}元`;
  };
  const range = (ts, f, unit = "") => {
    const v = [...new Set(ts.map((t) => t[f]).filter((x) => x !== null && x !== undefined))];
    if (!v.length) return "—";
    if (typeof v[0] !== "number") return v.join("／");
    const lo = Math.min(...v), hi = Math.max(...v);
    return (lo === hi ? A.fmt(lo) : `${A.fmt(lo)}～${A.fmt(hi)}`) + unit;
  };
  const filled = (x) => Array.isArray(x) ? x.length > 0 : !!x;

  // ---------- 車款列表 ----------
  function openList() {
    $("model-list").innerHTML = CARS.map((c) => {
      const ts = trimsOf(c.id);
      return `<button type="button" class="model-card" data-car="${esc(c.id)}">
        ${c.圖片 ? `<img src="${esc(c.圖片)}" alt="" loading="lazy">` : ""}
        <b>${esc(c.名稱)}</b><span>${esc(c.車型分類)}</span><span class="mc-price">${priceRange(ts)}</span></button>`;
    }).join("");
    for (const b of $("model-list").querySelectorAll(".model-card")) b.addEventListener("click", () => openModel(b.dataset.car));
    setUrl(null);
    A.show("models");
  }

  function setUrl(carId) {
    const u = new URL(location.href);
    u.searchParams.delete("compare");
    if (carId) u.searchParams.set("car", carId); else u.searchParams.delete("car");
    history.replaceState(null, "", u);
  }

  // ---------- 車款介紹頁 ----------
  function openModel(carId) {
    current = CARS.find((c) => c.id === carId);
    const ts = trimsOf(carId);
    const intro = INTRO[carId] || {};
    const recs = [].concat(intro.推薦版本 || []);   // 可以推薦一個或多個版本
    heroTrim = ts.find((t) => t.id === recs[0]) || ts[0];
    A.preloadColors([heroTrim]);
    const recColor = intro.推薦車色 && (heroTrim.車色 || []).find((c) => c.代號 === intro.推薦車色);
    if (recColor && !A.hasColor(heroTrim.id)) A.setColor(heroTrim.id, recColor.代號);
    setUrl(carId);

    const sections = [];
    // 1 開場
    sections.push(`<header class="mp-hero">
      <p class="eyebrow">${esc(current.車型分類)}${current.產地 ? `｜${esc(current.產地)}` : ""}</p>
      <h1 class="mp-name">${esc(current.名稱)}</h1>
      ${filled(intro.一句話) ? `<p class="mp-tagline">${esc(intro.一句話)}</p>` : ""}
      ${ratings().length ? `<ul class="badges">${ratings().map((r) =>
        `<li>🛡️ ${esc(r.地區)} ${esc(r.機構)}${r.機構 === "IIHS" ? " " + r.年份 : ""} ${esc(r.等級)}</li>`).join("")}</ul>` : ""}
      <p class="mp-price"><span>建議售價</span>${priceRange(ts)}<small>共 ${ts.length} 個版本</small></p>
      ${A.colorViewer(heroTrim)}
      ${recColor ? `<p class="rec-color">士倫最常推薦：<b>${esc(recColor.名稱)}</b></p>` : ""}
    </header>`);
    // 2 適合誰／不適合誰
    if (filled(intro.適合) || filled(intro.不適合)) {
      sections.push(section("適合誰？不適合誰？", "fit", `<div class="two-col">
        ${filled(intro.適合) ? `<div class="fit-box good"><h3>適合你，如果……</h3><ul>${intro.適合.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${filled(intro.不適合) ? `<div class="fit-box bad"><h3>可能不適合，如果……</h3><ul>${intro.不適合.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>`, true));
    }
    // 3 版本怎麼選
    sections.push(section(ts.length > 1 ? "版本怎麼選？" : "標準配備有哪些？", "trims", ladder(ts, intro)));
    // 4 優缺點
    if (filled(intro.優點) || filled(intro.缺點)) {
      sections.push(section("實際的優點和缺點", "proscons", `<div class="two-col">
        ${filled(intro.優點) ? `<div class="fit-box good"><h3>優點</h3><ul>${intro.優點.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${filled(intro.缺點) ? `<div class="fit-box bad"><h3>缺點</h3><ul>${intro.缺點.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>`, true));
    }
    // 5 展間最常被問的問題
    const faq = (intro.常見問題 || []).filter((q) => q.問 && q.答);
    if (faq.length) {
      sections.push(section("展間最常被問的問題", "faq", faq.map((q) =>
        `<details class="faq"><summary>${esc(q.問)}</summary><p>${esc(q.答)}</p></details>`).join(""), true));
    }
    // 6 台灣生活實用資訊
    sections.push(section("台灣生活實用資訊", "life", lifeInfo(ts)));
    // 7 常被拿來比較的車
    sections.push(section("常被拿來比較的車", "rivals", rivals(heroTrim)));

    $("model-body").innerHTML = sections.join("");
    $("model-cta-lead").textContent = `想親自坐坐看 ${current.名稱}？`;
    const p = A.RULES["計算參數"];
    $("model-foot").textContent = `價格為台灣馬自達公告之建議售價。規格、配備以台灣官方型錄為準；車輛圖片來源：台灣馬自達官網。` +
      (ratings().length ? "安全評等為海外第三方測試成績，海外車型配備可能和台灣版不同。" : "") +
      `標示 * 的${A.RULES["結果頁文字"].海外數據註記}。油錢以每年 ${A.fmt(p.每年行駛公里)} 公里、油價每公升 ${p.油價每公升} 元估算。` +
      `本網站由 ${window.SITE.顧問職稱}個人製作，非台灣馬自達官方網站。`;
    for (const b of $("model-body").querySelectorAll("[data-compare]")) {
      b.addEventListener("click", () => window.Compare.open(b.dataset.compare.split(",")));
    }
    A.show("model");
  }

  // 仍在有效期限內的安全評等（IIHS 一年、Euro NCAP／ANCAP 六年）
  function ratings() {
    const limit = A.DATA["安全評等有效年限"] || {};
    const year = new Date().getFullYear();
    return (current.安全評等 || []).filter((r) => !limit[r.機構] || year - r.年份 < limit[r.機構]);
  }

  function section(title, id, body, byAdvisor) {
    return `<section class="mp-sec" id="mp-${id}"><h2>${esc(title)}${byAdvisor ? `<span class="by">士倫觀點</span>` : ""}</h2>${body}</section>`;
  }

  // 版本階梯：多花多少、多了什麼（同車身才比）
  function ladder(ts, intro) {
    const recs = [].concat(intro.推薦版本 || []);
    const bodies = [...new Set(ts.map((t) => t.車身類型))];
    let html = "";
    for (const body of bodies) {
      const list = ts.filter((t) => t.車身類型 === body).sort((a, b) => a.建議售價 - b.建議售價);
      if (bodies.length > 1) html += `<h3 class="ladder-body">${esc(A.typeLabel(list[0]))}</h3>`;
      html += `<ol class="ladder">` + list.map((t, i) => {
        const prev = list[i - 1];
        let detail;
        if (!prev) detail = `<p class="ld-sub">${ts.length > 1 ? "入門版本，基本配備就有：" : "單一版本，標準配備有："}</p><ul>${(current.全車系標配重點 || []).slice(0, 5).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
        else {
          const g = stepGains(prev, t);
          detail = `<p class="ld-sub">比 ${esc(prev.名稱)} 多 <b>${wan(t.建議售價 - prev.建議售價)}元</b>${g.length ? "，多了：" : "，主要差在外觀細節"}</p>` +
            (g.length ? `<ul>${g.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join("")}${g.length > 8 ? `<li class="more">等共 ${g.length} 項</li>` : ""}</ul>` : "");
        }
        const isRec = recs.includes(t.id);
        return `<li class="ld${isRec ? " rec" : ""}">
          <div class="ld-head"><b>${esc(t.名稱)}</b><span>${wan(t.建議售價)}元</span>${isRec ? `<em>士倫推薦</em>` : ""}</div>
          ${detail}
          ${isRec && filled(intro.推薦理由) && t.id === recs.find((id) => list.some((x) => x.id === id)) ? `<p class="ld-why"><b>為什麼推薦：</b>${esc(intro.推薦理由)}</p>` : ""}
        </li>`;
      }).join("") + `</ol>`;
    }
    if (ts.length > 1) {
      const pair = ts.length >= 2 ? [ts[0].id, ts[1].id].join(",") : "";
      html += `<button type="button" class="ghost strong" data-compare="${pair}">詳細比較這款車的版本 →</button>`;
    }
    return html;
  }

  // 這款車自己的「版本差異」：上一個版本沒有、這個版本有的，或是規格升級的
  function stepGains(prev, t) {
    const idx = (x) => current.版本.findIndex((v) => v.id === x.id);
    const a = idx(prev), b = idx(t), out = [];
    if (prev.引擎 !== t.引擎) out.push(t.引擎);
    if (prev.驅動 !== t.驅動 && t.驅動.includes("四輪")) out.push("四輪驅動");
    for (const d of current.版本差異 || []) {
      const x = d.值[a], y = d.值[b];
      if (y === x || y === false || y === null || y === undefined) continue;
      if (y === true) out.push(d.項目);
      else if (x === false) out.push(`${d.項目}（${y}）`);
      else out.push(`${d.項目}：${y}`);
    }
    return out.length ? out : A.gains(prev, t);   // 沒有版本差異資料時，用通用的配備對照
  }

  // 台灣生活實用資訊
  function lifeInfo(ts) {
    const mechH = A.RULES["機械車位"].不知道時採用的高度;
    const maxH = Math.max(...ts.map((t) => t.全高));
    const fits = maxH <= mechH;
    // 每年養車成本四捨五入到千元，用「萬」顯示（例如 約 4.7 萬元）
    const cs = [...new Set(ts.map((t) => Math.round(t.每年養車成本 / 1000) * 1000))];
    const lo = Math.min(...cs), hi = Math.max(...cs);
    const cost = lo === hi ? wan(lo) : `${wan(lo).replace(" 萬", "")}～${wan(hi)}`;
    const overseas = ts.some((t) => t.行李廂來源 && !t.行李廂來源.startsWith("台灣"));
    const rows = [
      ["機械車位", fits ? `✓ 停得進限高 ${A.fmt(mechH)} mm 的機械車位` : `車高 ${A.fmt(maxH)} mm，停不進限高 ${A.fmt(mechH)} mm 的機械車位`, fits ? "ok" : "warn"],
      ...(current.產地 ? [["產地", current.產地]] : []),
      ["車身尺寸", `長 ${range(ts, "全長")} × 寬 ${range(ts, "全寬")} × 高 ${range(ts, "全高")} mm`],
      ["迴轉半徑", `${range(ts, "迴轉半徑")} m`],
      ["座位", range(ts, "座位數", " 人")],
      ["後車廂", `${range(ts, "行李廂L", " L")}${overseas ? "*" : ""}`],
      ["引擎", range(ts, "引擎")],
      ["馬力", range(ts, "馬力ps", " ps")],
      ["驅動", [...new Set(ts.map((t) => (t.驅動.includes("四輪") ? "四輪驅動" : t.驅動.includes("後輪") ? "後輪驅動" : "前輪驅動")))].join("／")],
      ["油耗", range(ts, "油耗kmL", " km/L")],
      ["每年稅金＋油錢", `約 ${cost}元`],
    ];
    return `<dl class="life">${rows.map(([k, v, cls]) => `<div class="${cls || ""}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  }

  // 常被拿來比較的車：價格最接近的 2 款（同車型優先）
  function rivals(base) {
    const mid = (id) => { const ps = trimsOf(id).map((t) => t.建議售價); return (Math.min(...ps) + Math.max(...ps)) / 2; };
    const me = mid(current.id);
    const others = CARS.filter((c) => c.id !== current.id).map((c) => {
      const t0 = trimsOf(c.id)[0];
      return { c, d: Math.abs(mid(c.id) - me) + (t0.車身類型 === base.車身類型 ? 0 : 150000) };
    }).sort((a, b) => a.d - b.d).slice(0, 2);
    return `<div class="rivals">` + others.map(({ c }) => {
      const ts = trimsOf(c.id);
      const near = ts.reduce((a, b) => (Math.abs(b.建議售價 - base.建議售價) < Math.abs(a.建議售價 - base.建議售價) ? b : a));
      const diff = near.建議售價 - base.建議售價;
      return `<button type="button" class="rival" data-compare="${esc(base.id)},${esc(near.id)}">
        ${c.圖片 ? `<img src="${esc(c.圖片)}" alt="" loading="lazy">` : ""}
        <b>${esc(current.名稱)} vs ${esc(c.名稱)}</b>
        <span>${esc(base.名稱)} 對 ${esc(near.名稱)}（${diff ? `${diff > 0 ? "貴" : "便宜"} ${wan(Math.abs(diff))}元` : "同價"}）</span>
        <i>看比較 →</i></button>`;
    }).join("") + `</div>`;
  }

  // ---------- LINE ----------
  function sendLine() {
    const c = A.colorOf(heroTrim);
    const color = c ? `（${c.名稱}）` : "";
    const full = `你好，我看了選車小幫手的 ${current.名稱} 介紹，想約時間試乘 ${current.名稱}${color}。`;
    A.sendLineText(full, `想試乘 ${current.名稱}${color}（選車小幫手）`);
  }

  // ---------- 綁定 ----------
  $("go-models").addEventListener("click", openList);
  $("models-back").addEventListener("click", () => { setUrl(null); A.show("home"); });
  $("model-back").addEventListener("click", openList);
  $("model-line").addEventListener("click", sendLine);
  $("model-quiz").addEventListener("click", () => { setUrl(null); $("go-quiz").click(); });
  document.addEventListener("app-ready", init);
  window.Model = { open: openModel, list: openList };
})();
