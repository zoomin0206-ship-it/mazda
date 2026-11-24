/* 選車小幫手：畫面流程。題目、選項文字全部讀自 題目與規則.json */
(function () {
  "use strict";
  const S = window.SITE;
  let DATA = null, RULES = null;
  let answers = {}, history = [], current = null;

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
    try {
      const [d, r] = await Promise.all([fetch(encodeURI(S.車款資料)), fetch(encodeURI(S.題目規則))]);
      DATA = await d.json();
      RULES = await r.json();
      window.App.DATA = DATA;
      window.App.RULES = RULES;
      document.dispatchEvent(new Event("app-ready"));
      const n = RULES["題目"].filter((q) => !q.只在).length;
      $("quiz-desc").textContent = `回答 ${n} 個問題，約 1 分鐘，幫你縮小到最適合的車款`;
    } catch (e) {
      $("home").insertAdjacentHTML("beforeend", '<p class="error">資料載入失敗，請稍後再試。</p>');
      $("go-quiz").disabled = true;
    }
  }

  function show(id) {
    for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
    window.scrollTo(0, 0);
  }

  // ---------- 題目流程 ----------
  function flow() {
    return RULES["題目"].filter((q) => {
      if (!q.只在) return true;
      const [k, v] = q.只在.split("=");
      return answers[k] === v;
    });
  }

  function startQuiz() {
    answers = {}; history = [];
    showQuestion(flow()[0].id);
    show("quiz");
  }

  function showQuestion(qid) {
    current = RULES["題目"].find((q) => q.id === qid);
    const list = flow();
    const idx = list.findIndex((q) => q.id === qid);
    $("step").textContent = `${idx + 1} / ${list.length}`;
    $("progress-bar").style.width = `${((idx + 1) / list.length) * 100}%`;
    $("q-title").textContent = current.題目;
    $("q-sub").textContent = current.副標 || (current.類型 === "單選" ? "選一個最接近的" : "");
    const multi = current.類型 === "複選";
    const box = $("options");
    box.innerHTML = "";
    box.setAttribute("role", multi ? "group" : "radiogroup");
    const sel = new Set([].concat(answers[qid] || []));
    for (const o of current.選項.filter(available)) {
      const b = document.createElement("button");
      b.className = "option" + (multi ? " multi" : "");
      b.type = "button";
      b.setAttribute("aria-pressed", sel.has(o.id) ? "true" : "false");
      b.innerHTML = `<span class="mark" aria-hidden="true"></span><span class="option-text"></span>`;
      b.querySelector(".option-text").textContent = o.文字;
      b.addEventListener("click", () => choose(o.id, b));
      box.appendChild(b);
    }
    $("next").hidden = !multi;
    updateNext();
  }

  function choose(oid, btn) {
    const q = current;
    if (q.類型 === "單選") {
      answers[q.id] = oid;
      for (const b of $("options").children) b.setAttribute("aria-pressed", "false");
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
    const ids = q.選項.filter(available).map((o) => o.id);
    [...$("options").children].forEach((b, i) => b.setAttribute("aria-pressed", sel.has(ids[i]) ? "true" : "false"));
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
    if (idx + 1 < list.length) showQuestion(list[idx + 1].id);
    else showResult();
  }

  function back() {
    if (!history.length) return show("home");
    showQuestion(history.pop());
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
    const { results, notes } = window.Engine.recommend(DATA, RULES, answers);
    const T = RULES["結果頁文字"];
    $("result-title").textContent = results.length > 1 ? "最適合你的兩款車" : "最適合你的車";
    $("result-notes").innerHTML = notes.map((n) => `<p class="note">${esc(n)}</p>`).join("");
    $("cards").innerHTML = results.map((r, i) => card(r, i, results.length)).join("");
    $("cta-lead").textContent = T.結尾;
    $("cta-store").textContent = `${S.展間}（${S.展間地區}）｜${S.顧問職稱} ${S.顧問名稱}`;
    $("send-line").textContent = S.LINE帳號 ? "把結果傳到 LINE，預約賞車試乘" : "把結果傳到 LINE（帳號設定中）";
    const p = RULES["計算參數"];
    $("disclaimer").textContent =
      `價格為台灣馬自達公告之建議售價。規格以台灣官方型錄為準。標示 * 的${T.海外數據註記}。` +
      `每年養車成本以每年 ${fmt(p.每年行駛公里)} 公里、油價每公升 ${p.油價每公升} 元估算。` +
      `本網站由 ${S.顧問職稱}個人製作，非台灣馬自達官方網站。`;
    window._last = results;
    $("compare-these").hidden = results.length < 2;
    show("result");
  }

  function card(r, i, n) {
    const t = r.t;
    const reasons = r.原因.map((k) => REASON[k] && REASON[k](t)).filter(Boolean);
    const hc = heightCap();
    if (hc && t.全高 <= hc) reasons.unshift(`車高 ${fmt(t.全高)} mm，停得進限高 ${fmt(hc)} mm 的機械車位`);
    const warn = r.提醒.filter((w) => !w.startsWith("缺少")).concat(r.缺少.length ? [`這個版本沒有：${r.缺少.map(fname).join("、")}`] : []);
    const badge = n === 1 ? "最推薦" : i === 0 ? "第一推薦" : "第二推薦";
    return `
      <article class="card${i === 0 ? " top" : ""}">
        <p class="badge">${badge}</p>
        <h3 class="car">${esc(t.車款)}</h3>
        <p class="trim">${esc(t.名稱)}<span class="type">${esc(typeLabel(t))}</span></p>
        <p class="price"><span>建議售價</span>${wan(t.建議售價)}元</p>
        ${reasons.length ? `<p class="sub">為什麼適合你</p><ul class="reasons">${reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.具備.length ? `<p class="sub">你需要的配備，這個版本都有</p><p class="chips">${r.具備.map((k) => `<span class="chip">${esc(fname(k))}</span>`).join("")}</p>` : ""}
        ${warn.length ? `<ul class="warns">${warn.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <dl class="specs">
          <div><dt>座位</dt><dd>${t.座位數} 人</dd></div>
          <div><dt>車長</dt><dd>${fmt(t.全長)} mm</dd></div>
          <div><dt>車高</dt><dd>${fmt(t.全高)} mm</dd></div>
          <div><dt>後車廂</dt><dd>${t.行李廂L ? t.行李廂L + " L" + (overseas(t) ? "*" : "") : "—"}</dd></div>
          <div><dt>驅動</dt><dd>${t.驅動.includes("四輪") ? "四輪驅動" : t.驅動.includes("後輪") ? "後輪驅動" : "前輪驅動"}</dd></div>
          <div><dt>每年養車約</dt><dd>${wan(Math.round(t.每年養車成本 / 1000) * 1000)}</dd></div>
        </dl>
        ${r.可升級 ? `<p class="upgrade">預算內最高可以選到 <b>${esc(r.可升級.名稱)}</b>（建議售價 ${wan(r.可升級.建議售價)}元）</p>` : ""}
      </article>`;
  }

  function heightCap() {
    if (answers.parking !== "mech") return null;
    const h = window.Engine.opt(RULES, "mech_height", answers.mech_height).車高上限;
    return h === null ? RULES["機械車位"].不知道時採用的高度 : h;
  }

  function typeLabel(t) {
    if (!t.車型分類.includes("／")) return t.車型分類;
    return { 轎車: "四門轎車", 掀背: "五門掀背" }[t.車身類型] || t.車型分類;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------- LINE ----------
  function summary() {
    const lines = ["你好，我用了選車小幫手，結果是："];
    window._last.forEach((r, i) => lines.push(`${i + 1}. ${r.t.車款} ${r.t.名稱}`));
    lines.push("", "我的情況：");
    for (const q of flow()) {
      const a = answers[q.id];
      if (a === undefined || (Array.isArray(a) && !a.length)) continue;
      const text = [].concat(a).map((id) => q.選項.find((o) => o.id === id).文字).join("、");
      lines.push(`・${q.題目.replace(/？$/, "")}：${text}`);
    }
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
    return `選車小幫手推薦：${cars}，想預約賞車`;
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
  window.App = { show, toast, sendLineText, fname, typeLabel, fmt, wan, esc, DATA: null, RULES: null };

  // ---------- 綁定 ----------
  $("go-quiz").addEventListener("click", startQuiz);
  $("next").addEventListener("click", next);
  $("back").addEventListener("click", back);
  $("restart").addEventListener("click", () => show("home"));
  $("send-line").addEventListener("click", sendLine);
  $("compare-these").addEventListener("click", () => window.Compare.open(window._last.map((r) => r.t.id)));
  $("qr-close").addEventListener("click", () => ($("qr-modal").hidden = true));
  $("qr-modal").addEventListener("click", (e) => { if (e.target.id === "qr-modal") $("qr-modal").hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("qr-modal").hidden = true; });
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
