/*
 * 退職金手取り額の概算計算ロジック。DOM・windowの状態には触れない純粋関数のみで構成する。
 * 退職金は給与とは別に「退職所得」として分離課税される特殊な仕組みのため、
 * takehome-calculator/furusato-simulatorとは別の計算ロジックを持つ。
 */

// 所得税の超過累進税率表(2024年分、復興特別所得税2.1%は別途上乗せ)。takehome-calculatorと共通。
const INCOME_TAX_BRACKETS = [
  { limit: 1950000, rate: 0.05, deduction: 0 },
  { limit: 3300000, rate: 0.1, deduction: 97500 },
  { limit: 6950000, rate: 0.2, deduction: 427500 },
  { limit: 9000000, rate: 0.23, deduction: 636000 },
  { limit: 18000000, rate: 0.33, deduction: 1536000 },
  { limit: 40000000, rate: 0.4, deduction: 2796000 },
  { limit: Infinity, rate: 0.45, deduction: 4796000 },
];

function incomeTax(taxableIncome) {
  if (taxableIncome <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((b) => taxableIncome <= b.limit);
  const base = taxableIncome * bracket.rate - bracket.deduction;
  return Math.max(0, Math.round(base * 1.021));
}

// 退職所得控除額(勤続年数は端数切り上げ)
function retirementDeduction(years) {
  const roundedYears = Math.ceil(years);
  if (roundedYears <= 20) {
    return Math.max(800000, 400000 * roundedYears);
  }
  return 8000000 + 700000 * (roundedYears - 20);
}

// 退職所得の計算(2022年度改正: 勤続5年以下の場合、控除後300万円を超える部分は1/2課税が適用されない)
function taxableRetirementIncome(retirementPay, deduction, years) {
  const afterDeduction = Math.max(0, retirementPay - deduction);
  if (years > 5) {
    return Math.floor(afterDeduction / 2);
  }
  // 勤続5年以下(短期退職手当等)
  if (afterDeduction <= 3000000) {
    return Math.floor(afterDeduction / 2);
  }
  return 1500000 + (afterDeduction - 3000000);
}

function calcRetirement(input) {
  const { retirementPay, years } = input;

  const deduction = retirementDeduction(years);
  const taxableIncome = taxableRetirementIncome(retirementPay, deduction, years);

  const tax = incomeTax(taxableIncome);
  // 住民税(退職所得への課税は都道府県民税4%+市町村民税6%の合計10%、分離課税)
  const residentTax = Math.floor(taxableIncome * 0.1);

  const takeHome = retirementPay - tax - residentTax;

  return {
    retirementPay,
    deduction,
    taxableIncome,
    incomeTax: tax,
    residentTax,
    takeHome,
  };
}
