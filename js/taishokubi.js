/*
 * 退職日シミュレーター(taishokubi/)。退職日1日の違いで変わる3つを出す。
 *   1. 失業給付 … 65歳に達する日(誕生日の前日)より前の離職は基本手当、以後は高年齢求職者給付金
 *      基本手当の所定給付日数はハローワーク「基本手当の所定給付日数」(2026-10-12 確認)
 *      高年齢求職者給付金は被保険者期間1年未満30日分・1年以上50日分(厚生労働省)
 *   2. 社会保険料 … 資格喪失日は退職日の翌日。保険料は喪失日の属する月の前月分まで(日本年金機構)
 *      月末退職なら退職月の保険料も給与から。月末より前なら、その月は国民年金(令和8年度 月17,920円)と国保
 *   3. 住民税 … 1月1日〜4月30日の退職は5月分までを最後の給与・退職金から一括(地方税法321条の5第2項)
 */
const TB_PERIODS = ["lt1", "1to5", "5to10", "10to20", "ge20"];
const TB_PERIOD_LABEL = { lt1: "1年未満", "1to5": "1年以上5年未満", "5to10": "5年以上10年未満", "10to20": "10年以上20年未満", ge20: "20年以上" };
/* 特定受給資格者(倒産・解雇など) 年齢区分×被保険者期間 */
const TB_TOKUTEI = [
  [30, [90, 90, 120, 180, null]],
  [35, [90, 120, 180, 210, 240]],
  [45, [90, 150, 180, 240, 270]],
  [60, [90, 180, 240, 270, 330]],
  [65, [90, 150, 180, 210, 240]],
];
/* 自己都合などの一般の離職者(全年齢) */
const TB_IPPAN = [null, 90, 90, 120, 150];
const KOKUMIN_NENKIN_R8 = 17920;

/* 日付ユーティリティ(ローカル時刻の年月日だけで扱う) */
const tbDate = (y, m, d) => new Date(y, m - 1, d);
const tbFmt = (dt) => `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日(${"日月火水木金土"[dt.getDay()]})`;
const tbAddDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);

/* 年齢に達する日(誕生日の前日)。2月29日生まれは、平年は2月28日 */
function tbReachDate(by, bm, bd, age) {
  const y = by + age;
  const bday = (bm === 2 && bd === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) ? tbDate(y, 3, 1) : tbDate(y, bm, bd);
  return tbAddDays(bday, -1);
}
/* その日の年齢(年齢に達する日を過ぎていれば加算) */
function tbAgeOn(by, bm, bd, dt) {
  let a = dt.getFullYear() - by;
  if (dt < tbReachDate(by, bm, bd, a)) a -= 1;
  return a;
}

function tbBenefit(age, period, reason) {
  const pi = TB_PERIODS.indexOf(period);
  if (age >= 65) return { kind: "高年齢求職者給付金", days: period === "lt1" ? 30 : 50, lump: true };
  if (reason === "kaisha") {
    const row = TB_TOKUTEI.find(([lim]) => age < lim);
    return { kind: "基本手当", days: row[1][pi], lump: false };
  }
  return { kind: "基本手当", days: TB_IPPAN[pi], lump: false };
}

function tbSimulate(v) {
  const retire = tbDate(v.ry, v.rm, v.rd);
  const age = tbAgeOn(v.by, v.bm, v.bd, retire);
  const reach65 = tbReachDate(v.by, v.bm, v.bd, 65);
  const lastBasic = tbAddDays(reach65, -1);             // 基本手当になる最後の退職日(65歳の誕生日の前々日)
  const benefit = tbBenefit(age, v.period, v.reason);
  const before = tbBenefit(64, v.period, v.reason), after = tbBenefit(65, v.period, v.reason);
  const monthEnd = tbAddDays(retire, 1).getDate() === 1;
  const loss = tbAddDays(retire, 1);
  return { retire, age, reach65, lastBasic, benefit, before, after, monthEnd, loss, rm: v.rm, near65: Math.abs((retire - reach65) / 864e5) <= 400 };
}

if (typeof module !== "undefined") module.exports = { tbSimulate, tbReachDate, tbAgeOn, tbBenefit };

/* ---------- 画面 ---------- */
if (typeof document !== "undefined") (function () {
  const $ = (id) => document.getElementById(id);
  const STORE = "retirement-simulator:taishokubi";
  const fill = (ids, from, to, def) => {
    const [y, m, d] = ids.map($);
    for (let i = from; i <= to; i++) y.add(new Option(`${i}年`, i));
    for (let i = 1; i <= 12; i++) m.add(new Option(`${i}月`, i));
    for (let i = 1; i <= 31; i++) d.add(new Option(`${i}日`, i));
    [y.value, m.value, d.value] = def;
  };
  const now = new Date();
  fill(["tb-by", "tb-bm", "tb-bd"], 1945, 2008, ["1962", "4", "10"]);
  fill(["tb-ry", "tb-rm", "tb-rd"], now.getFullYear(), now.getFullYear() + 3, [String(now.getFullYear() + 1), "3", "31"]);

  const read = () => ({
    by: +$("tb-by").value, bm: +$("tb-bm").value, bd: +$("tb-bd").value,
    ry: +$("tb-ry").value, rm: +$("tb-rm").value, rd: +$("tb-rd").value,
    period: $("tb-period").value, reason: $("tb-reason").value,
  });
  const write = (v) => { for (const k of ["by", "bm", "bd", "ry", "rm", "rd", "period", "reason"]) $("tb-" + k).value = v[k]; };

  function render(v) {
    const r = tbSimulate(v);
    const b = r.benefit;
    const days = b.days == null ? "受給資格がないことが多い(離職前2年間に被保険者期間12か月以上が必要)" : `${b.days}日分${b.lump ? "を一時金で" : ""}`;
    const sec1 = `<h3>失業給付</h3>
      <p>${tbFmt(r.retire)}の退職は${r.age}歳での離職で、<strong>${b.kind}・${days}</strong>です${v.reason === "jiko" && b.kind === "基本手当" ? "(自己都合は7日の待期のあと、原則1か月の給付制限)" : ""}。</p>
      ${r.near65 ? `<p>65歳に達する日は${tbFmt(r.reach65)}(誕生日の前日)です。<strong>${tbFmt(r.lastBasic)}までに退職すると基本手当(${r.before.days == null ? "対象外" : r.before.days + "日分"})</strong>、それより後だと高年齢求職者給付金(${r.after.days}日分を一時金)になります。</p>` : ""}`;
    const sec2 = r.monthEnd
      ? `<h3>社会保険料</h3><p>月末の退職なので、資格を失うのは${tbFmt(r.loss)}です。<strong>退職した月(${v.rm}月)の健康保険・厚生年金の保険料も給与から引かれます</strong>(給与の締め日によっては、最後の給与から2か月分)。そのかわり、${v.rm}月は国民年金・国民健康保険に入る必要はありません。</p>`
      : `<h3>社会保険料</h3><p>月の途中の退職なので、資格を失うのは${tbFmt(r.loss)}で、<strong>${v.rm}月分の会社の健康保険・厚生年金の保険料はかかりません</strong>。そのかわり${v.rm}月から国民健康保険(または任意継続・家族の扶養)に入り、${r.age < 60 ? `国民年金保険料(令和8年度は月${KOKUMIN_NENKIN_R8.toLocaleString("ja-JP")}円)も納めます。` : "60歳以上なので国民年金の加入義務はありません。"}どちらが得かは、会社の保険料と国保の保険料の差で決まります。</p>`;
    const sec3 = v.rm <= 4
      ? `<h3>住民税</h3><p>1月1日〜4月30日の退職なので、<strong>5月分までの残りの住民税が、最後の給与や退職金から一括で差し引かれます</strong>(本人の希望にかかわらず)。</p>`
      : v.rm === 5
        ? `<h3>住民税</h3><p>5月の退職は、5月分を最後の給与から差し引いて終わります。6月からの新年度分は、市区町村から届く納付書で納めます。</p>`
        : `<h3>住民税</h3><p>6月〜12月の退職なので、翌年5月分までの残りは、<strong>市区町村から届く納付書で自分で納める(普通徴収)か、最後の給与から一括で引いてもらうかを選べます</strong>。</p>`;
    $("tb-result-body").innerHTML = sec1 + sec2 + sec3;
    $("tb-result").hidden = false;
  }
  $("tb-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = read();
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (err) { /* 保存できなくても表示はする */ }
    render(v);
    $("tb-result").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.by) { write(s); render(read()); } } catch (err) { /* noop */ }
})();
