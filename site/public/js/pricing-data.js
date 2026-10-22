export const PRO_PLAN = Object.freeze({
  monthlyCents: 1999,
  monthlyStandardCents: 6900,
  yearlyCents: 14900,
  yearlyStandardCents: 24900,
  interviewsPerMonth: 10,
  minutesPerInterview: 30,
});

export function money(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function billingCopy(period) {
  if (!['monthly', 'yearly'].includes(period)) throw new RangeError('Unknown billing period');
  const yearly = period === 'yearly';
  const total = yearly ? PRO_PLAN.yearlyCents : PRO_PLAN.monthlyCents;
  const regular = yearly ? PRO_PLAN.yearlyStandardCents : PRO_PLAN.monthlyStandardCents;
  const yearlyDiscount = Math.round((1 - PRO_PLAN.yearlyCents / (PRO_PLAN.monthlyCents * 12)) * 100);
  return {
    period, yearly, total,
    price: money(yearly ? Math.round(total / 12) : total),
    standard: money(yearly ? Math.round(regular / 12) : regular),
    billing: yearly ? `Billed ${money(total)}/year.` : 'Billed monthly.',
    saving: `Save ${money(regular - total)} ${yearly ? 'a year' : 'every month'}`,
    discount: `${yearlyDiscount}% less yearly`,
    charge: `${money(total)}/${yearly ? 'year' : 'month'}`,
    allowance: `${PRO_PLAN.interviewsPerMonth} × ${PRO_PLAN.minutesPerInterview}-minute interviews every month`,
    liveHours: PRO_PLAN.interviewsPerMonth * PRO_PLAN.minutesPerInterview / 60,
  };
}
