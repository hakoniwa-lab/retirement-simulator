/*
 * iDeCo受け取り順比較ページのフォーム受付・DOM描画。計算は ideco-calc.js に委譲する。
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function yen(n) {
  return Math.round(n).toLocaleString("ja-JP") + "円";
}

function man(n) {
  return (n / 10000).toLocaleString("ja-JP") + "万円";
}

function ageRange(from, to) {
  return from === to ? `${from}歳` : `${from}〜${to}歳`;
}

function yearRange(from, to) {
  return from === to ? `${from}年` : `${from}〜${to}年`;
}

const form = document.getElementById("ideco-form");
const formError = document.getElementById("form-error");
const resultSection = document.getElementById("screen-result");
const introSection = document.getElementById("screen-intro");
const resultBody = document.getElementById("result-body");
const btnRestart = document.getElementById("btn-restart");

// 同じ受け取り方・同じ税額が続く年齢をまとめる
function groupRows(rows) {
  const groups = [];
  rows.forEach((row) => {
    const reduction = row.adjustment ? row.adjustment.reduction : -1;
    const key = `${row.order}|${row.adjustedSide}|${reduction}|${row.totalTax}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, rows: [row] });
    }
  });
  return groups;
}

function groupLabel(group) {
  const first = group.rows[0];
  const last = group.rows[group.rows.length - 1];
  const gaps = group.rows.map((r) => r.gap);
  const gapText = yearRange(Math.min(...gaps), Math.max(...gaps));
  if (first.order === "same") return { order: "退職金と同じ年", note: "勤続期間と掛金の期間を通算して、控除を1回で使う" };

  const adj = first.adjustment;
  if (first.order === "ideco-first") {
    let note;
    if (!adj) note = "10年以上空くので、退職金の控除は減らない";
    else if (adj.reduction === 0) note = "期間が重ならないので、退職金の控除は減らない";
    else note = `10年ルールで、退職金の控除が${man(adj.reduction)}減る`;
    return { order: `iDeCoが先（退職金の${gapText}前）`, note };
  }
  let note;
  if (!adj) note = "20年以上空くので、iDeCoの控除は減らない";
  else if (adj.reduction === 0) note = "期間が重ならないので、iDeCoの控除は減らない";
  else note = `19年ルールで、iDeCoの控除が${man(adj.reduction)}減る`;
  return { order: `退職金が先（退職金の${gapText}後）`, note };
}

function bestAgeText(rows) {
  const runs = [];
  rows.forEach((r) => {
    if (r.diffFromMin !== 0) return;
    const last = runs[runs.length - 1];
    if (last && last.to === r.idecoAge - 1) last.to = r.idecoAge;
    else runs.push({ from: r.idecoAge, to: r.idecoAge });
  });
  return runs.map((run) => ageRange(run.from, run.to)).join("・");
}

function breakdownRows(label, part) {
  return `
    <div class="result-row result-row--head"><span>${escapeHtml(label)}</span><span>${escapeHtml(yen(part.amount))}</span></div>
    <div class="result-row"><span>退職所得控除額</span><span>− ${escapeHtml(yen(part.deduction))}</span></div>
    <div class="result-row"><span>課税対象の退職所得</span><span>${escapeHtml(yen(part.taxable))}</span></div>
    <div class="result-row"><span>所得税＋住民税</span><span>− ${escapeHtml(yen(part.total))}</span></div>
  `;
}

function buildBreakdown(row, input) {
  if (row.order === "same") {
    return `
      <p class="breakdown-title">内訳（${escapeHtml(row.idecoAge)}歳で両方を受け取る場合）</p>
      <div class="result-breakdown">
        ${breakdownRows("退職金＋iDeCo一時金", row.combined)}
        <div class="result-row"><span>通算した勤続年数</span><span>${escapeHtml(row.combined.unionYears)}年</span></div>
      </div>`;
  }
  const payLabel = `退職金（${input.payAge}歳）`;
  const idecoLabel = `iDeCo一時金（${row.idecoAge}歳）`;
  const parts =
    row.order === "ideco-first"
      ? breakdownRows(idecoLabel, row.ideco) + breakdownRows(payLabel, row.pay)
      : breakdownRows(payLabel, row.pay) + breakdownRows(idecoLabel, row.ideco);
  return `
    <p class="breakdown-title">内訳（iDeCoを${escapeHtml(row.idecoAge)}歳で受け取る場合）</p>
    <div class="result-breakdown">${parts}</div>`;
}

function buildTable(groups) {
  const body = groups
    .map((g) => {
      const first = g.rows[0];
      const last = g.rows[g.rows.length - 1];
      const label = groupLabel(g);
      const isBest = first.diffFromMin === 0;
      const diff = isBest
        ? `<span class="badge badge--accent">いちばん少ない</span>`
        : `<span class="compare-diff">最少より+${escapeHtml(yen(first.diffFromMin))}</span>`;
      return `
        <tr class="${isBest ? "is-best" : ""}">
          <td>
            <span class="compare-age">${escapeHtml(ageRange(first.idecoAge, last.idecoAge))}</span>
            <span class="compare-order">${escapeHtml(label.order)}</span>
            <span class="compare-note">${escapeHtml(label.note)}</span>
          </td>
          <td class="num">${escapeHtml(yen(first.totalTax))}${diff}</td>
        </tr>`;
    })
    .join("");
  return `
    <div class="table-scroll">
      <table class="compare-table">
        <thead><tr><th>iDeCoを受け取る年齢</th><th class="num">税金の合計</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function buildResultHtml(result, input) {
  const { rows } = result;
  const groups = groupRows(rows);
  const best = rows.find((r) => r.diffFromMin === 0);
  const maxTax = Math.max(...rows.map((r) => r.totalTax));
  const same = rows.find((r) => r.order === "same");

  let compare = "";
  if (maxTax === result.minTax) {
    compare = "この条件では、iDeCoを何歳で受け取っても税金の合計は変わりません。";
  } else {
    compare = `いちばん多い受け取り方との差は<strong>${escapeHtml(yen(maxTax - result.minTax))}</strong>です。`;
    if (same && same.diffFromMin > 0) {
      compare += `退職金と同じ年にまとめて受け取るより${escapeHtml(yen(same.diffFromMin))}少なくなります。`;
    }
  }

  const startNote =
    result.firstAge > 60
      ? `<p class="guide-note">iDeCoを受け取れるのは${escapeHtml(result.firstAge)}歳からとして計算しています（60歳時点の加入年数と、掛金を出し終える年齢から判定）。</p>`
      : "";

  return `
    <div class="result-headline">
      <p class="result-headline__label">税金の合計がいちばん少ないのは、iDeCoを</p>
      <p class="result-headline__value result-headline__value--text">${escapeHtml(bestAgeText(rows))}で受け取る場合</p>
      <p class="result-headline__sub">税金の合計 ${escapeHtml(yen(result.minTax))}<br>退職金とiDeCoの手取りの合計 ${escapeHtml(yen(result.gross - result.minTax))}</p>
    </div>
    <p class="result-compare">${compare}</p>
    ${buildTable(groups)}
    ${startNote}
    ${buildBreakdown(best, input)}
    <p class="guide-note">退職金は${escapeHtml(input.payAge)}歳で受け取る前提で、iDeCoを受け取る年齢だけを動かしています。年齢は受け取る年（1〜12月）の目安です。iDeCoを年金で受け取る場合はこの表に含めていません。</p>
    <div class="result-cross-links">
      <a class="cross-link-banner" href="../">退職金だけの手取りを計算する →</a>
      <a class="cross-link-banner" href="../../takehome-calculator/">再就職後の手取り年収も計算してみる →</a>
      <a class="cross-link-banner" href="../../insurance-checker/">退職後の保障を保険診断で確認する →</a>
    </div>
  `;
}

function readInput() {
  const fd = new FormData(form);
  const num = (name) => Number(fd.get(name));
  return {
    payAmount: Math.round(num("pay_amount") * 10000),
    payYears: num("pay_years"),
    payAge: num("pay_age"),
    idecoAmount: Math.round(num("ideco_amount") * 10000),
    idecoYears: num("ideco_years"),
    idecoEndAge: num("ideco_end_age"),
  };
}

function validate(input) {
  const ints = ["payYears", "payAge", "idecoYears", "idecoEndAge"];
  if (ints.some((k) => !Number.isInteger(input[k]))) return "年数と年齢は整数で入力してください。";
  if (!(input.payAmount > 0) || !(input.idecoAmount > 0)) return "退職金とiDeCoの金額を入力してください。";
  if (input.payAge < 40 || input.payAge > 75) return "退職金を受け取る年齢は40〜75歳で入力してください。";
  if (input.payYears < 1 || input.payYears > input.payAge - 15) return "勤続年数が退職金を受け取る年齢に対して長すぎます。";
  if (input.idecoEndAge < 21 || input.idecoEndAge > 70) return "掛金を出し終える年齢は70歳までで入力してください。";
  if (input.idecoYears < 1 || input.idecoYears > input.idecoEndAge - 20) return "iDeCoの掛金を出した年数が、出し終える年齢に対して長すぎます。";
  return "";
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = readInput();
  const message = validate(input);
  if (!message) {
    const result = compareIdecoTiming(input);
    if (!result.rows.length) {
      formError.textContent = "この条件では75歳までにiDeCoの受け取りを始められません。掛金の期間を確認してください。";
      formError.hidden = false;
      return;
    }
    formError.hidden = true;
    resultBody.innerHTML = buildResultHtml(result, input);
    introSection.hidden = true;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  formError.textContent = message;
  formError.hidden = false;
});

btnRestart.addEventListener("click", () => {
  resultSection.hidden = true;
  introSection.hidden = false;
});
