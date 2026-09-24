// Công thức tính lương, thuế TNCN, bảo hiểm, lãi vay, lãi tiết kiệm — Việt Nam 2026.
// Chạy được cả trên trình duyệt (window.Calc) lẫn Node (module.exports) để test.
(function (root) {
  'use strict';

  // Nguồn: Nghị quyết 110/2025/UBTVQH15 (giảm trừ gia cảnh), Luật Thuế TNCN sửa đổi 2025
  // (biểu 5 bậc, áp dụng thu nhập tiền lương từ kỳ tính thuế 2026), Nghị định 293/2025/NĐ-CP
  // (lương tối thiểu vùng từ 01/01/2026), Nghị định 161/2026/NĐ-CP (lương cơ sở từ 01/07/2026).
  const RULES = {
    personalDeduction: 15500000,
    dependentDeduction: 6200000,
    // [ngưỡng trên của bậc (tháng), thuế suất]
    brackets: [
      [10000000, 0.05],
      [30000000, 0.10],
      [60000000, 0.20],
      [100000000, 0.30],
      [Infinity, 0.35],
    ],
    regionMinWage: { 1: 5310000, 2: 4730000, 3: 4140000, 4: 3700000 },
    // Lương cơ sở / mức tham chiếu theo giai đoạn
    baseSalary: { before202607: 2340000, from202607: 2530000 },
    employee: { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 },
    employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 },
    unionFee: 0.02, // kinh phí công đoàn trên quỹ lương đóng BHXH (Điều 29 Luật Công đoàn 2024), mọi doanh nghiệp
    capMultiplier: 20,
  };

  function progressiveTax(taxable) {
    if (!(taxable > 0)) return { tax: 0, rows: [] };
    let prev = 0, tax = 0;
    const rows = [];
    for (const [upper, rate] of RULES.brackets) {
      if (taxable <= prev) break;
      const amount = Math.min(taxable, upper) - prev;
      const t = amount * rate;
      rows.push({ from: prev, to: upper, rate, amount, tax: t });
      tax += t;
      prev = upper;
    }
    return { tax, rows };
  }

  function baseSalaryFor(period) {
    return period === 'before202607' ? RULES.baseSalary.before202607 : RULES.baseSalary.from202607;
  }

  // opts: { gross, insuranceSalary?, region=1, dependents=0, nonTaxable=0, period='from202607', noInsurance=false }
  function grossToNet(opts) {
    const gross = Math.max(0, Number(opts.gross) || 0);
    const region = Number(opts.region) || 1;
    const dependents = Math.max(0, Math.floor(Number(opts.dependents) || 0));
    const nonTaxable = Math.min(gross, Math.max(0, Number(opts.nonTaxable) || 0));
    const insBase = opts.insuranceSalary == null || opts.insuranceSalary === ''
      ? gross : Math.max(0, Number(opts.insuranceSalary) || 0);
    const base = baseSalaryFor(opts.period);
    const capSocial = base * RULES.capMultiplier;
    const capUnemp = RULES.regionMinWage[region] * RULES.capMultiplier;

    const socialBase = opts.noInsurance ? 0 : Math.min(insBase, capSocial);
    const unempBase = opts.noInsurance ? 0 : Math.min(insBase, capUnemp);

    const ins = {
      bhxh: socialBase * RULES.employee.bhxh,
      bhyt: socialBase * RULES.employee.bhyt,
      bhtn: unempBase * RULES.employee.bhtn,
    };
    ins.total = ins.bhxh + ins.bhyt + ins.bhtn;

    const employerIns = {
      bhxh: socialBase * RULES.employer.bhxh,
      bhyt: socialBase * RULES.employer.bhyt,
      bhtn: unempBase * RULES.employer.bhtn,
    };
    employerIns.total = employerIns.bhxh + employerIns.bhyt + employerIns.bhtn;
    const unionFee = socialBase * RULES.unionFee;

    const deduction = RULES.personalDeduction + dependents * RULES.dependentDeduction;
    const incomeBeforeDeduction = gross - nonTaxable - ins.total;
    const taxable = Math.max(0, incomeBeforeDeduction - deduction);
    const { tax, rows } = progressiveTax(taxable);
    const net = gross - ins.total - tax;

    return {
      gross, net, tax, taxable, deduction, insurance: ins, employerInsurance: employerIns,
      insuranceBase: opts.noInsurance ? null : insBase,
      unionFee, employerCost: gross + employerIns.total + unionFee, taxRows: rows,
      caps: { social: capSocial, unemployment: capUnemp },
    };
  }

  // Tìm gross sao cho net = target (net đơn điệu tăng theo gross) bằng tìm kiếm nhị phân.
  function netToGross(opts) {
    const target = Math.max(0, Number(opts.net) || 0);
    let lo = target, hi = target * 2 + 10000000;
    while (grossToNet({ ...opts, gross: hi }).net < target) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      if (grossToNet({ ...opts, gross: mid }).net < target) lo = mid; else hi = mid;
    }
    return grossToNet({ ...opts, gross: Math.round(hi) });
  }

  // method: 'annuity' (trả góp đều) | 'declining' (gốc đều, lãi trên dư nợ giảm dần)
  function loan({ principal, annualRate, months, method = 'declining' }) {
    const P = Math.max(0, Number(principal) || 0);
    const n = Math.max(1, Math.floor(Number(months) || 1));
    const r = Math.max(0, Number(annualRate) || 0) / 100 / 12;
    const schedule = [];
    let balance = P, totalInterest = 0;
    const annuity = r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n));
    for (let k = 1; k <= n; k++) {
      const interest = balance * r;
      const principalPart = method === 'annuity' ? annuity - interest : P / n;
      balance = Math.max(0, balance - principalPart);
      totalInterest += interest;
      schedule.push({ month: k, payment: principalPart + interest, principal: principalPart, interest, balance });
    }
    return { schedule, totalInterest, totalPayment: P + totalInterest, firstPayment: schedule[0].payment };
  }

  // compound: tái tục cả gốc lẫn lãi mỗi kỳ hạn; termMonths: kỳ hạn gửi; totalMonths: tổng thời gian
  function savings({ principal, annualRate, termMonths, totalMonths, compound = false }) {
    const P = Math.max(0, Number(principal) || 0);
    const r = Math.max(0, Number(annualRate) || 0) / 100;
    const term = Math.max(1, Math.floor(Number(termMonths) || 1));
    const total = Math.max(term, Math.floor(Number(totalMonths) || term));
    const periods = Math.floor(total / term);
    let balance = P;
    const rows = [];
    for (let i = 1; i <= periods; i++) {
      const interest = (compound ? balance : P) * r * term / 12;
      if (compound) balance += interest; else balance = P + interest * i;
      rows.push({ period: i, month: i * term, interest, balance });
    }
    return { rows, interest: balance - P, final: balance };
  }

  // Quyền lợi BHXH tính trên tiền lương làm căn cứ đóng — Luật BHXH 41/2024/QH15 (từ 01/07/2025),
  // Luật Việc làm 2025 (từ 01/01/2026). Dùng cho công cụ "kiểm tra mức đóng BHXH".
  const BENEFITS = {
    maternityMonths: 6,           // Điều 53: nghỉ 6 tháng, mỗi tháng = 100% bình quân lương đóng 6 tháng gần nhất
    maternityLumpSumRef: 2,       // Điều 58: trợ cấp một lần khi sinh = 2 lần mức tham chiếu (không phụ thuộc lương)
    paternityDays: 5,             // Điều 53: chồng nghỉ khi vợ sinh thường 5 ngày làm việc (tối đa 14), mức ngày = tháng / 24
    sickRate: 0.75, sickDivisor: 24,   // Điều 45: 75% lương đóng tháng liền kề; mức 1 ngày = mức tháng / 24
    unempRate: 0.6, unempCapMinWage: 5,  // Luật Việc làm 2025: 60% bình quân 6 tháng, tối đa 5 lần lương tối thiểu vùng
    unempMonths: (years) => years < 1 ? 0 : Math.min(12, 3 + Math.max(0, Math.floor(years) - 3)), // 12–36 tháng đóng → 3 tháng, +1/12 tháng
    // Điều 66: tỷ lệ hưởng lương hưu theo số năm đóng
    pensionRate: (years, gender) => {
      const y = Math.floor(years);
      if (y < 15) return 0;
      const r = gender === 'female' ? 0.45 + (y - 15) * 0.02 : y < 20 ? 0.40 + (y - 15) * 0.01 : 0.45 + (y - 20) * 0.02;
      return Math.min(0.75, r);
    },
    retirementYears: 20,          // giả định số năm hưởng hưu để quy đổi thiệt hại trọn đời
  };

  // opts: { gross, declared, region=1, dependents=0, gender='female', years=25 (năm đóng khi nghỉ hưu), unempYears=3, period }
  // Trả về phần lương không được đóng và các quyền lợi bị mất tương ứng.
  function bhxhGap(opts) {
    const gross = Math.max(0, Number(opts.gross) || 0);
    const declared = Math.min(gross, Math.max(0, Number(opts.declared) || 0));
    const region = Number(opts.region) || 1;
    const gender = opts.gender === 'male' ? 'male' : 'female';
    const years = Math.max(0, Number(opts.years) || 0);
    const unempYears = Math.max(0, Number(opts.unempYears) || 0);
    const base = { region, dependents: opts.dependents, period: opts.period };
    const full = grossToNet({ ...base, gross, insuranceSalary: gross });
    const low = grossToNet({ ...base, gross, insuranceSalary: declared });
    const capSocial = full.caps.social, capUnemp = full.caps.unemployment;
    const minWage = RULES.regionMinWage[region];

    // Chênh lệch có hiệu lực (sau trần đóng) — phần thực sự ảnh hưởng tới quyền lợi
    const gapSocial = Math.max(0, Math.min(gross, capSocial) - Math.min(declared, capSocial));
    const gapUnemp = Math.max(0, Math.min(gross, capUnemp) - Math.min(declared, capUnemp));
    const gap = gross - declared;

    const extraNet = low.net - full.net;                       // người lao động nhận thêm mỗi tháng (đã tính thuế)
    const employerSaving = full.employerInsurance.total - low.employerInsurance.total;

    const unempCap = BENEFITS.unempCapMinWage * minWage;
    const unempPerMonth = Math.min(unempCap, BENEFITS.unempRate * Math.min(gross, capUnemp))
      - Math.min(unempCap, BENEFITS.unempRate * Math.min(declared, capUnemp));
    const unempMonths = BENEFITS.unempMonths(unempYears);
    const rate = BENEFITS.pensionRate(years, gender);
    const pensionPerMonth = rate * gapSocial;

    const lost = {
      maternity: gapSocial * BENEFITS.maternityMonths,
      paternity: gapSocial / BENEFITS.sickDivisor * BENEFITS.paternityDays,
      sickDay: BENEFITS.sickRate * gapSocial / BENEFITS.sickDivisor,
      unempPerMonth, unempMonths, unemp: unempPerMonth * unempMonths,
      pensionRate: rate, pensionPerMonth, pensionLife: pensionPerMonth * 12 * BENEFITS.retirementYears,
    };
    return {
      gross, declared, gap, gapSocial, gapUnemp, gender, years, extraNet, employerSaving,
      extraNetYear: extraNet * 12, extraNet10y: extraNet * 120, employerSaving10y: employerSaving * 120,
      belowMinWage: declared > 0 && declared < minWage, minWage, capSocial, capUnemp, lost,
      yearsToOffsetMaternity: extraNet > 0 ? lost.maternity / (extraNet * 12) : Infinity,
    };
  }

  // Thưởng / lương tháng 13 trả cùng tháng lương: cộng vào thu nhập chịu thuế của tháng đó (biểu luỹ tiến), không đóng BHXH.
  // opts: { salary, bonus, region, dependents, period, insuranceSalary? }
  function bonusTax(opts) {
    const salary = Math.max(0, Number(opts.salary) || 0), bonus = Math.max(0, Number(opts.bonus) || 0);
    const base = { region: opts.region, dependents: opts.dependents, period: opts.period,
      insuranceSalary: opts.insuranceSalary == null || opts.insuranceSalary === '' ? salary : opts.insuranceSalary };
    const without = grossToNet({ ...base, gross: salary });
    const withBonus = grossToNet({ ...base, gross: salary + bonus });
    const taxOnBonus = withBonus.tax - without.tax;
    const netBonus = bonus - taxOnBonus;
    // Nếu trả thưởng vào tháng có thu nhập thấp hơn (ví dụ tách sang tháng khác), thuế có thể thấp hơn: so sánh với việc chia đôi.
    const half = grossToNet({ ...base, gross: salary + bonus / 2 });
    const splitTax = (half.tax - without.tax) * 2;
    return { salary, bonus, taxOnBonus, netBonus, effectiveRate: bonus ? taxOnBonus / bonus : 0,
      monthNet: withBonus.net, monthTax: withBonus.tax, baseTax: without.tax, splitTax, splitSaving: Math.max(0, taxOnBonus - splitTax) };
  }

  // So hai phiếu lương: tách chênh lệch thực nhận thành từng nguyên nhân (đổi một yếu tố mỗi lần, theo thứ tự cố định).
  // a, b: { gross, insuranceSalary?, dependents, region, period, nonTaxable }
  function payslipDiff(a, b) {
    const norm = (x) => ({ gross: Math.max(0, Number(x.gross) || 0),
      insuranceSalary: x.insuranceSalary === '' || x.insuranceSalary == null ? null : Math.max(0, Number(x.insuranceSalary) || 0),
      dependents: Math.max(0, Math.floor(Number(x.dependents) || 0)), region: Number(x.region) || 1,
      period: x.period || 'from202607', nonTaxable: Math.max(0, Number(x.nonTaxable) || 0) });
    const A = norm(a), B = norm(b);
    const net = (x) => grossToNet(x).net;
    const steps = [
      ['period', 'Mức tham chiếu (trần BHXH) đổi theo thời điểm'],
      ['region', 'Vùng lương (trần BHTN) đổi'],
      ['gross', 'Lương gross đổi'],
      ['insuranceSalary', 'Mức lương đóng bảo hiểm đổi'],
      ['nonTaxable', 'Phụ cấp không chịu thuế đổi'],
      ['dependents', 'Số người phụ thuộc đổi'],
    ];
    const rows = [];
    let cur = { ...A }, prevNet = net(cur);
    for (const [k, label] of steps) {
      if (String(cur[k]) === String(B[k])) continue;
      cur = { ...cur, [k]: B[k] };
      const n = net(cur);
      if (Math.abs(n - prevNet) >= 1) rows.push({ key: k, label, from: A[k], to: B[k], effect: n - prevNet });
      prevNet = n;
    }
    const ra = grossToNet(A), rb = grossToNet(B);
    return { a: ra, b: rb, diff: rb.net - ra.net, rows,
      parts: { gross: rb.gross - ra.gross, insurance: -(rb.insurance.total - ra.insurance.total), tax: -(rb.tax - ra.tax) } };
  }

  const Calc = { RULES, BENEFITS, progressiveTax, grossToNet, netToGross, loan, savings, bhxhGap, bonusTax, payslipDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof self !== 'undefined' ? self : this);
