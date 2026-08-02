/*
 * フォームの入力受付・DOM描画。計算ロジックは calculate.js に委譲する。
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function yen(n) {
  return Math.round(n).toLocaleString("ja-JP") + "円";
}

const form = document.getElementById("calc-form");
const resultSection = document.getElementById("screen-result");
const introSection = document.getElementById("screen-intro");
const resultBody = document.getElementById("result-body");
const btnRestart = document.getElementById("btn-restart");

function buildCrossLinkBanners() {
  const banners = [
    { href: "../takehome-calculator/", text: "在職中の手取り年収も計算してみる →" },
    { href: "../insurance-checker/", text: "退職後の保障を保険診断で確認する →" },
    { href: "../career-checker/", text: "転職・再就職を考えるなら転職エージェント診断へ →" },
  ];
  return banners.map((b) => `<a class="cross-link-banner" href="${escapeHtml(b.href)}">${escapeHtml(b.text)}</a>`).join("");
}

function buildResultHtml(r, years) {
  const shortTermNote =
    years <= 5
      ? `<p class="result-headline__sub">勤続5年以下は「短期退職手当等」の特例により、控除後300万円を超える部分の1/2課税が適用されない場合があります。</p>`
      : "";

  return `
    <div class="result-headline">
      <p class="result-headline__label">退職金の手取り額の目安</p>
      <p class="result-headline__value">${escapeHtml(yen(r.takeHome))}</p>
      ${shortTermNote}
    </div>
    <div class="result-breakdown">
      <div class="result-row"><span>退職金(額面)</span><span>${escapeHtml(yen(r.retirementPay))}</span></div>
      <div class="result-row"><span>退職所得控除額</span><span>− ${escapeHtml(yen(r.deduction))}</span></div>
      <div class="result-row"><span>課税対象の退職所得(概算)</span><span>${escapeHtml(yen(r.taxableIncome))}</span></div>
      <div class="result-row"><span>所得税(概算・分離課税)</span><span>− ${escapeHtml(yen(r.incomeTax))}</span></div>
      <div class="result-row"><span>住民税(概算・分離課税)</span><span>− ${escapeHtml(yen(r.residentTax))}</span></div>
    </div>
    <div class="result-cross-links">
      ${buildCrossLinkBanners()}
    </div>
  `;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  const retirementPay = Number(formData.get("retirement_pay"));
  const years = Number(formData.get("years"));

  if (!retirementPay || retirementPay <= 0 || !years || years <= 0) {
    return;
  }

  const result = calcRetirement({ retirementPay, years });

  resultBody.innerHTML = buildResultHtml(result, years);
  introSection.hidden = true;
  resultSection.hidden = false;
});

btnRestart.addEventListener("click", () => {
  resultSection.hidden = true;
  introSection.hidden = false;
});
