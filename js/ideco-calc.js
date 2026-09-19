/*
 * iDeCo一時金と退職金の「受け取り順」比較ロジック。DOMには触れない純粋関数のみ。
 * calculate.js の incomeTax / retirementDeduction / taxableRetirementIncome を使うので、先に読み込むこと。
 *
 * 根拠(e-Gov法令):
 *   所得税法30条3項  退職所得控除額(40万円×年数、20年超は800万円+70万円×(年数-20))
 *   所得税法30条6項  前年以前に他の退職手当等がある場合の控除額の調整・80万円の下限
 *   施行令69条1項3号 同じ年に2つ以上受け取るときの勤続年数(最も長い期間+重複しない期間)
 *   施行令70条1項2号 調整の対象になる期間
 *                     イ 前年以前4年内(一般)
 *                     ロ 前年以前9年内にDC一時金(2026年1月1日以後の支払分) → 今年に退職金 … いわゆる10年ルール
 *                     ハ 前年以前19年内に退職金 → 今年にDC一時金 … いわゆる19年ルール(20年空ければ調整なし)
 *   施行令70条2項     前の収入金額が前の控除額に満たないときは、前の勤続期間を短くみなす
 *   施行令70条3項     重複期間の1年未満の端数は切り捨て
 *   施行令71条の2第1項 同じ年に一般退職手当等と短期退職手当等があるときの計算
 *
 * 期間は年齢の整数で持つ。{ start: 40, end: 60 } は40歳から60歳になるまでの20年。
 * 「受け取る年齢」は受け取る年(1〜12月)の目安として扱う。
 */

const IDECO_RULE_GAP_DC_FIRST = 9; // DC一時金が先: 前年以前9年内なら退職金の控除を調整
const IDECO_RULE_GAP_PAY_FIRST = 19; // 退職金が先: 前年以前19年内ならDC一時金の控除を調整
const IDECO_MAX_RECEIVE_AGE = 75;
const SHORT_TERM_YEARS = 5;

// 30条3項の算式そのもの(80万円の下限を含まない)。重複期間の控除額を出すのに使う。
function deductionByYears(years) {
  if (years <= 0) return 0;
  if (years <= 20) return 400000 * years;
  return 8000000 + 700000 * (years - 20);
}

function periodYears(p) {
  return Math.max(0, p.end - p.start);
}

function overlapYears(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

// calculate.js の taxableRetirementIncome は勤続年数が5年以下かどうかだけを見ている
function taxableFor(amount, deduction, isShort) {
  return taxableRetirementIncome(amount, deduction, isShort ? SHORT_TERM_YEARS : SHORT_TERM_YEARS + 1);
}

// 施行令70条2項: 前の収入金額が前の控除額に満たないとき、前の勤続期間は
// 初日から「収入金額÷40万円」(800万円超は(収入−800万円)÷70万円+20)年ぶんとみなす
function effectivePriorPeriod(prior) {
  if (prior.amount >= deductionByYears(periodYears(prior.period))) return prior.period;
  const n =
    prior.amount <= 8000000
      ? Math.floor(prior.amount / 400000)
      : Math.floor((prior.amount - 8000000) / 700000) + 20;
  return { start: prior.period.start, end: prior.period.start + n };
}

// 前年以前の退職手当等(prior)があるときの、今回(current)の退職所得控除額
function adjustedDeduction(current, prior) {
  const base = deductionByYears(periodYears(current.period));
  const effective = effectivePriorPeriod(prior);
  const overlap = overlapYears(current.period, effective);
  const reduction = deductionByYears(overlap);
  return {
    deduction: Math.max(800000, base - reduction),
    reduction,
    overlap,
    priorShortened: periodYears(effective) < periodYears(prior.period),
  };
}

function taxOf(taxable) {
  const incomeTaxAmount = incomeTax(taxable);
  const residentTax = Math.floor(taxable * 0.1);
  return { incomeTax: incomeTaxAmount, residentTax, total: incomeTaxAmount + residentTax };
}

// 1つの年に1つだけ受け取る場合
function singleReceipt(item, deduction) {
  const isShort = periodYears(item.period) <= SHORT_TERM_YEARS;
  const taxable = taxableFor(item.amount, deduction, isShort);
  const tax = taxOf(taxable);
  return { amount: item.amount, deduction, taxable, isShort, ...tax };
}

// 同じ年に退職金とiDeCo一時金を受け取る場合(施行令69条1項3号・71条の2第1項)
function sameYearReceipt(pay, ideco) {
  const unionYears = periodYears(pay.period) + periodYears(ideco.period) - overlapYears(pay.period, ideco.period);
  const deduction = Math.max(800000, deductionByYears(unionYears));
  const payShort = periodYears(pay.period) <= SHORT_TERM_YEARS;
  const idecoShort = periodYears(ideco.period) <= SHORT_TERM_YEARS;
  const total = pay.amount + ideco.amount;

  let taxable;
  if (payShort === idecoShort) {
    taxable = taxableFor(total, deduction, payShort);
  } else {
    const shortItem = payShort ? pay : ideco;
    const generalItem = payShort ? ideco : pay;
    const shortYears = periodYears(shortItem.period);
    const dup = overlapYears(shortItem.period, generalItem.period);
    const shortDeduction = 400000 * (shortYears - dup) + 200000 * dup;
    const generalDeduction = deduction - shortDeduction;
    const shortRaw = shortItem.amount - shortDeduction;
    const generalRaw = generalItem.amount - generalDeduction;
    const shortRest = shortRaw - Math.max(0, -generalRaw);
    const generalRest = generalRaw - Math.max(0, -shortRaw);
    const shortPart =
      shortRest <= 0 ? 0 : shortRest <= 3000000 ? Math.floor(shortRest / 2) : 1500000 + (shortRest - 3000000);
    const generalPart = generalRest <= 0 ? 0 : Math.floor(generalRest / 2);
    taxable = shortPart + generalPart;
  }
  const tax = taxOf(taxable);
  return { amount: total, deduction, taxable, unionYears, ...tax };
}

// 60歳時点の加入年数で決まる受け取り開始年齢。60歳以降に加入した場合は加入から5年後。
// 運用指図者の期間も本来は通算されるので、掛金を出した年数だけで判定するこの関数は遅めに出る。
function idecoEarliestAge(idecoPeriod) {
  if (idecoPeriod.start >= 60) return idecoPeriod.start + 5;
  const before60 = Math.min(idecoPeriod.end, 60) - idecoPeriod.start;
  if (before60 >= 10) return 60;
  if (before60 >= 8) return 61;
  if (before60 >= 6) return 62;
  if (before60 >= 4) return 63;
  if (before60 >= 2) return 64;
  return 65;
}

/*
 * input: {
 *   payAmount, payYears, payAge,          退職金の額面・勤続年数・受け取る年齢
 *   idecoAmount, idecoYears, idecoEndAge  iDeCo一時金・掛金を出した年数・掛金を出し終える年齢
 * }
 * iDeCoを受け取る年齢を1歳ずつ動かして、年齢ごとの税額を返す。
 */
function compareIdecoTiming(input) {
  const pay = {
    amount: input.payAmount,
    period: { start: input.payAge - input.payYears, end: input.payAge },
  };
  const ideco = {
    amount: input.idecoAmount,
    period: { start: input.idecoEndAge - input.idecoYears, end: input.idecoEndAge },
  };

  const earliestByRule = idecoEarliestAge(ideco.period);
  const firstAge = Math.max(earliestByRule, input.idecoEndAge);
  const rows = [];

  for (let age = firstAge; age <= IDECO_MAX_RECEIVE_AGE; age++) {
    const gap = input.payAge - age;
    let row;
    if (gap === 0) {
      const both = sameYearReceipt(pay, ideco);
      row = { order: "same", gap: 0, adjustedSide: null, adjustment: null, combined: both };
      row.totalTax = both.total;
    } else if (gap > 0) {
      // iDeCoが先
      const idecoResult = singleReceipt(ideco, retirementDeduction(periodYears(ideco.period)));
      let adjustment = null;
      let payDeduction = retirementDeduction(periodYears(pay.period));
      if (gap <= IDECO_RULE_GAP_DC_FIRST) {
        adjustment = adjustedDeduction(pay, ideco);
        payDeduction = adjustment.deduction;
      }
      const payResult = singleReceipt(pay, payDeduction);
      row = { order: "ideco-first", gap, adjustedSide: adjustment ? "pay" : null, adjustment, pay: payResult, ideco: idecoResult };
      row.totalTax = payResult.total + idecoResult.total;
    } else {
      // 退職金が先
      const payResult = singleReceipt(pay, retirementDeduction(periodYears(pay.period)));
      let adjustment = null;
      let idecoDeduction = retirementDeduction(periodYears(ideco.period));
      if (-gap <= IDECO_RULE_GAP_PAY_FIRST) {
        adjustment = adjustedDeduction(ideco, pay);
        idecoDeduction = adjustment.deduction;
      }
      const idecoResult = singleReceipt(ideco, idecoDeduction);
      row = { order: "pay-first", gap: -gap, adjustedSide: adjustment ? "ideco" : null, adjustment, pay: payResult, ideco: idecoResult };
      row.totalTax = payResult.total + idecoResult.total;
    }
    row.idecoAge = age;
    rows.push(row);
  }

  const minTax = rows.length ? Math.min(...rows.map((r) => r.totalTax)) : 0;
  rows.forEach((r) => {
    r.diffFromMin = r.totalTax - minTax;
  });

  return {
    rows,
    minTax,
    earliestByRule,
    firstAge,
    gross: pay.amount + ideco.amount,
    payPeriod: pay.period,
    idecoPeriod: ideco.period,
  };
}
