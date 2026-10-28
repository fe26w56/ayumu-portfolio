import type { HealthCheck, HealthLabValue } from './health-model';
const aliases: Record<string,string> = { sbp:'systolic', dbp:'diastolic', 'bmi-index':'bmi', 'hba1c':'hba1c' };
export function metricCode(value: HealthLabValue) { return value.metricCode ?? aliases[value.id] ?? value.id; }
export function previousLab(check: HealthCheck, value: HealthLabValue, checks: HealthCheck[]) {
  if (typeof value.value !== 'number') return undefined;
  // Unknown units cannot establish comparability, except explicitly dimensionless BMI.
  if (!value.unit && metricCode(value) !== 'bmi') return undefined;
  for (const earlier of checks.filter(c=>c.date<check.date).sort((a,b)=>b.date.localeCompare(a.date))) {
    const match=earlier.values.find(v=>metricCode(v)===metricCode(value)&&v.unit===value.unit&&typeof v.value==='number');
    if (match) return {date:earlier.date,value:match.value};
  }
  return undefined;
}
