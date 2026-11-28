/* 「幫我選」推薦引擎。
 * 與 tools/simulate.py 的邏輯一致：規則讀自 題目與規則.json，車款讀自 mazda-車款資料.json，
 * 不寫任何車名，資料更新後推薦自動跟著變。
 */
(function (global) {
  "use strict";

  function opt(RULES, qid, oid) {
    const q = RULES["題目"].find((q) => q.id === qid);
    return q.選項.find((o) => o.id === oid);
  }

  // 版本的圖片：有車色就用預設車色那張，沒有就用車款的圖片
  function defaultImage(car, t) {
    const cols = t["車色"] || [];
    const c = cols.find((x) => x.代號 === car["預設車色"]) || cols[0];
    return c ? c.圖片 : (t["圖片"] || car["圖片"]);
  }

  function loadTrims(DATA, RULES) {
    const tax = DATA["稅金級距"];
    const p = RULES["計算參數"];
    const trims = [];
    for (const car of DATA["車款"]) {
      if (car.上架 === false) continue;
      const common = car["版本共同規格"] || {};
      for (const t of car["版本"]) {
        const v = Object.assign({}, common, t, { 車款: car["名稱"], 車款id: car.id, 車型分類: car["車型分類"], 圖片: defaultImage(car, t), 圖片註記: "",
          預設車色: car["預設車色"] });
        v.每年稅金 = tax[v.稅金級距].合計;
        v.每年油錢 = Math.round((p.每年行駛公里 / v.油耗kmL) * p.油價每公升);
        v.每年養車成本 = v.每年稅金 + v.每年油錢;
        v.每噸馬力 = (v.馬力ps / v.空車重) * 1000;
        trims.push(v);
      }
    }
    return trims;
  }

  function scoreItems(trims, RULES) {
    for (const [name, spec] of Object.entries(RULES["評分項目"])) {
      if (name === "說明") continue;
      for (const t of trims) t._score = t._score || {};
      if (spec.欄位) {
        const parts = new Map(trims.map((t) => [t, []]));
        let total = 0;
        for (const [f, fs] of Object.entries(spec.欄位)) {
          const direction = typeof fs === "string" ? fs : fs.方向;
          const weight = typeof fs === "string" ? 1 : (fs.比重 || 1);
          total += weight;
          const vals = trims.map((t) => t[f]).filter((x) => x !== null && x !== undefined);
          const lo = Math.min(...vals), hi = Math.max(...vals);
          for (const t of trims) {
            const x = t[f];
            let s = x === null || x === undefined || hi === lo ? 0.5 : (x - lo) / (hi - lo);
            parts.get(t).push(weight * (direction === "越小越好" ? 1 - s : s));
          }
        }
        for (const t of trims) {
          const arr = parts.get(t);
          const bonus = (spec.車身類型加分 || {})[t.車身類型] || 0;
          t._score[name] = arr.reduce((a, b) => a + b, 0) / total + bonus;
        }
      } else if (spec.車身類型分數) {
        for (const t of trims) {
          const v = spec.車身類型分數[t.車身類型];
          t._score[name] = v === undefined ? 0.5 : v;
        }
      } else if (spec.車身類型) {
        for (const t of trims) t._score[name] = t.車身類型 === spec.車身類型 ? 1 : 0;
      } else if (spec.關鍵配備) {
        for (const t of trims) t._score[name] = t.關鍵配備[spec.關鍵配備] ? 1 : 0;
      }
    }
  }

  // REC：士倫推薦版本的 id（讀自 車款介紹.json）；分數相近時優先推薦（士倫 2026-11-28）
  function recommend(DATA, RULES, ans, REC) {
    REC = new Set(REC || []);
    const rule = RULES["推薦規則"], mech = RULES["機械車位"];
    const trims = loadTrims(DATA, RULES);
    scoreItems(trims, RULES);
    const o = (q, id) => opt(RULES, q, id);

    const chosen = ans.who.map((x) => o("who", x)).concat([o("parking", ans.parking)]);
    ans.use.forEach((x) => chosen.push(o("use", x)));
    chosen.push(o("pain", ans.pain));
    (ans.life || []).forEach((x) => chosen.push(o("life", x)));  // 第 7 題：有的選項是配備、有的是加權（例如「開車是一種享受」）
    const weights = {};
    for (const c of chosen) for (const [k, w] of Object.entries(c.加權 || {})) weights[k] = (weights[k] || 0) + w;
    const minSeats = Math.max(...chosen.map((c) => c.最少座位 || 0));
    const minTrunk = Math.max(...chosen.map((c) => c.後車廂至少 || 0));
    const wanted = [];
    for (const c of chosen) if (c.配備 && !wanted.includes(c.配備)) wanted.push(c.配備);
    const bodies = new Set(ans.body.map((x) => o("body", x).車身類型).filter((b) => b));
    const budget = o("budget", ans.budget).上限;
    const cap = budget ? budget * (1 + rule.預算寬容) : null;
    const stretch = budget ? budget * (1 + rule.預算可超出) : null;

    const notes = [];
    let heightCap = null;
    if (ans.parking === "mech") {
      heightCap = o("mech_height", ans.mech_height).車高上限;
      if (heightCap === null) {
        heightCap = mech.不知道時採用的高度;
        notes.push(`你還不確定機械車位的限高，先以最常見的 ${heightCap.toLocaleString()} mm 篩選，購車前請向管委會確認`);
      }
    }

    function build(useHeight) {
      const out = new Map();
      for (const t of trims) {
        if (t.座位數 < minSeats) continue;
        if (t.不主動推薦) continue;  // 例如接單生產的版本
        if (useHeight && heightCap && t.全高 > heightCap) continue;
        if (!out.has(t.車款id)) out.set(t.車款id, []);
        out.get(t.車款id).push(t);
      }
      return out;
    }
    let models = build(true), tooTall = false;
    if (models.size === 0 && heightCap) {
      models = build(false);
      tooTall = true;
      notes.push(`符合你需求的車款，車高都超過 ${heightCap.toLocaleString()} mm，停不進這種機械車位。建議先確認車位，或考慮平面車位`);
    }

    const nHave = (t) => wanted.filter((m) => t.關鍵配備[m]).length;
    const cheapest = (arr) => arr.reduce((a, b) => (b.建議售價 < a.建議售價 ? b : a));
    const base = (t) => {
      let sc = 0;
      for (const [k, w] of Object.entries(weights)) sc += w * t._score[k];
      if (bodies.size) sc += bodies.has(t.車身類型) ? rule.車型加分 : -rule.車型不符扣分;
      if (t.行李廂L !== null && t.行李廂L !== undefined && t.行李廂L < minTrunk) sc -= rule.後車廂不足扣分;
      if (minSeats <= 5 && t.座位數 >= 6) sc -= rule.座位過多扣分;
      return sc;
    };
    const choose = (cands) => {
      const best = Math.max(...cands.map(base));
      const near = cands.filter((t) => base(t) >= best - rule.版本同分範圍);
      // 符合條件的版本裡有士倫推薦的、而且沒有貴太多，就推薦它
      const low = cheapest(near).建議售價;
      const recs = near.filter((t) => REC.has(t.id) && t.建議售價 <= low + (rule.士倫推薦最多多付 || 0));
      const pool = recs.length ? recs : near;
      const lowP = cheapest(pool).建議售價;  // 同價的版本（例如四門、五門 Signature）選分數高的
      return pool.filter((t) => t.建議售價 === lowP).reduce((a, b) => (base(b) > base(a) ? b : a));
    };
    const mostFeatures = (cands) => {
      const top = Math.max(...cands.map(nHave));
      return choose(cands.filter((t) => nHave(t) === top));
    };

    const results = [];
    for (const ts of models.values()) {
      const inB = ts.filter((t) => cap === null || t.建議售價 <= cap);
      const near = ts.filter((t) => stretch !== null && t.建議售價 > cap && t.建議售價 <= stretch);
      const fullIn = inB.filter((t) => nHave(t) === wanted.length);
      const fullNear = near.filter((t) => nHave(t) === wanted.length);
      let pick, level;
      if (fullIn.length) [pick, level] = [choose(fullIn), "ok"];
      else if (fullNear.length) [pick, level] = [choose(fullNear), "stretch"];
      else if (inB.length) [pick, level] = [mostFeatures(inB), "ok"];
      else if (near.length) [pick, level] = [mostFeatures(near), "stretch"];
      else { const lp = cheapest(ts).建議售價; [pick, level] = [ts.filter((t) => t.建議售價 === lp).reduce((a, b) => (base(b) > base(a) ? b : a)), "over"]; }
      const missing = wanted.filter((m) => !pick.關鍵配備[m]);
      const have = wanted.filter((m) => pick.關鍵配備[m]);

      const contrib = {};
      for (const [k, w] of Object.entries(weights)) contrib[k] = w * pick._score[k];
      let score = base(pick) - rule.配備缺少扣分 * missing.length;
      if (level === "stretch") score -= rule.超出預算扣分;
      const short = pick.行李廂L !== null && pick.行李廂L !== undefined && pick.行李廂L < minTrunk;
      const extra = minSeats <= 5 && pick.座位數 >= 6;

      const warn = [];
      if (level === "stretch") warn.push("稍微超出預算");
      if (level === "over") warn.push("超出預算");
      if (missing.length) warn.push("缺少：" + missing.join("、"));
      if (short) warn.push(`後車廂 ${pick.行李廂L}L 偏小`);
      if (ans.parking === "mech") {
        if (pick.全寬 > mech.常見寬度上限) warn.push(`車寬 ${pick.全寬.toLocaleString()} mm，請確認車位寬度`);
        if (pick.空車重 > mech.常見重量上限) warn.push(`車重 ${pick.空車重.toLocaleString()} kg，請確認車位載重`);
      }
      if (pick.座位數 === 2) warn.push("只有 2 個座位");
      if (extra) warn.push(`${pick.座位數} 人座，你可能用不到這麼大的空間`);
      if (tooTall) warn.push(`車高 ${pick.全高.toLocaleString()} mm，超過車位限高`);
      const sameBody = inB.filter((t) => t.車身類型 === pick.車身類型);  // 升級建議只看同一種車身（Mazda3 五門不會建議升級到四門）
      const top = sameBody.length ? sameBody.reduce((a, b) => (b.建議售價 > a.建議售價 ? b : a)) : null;
      const reasons = Object.keys(contrib).filter((k) => contrib[k] > 0.3)
        .sort((a, b) => contrib[b] - contrib[a]).slice(0, 3);
      results.push({
        t: pick, 分數: Math.round(score * 100) / 100, 預算: level, 提醒: warn, 原因: reasons,
        具備: have, 缺少: missing, 所有版本: ts, 士倫推薦: REC.has(pick.id),
        可升級: top && top !== pick && level === "ok" ? top : null,
      });
    }

    const missCount = (r) => r.提醒.filter((w) => w.startsWith("缺少")).length;
    let fit = results.filter((r) => r.預算 !== "over")
      .sort((a, b) => b.分數 - a.分數 || missCount(a) - missCount(b));
    if (fit.length < rule.推薦數量) {
      fit = fit.concat(results.filter((r) => r.預算 === "over").sort((a, b) => a.t.建議售價 - b.t.建議售價));
    }
    fit = fit.slice(0, rule.推薦數量);
    if (fit.length > 1 && fit[1].預算 !== "over" &&
        (fit[1].分數 < 0 || fit[1].分數 < fit[0].分數 * rule.第二名門檻)) fit = fit.slice(0, 1);
    // 其他車款為什麼沒有推薦（讓客戶知道系統考慮過哪些車）
    const picked = new Set(fit.map((r) => r.t.車款id));
    const byModel = new Map();
    for (const t of trims) {
      if (!byModel.has(t.車款id)) byModel.set(t.車款id, []);
      byModel.get(t.車款id).push(t);
    }
    const excluded = [];
    for (const [id, ts] of byModel) {
      if (picked.has(id)) continue;
      const name = ts[0].車款;
      const r = results.find((x) => x.t.車款id === id);
      const maxSeat = Math.max(...ts.map((t) => t.座位數));
      const minH = Math.min(...ts.map((t) => t.全高));
      const minP = Math.min(...(ts.some((t) => !t.不主動推薦) ? ts.filter((t) => !t.不主動推薦) : ts).map((t) => t.建議售價));  // 不主動推薦的版本（例如接單生產）不拿來說「最便宜」
      let why;
      if (maxSeat < minSeats) why = `只有 ${maxSeat} 個座位，坐不下你需要的人數`;
      else if (heightCap && !tooTall && minH > heightCap) why = `車高 ${minH.toLocaleString()} mm，停不進限高 ${heightCap.toLocaleString()} mm 的機械車位`;
      else if (!r) why = "不符合你的條件";
      else if (r.預算 === "over") why = `最便宜的版本 ${(minP / 10000).toFixed(1).replace(/\.0$/, "")} 萬元，超出你的預算`;
      else if (bodies.size && !bodies.has(r.t.車身類型)) why = `是${r.t.車身類型.endsWith("車") ? r.t.車身類型 : r.t.車身類型 + "車"}，不是你喜歡的車型`;
      else if (r.t.行李廂L !== null && r.t.行李廂L !== undefined && r.t.行李廂L < minTrunk) why = `後車廂 ${r.t.行李廂L} L，對你的需求來說偏小`;
      else if (r.缺少.length) why = `預算內的版本沒有你需要的：${r.缺少.join("、")}`;
      else why = "也符合你的條件，但整體適合度排在後面，可以用「我要比較」詳細比較";
      excluded.push({ 車款: name, 車款id: id, 原因: why });
    }
    return { results: fit, notes: notes, excluded: excluded };
  }

  global.Engine = { recommend: recommend, opt: opt, loadTrims: loadTrims };
})(typeof window !== "undefined" ? window : globalThis);
