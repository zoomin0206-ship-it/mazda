/* 士倫車 Mazda 選車指南：畫面流程。題目、選項文字全部讀自 題目與規則.json */
(function () {
  "use strict";
  const carType = (x) => (x.endsWith("車") ? x : x + "車"); // 轎車／掀背車／休旅車
  const S = window.SITE;
  let DATA = null, RULES = null, INTRO = {};
  let answers = {}, history = [], current = null, extra = {}, shared = false;

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString("zh-TW");
  const wan = (n) => {
    const w = n / 10000;
    return (Number.isInteger(w) ? w : w.toFixed(1).replace(/\.0$/, "")) + " 萬";
  };
  const FEATURE_NAME = {
    前座通風: "座椅通風", 前座加熱: "座椅加熱", 電動尾門: "電動尾門", "360環景": "360 度環景",
    BOSE音響: "BOSE 音響", 無線充電: "無線充電", 全景天窗: "全景天窗", 抬頭顯示器HUD: "抬頭顯示器",
    四輪驅動: "四輪驅動",
  };
  const fname = (k) => FEATURE_NAME[k] || k;

  // ---------- 載入 ----------
  async function load() {
    $("advisor-line").textContent = `${S.展間}｜${S.顧問職稱} ${S.顧問名稱}`;
    $("about-avatar").textContent = S.顧問名稱.slice(-1);
    $("about-name").textContent = `${S.顧問職稱} ${S.顧問名稱}`;
    $("about-role").textContent = `${S.展間}｜${S.年資.replace(/^在 Mazda /, "")}`;
    $("about-title").textContent = S.自我介紹標題;
    $("about-text").textContent = S.自我介紹;
    try {
      const [d, r] = await Promise.all([fetch(encodeURI(S.車款資料)), fetch(encodeURI(S.題目規則))]);
      DATA = await d.json();
      // 網頁上的版本名稱：Sedan／Hatchback 改成中文（資料檔維持型錄寫法）
      for (const c of DATA["車款"]) for (const v of c["版本"]) v.名稱 = v.名稱.replace(/^Sedan /, "四門轎車 ").replace(/^Hatchback /, "五門掀背車 ");
      RULES = await r.json();
      try { INTRO = await (await fetch(encodeURI(S.車款介紹))).json(); } catch (e) { INTRO = {}; }
      window.App.DATA = DATA;
      window.App.RULES = RULES;
      document.dispatchEvent(new Event("app-ready"));
      openShared();
      const n = RULES["題目"].filter((q) => !q.只在).length;
      $("quiz-desc").textContent = `回答 ${n} 個問題，約 1 分鐘，幫你縮小到最適合的車款`;
    } catch (e) {
      $("home").insertAdjacentHTML("beforeend", '<p class="error">資料載入失敗，請稍後再試。</p>');
      $("go-quiz").disabled = true;
    }
  }

  // 畫面切換：每換一個畫面就記進瀏覽器歷史，手機的返回手勢／返回鍵才會回到上一個畫面，而不是直接離開網站
  // opts.url：這個畫面的網址（例如 ?car=cx5）；opts.state：還原畫面需要的資料；opts.pop：是從返回手勢還原的，不要再記一次
  function show(id, opts = {}) {
    for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
    $("brandbar").hidden = id === "home";
    window.scrollTo(0, 0);
    if (opts.pop) { if (id === "home") window.history.replaceState(window.history.state, "", location.pathname); return; }
    const url = opts.url || location.pathname;
    const depth = ((window.history.state && window.history.state.depth) || 0) + 1;
    window.history.pushState(Object.assign({ screen: id, depth }, opts.state || {}), "", url);
  }
  // 頁面上的「←」：有上一個畫面就回去（跟返回手勢一樣），從外部連結直接進來的就用 fallback
  function goBack(fallback) {
    if (window.history.state && window.history.state.depth > 0) window.history.back();
    else fallback();
  }
  const goHome = () => show("home");
  // 返回手勢：依記錄的畫面還原
  window.addEventListener("popstate", (e) => {
    const st = e.state || { screen: "home" };
    const pop = { pop: true };
    if (st.screen === "quiz" && st.q && RULES) {
      const i = history.lastIndexOf(st.q);
      history = i >= 0 ? history.slice(0, i) : history;
      showQuestion(st.q); return show("quiz", pop);
    }
    if (st.screen === "result" && window._last) return show("result", pop);
    if (st.screen === "model" && window.Model) return window.Model.open(st.car, { pop: true, tab: st.tab });
    if (st.screen === "models" && window.Model) return window.Model.list({ pop, eq: st.eq });
    if ((st.screen === "compare-view" || st.screen === "compare-pick") && window.Compare) return window.Compare.restore(st);
    show("home", pop);
  });

  // ---------- 題目流程 ----------
  function flow() {
    return RULES["題目"].filter((q) => {
      if (!q.只在) return true;
      const [k, v] = q.只在.split("=");
      return answers[k] === v;
    });
  }

  function startQuiz() {
    answers = {}; history = []; extra = {}; shared = false;
    const q0 = flow()[0].id;
    showQuestion(q0);
    show("quiz", { state: { q: q0 } });
  }

  // 題目選項：「選項來源」＝車款 時，從上架車款自動產生（例如第 1 題「心裡已經有想看的車嗎？」）
  function qOpts(q) {
    if (q.選項來源 !== "車款") return q.選項;
    // 「還沒有」放第一個（士倫 2026-11-28：大部分人還沒決定），車款排在後面
    return q.選項.concat(DATA["車款"].filter((c) => c.上架 !== false).map((c, i) => ({ id: c.id, 文字: c.名稱, 分隔: i === 0 ? q.車款前的提示 : "" })));
  }

  function showQuestion(qid) {
    current = RULES["題目"].find((q) => q.id === qid);
    // 進度只算主要題目；追問題（例如機械車位限高）沿用上一題的題號
    const main = RULES["題目"].filter((q) => !q.只在);
    const parentId = current.只在 ? current.只在.split("=")[0] : qid;
    const idx = main.findIndex((q) => q.id === parentId);
    $("step").textContent = `${idx + 1} / ${main.length}`;
    $("progress-bar").style.width = `${((idx + 1) / main.length) * 100}%`;
    $("q-title").textContent = current.題目;
    $("q-sub").textContent = current.副標 || (current.類型 === "單選" ? "選一個最接近的" : "");
    const multi = current.類型 === "複選";
    const box = $("options");
    box.innerHTML = "";
    box.setAttribute("role", multi ? "group" : "radiogroup");
    const sel = new Set([].concat(answers[qid] || []));
    for (const o of qOpts(current).filter(available)) {
      const b = document.createElement("button");
      b.className = "option" + (multi ? " multi" : "");
      b.type = "button";
      b.setAttribute("aria-pressed", sel.has(o.id) ? "true" : "false");
      b.innerHTML = `<span class="mark" aria-hidden="true"></span><span class="option-text"></span>`;
      b.querySelector(".option-text").textContent = o.文字;
      b.addEventListener("click", () => choose(o.id, b));
      if (o.分隔) { const h = document.createElement("p"); h.className = "opt-divider"; h.textContent = o.分隔; box.appendChild(h); }
      box.appendChild(b);
    }
    $("next").hidden = !multi;
    updateNext();
  }

  function choose(oid, btn) {
    const q = current;
    if (q.類型 === "單選") {
      answers[q.id] = oid;
      for (const b of $("options").querySelectorAll(".option")) b.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-pressed", "true");
      setTimeout(next, 220);
      return;
    }
    let sel = new Set(answers[q.id] || []);
    if (sel.has(oid)) sel.delete(oid);
    else {
      const anyOpt = q.選項.find((o) => o.車身類型 === null);
      if (anyOpt && oid === anyOpt.id) sel = new Set();
      else if (anyOpt) sel.delete(anyOpt.id);
      if (q.最多 && sel.size >= q.最多) {
        toast(`最多選 ${q.最多} 個`);
        return;
      }
      sel.add(oid);
    }
    answers[q.id] = [...sel];
    const ids = qOpts(q).filter(available).map((o) => o.id);
    [...$("options").querySelectorAll(".option")].forEach((b, i) => b.setAttribute("aria-pressed", sel.has(ids[i]) ? "true" : "false"));
    updateNext();
  }

  // 選項是否有對應的上架車款：車型、配備沒有任何車符合時自動隱藏
  let TRIMS = null;
  function available(o) {
    TRIMS = TRIMS || window.Engine.loadTrims(DATA, RULES);
    if (o.車身類型) return TRIMS.some((t) => t.車身類型 === o.車身類型);
    if (o.配備) return TRIMS.some((t) => t.關鍵配備[o.配備]);
    if (o.最少座位) return TRIMS.some((t) => t.座位數 >= o.最少座位);
    return true;
  }

  function updateNext() {
    const q = current, n = $("next");
    if (q.類型 !== "複選") return;
    const count = (answers[q.id] || []).length;
    const optional = q.id === "life";
    n.disabled = !count && !optional;
    n.textContent = !count && optional ? "都沒有，跳過" : isLast() ? "看結果" : "下一題";
  }

  function isLast() {
    const list = flow();
    return list[list.length - 1].id === current.id;
  }

  function next() {
    if (current.類型 === "複選" && !answers[current.id]) answers[current.id] = [];
    const list = flow();
    const idx = list.findIndex((q) => q.id === current.id);
    history.push(current.id);
    if (idx + 1 < list.length) { const q = list[idx + 1].id; showQuestion(q); show("quiz", { state: { q } }); }
    else showResult();
  }

  function back() {
    goBack(() => { if (!history.length) return show("home"); const q = history.pop(); showQuestion(q); show("quiz", { state: { q } }); });
  }

  // ---------- 結果 ----------
  const REASON = {
    小車身: (t) => `車長 ${fmt(t.全長)} mm、迴轉半徑 ${t.迴轉半徑} m，好停又好開`,
    大後車廂: (t) => t.行李廂L ? `後車廂 ${t.行李廂L} L${overseas(t) ? "*" : ""}，行李、推車都放得下` : null,
    大空間: (t) => `軸距 ${fmt(t.軸距)} mm、車寬 ${fmt(t.全寬)} mm，車內寬敞`,
    好上下車: (t) => t.車身類型 === "休旅" ? "休旅車座椅高度接近腰部，上下車輕鬆" : `車高 ${fmt(t.全高)} mm`,
    低養車成本: (t) => `每年稅金＋油錢約 ${wan(Math.round(t.每年養車成本 / 1000) * 1000)}元`,
    駕駛樂趣: (t) => `${t.馬力ps} 匹馬力、車重 ${fmt(t.空車重)} kg，` + (t.車身類型 === "跑車" ? "人車一體的駕駛樂趣" : "開起來靈活有勁"),
    休旅偏好: () => "休旅車型，視野高、載物彈性大",
    四驅偏好: () => "四輪驅動，山路、雨天更穩",
    停車輔助: () => "有 360 度環景影像，停車不緊張",
  };
  const overseas = (t) => t.行李廂來源 && !t.行李廂來源.startsWith("台灣");

  function showResult() {
    const { results, notes, excluded } = window.Engine.recommend(DATA, RULES, answers, recIds());
    $("excluded").hidden = !excluded.length;
    $("excluded").open = true;
    $("excluded-list").innerHTML = excluded.map((x) => `<li><b>${esc(x.車款)}</b>：${esc(x.原因)}</li>`).join("");
    const T = RULES["結果頁文字"];
    $("result-title").textContent = results.length > 1 ? "最適合你的兩款車" : "最適合你的車";
    $("result-notes").innerHTML = notes.map((n) => `<p class="note">${esc(n)}</p>`).join("") + bodyNote(results);
    $("cards").innerHTML = results.map((r, i) => card(r, i, results.length, results[0])).join("");
    $("want-box").innerHTML = wantBox(results, excluded);
    $("want-box").hidden = !$("want-box").innerHTML;
    $("cta-lead").textContent = T.結尾;
    $("cta-store").textContent = `${S.展間}（${S.展間地區}）｜${S.顧問職稱} ${S.顧問名稱}`;
    renderExtra();
    const SH = RULES["結果頁文字"].分享 || {};
    $("shared-banner").hidden = !shared;
    $("shared-text").textContent = SH.收到的提示 || "";
    $("shared-quiz").textContent = SH.收到的按鈕 || "我也來測一次 →";
    $("send-line").textContent = S.LINE帳號 ? "把結果傳到 LINE，預約賞車試乘" : "把結果傳到 LINE（帳號設定中）";
    const p = RULES["計算參數"];
    $("disclaimer").textContent =
      `價格為台灣馬自達公告之建議售價。規格以台灣官方型錄為準；車輛圖片來源：台灣馬自達官網。標示 * 的${T.海外數據註記}。` +
      `每年養車成本以每年 ${fmt(p.每年行駛公里)} 公里、油價每公升 ${p.油價每公升} 元估算。` +
      `本網站由 ${S.顧問職稱}個人製作，非台灣馬自達官方網站。`;
    window._last = results;
    preloadColors(results.map((r) => r.t));
    $("compare-these-box").hidden = results.length < 2;
    const carIds = [...new Set(results.map((r) => r.t.車款id))];
    $("res-models").innerHTML = carIds.map((id) => { const r = results.find((x) => x.t.車款id === id); return `<button type="button" class="next-link" data-model="${esc(id)}">看 ${esc(r.t.車款)} →</button>`; }).join("");
    show("result");
  }



  // ---------- 結果後的小問題（2026-11-28）：可以跳過，答案只帶進 LINE 訊息 ----------
  function renderExtra() {
    const X = RULES["結果後小問題"];
    if (!X) return;
    const skip = (q) => q.略過條件 && (() => { const [k, v] = q.略過條件.split("="); return [].concat(answers[k] || []).includes(v); })();
    $("extra-q").innerHTML = `<p class="extra-h">${esc(X.標題)}<span>${esc(X.副標)}</span></p>` +
      X.題目.filter((q) => !skip(q)).map((q) => `<p class="extra-l">${esc(q.題目)}</p><div class="extra-opts">${q.選項.map((o) =>
        `<button type="button" class="extra-opt" data-q="${esc(q.id)}" data-v="${esc(o)}" aria-pressed="${extra[q.id] === o}">${esc(o)}</button>`).join("")}</div>`).join("");
  }
  function onExtra(e) {
    const b = e.target.closest(".extra-opt");
    if (!b) return;
    extra[b.dataset.q] = extra[b.dataset.q] === b.dataset.v ? undefined : b.dataset.v;  // 再點一次取消
    renderExtra();
  }

  // ---------- 結果連結：把回答放進網址，打開就是同一份結果 ----------
  // 2026-11-28 士倫：不放「傳給家人一起看」按鈕（等於提醒客戶「回去跟家人討論」，會影響漏斗）。
  // 下面 shareFamily 目前沒有按鈕會呼叫；openShared 保留，之後士倫可以在 LINE 附上客戶的結果連結
  const encAns = (a) => btoa(unescape(encodeURIComponent(JSON.stringify(a)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const decAns = (x) => JSON.parse(decodeURIComponent(escape(atob(x.replace(/-/g, "+").replace(/_/g, "/")))));
  async function shareFamily() {
    const T = RULES["結果頁文字"].分享;
    const url = `${location.origin}${location.pathname}?ans=${encAns(answers)}`;
    const cars = (window._last || []).map((r) => r.t.車款).join("、");
    const text = T.分享文字.replace("{車款}", cars);
    if (navigator.share) {
      try { await navigator.share({ title: "士倫車｜Mazda 選車指南", text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    if (isMobile()) { window.location.href = "https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + url); return; }
    try { await navigator.clipboard.writeText(text + "\n" + url); toast("連結已複製，貼到 LINE 傳給家人就可以了"); }
    catch (e) { prompt("複製這個連結傳給家人：", url); }
  }
  // 打開家人傳來的連結：直接顯示同一份結果
  function openShared() {
    const m = location.search.match(/[?&]ans=([^&]+)/);
    if (!m) return false;
    try {
      const a = decAns(m[1]);
      const ids = new Set(RULES["題目"].map((q) => q.id));
      if (!a || typeof a !== "object" || !Object.keys(a).every((k) => ids.has(k))) return false;
      answers = a; shared = true; showResult();
      return true;
    } catch (e) { return false; }
  }



  // ---------- 推薦的車型跟客戶選的不一樣時，說明原因（2026-11-28 網站驗證） ----------
  function bodyNote(results) {
    const X = RULES["車型不符說明"];
    if (!X || !results.length) return "";
    const want = new Set((answers.body || []).map((x) => (RULES["題目"].find((q) => q.id === "body").選項.find((o) => o.id === x) || {}).車身類型).filter(Boolean));
    const t = results[0].t;
    if (!want.size || want.has(t.車身類型)) return "";
    const picked = [].concat(answers.who || [], answers.use || []);
    const why = Object.entries(X.原因).filter(([k]) => picked.includes(k)).map(([, v]) => v);
    if (!why.length) return "";
    const name = [...want].map((b) => ({ 轎車: "轎車", 掀背: "掀背車", 休旅: "休旅車" }[b] || b)).join("或");
    const rec = { 轎車: "轎車", 掀背: "掀背車", 休旅: "休旅車" }[t.車身類型] || t.車身類型;
    return `<div class="note body-note"><p>${esc(X.開頭.replace("{選的車型}", name).replace("{推薦車型}", rec))}</p><ul>${why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p>${esc(X.結尾.replace("{選的車型}", name))}</p></div>`;
  }

  // ---------- 客戶原本想看的車（第 1 題，2026-11-28）：有推薦就說眼光不錯，沒推薦就說明原因、可以一鍵比較 ----------
  function wantBox(results, excluded) {
    const w = answers.want;
    if (!w || w === "none") return "";
    const car = DATA["車款"].find((c) => c.id === w);
    if (!car) return "";
    if (results.some((r) => r.t.車款id === w)) return `<p class="want-yes">👍 你原本想看的 <b>${esc(car.名稱)}</b> 也在推薦裡，眼光不錯！</p>`;
    const why = (excluded.find((x) => x.車款id === w) || {}).原因;
    const recs = recOf(w);
    const ts = window.Engine.loadTrims(DATA, RULES).filter((t) => t.車款id === w && !t.不主動推薦);
    const t = ts.find((x) => recs.includes(x.id)) || ts.sort((a, b) => a.建議售價 - b.建議售價)[0];
    window._wantCompare = t && results[0] ? [results[0].t.id, t.id] : null;
    return `<p class="want-h">你原本想看的 <b>${esc(car.名稱)}</b>，這次沒有排進推薦</p>` +
      (why ? `<p class="want-why">原因：${esc(why)}</p>` : "") +
      (window._wantCompare ? `<button type="button" class="next-link" id="want-compare">把 ${esc(car.名稱)} 和 ${esc(results[0].t.車款)} 放在一起比較 →</button>` : "") +
      `<p class="want-note">這只是依你回答的條件排序。如果你特別喜歡 ${esc(car.名稱)}，很歡迎來看實車，我幫你一起評估。</p>`;
  }

  // ---------- 士倫怎麼說（2026-11-28）：依客戶的回答，從士倫觀點挑出相關的句子 ----------
  const recOf = (carId) => [].concat((INTRO[carId] || {}).推薦版本 || []).filter(Boolean);
  const recIds = () => Object.keys(INTRO).flatMap(recOf);
  function voice(r) {
    const t = r.t, it = INTRO[t.車款id];
    if (!it || !it.一句話) return "";
    const map = RULES["士倫觀點對應"] || {};
    // 「誰會坐」「車位」最切身，關鍵字算三倍
    const strong = new Set([].concat(answers.who || [], answers.parking || []));
    const picked = Object.values(answers).flat().filter((x) => typeof x === "string");
    const kw = new Map();
    for (const id of picked) for (const k of map[id] || []) kw.set(k, Math.max(kw.get(k) || 0, strong.has(id) ? 3 : 1));
    // CX-60 這種「2.5：…」「3.3 渦輪：…」開頭的句子，只挑跟推薦版本引擎相符的
    const engineOk = (x) => { const m = x.match(/^([\d.]+)[^：]*：/); return !m || (t.引擎 || "").startsWith(m[1]); };
    const hit = (x) => [...kw].reduce((n, [k, w]) => n + (x.includes(k) ? w : 0), 0);
    const rank = (arr) => (arr || []).filter(engineOk).map((x, i) => [x, hit(x), i]).filter((a) => a[1] > 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((a) => a[0]);
    let good = rank(it.適合).slice(0, 2);
    if (!good.length && it.適合 && it.適合.length) good = [it.適合.filter(engineOk)[0] || it.適合[0]];
    const bad = rank(it.不適合).slice(0, 1);
    const recs = recOf(t.車款id);
    let ver = "";
    if (r.士倫推薦) ver = `<p class="voice-rec"><span class="voice-tag">士倫推薦版本</span></p>${it.推薦理由 ? `<details class="voice-why"><summary>為什麼推薦這個版本</summary><p>${esc(it.推薦理由)}</p></details>` : ""}`;
    else if (recs.length) {
      // 士倫推薦版本也要有客戶需要的配備（例如要四驅，就不提後驅的版本）
      const okFor = (x) => recs.includes(x.id) && r.具備.every((k) => x.關鍵配備[k]) && x.座位數 >= t.座位數 - 1;
      const rt = (r.所有版本 || []).find((x) => okFor(x) && x.車身類型 === t.車身類型) || (r.所有版本 || []).find(okFor);
      // 比推薦的版本貴超過「士倫推薦最多多付」（20 萬）就不提：多半是給不同需求的人（例如 CX-60 3.3 是給想要大馬力的人）
      const maxMore = RULES["推薦規則"].士倫推薦最多多付 || Infinity;
      if (rt && rt.id !== t.id && rt.建議售價 - t.建議售價 <= maxMore) {
        const d = rt.建議售價 - t.建議售價;
        ver = `<details class="voice-why"><summary>士倫最常推薦的是 ${esc(rt.名稱)}（${d > 0 ? "多" : "少"} ${wan(Math.abs(d))}元）</summary><p>${esc(it.推薦理由 || "")}</p></details>`;
      }
    }
    return `<div class="voice">
        <div class="voice-head"><img src="img/brand/headshot.jpg" alt="" width="40" height="40"><div><b>士倫怎麼說</b><span>${esc(S.顧問職稱)} ${esc(S.顧問名稱)}</span></div></div>
        <p class="voice-q">「${esc(it.一句話)}」</p>
        ${good.length ? `<p class="voice-sub">跟你的情況有關</p><ul class="voice-list">${good.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${bad.length ? `<p class="voice-warn"><b>也要先跟你說：</b>${esc(bad[0])}</p>` : ""}
        ${ver}
      </div>`;
  }

  // 配備差異：b 比 a 多了哪些（依「配備對照清單」，也看驅動方式）
  function gains(a, b) {
    const out = [];
    const has = (v) => v === true || (typeof v === "string" && v !== "");
    if (a.驅動 !== b.驅動 && b.驅動.includes("四輪")) out.push("四輪驅動");
    for (const it of DATA["配備對照清單"] || []) {
      const x = a.配備 && a.配備[it.key], y = b.配備 && b.配備[it.key];
      if (has(y) && x === false) out.push(it.名稱);
      else if (it.亮點關鍵字 && typeof x === "string" && typeof y === "string" &&
               y.includes(it.亮點關鍵字) && !x.includes(it.亮點關鍵字)) out.push(it.亮點名稱);
    }
    return out;
  }
  const listText = (arr, max) => arr.slice(0, max).join("、") + (arr.length > max ? ` 等 ${arr.length} 項` : "");
  const bodyDesc = (type) => {
    const o = RULES["題目"].find((q) => q.id === "body").選項.find((x) => x.車身類型 === type);
    return o ? o.文字.split("：")[1] : "";
  };

  // 和第一推薦比：一行一個重點
  function versusFirst(t, first) {
    const rows = [];
    const d = t.建議售價 - first.建議售價;
    if (d) rows.push(["價格", `${d < 0 ? "便宜" : "貴"} ${wan(Math.abs(d))}元`]);
    if (t.車身類型 !== first.車身類型) rows.push(["車型", `${carType(t.車身類型)}（${bodyDesc(t.車身類型)}）`]);
    if (t.行李廂L && first.行李廂L && Math.abs(t.行李廂L - first.行李廂L) >= 30) {
      rows.push(["後車廂", `${t.行李廂L > first.行李廂L ? "大" : "小"} ${Math.abs(t.行李廂L - first.行李廂L)} L`]);
    }
    const more = gains(first, t), less = gains(t, first);
    if (more.length) rows.push(["多了", listText(more, 4)]);
    if (less.length) rows.push(["少了", listText(less, 4)]);
    return rows;
  }

  function card(r, i, n, firstR) {
    const t = r.t;
    const reasons = r.原因.map((k) => REASON[k] && REASON[k](t)).filter(Boolean);
    const hc = heightCap();
    if (hc && t.全高 <= hc) reasons.unshift(`車高 ${fmt(t.全高)} mm，停得進限高 ${fmt(hc)} mm 的機械車位`);
    const warn = r.提醒.filter((w) => !w.startsWith("缺少")).concat(r.缺少.length ? [`這個版本沒有：${r.缺少.map(fname).join("、")}`] : []);
    const badge = (n === 1 ? "最推薦" : i === 0 ? "第一推薦" : "第二推薦") + (answers.want === t.車款id ? "・你原本想看的車" : "");
    return `
      <article class="card${i === 0 ? " top" : ""}">
        <p class="badge">${badge}</p>
        ${colorViewer(t)}
        <h3 class="car">${esc(t.車款)}</h3>
        <p class="trim">${esc(t.名稱)}<span class="type">${esc(typeLabel(t))}</span></p>
        <p class="price"><span>建議售價</span>${wan(t.建議售價)}元</p>
        ${voice(r)}
        ${reasons.length ? `<p class="sub">為什麼適合你</p><ul class="reasons">${reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.具備.length ? `<p class="sub">你需要的配備，這個版本都有</p><p class="chips">${r.具備.map((k) => `<span class="chip">${esc(fname(k))}</span>`).join("")}</p>` : ""}
        ${warn.length ? `<ul class="warns">${warn.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <details class="card-more"><summary>規格、每年養車費用${r.可升級 ? "、升級選擇" : ""}</summary>
        <dl class="specs">
          <div><dt>座位</dt><dd>${t.座位數} 人</dd></div>
          <div><dt>車長</dt><dd>${fmt(t.全長)} mm</dd></div>
          <div><dt>車高</dt><dd>${fmt(t.全高)} mm</dd></div>
          <div><dt>後車廂</dt><dd>${t.行李廂L ? t.行李廂L + " L" + (overseas(t) ? "*" : "") : "—"}</dd></div>
          <div><dt>驅動</dt><dd>${t.驅動.includes("四輪") ? "四輪驅動" : t.驅動.includes("後輪") ? "後輪驅動" : "前輪驅動"}</dd></div>
          <div><dt>每年養車約</dt><dd>${wan(Math.round(t.每年養車成本 / 1000) * 1000)}</dd></div>
        </dl>
        ${r.可升級 ? upgradeText(r) : ""}
        </details>
        ${i > 0 && firstR ? `<div class="versus"><b>和第一推薦（${esc(firstR.t.車款)} ${esc(firstR.t.名稱)}）比</b><dl>${versusFirst(t, firstR.t).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>` : ""}
        <button type="button" class="more-link" data-model="${esc(t.車款id)}">看 ${esc(t.車款)} 完整介紹 →</button>
      </article>`;
  }

  // ---------- 車色 ----------
  // 客戶選的車色：{ 版本id: 代號 }，比較頁和 LINE 訊息都會用到
  const chosenColor = {};
  let ALL_TRIMS = null;
  function colorOf(t) {
    const cols = t.車色 || [];
    return cols.find((c) => c.代號 === (chosenColor[t.id] || t.預設車色)) || cols[0] || null;
  }
  function colorViewer(t) {
    const cols = t.車色 || [];
    if (!cols.length) return t.圖片 ? `<img class="car-img" src="${esc(t.圖片)}" alt="${esc(t.車款)}" loading="lazy">` : "";
    const cur = colorOf(t);
    return `<div class="color-viewer" data-trim="${esc(t.id)}">
      <img class="car-img big" src="${esc(cur.圖片)}" alt="${esc(t.車款)} ${esc(cur.名稱)}">
      <div class="swatches" role="radiogroup" aria-label="選擇車色">${cols.map((c) =>
        `<button type="button" class="swatch${c === cur ? " on" : ""}" role="radio" aria-checked="${c === cur}" data-code="${esc(c.代號)}"
          aria-label="${esc(c.名稱)}" style="--c:${esc(c.色碼 || "#ccc")}"></button>`).join("")}</div>
      <p class="color-name">${esc(cur.名稱)}${cur.備註 ? `<span>${esc(cur.備註)}</span>` : ""}</p>
    </div>`;
  }
  function onSwatch(e) {
    const b = e.target.closest(".swatch");
    if (!b) return;
    const box = b.closest(".color-viewer");
    ALL_TRIMS = ALL_TRIMS || window.Engine.loadTrims(DATA, RULES);
    const t = ALL_TRIMS.find((x) => x.id === box.dataset.trim);
    if (!t) return;
    chosenColor[t.id] = b.dataset.code;
    const tmp = document.createElement("div");
    tmp.innerHTML = colorViewer(t);
    box.replaceWith(tmp.firstElementChild);
  }
  // 先載入所有車色圖片，切換時不會閃一下
  function preloadColors(ts) {
    for (const t of ts) for (const c of t.車色 || []) { const i = new Image(); i.src = c.圖片; }
  }

  function upgradeText(r) {
    const up = r.可升級, g = gains(r.t, up);
    return `<div class="upgrade"><p>預算內可以升級：多 <b>${wan(up.建議售價 - r.t.建議售價)}元</b>選 <b>${esc(up.名稱)}</b></p>` +
      (g.length ? `<p class="upgrade-g">多了：${esc(listText(g, 5))}</p>` : `<p class="upgrade-g">主要差在外觀細節</p>`) + `</div>`;
  }

  function heightCap() {
    if (answers.parking !== "mech") return null;
    const h = window.Engine.opt(RULES, "mech_height", answers.mech_height).車高上限;
    return h === null ? RULES["機械車位"].不知道時採用的高度 : h;
  }

  function typeLabel(t) {
    if (!t.車型分類.includes("／")) return t.車型分類;
    return { 轎車: "四門轎車", 掀背: "五門掀背車" }[t.車身類型] || t.車型分類;
  }

  // 同一車款有不同車身（Mazda3 四門／五門）時的切換按鈕；預設五門掀背車（士倫：五門比較多人選）
  const BODY_ORDER = ["掀背", "轎車"];
  function bodiesOf(trims) { return [...new Set(trims.map((t) => t.車身類型))].sort((a, b) => BODY_ORDER.indexOf(a) - BODY_ORDER.indexOf(b)); }
  function bodySwitch(trims, cur, attr) {
    const bs = bodiesOf(trims);
    if (bs.length < 2) return "";
    return `<div class="body-switch" role="tablist">${bs.map((b) => `<button type="button" class="${b === cur ? "on" : ""}" ${attr}="${b}">${esc({ 轎車: "四門轎車", 掀背: "五門掀背車" }[b] || b)}</button>`).join("")}</div>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------- LINE ----------
  function summary() {
    const lines = ["你好，我用了士倫車 Mazda 選車指南，結果是："];
    // 不放顏色（士倫 2026-11-28）：預設顯示的顏色不是客戶選的，會誤導；需要時在 LINE 裡再問
    window._last.forEach((r, i) => lines.push(`${i + 1}. ${r.t.車款} ${r.t.名稱}`));
    lines.push("", "我的情況：");
    for (const q of flow()) {
      const a = answers[q.id];
      if (a === undefined || (Array.isArray(a) && !a.length)) continue;
      const text = [].concat(a).map((id) => qOpts(q).find((o) => o.id === id).文字).join("、");
      lines.push(`・${q.題目.replace(/？$/, "")}：${text}`);
    }
    const X = RULES["結果後小問題"];
    if (X) for (const q of X.題目) if (extra[q.id]) lines.push(`・${q.題目.replace(/？$/, "")}：${extra[q.id]}`);
    if (shared) lines.splice(1, 0, "（這是家人傳給我的結果）");
    lines.push("", "想請你幫我確認版本，並約時間賞車試乘。");
    return lines.join("\n");
  }

  // 手機（含 iPad）才能直接打開 LINE App；電腦改用 QR Code
  // 判斷是不是手機或平板。有些瀏覽器（Android Chrome 的「電腦版網站」、摺疊機展開時）會自稱電腦，
  // 也會把螢幕尺寸假裝成電腦，所以以「主要用手指觸控、沒有滑鼠」為準，這個特徵無法偽裝。
  function deviceInfo() {
    const ua = navigator.userAgent;
    const mq = (q) => !!(window.matchMedia && matchMedia(q).matches);
    const info = {
      ua: ua,
      觸控點數: navigator.maxTouchPoints || 0,
      手指觸控為主: mq("(pointer: coarse)"),
      無滑鼠懸停: mq("(hover: none)"),
      有滑鼠或觸控板: mq("(any-pointer: fine)"),
      螢幕: `${screen.width}x${screen.height}`,
      平台: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform,
    };
    info.判斷為手機 =
      /Android|iPhone|iPad|iPod|Mobile|Line\/|FBAN|FBAV|Instagram/i.test(ua) ||
      (/Macintosh/.test(ua) && info.觸控點數 > 1) ||
      /Android|iOS/i.test(info.平台) ||
      (info.觸控點數 > 0 && (info.手指觸控為主 || info.無滑鼠懸停) && !info.有滑鼠或觸控板);
    return info;
  }

  function isMobile() {
    return deviceInfo().判斷為手機;
  }

  function lineUrl(text) {
    return `https://line.me/R/oaMessage/${encodeURIComponent(S.LINE帳號)}/?${encodeURIComponent(text)}`;
  }

  // QR Code 用的精簡版訊息（太長的話 QR Code 會太密、不好掃）
  function shortSummary() {
    const cars = window._last.map((r) => `${r.t.車款} ${r.t.名稱}`).join("／");
    return `士倫車選車指南推薦：${cars}，想預約賞車`;
  }

  function sendLine() {
    return sendLineText(summary(), shortSummary());
  }

  // 共用：手機直接開 LINE；電腦顯示 QR Code（QR 用精簡訊息，避免太密掃不出來）
  async function sendLineText(text, short) {
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* 部分瀏覽器不允許，略過 */ }
    if (!S.LINE帳號) return toast("LINE 帳號設定中。結果已複製，可以先貼給朋友參考");
    if (isMobile()) {
      window.location.href = lineUrl(text);
      return;
    }
    const qr = window.qrcode(0, "L");
    qr.addData(lineUrl(short));
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    $("qr-copied").textContent = copied
      ? `完整結果也已經複製了。如果你用電腦版 LINE，可以搜尋 ${S.LINE帳號} 加入好友後直接貼上。`
      : `如果你用電腦版 LINE，可以搜尋 ${S.LINE帳號} 加入好友。`;
    $("qr-direct").href = lineUrl(text);
    $("qr-modal").hidden = false;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2600);
  }

  // 給「我要比較」等其他模組使用
  const setColor = (trimId, code) => { chosenColor[trimId] = code; };
  const hasColor = (trimId) => trimId in chosenColor;
  window.App = { show, goBack, goHome, toast, bodiesOf, bodySwitch, sendLineText, fname, typeLabel, fmt, wan, esc, colorOf, colorViewer, preloadColors, gains, listText, setColor, hasColor,
    isMobileDevice: () => isMobile(), DATA: null, RULES: null };

  // ---------- 綁定 ----------
  $("go-quiz").addEventListener("click", startQuiz);
  $("next").addEventListener("click", next);
  $("back").addEventListener("click", back);
  $("restart").addEventListener("click", startQuiz);
  $("result-back").addEventListener("click", () => goBack(() => { const q = history.pop(); if (q) { showQuestion(q); show("quiz", { state: { q } }); } else show("home"); }));
  $("brandbar").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
  $("send-line").addEventListener("click", sendLine);
  $("extra-q").addEventListener("click", onExtra);
  $("want-box").addEventListener("click", (e) => { if (e.target.closest("#want-compare") && window._wantCompare) window.Compare.open(window._wantCompare); });
  $("shared-quiz").addEventListener("click", startQuiz);
  document.addEventListener("click", onSwatch);  // 結果頁、車款介紹頁的色點都適用
  $("cards").addEventListener("click", (e) => { const b = e.target.closest(".more-link"); if (b) window.Model.open(b.dataset.model); });
  $("res-models").addEventListener("click", (e) => { const b = e.target.closest("[data-model]"); if (b) window.Model.open(b.dataset.model); });
  $("compare-these").addEventListener("click", () => window.Compare.open(window._last.map((r) => r.t.id)));
  $("qr-close").addEventListener("click", () => ($("qr-modal").hidden = true));
  $("qr-modal").addEventListener("click", (e) => { if (e.target.id === "qr-modal") $("qr-modal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("qr-modal").hidden = true; });
  window.history.replaceState({ screen: "home", depth: 0 }, "", location.pathname + location.search);
  load();

  // 診斷模式：網址加上 ?debug=1，頁面底部顯示裝置判斷資訊
  if (/[?&]debug=1/.test(location.search)) {
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;font-size:12px;background:#fff;border:1px solid #ccc;padding:10px;margin:16px;border-radius:8px";
    pre.textContent = "診斷資訊（請截圖給顧問）\n" + JSON.stringify(deviceInfo(), null, 2);
    document.body.appendChild(pre);
  }

  // 測試用：自動作答並顯示結果
  window.__answerAndShow = (a) => { answers = a; showResult(); };
})();
