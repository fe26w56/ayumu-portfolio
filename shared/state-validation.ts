import { strengthWorkoutSchema } from "./strength-workout";

// Canonical runtime contract shared by the SPA and API.
// Runtime guards inspect unknown JSON properties before narrowing them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string => text(v) && v.length > 0 && v.length <= 200;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown) => num(v) && v >= 0;
const opt = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const one = (v: unknown, values: string[]) => text(v) && values.includes(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(text);
export const validDate = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0,10) === v;
const stamp = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const records = (v: unknown, check: (x: Obj) => boolean, key='id'): v is Obj[] => Array.isArray(v) && v.every(x=>obj(x) && id(x[key]) && check(x)) && new Set(v.map(x=>x[key])).size===v.length;
const optionalNumbers = (x: Obj, keys: string[]) => keys.every(k=>opt(x[k], num));
const optionalNonnegative = (x: Obj, keys: string[]) => keys.every(k=>opt(x[k], positive));
const optionalStrings = (x: Obj, keys: string[]) => keys.every(k=>opt(x[k],text));
const slot = (v:unknown) => one(v,['breakfast','lunch','dinner','snack']);
const portion = (v:unknown) => num(v) && v>=.1 && v<=5;
const nutrition = (v:unknown) => obj(v) && ['calories','protein','fat','carbs','fiber'].every(k=>positive(v[k]));
const recipe = (r:Obj) => text(r.name) && text(r.category) && Array.isArray(r.mealSlots) && r.mealSlots.every(slot) && num(r.servings) && r.servings>0 && positive(r.prepMinutes) && opt(r.satiety,positive) && strings(r.tags) && nutrition(r.nutrition) && strings(r.ingredients) && strings(r.steps);
export function validPlanner(v:unknown): boolean {
 if (!obj(v) || v.version!==1 || !obj(v.dailyTargets) || !positive(v.dailyTargets.calories) || !positive(v.dailyTargets.protein) || !positive(v.weekTargetCalories)) return false;
 if (!records(v.customRecipes,recipe) || !records(v.plans,p=>validDate(p.date)&&slot(p.slot)&&id(p.recipeId)&&Number.isInteger(p.order)&&opt(p.portion,portion)&&opt(p.fixed,x=>typeof x==='boolean'))) return false;
 if (!records(v.actuals,a=>validDate(a.date)&&slot(a.slot)&&id(a.recipeId)&&positive(a.calories)&&positive(a.protein)&&stamp(a.recordedAt)&&opt(a.planId,id)&&opt(a.review,r=>obj(r)&&r.reason==='duplicate-plan-link'&&id(r.planId))&&opt(a.portion,portion)&&opt(a.nutrition,nutrition)&&opt(a.recipeSnapshot,r=>obj(r)&&text(r.name))&&opt(a.skipped,x=>typeof x==='boolean')&&opt(a.edited,x=>typeof x==='boolean'))) return false;
 const refs=v.actuals.filter((a:Obj)=>a.planId).map((a:Obj)=>a.planId);
 // An actual can outlive a removed plan; retained references must agree on date/slot.
 return new Set(refs).size===refs.length && v.actuals.every((a:Obj)=>{const p=v.plans.find((p:Obj)=>p.id===a.planId);return !p || (p.date===a.date && p.slot===a.slot);});
}
const score = (s:Obj) => one(s.key,['sleep','recovery','circulation','activity']) && text(s.label) && text(s.detail) && one(s.source,['ultrahuman','derived']) && opt(s.value,v=>num(v)&&v>=0&&v<=100)&&opt(s.delta,num);
const daily = (d:Obj) => validDate(d.date) && records(d.scores,score,'key') && optionalNumbers(d,['bodyScore','sleepMinutes','sleepNeedMinutes','sleepEfficiency','timeInBedMinutes','restingHeartRate','hrv','spo2','skinTemperatureCelsius','temperatureDeviation','vo2Max','steps']) && opt(d.sleepFinalized,v=>typeof v==='boolean') && opt(d.sleepStages,s=>obj(s)&&optionalNonnegative(s,['deepMinutes','remMinutes','lightMinutes','awakeMinutes'])&&opt(s.awakeEstimated,v=>typeof v==='boolean')) && opt(d.syncedAt,stamp);
const lab = (x:Obj) => one(x.category,['basic','metabolic','liver','other']) && text(x.label) && ((opt(x.valueType,v=>v==='numeric')&&num(x.value)) || (one(x.valueType,['qualitative','text']) && text(x.value))) && text(x.referenceLabel) && optionalStrings(x,['unit','metricCode']) && opt(x.previousValue,num) && opt(x.attention,x=>typeof x==='boolean') && opt(x.flag,x=>one(x,['high','low','abnormal','normal','unknown']));
const check = (c:Obj) => validDate(c.date) && opt(c.facility,text) && records(c.values,lab) && optionalStrings(c,['overallGrade','importRequestId']) && opt(c.findings,strings) && opt(c.categoryGrades,g=>obj(g)&&Object.values(g).every(text));
const report = (r:Obj) => one(r.kind,['daily','weekly','health-check']) && validDate(r.periodStart) && validDate(r.periodEnd) && r.periodStart<=r.periodEnd && stamp(r.generatedAt) && text(r.title) && text(r.summary) && strings(r.observations) && optionalStrings(r,['healthCheckId','inputRevision']) && opt(r.source,s=>one(s,['source-document','app-analysis']));
export function validHealth(v:unknown):boolean {
 return obj(v)&&v.version===1&&positive(v.sleepTargetMinutes)&&records(v.daily,daily,'date')&&records(v.exercises,e=>validDate(e.date)&&one(e.source,['ultrahuman','manual','merged'])&&optionalNonnegative(e,['durationMinutes','averageHeartRate','activeCalories'])&&opt(e.linkedRecordIds,strings))&&records(v.healthChecks,check)&&records(v.reports,report);
}
const intensity = (v:unknown)=>one(v,['light','moderate','hard']);
const pattern = (p:Obj)=>text(p.name)&&one(p.category,['strength','walking','running','cycling','light','rest','other'])&&records(p.exercises,e=>text(e.name)&&optionalNumbers(e,['defaultSets','defaultReps','defaultWeightKg']))&&positive(p.defaultDurationMinutes)&&intensity(p.defaultIntensity)&&optionalNonnegative(p,['weeklyCount','weeklyMinutes'])&&Array.isArray(p.preferredWeekdays)&&p.preferredWeekdays.every((x:unknown)=>Number.isInteger(x)&&Number(x)>=0&&Number(x)<=6)&&typeof p.enabled==='boolean';
const candidate=(c:unknown)=>obj(c)&&id(c.patternId)&&one(c.role,['main','supplemental'])&&positive(c.durationMinutes)&&intensity(c.intensity)&&opt(c.reasons,strings);
export function validMove(v:unknown):boolean {
 return obj(v)&&v.version===1&&text(v.notificationTime)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.notificationTime)&&records(v.patterns,pattern)&&records(v.records,r=>validDate(r.date)&&text(r.type)&&opt(r.strengthWorkout,w=>strengthWorkoutSchema.safeParse(w).success)&&positive(r.durationMinutes)&&one(r.outcome,['complete','partial','skipped'])&&one(r.source,['manual','ultrahuman','merged','automatic-rest'])&&opt(r.intensity,intensity)&&opt(r.linkedRecordIds,strings)&&optionalNumbers(r,['activeCalories','averageHeartRate'])&&opt(r.sets,sets=>Array.isArray(sets)&&sets.every(s=>obj(s)&&id(s.exerciseId)&&Number.isInteger(s.set)&&typeof s.completed==='boolean'&&optionalNumbers(s,['weightKg','reps']))))&&records(v.recommendations,r=>r.version===1&&validDate(r.date)&&stamp(r.generatedAt)&&one(r.source,['scheduled','deterministic'])&&text(r.inputRevision)&&candidate(r.main)&&opt(r.supplemental,candidate));
}
export function validWellness(v:unknown):boolean {return obj(v)&&v.version===1&&validHealth(v.health)&&validMove(v.move)&&opt(v.tombstones,t=>obj(t)&&['dailyDates','exerciseIds','healthCheckIds','reportIds','moveRecordIds','patternIds','recommendationIds'].every(k=>strings(t[k])));}
