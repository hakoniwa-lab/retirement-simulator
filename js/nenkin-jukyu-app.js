/*
 * 年金の受け取り開始年齢シミュレーター(nenkin-jukyu/)の画面。計算は nenkin-jukyu-calc.js。
 * 入力は端末の localStorage(retirement-simulator:nenkin-jukyu)にだけ保存する。
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const STORE = "retirement-simulator:nenkin-jukyu";
  const fmtAge = (m) => m == null ? "105歳までに分岐しない" : `${Math.floor(m / 12)}歳${m % 12}か月ごろ`;
  const man = (yen) => `${(Math.round(yen / 1000) / 10).toLocaleString("ja-JP")}万円`;

  const selY = $("nj-year"), selM = $("nj-month"), selD = $("nj-day");
  for (let y = 1945; y <= 2000; y++) selY.add(new Option(`${y}年`, y));
  for (let m = 1; m <= 12; m++) selM.add(new Option(`${m}月`, m));
  for (let d = 1; d <= 31; d++) selD.add(new Option(`${d}日`, d));
  selY.value = "1966"; selM.value = "4"; selD.value = "2";
  $("nj-kakyu").addEventListener("change", () => { $("nj-kakyu-box").hidden = !$("nj-kakyu").checked; });

  function read() {
    return {
      by: Number(selY.value), bm: Number(selM.value), bd: Number(selD.value),
      kiso: Number($("nj-kiso").value || 0) * 10000,
      kosei: Number($("nj-kosei").value || 0) * 10000,
      kakyu: $("nj-kakyu").checked ? Number($("nj-kakyu-amt").value || 0) : 0,
      kakyuMonths: $("nj-kakyu").checked ? Number($("nj-diff").value || 0) * 12 : 0,
      until: Number($("nj-until").value || 90),
      kakyuOn: $("nj-kakyu").checked,
    };
  }
  function write(v) {
    selY.value = v.by; selM.value = v.bm; selD.value = v.bd;
    $("nj-kiso").value = v.kiso / 10000; $("nj-kosei").value = v.kosei / 10000;
    $("nj-kakyu").checked = !!v.kakyuOn; $("nj-kakyu-box").hidden = !v.kakyuOn;
    if (v.kakyuOn) { $("nj-kakyu-amt").value = v.kakyu; $("nj-diff").value = v.kakyuMonths / 12; }
    $("nj-until").value = v.until || 90;
  }

  function render(v) {
    const rules = nenkinRules(v.by, v.bm, v.bd);
    const offsets = [];
    for (let a = 60; a <= (rules.kurisageMaxMonths === 60 ? 70 : 75); a++) offsets.push((a - 65) * 12);
    const rows = offsets.map((off) => {
      const p = nenkinPlan(v, off);
      return { off, age: 65 + off / 12, rate: p.rate, annual: (v.kiso + v.kosei) * (1 + p.rate),
        be: nenkinBreakEven(v, off), total: nenkinTotalUntil(v, off, v.until * 12) };
    });
    const best = rows.reduce((a, b) => (b.total > a.total ? b : a));
    const body = rows.map((r) => `<tr${r === best ? ' class="is-best"' : ""}>
      <td>${r.age}歳${r.off === 0 ? "(原則)" : ""}</td>
      <td class="num">${r.rate === 0 ? "—" : (r.rate > 0 ? "+" : "") + (r.rate * 100).toFixed(1) + "%"}</td>
      <td class="num">${man(r.annual)}</td>
      <td>${r.off === 0 ? "—" : fmtAge(r.be)}</td>
      <td class="num">${man(r.total)}</td></tr>`).join("");
    $("nj-result-body").innerHTML = `
      <p class="guide-lead">${v.until}歳まで受け取ったときの累計がいちばん多いのは、<strong>${best.age}歳から</strong>受け取る場合です(${man(best.total)})。</p>
      <div class="table-scroll"><table class="guide-table">
        <thead><tr><th>受け取り開始</th><th>増減率</th><th>年額(額面)</th><th>65歳開始との損益分岐</th><th>${v.until}歳までの累計</th></tr></thead>
        <tbody>${body}</tbody></table></div>
      <p class="guide-note">繰上げの減額率は1か月${(rules.kuriageRate * 100).toFixed(1)}%、繰下げの増額率は1か月0.7%(上限${rules.kurisageMaxMonths === 60 ? "70歳" : "75歳"})で計算しています。年額は老齢基礎年金と老齢厚生年金の合計で、加給年金は含めていません。${v.kakyu ? "累計と損益分岐には、加給年金(65歳から配偶者が65歳になるまで。繰下げて待っているあいだは付かない)を含めています。" : ""}金額はすべて額面で、税金・介護保険料・国民健康保険料は引いていません。</p>`;
    $("nj-result").hidden = false;
  }

  $("nj-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = read();
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (err) { /* 保存できなくても計算はする */ }
    render(v);
    $("nj-result").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && saved.by) { write(saved); render(read()); }
  } catch (err) { /* 読めなければ空のまま */ }
})();
