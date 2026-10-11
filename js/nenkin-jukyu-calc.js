/*
 * 年金の受け取り開始年齢(繰上げ・繰下げ)の計算。DOM に依存しない純粋関数。
 *
 * 日本年金機構「年金の繰上げ受給」「年金の繰下げ受給」「加給年金額と振替加算」(2026-10-12 確認)
 *   繰上げ: 減額率 = 0.4% × 繰上げ請求月から65歳に達する日の前月までの月数(最大24%)
 *           昭和37年4月1日以前生まれは 0.5%(最大30%)
 *   繰下げ: 増額率 = 0.7% × 65歳に達した月から繰下げ申出月の前月までの月数(最大84%、75歳まで)
 *           昭和27年4月1日以前生まれは70歳(42%)まで
 *   加給年金額・振替加算は増減の対象外。繰下げ待機中は加給年金を受け取れない
 *   加給年金額(令和8年度・配偶者): 243,800円＋特別加算(昭和18年4月2日以後生まれ 179,900円)＝423,700円
 *
 * 「65歳に達する日」は誕生日の前日(年齢計算ニ関スル法律)。年金は受給権が生じた月の翌月分から支払われる。
 * ここでは月単位で、65歳から受け取る場合の最初の支払い対象月を基準(0)にして数える。
 */

const KAKYU_HAIGUSHA_R8 = 423700;

/* 生年月日 → 繰上げの減額率(1か月あたり)と繰下げの上限月数 */
function nenkinRules(by, bm, bd) {
  const key = by * 10000 + bm * 100 + bd;
  return {
    kuriageRate: key <= 19620401 ? 0.005 : 0.004,
    kurisageMaxMonths: key <= 19520401 ? 60 : 120,
  };
}

/* 受け取り開始を65歳から何か月ずらすか(−60〜+120)の増減率 */
function nenkinAdjust(offsetMonths, rules) {
  if (offsetMonths < 0) return -Math.min(60, -offsetMonths) * rules.kuriageRate;
  return Math.min(rules.kurisageMaxMonths, offsetMonths) * 0.007;
}

/*
 * input: { by, bm, bd, kiso(65歳時点の老齢基礎年金 年額), kosei(65歳時点の老齢厚生年金 年額),
 *          kakyu(加給年金 年額。なければ0), kakyuMonths(自分が65歳になってから配偶者が65歳になるまでの月数) }
 * offset: 65歳開始からのずれ(月)
 * 戻り値: 月ごとの受け取り額を返す関数と、開始時の年額
 */
function nenkinPlan(input, offset) {
  const rules = nenkinRules(input.by, input.bm, input.bd);
  const r = nenkinAdjust(offset, rules);
  const base = (input.kiso + input.kosei) * (1 + r) / 12;
  const kakyuMonthly = (input.kakyu || 0) / 12;
  const kakyuEnd = input.kakyuMonths || 0;            // 65歳から数えて、この月数まで加給年金が付く
  // 加給年金は65歳から(繰上げても65歳から)。繰下げると待機中は付かず、受け取り始めた月から配偶者が65歳になるまで
  const kakyuStart = Math.max(0, offset);
  const monthly = (m) => {                            // m: 65歳開始の初月を0とした月
    if (m < offset) return 0;
    let v = base;
    if (m >= kakyuStart && m < kakyuEnd) v += kakyuMonthly;
    return v;
  };
  return { rate: r, annualStart: base * 12, monthly, rules };
}

/* 65歳開始(offset=0)と比べた累計の損益分岐。分岐する年齢を「歳・か月」で返す(105歳までで見つからなければ null) */
function nenkinBreakEven(input, offset) {
  if (offset === 0) return null;
  const a = nenkinPlan(input, offset), b = nenkinPlan(input, 0);
  let ca = 0, cb = 0;
  const startM = Math.min(offset, 0);
  for (let m = startM; m <= 40 * 12; m++) {
    ca += a.monthly(m); cb += b.monthly(m);
    if (offset < 0 && m >= 0 && ca < cb) return 65 * 12 + m;   // 繰上げが追い抜かれる月
    if (offset > 0 && m >= offset && ca >= cb) return 65 * 12 + m; // 繰下げが追いつく月
  }
  return null;
}

/* ある年齢(月)までの累計 */
function nenkinTotalUntil(input, offset, ageMonths) {
  const p = nenkinPlan(input, offset);
  let s = 0;
  for (let m = Math.min(offset, 0); m < ageMonths - 65 * 12; m++) s += p.monthly(m);
  return s;
}

if (typeof module !== "undefined") module.exports = { nenkinRules, nenkinAdjust, nenkinPlan, nenkinBreakEven, nenkinTotalUntil, KAKYU_HAIGUSHA_R8 };
