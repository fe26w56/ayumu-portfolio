import { mealMetricsForDates, type DayMetric } from "./data/meal-summary";
import { scaledRecipeNutrition } from "./data/meal-snapshot";
import { previousLab } from "./data/health-checks";
import { today, currentHour, useAppClock } from "./data/app-clock";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { GearSix } from "@phosphor-icons/react/GearSix";
import { Monitor } from "@phosphor-icons/react/Monitor";
import { Sun } from "@phosphor-icons/react/Sun";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ArrowsLeftRight } from "@phosphor-icons/react/ArrowsLeftRight";
import { CalendarDots } from "@phosphor-icons/react/CalendarDots";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { Check } from "@phosphor-icons/react/Check";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CloudSlash } from "@phosphor-icons/react/CloudSlash";
import { DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ForkKnife } from "@phosphor-icons/react/ForkKnife";
import { Heartbeat } from "@phosphor-icons/react/Heartbeat";
import { House } from "@phosphor-icons/react/House";
import { Moon } from "@phosphor-icons/react/Moon";
import { BatteryCharging } from "@phosphor-icons/react/BatteryCharging";
import { Pulse } from "@phosphor-icons/react/Pulse";
import { ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { Flask } from "@phosphor-icons/react/Flask";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Minus } from "@phosphor-icons/react/Minus";
import { PersonSimpleRun } from "@phosphor-icons/react/PersonSimpleRun";
import { Plus } from "@phosphor-icons/react/Plus";
import { Star } from "@phosphor-icons/react/Star";
import { Trash } from "@phosphor-icons/react/Trash";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import { cloneElement, isValidElement, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { BottomSheet, Carousel, KeyboardInput, MobileScroll } from "./mobile";
import { MembraneSphere, mapConditionToMembrane } from "./condition-sphere";
import "./component-fixes.css";
import recipesJson from "./data/recipes.json";
import { plannerStateStore } from "./data/planner-store";
import { completedSleepSummaries, sleepDebtMinutes, sleepNeedMinutes, type DailyHealthSummary, type HealthMetricKey, type HealthState } from "./data/health-model";
import { healthStateStore } from "./data/health-store";
import { activityMinutes, applyDetectedWorkoutClassification, buildMoveCandidates, deterministicRecommendation, findDetectedWorkoutMatch, isMoveRecommendation, mergeDetectedWorkout, moveRecordsForDisplay, nextLoadSuggestion, type MoveCandidate, type MovePattern, type MoveRecord, type MoveState, type WorkoutSet } from "./data/move-model";
import { moveStateStore } from "./data/move-store";
import { aggregateTimeSeries, contiguousValueSegments, periodBounds, periodOffsetForDate, rangeResolution, timeSeriesRanges, type TimeSeriesRange } from "./data/time-series";
import type { Actual, MealSlot, Plan, PlannerState, Recipe } from "./data/model";

type TabId = "week" | "candidates" | "history";
type GlobalTab = "today" | "meals" | "move" | "body";
type BodyTab = "week" | "labs";
type MoveTab = "week" | "menu" | "history";
type ThemeMode = "system" | "light" | "dark";
type Selection = { recipeId: string; portion: number };
type SheetState = { kind: "add" } | { kind: "recipe"; recipeId: string; planId?: string } | { kind: "record"; planId: string } | { kind: "editActual"; actualId: string } | { kind: "quickMove"; patternId: string } | { kind: "detectedMove"; ringId: string } | { kind: "substituteMove" } | { kind: "pattern"; patternId?: string } | { kind: "workoutFeedback"; recordId: string } | null;
type MetricDetailViewState = { metricKey: HealthMetricKey; range: TimeSeriesRange; periodOffset: number; selectedDate: string; scrollTop: number };

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartFor(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return localDateString(date);
}


const recipes = recipesJson as Recipe[];
const slots = ["breakfast", "lunch", "dinner", "snack"] as MealSlot[];
const slotLabels: Record<MealSlot, string> = { breakfast: "朝", lunch: "昼", dinner: "夜", snack: "間食" };
const slotLongLabels: Record<MealSlot, string> = { breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食" };
const weekdayLabels = ["月", "火", "水", "木", "金", "土", "日"];
const favoriteIds = new Set(["demo-oats", "demo-bowl"]);

function addDays(date: string, count: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
function daysInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}
function formatShortDate(date: string) { const [, m, d] = date.split("-").map(Number); return `${m}/${d}`; }
function formatWeekday(date: string) { return weekdayLabels[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]; }
function formatNumber(value: number) { return new Intl.NumberFormat("ja-JP").format(Math.round(value)); }
function scaledNutrition(recipe: Recipe, portion = 1) { return { calories: recipe.nutrition.calories * portion, protein: recipe.nutrition.protein * portion, fat: recipe.nutrition.fat * portion, carbs: recipe.nutrition.carbs * portion, fiber: recipe.nutrition.fiber * portion }; }

function SegmentedControl<T extends string>({ value, options, label, onChange }: { value: T; options: Array<[T, string]>; label: string; onChange: (value: T) => void }) {
  return <nav className="top-tab-control flex min-h-[52px] w-full p-1" aria-label={label}>{options.map(([id, text]) => <button type="button" key={id} className={`top-tab-control__item min-h-11 flex-1 border-0 text-[13px] ${value === id ? "is-active text-primary font-bold" : "bg-transparent text-[#8E8E93] font-medium"}`} aria-current={value === id ? "page" : undefined} onClick={() => onChange(id)}>{text}</button>)}</nav>;
}

function TopTabNavigation({ children, component }: { children: ReactNode; component: string }) {
  return <div data-design-component={component} data-navigation-style="rounded-card" className="top-tab-navigation shrink-0 px-4 py-3">{children}</div>;
}

function WeeklyCard({ component, children }: { component: string; children: ReactNode }) {
  return <section data-design-component={component} data-surface="card" className="rounded-[18px] border border-solid border-[#EEEEEE] bg-white p-4 shadow-none">{children}</section>;
}

function EmptyStateCard({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return <section data-design-component="empty-state" data-surface="card" className="flex min-h-[168px] flex-col items-center justify-center px-6 py-8 text-center">
    <span aria-hidden="true" className="mb-3 grid h-10 w-10 place-items-center rounded-[12px] bg-background text-textSub">{icon}</span>
    <strong className="text-[15px] font-semibold text-textMain">{title}</strong>
    <p className="mb-0 mt-2 max-w-[250px] text-[12px] leading-5 text-textSub">{description}</p>
  </section>;
}

function WeekRangeLabel({ startDate, endDate }: { startDate: string; endDate: string }) {
  return <div className="text-[12px] font-medium tabular-nums text-textSub">{formatShortDate(startDate)}〜{formatShortDate(endDate)}</div>;
}

function WeekDayLabel({ date, selected }: { date: string; selected: boolean }) {
  return <small data-design-role="week-day-label" data-selected={selected ? "true" : "false"} className={`mt-1 flex flex-col items-center text-[10px] leading-[13px] tabular-nums ${selected ? "font-bold text-primary" : "text-textSub"}`}><span>{formatShortDate(date)}</span><span>{formatWeekday(date)}</span></small>;
}

type SevenDayBarItem = {
  date: string;
  ariaLabel: string;
  disabled?: boolean;
  renderBar: (selected: boolean) => ReactNode;
};

function TimeSeriesScroller({ ariaLabel, selectedKey, viewportStartKey, className, contentClassName, children }: { ariaLabel: string; selectedKey: string; viewportStartKey?: string; className?: string; contentClassName?: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const alignViewport = () => {
      const viewport = rootRef.current?.querySelector<HTMLElement>(".mobile-carousel");
      const marker = viewportStartKey
        ? [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-scroll-key]") ?? [])].find((item) => item.dataset.scrollKey === viewportStartKey)
        : rootRef.current?.querySelector<HTMLElement>('[data-scroll-selected="true"]');
      if (!viewport || !marker) return;
      viewport.scrollTo({ left: viewportStartKey ? marker.offsetLeft : marker.offsetLeft - (viewport.clientWidth - marker.offsetWidth) / 2 });
    };
    alignViewport();
  }, [selectedKey, viewportStartKey]);
  return <div ref={rootRef} data-design-component="time-series-scroller" data-scrollbar="hidden" data-scroll-behavior="daily-snap" className={className}>
    <Carousel key={`${viewportStartKey ?? "selected"}-${selectedKey}`} ariaLabel={ariaLabel} contentClassName={contentClassName ?? "time-series-scroller__track"} showScrollbar={false} snapStep={44}>{children}</Carousel>
  </div>;
}

function SevenDayBarChart({ component, items, selectedDate, ariaLabel, onSelect, underlay, overlay, spacingClassName = "mt-2 mb-2" }: { component: string; items: SevenDayBarItem[]; selectedDate: string; ariaLabel: string; onSelect: (date: string) => void; underlay?: ReactNode; overlay?: ReactNode; spacingClassName?: string }) {
  const [selectionRevision,setSelectionRevision]=useState(0);
  const contentWidth = Math.max(308, items.length * 44);
  return <TimeSeriesScroller ariaLabel={ariaLabel} selectedKey={`${selectedDate}:${selectionRevision}`} viewportStartKey={weekStartFor(selectedDate)} className={`time-series-scroller ${spacingClassName}`} contentClassName="time-series-scroller__track">
    <div data-design-component={component} data-chart-anatomy="continuous-time-series" data-period-navigation="daily-snap-scroll" className="relative flex h-[120px] items-end px-0 select-none" style={{ width: contentWidth }} role="group">
      {underlay}
      {overlay ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[6px] z-20 h-[80px]">{overlay}</div> : null}
      {items.map((item) => { const selected = selectedDate === item.date; return <button data-scroll-key={item.date} data-scroll-selected={selected ? "true" : undefined} type="button" key={item.date} aria-disabled={item.disabled ? "true" : undefined} tabIndex={item.disabled ? -1 : undefined} aria-pressed={selected} aria-label={item.ariaLabel} onClick={() => { if (!item.disabled) { setSelectionRevision(v=>v+1); onSelect(item.date); } }} className={`relative z-10 flex h-[112px] w-11 min-w-[44px] flex-col items-center justify-end rounded-[8px] border-0 bg-transparent p-0 ${item.disabled ? "opacity-45" : ""}`}>
        <span className="relative flex h-[80px] w-full items-end justify-center">{item.renderBar(selected)}</span>
        <WeekDayLabel date={item.date} selected={selected} />
      </button>; })}
    </div>
  </TimeSeriesScroller>;
}

function HistoryGroup({ date, summary, children }: { date: string; summary?: ReactNode; children: ReactNode }) {
  return <section className="mb-6"><div className="mb-2 flex items-end justify-between px-1"><h2 className="m-0 text-base font-bold text-text-main">{formatShortDate(date)} {formatWeekday(date)}曜日</h2>{summary ? <div className="text-right text-sm font-bold text-text-main tabular-nums">{summary}</div> : null}</div><div data-surface="card" className="overflow-hidden rounded-[18px] border border-solid border-[#EEEEEE] bg-white shadow-none">{children}</div></section>;
}

function StitchHeader({ tab, selectedDate, onTab, onDate }: { tab: TabId; selectedDate: string; onTab: (tab: TabId) => void; onDate: (date: string) => void }) {
  return <>
    <header data-design-component="primary-header" className="grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 w-full bg-transparent shrink-0 z-10">
      <span aria-hidden="true" /><h1 className="text-[18px] font-bold text-[#333333] font-body tracking-tight text-center m-0">食事</h1>
      <label aria-label="日付を選択" className="relative w-11 h-11 grid place-items-center text-[#333333] cursor-pointer"><CalendarDots size={24} /><input type="date" value={selectedDate} onChange={(event) => event.target.value && onDate(event.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /></label>
    </header>
    <TopTabNavigation component="meal-tabs">
      <SegmentedControl value={tab} options={[["week", "今週"], ["candidates", "メニュー"], ["history", "履歴"]]} label="食事の表示" onChange={onTab} />
    </TopTabNavigation>
  </>;
}

function WeekSummary({ metrics, timelineMetrics, selectedDate, weekTarget, dailyTarget, proteinTarget, emptyMeals, onSelect }: { metrics: DayMetric[]; timelineMetrics: DayMetric[]; selectedDate: string; weekTarget: number; dailyTarget: number; proteinTarget: number; emptyMeals: number; onSelect: (date: string) => void }) {
  const actualCalories = metrics.reduce((sum, day) => sum + day.actual, 0);
  const plannedCalories = metrics.reduce((sum, day) => sum + day.planned, 0);
  const projected = actualCalories + plannedCalories;
  const remaining = weekTarget - projected;
  const targetCoverage = weekTarget > 0 ? Math.round(projected / weekTarget * 100) : 0;
  const progressWidth = weekTarget > 0 ? Math.min(100, projected / weekTarget * 100) : 0;
  const actualWidth = weekTarget > 0 ? Math.min(100, actualCalories / weekTarget * 100) : 0;
  const plannedWidth = Math.max(0, progressWidth - actualWidth);
  const overTarget = projected > weekTarget;
  const peak = Math.max(0, ...timelineMetrics.map((day) => day.actual + day.planned));
  // Reserve the top 18% for the selected-day marker, even when one meal day is
  // far above the daily target (for example 3,395 kcal).
  const max = Math.max(dailyTarget * 1.25, peak / 0.82);
  const plotHeight = 80;
  const plotBottom = 26;
  const targetPosition = plotBottom + Math.min(1, dailyTarget / max) * plotHeight;
  const proteinDays = metrics.filter((day) => day.protein >= proteinTarget).length;
  return <WeeklyCard component="meal-week-card"><div className="flex flex-col gap-4">
    <WeekRangeLabel startDate={metrics[0].date} endDate={metrics[6].date} />
    {remaining >= 0 ? <div className="text-[20px] font-bold tracking-tight">今週あと <span className="text-[28px] tabular-nums font-extrabold text-primary">{formatNumber(remaining)}</span> <span className="text-[14px] font-medium">kcal</span></div>
      : <div className="text-[20px] font-bold tracking-tight text-[#E56A00]"><span className="text-[28px] tabular-nums font-extrabold">{formatNumber(Math.abs(remaining))}</span> <span className="text-[14px] font-medium">kcal オーバー見込み</span></div>}
    <SevenDayBarChart component="meal-week-chart" items={timelineMetrics.map((day) => { const total = day.actual + day.planned; const totalHeight = Math.max(0, Math.min(82, total / max * 100)); const actualShare = total > 0 ? day.actual / total * 100 : 0; const plannedShare = total > 0 ? day.planned / total * 100 : 0; return { date: day.date, ariaLabel: `${formatShortDate(day.date)} ${formatWeekday(day.date)}曜日${day.date === today() ? " 今日" : ""}`, renderBar: (selected: boolean) => <span className="relative flex h-full w-8 items-end"><span data-design-role="weekly-bar" data-domain-bar="meal" data-selected={selected ? "true" : "false"} className="flex w-8 flex-col-reverse justify-start overflow-hidden rounded-t-[3px]" style={{ height: `${totalHeight}%` }}><i className="block w-full bg-primary not-italic" style={{ height: `${actualShare}%` }} /><i className="block w-full bg-primary-light not-italic" style={{ height: `${plannedShare}%` }} /></span>{selected ? <span data-design-role="meal-selected-marker" className="absolute left-1/2 z-20 h-1.5 w-1.5 rounded-full bg-primary" style={{ bottom: `calc(${totalHeight}% + 8px)`, transform: "translateX(-50%)" }} /> : null}</span> }; })} selectedDate={selectedDate} ariaLabel="食事の連続日別グラフ。横にスクロールして日付を選択" onSelect={onSelect} underlay={<div className="chart-target-line absolute left-0 z-0 w-full" style={{ bottom: targetPosition }} />} />
    <div data-design-role="meal-target-legend" className="-mt-1 flex justify-center text-[10px] text-textSub"><span className="flex items-center gap-1.5"><i className="chart-target-key h-0.5 w-3" />1日の目安 {formatNumber(dailyTarget)} kcal</span></div>
    <div data-design-role="meal-goal-progress" className="mt-1 border-0 border-t border-solid border-[#EEEEEE] pt-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <span><small className="mb-0.5 block text-[11px] font-medium text-textSub">今週の進捗</small><strong className={`text-[22px] leading-none tabular-nums ${overTarget ? "text-[#FF9500]" : "text-textMain"}`}>{targetCoverage}%</strong></span>
        <span className="pb-0.5 text-right text-[12px] text-textSub tabular-nums"><strong className={overTarget ? "text-[15px] text-[#FF9500]" : "text-[15px] text-textMain"}>{formatNumber(projected)}</strong> / {formatNumber(weekTarget)} kcal</span>
      </div>
      <span data-design-role="meal-progress-track" data-over-target={overTarget ? "true" : "false"} className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`今週の食事目標。食べた量${formatNumber(actualCalories)}キロカロリー、候補${formatNumber(plannedCalories)}キロカロリー、目標${formatNumber(weekTarget)}キロカロリー`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, targetCoverage)}>
        {overTarget ? <i data-progress-segment="over" className="block h-full w-full not-italic" /> : <><i data-progress-segment="actual" className="block h-full bg-primary not-italic" style={{ width: `${actualWidth}%` }} /><i data-progress-segment="planned" className="block h-full not-italic" style={{ width: `${plannedWidth}%` }} /></>}
      </span>
    </div>
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center"><span className="text-[13px] text-text-main font-medium">P達成見込み</span><span className="text-[14px] font-bold tabular-nums">{proteinDays}/7<small className="text-[11px] font-normal text-text-sub">日</small></span></div>
      <div className="flex justify-between items-center"><span className="text-[13px] text-text-main font-medium">未予定</span><span className="text-[14px] font-bold text-[#E56A00] tabular-nums">{emptyMeals}<small className="text-[11px] font-normal text-text-sub">食</small></span></div>
    </div>
  </div></WeeklyCard>;
}

function MealStatus({ status }: { status: "actual" | "planned" | "skipped" }) { return status === "actual" ? <CheckCircle size={20} weight="fill" className="text-primary" /> : status === "planned" ? <CalendarDots size={20} className="text-[#666666]" /> : <Minus size={20} className="text-gray-400" />; }
function DailyMeals({ date, plans, actuals, recipesById, onOpen, onOpenActual, onAdd, onRecord }: { date: string; plans: Plan[]; actuals: Actual[]; recipesById: Map<string, Recipe>; onOpen: (plan: Plan) => void; onOpenActual: (actual: Actual) => void; onAdd: (slot: MealSlot) => void; onRecord: (plan: Plan) => void }) {
  const dayActuals = actuals.filter((actual) => actual.date === date);
  const actualTotal = dayActuals.filter((actual) => !actual.skipped).reduce((sum, actual) => ({ calories: sum.calories + actual.calories, protein: sum.protein + actual.protein }), { calories: 0, protein: 0 });
  const plannedTotal = plans.reduce((sum, plan) => { if (dayActuals.some((actual) => actual.planId === plan.id)) return sum; const recipe = recipesById.get(plan.recipeId); const n = recipe ? scaledNutrition(recipe, plan.portion) : { calories: 0, protein: 0 }; return { calories: sum.calories + n.calories, protein: sum.protein + n.protein }; }, { calories: 0, protein: 0 });
  const total = { calories: actualTotal.calories + plannedTotal.calories, protein: actualTotal.protein + plannedTotal.protein, actual: actualTotal.calories, planned: plannedTotal.calories };
  const dayIndex = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return <section className="pt-2">
    <div className="flex justify-between items-end mb-4 pt-2 px-2">
      <h2 className="text-brand-text font-bold text-[20px] tracking-tight m-0">{weekdayLabels[dayIndex]} {formatShortDate(date)}</h2>
      <button type="button" className="text-primary text-[13px] font-semibold flex items-center min-h-[44px] px-2 bg-transparent border-0" onClick={() => onAdd("dinner")}>予定を追加</button>
    </div>
    <div className="mb-6 px-2">
      <div className="flex items-baseline gap-4 mb-1">
        <div className="flex items-baseline"><strong className="text-[28px] font-bold text-brand-text tabular-nums">{formatNumber(total.calories)}</strong><span className="text-[14px] text-brand-subtext ml-1">kcal</span></div>
        <div className="flex items-baseline"><strong className="text-[20px] font-bold text-brand-text tabular-nums">P{formatNumber(total.protein)}</strong><span className="text-[12px] text-brand-subtext ml-0.5">g</span></div>
      </div>
      <p className="text-[12px] text-brand-gray tabular-nums m-0">実績 {formatNumber(total.actual)} kcal・予定として計算 {formatNumber(total.planned)} kcal</p>
    </div>
    <div className="bg-white rounded-[12px] p-4 flex flex-col shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      {slots.map((slot, slotIndex) => { const slotPlans = plans.filter((plan) => plan.slot === slot); const standaloneActuals = dayActuals.filter((actual) => actual.slot === slot && !actual.planId); const hasItems = slotPlans.length + standaloneActuals.length > 0; return <div key={slot} className={slotIndex ? "border-t border-gray-100 pt-6 mt-6" : ""}>
        <div className={`flex justify-between items-center ${hasItems ? "mb-3" : ""}`}>
          <h3 className="text-[15px] font-bold text-brand-text m-0">{slotLongLabels[slot]}</h3>
          <button type="button" className={`w-[44px] h-[44px] flex items-center justify-end -mr-2 bg-transparent border-0 ${hasItems ? "text-primary" : "text-brand-gray"}`} aria-label={`${slotLabels[slot]}に予定を追加`} onClick={() => onAdd(slot)}><Plus size={20} /></button>
        </div>
        {[...standaloneActuals.map((actual) => ({ kind: "actual" as const, actual })), ...slotPlans.map((plan) => ({ kind: "plan" as const, plan }))].map((item, itemIndex, items) => { const actual = item.kind === "actual" ? item.actual : dayActuals.find((entry) => entry.planId === item.plan.id); const recipe = recipesById.get(item.kind === "actual" ? item.actual.recipeId : item.plan.recipeId); if (!recipe) return null; const n = actual ?? scaledNutrition(recipe, item.kind === "plan" ? item.plan.portion : 1); const open = () => item.kind === "actual" ? onOpenActual(item.actual) : onOpen(item.plan); return <div key={item.kind === "actual" ? item.actual.id : item.plan.id} className={`flex items-start gap-3 ${itemIndex < items.length - 1 ? "mb-3" : ""}`}>
          <div className="mt-0.5 w-5 shrink-0">{itemIndex === 0 ? <button type="button" className="w-11 h-11 -m-3 grid place-items-center border-0 bg-transparent" aria-label={actual ? `${slotLabels[slot]}の実績を編集` : `${slotLabels[slot]}を記録`} onClick={() => actual ? open() : item.kind === "plan" && onRecord(item.plan)}><MealStatus status={actual?.skipped ? "skipped" : actual ? "actual" : "planned"} /></button> : null}</div>
          <button type="button" onClick={open} aria-label={`${slotLabels[slot]} ${recipe.name} ${actual ? "実績を見る" : "予定"}`} className="flex-1 min-w-0 flex justify-between items-baseline text-left p-0 border-0 bg-transparent">
            <span className="text-[14px] text-brand-text truncate">{actual?.skipped ? "食べなかった" : recipe.name}</span>
            <span className="flex gap-3 text-[13px] text-brand-subtext tabular-nums shrink-0 ml-3"><span>{formatNumber(n.calories)} kcal</span><span>P{formatNumber(n.protein)}g</span></span>
          </button>
        </div>; })}
      </div>; })}
    </div>
  </section>;
}

function SearchField({ value, onChange, label = "料理を検索", placeholder = "料理名で検索" }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) { return <div className="relative mb-4"><span className="absolute left-3 top-0 bottom-0 flex items-center text-gray-400 z-10 pointer-events-none"><MagnifyingGlass size={20} /></span><KeyboardInput type="text" inputMode="search" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={placeholder} className="w-full h-[44px] bg-white rounded-[8px] pl-10 pr-12 py-3 text-[16px] text-gray-800 border-none outline-none shadow-sm" />{value ? <button type="button" aria-label="検索をクリア" className="absolute right-0 top-0 bottom-0 w-11 flex items-center justify-center bg-transparent border-0 text-gray-400" onClick={() => onChange("")}><X size={16} /></button> : null}</div>; }
function CandidateRow({ recipe, selected, onOpen, onToggle }: { recipe: Recipe; selected?: boolean; onOpen: (recipe: Recipe) => void; onToggle?: (recipe: Recipe) => void }) { return <div className={`flex items-center min-h-[64px] px-4 border-b border-gray-100 last:border-b-0 transition-colors ${selected ? "bg-primary-light" : "bg-white"}`}>
  {onToggle ? <button type="button" aria-label={`${recipe.name}を${selected ? "選択解除" : "選択"}`} className={`w-11 h-11 -ml-2 mr-1 shrink-0 grid place-items-center p-0 leading-none rounded-md border-0 bg-transparent ${selected ? "text-primary" : "text-gray-400"}`} onClick={() => onToggle(recipe)}><span aria-hidden="true" className={`w-6 h-6 grid place-items-center rounded-md border border-solid ${selected ? "bg-primary border-primary text-white" : "bg-white border-gray-300 text-transparent"}`}><Check size={15} weight="bold" /></span></button> : null}
  <button type="button" className="self-stretch min-h-[64px] flex-1 min-w-0 flex items-center justify-between p-0 border-0 bg-transparent text-left" onClick={() => onOpen(recipe)}><span className="flex flex-col justify-center min-w-0"><strong className="text-[16px] text-gray-800 font-medium leading-tight mb-1 truncate">{recipe.name}</strong><small className="text-[12px] text-gray-500 font-normal leading-tight">{formatNumber(recipe.nutrition.calories)} kcal / P{formatNumber(recipe.nutrition.protein)}g</small></span><span className="flex items-center gap-2 ml-2 shrink-0">{favoriteIds.has(recipe.id) ? <Star size={20} weight="fill" className="text-primary" aria-label="お気に入り" /> : <Star size={20} className="text-gray-400" />}<CaretRight size={20} className="text-gray-300" /></span></button>
</div>; }
function CandidatesView({ recipesList, onOpen }: { recipesList: Recipe[]; onOpen: (recipe: Recipe) => void }) { const [query, setQuery] = useState(""); const deferred = useDeferredValue(query.trim().toLowerCase()); const filtered = useMemo(() => recipesList.filter((recipe) => `${recipe.name} ${recipe.tags.join(" ")} ${recipe.ingredients.join(" ")}`.toLowerCase().includes(deferred)).sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id))), [deferred, recipesList]); return <main className="px-4 pt-6 pb-8 w-full">
  <div className="flex items-end justify-between mb-4"><h2 className="text-[18px] font-bold text-gray-800 leading-none m-0" aria-label="料理の候補">料理候補</h2><span className="text-[12px] text-gray-500 leading-none pb-0.5">{filtered.length}件</span></div>
  <SearchField value={query} onChange={setQuery} /><div className="flex justify-end mb-3"><button type="button" className="min-h-11 px-2 flex items-center text-[12px] text-gray-500 bg-transparent border-0"><span>お気に入り・最近使った順</span><CaretDown size={16} className="ml-1" /></button></div>
  {filtered.length ? <div className="bg-white rounded-[12px] shadow-sm overflow-hidden mb-8">{filtered.map((recipe) => <CandidateRow key={recipe.id} recipe={recipe} onOpen={onOpen} />)}</div> : <EmptyStateCard title="候補が見つかりません" description="料理名や食材名を短くして、もう一度検索してください。" icon={<MagnifyingGlass size={20} />} />}
</main>; }

function HistoryView({ actuals, plans, recipesById, dates, onOpen }: { actuals: Actual[]; plans: Plan[]; recipesById: Map<string, Recipe>; dates: string[]; onOpen: (actual: Actual) => void }) { const grouped = dates.slice().reverse().map((date) => ({ date, items: actuals.filter((actual) => actual.date === date) })).filter((group) => group.items.length); return <main className="px-4 pt-4 pb-8 w-full">
  <div className="flex justify-end mb-6"><button type="button" className="min-h-11 px-2 text-primary text-sm font-medium flex items-center gap-1 bg-transparent border-0"><Plus size={18} />記録を追加</button></div>
  {grouped.map((group) => { const calories = group.items.reduce((sum, actual) => sum + actual.calories, 0); const protein = group.items.reduce((sum, actual) => sum + actual.protein, 0); return <HistoryGroup key={group.date} date={group.date} summary={<>{formatNumber(calories)} <small className="text-xs font-normal text-text-muted">kcal</small> / P{formatNumber(protein)}<small className="text-xs font-normal text-text-muted">g</small></>}>
    {group.items.map((actual) => { const recipe = recipesById.get(actual.recipeId); if (!recipe) return null; const plan = plans.find((item) => item.id === actual.planId); const plannedRecipe = plan ? recipesById.get(plan.recipeId) : undefined; const changed = Boolean(plan && plan.recipeId !== actual.recipeId); const status = actual.skipped ? "食べなかった" : changed ? `${plannedRecipe?.name ?? "予定"} → 実績` : "予定どおり"; return <button type="button" key={actual.id} aria-label={`${recipe.name} ${formatShortDate(actual.date)} · ${slotLabels[actual.slot]} ${status}`} onClick={() => onOpen(actual)} className="px-4 py-4 flex items-start gap-3 border-0 border-b border-border-light last:border-b-0 bg-white text-left w-full"><span className="w-8 shrink-0 pt-0.5 text-xs font-medium text-text-muted">{slotLongLabels[actual.slot]}</span><span className="flex-1 flex flex-col gap-1">{changed ? <><span className="flex items-center gap-2"><i className="not-italic text-[10px] font-medium text-primary bg-primary-pale px-1.5 py-0.5 rounded">予定</i><span className="text-sm text-text-muted line-through">{plannedRecipe?.name}</span></span><span className="flex items-center gap-2"><i className="not-italic text-[10px] font-medium text-white bg-primary px-1.5 py-0.5 rounded">実績</i><strong className="text-sm text-primary font-medium">{recipe.name}</strong></span></> : <strong className={`text-sm font-medium ${actual.skipped ? "text-empty-gray" : "text-text-main"}`}>{actual.skipped ? "食べなかった" : recipe.name}</strong>}<small className="flex items-center gap-1.5 text-[11px] text-text-muted"><CheckCircle size={14} weight={actual.skipped ? "regular" : "fill"} className={actual.skipped ? "text-empty-gray" : "text-primary"} />{status}{actual.edited ? " · 編集済み" : ""}</small></span></button>; })}
  </HistoryGroup>; })}{grouped.length === 0 ? <EmptyStateCard title="この週の記録はまだありません" description="食べた内容を記録すると、日ごとのカロリーとたんぱく質をここで振り返れます。" icon={<ForkKnife size={20} />} /> : null}
</main>; }

function SheetClose({ onClose }: { onClose: () => void }) { return <button type="button" aria-label="閉じる" className="absolute top-[18px] right-4 z-10 w-11 h-11 grid place-items-center rounded-full text-cool-gray bg-transparent border-0" onClick={onClose}><X size={24} /></button>; }
function AddSheet({ recipesList, selected, setSelected, onOpen, onAdd, onClose }: { recipesList: Recipe[]; selected: Selection[]; setSelected: React.Dispatch<React.SetStateAction<Selection[]>>; onOpen: (recipe: Recipe) => void; onAdd: () => void; onClose: () => void }) { const [query, setQuery] = useState(""); const deferred = useDeferredValue(query.trim().toLowerCase()); const visible = recipesList.filter((recipe) => `${recipe.name} ${recipe.tags.join(" ")} ${recipe.ingredients.join(" ")}`.toLowerCase().includes(deferred)).slice(0, 8); const toggle = (recipe: Recipe) => setSelected((current) => current.some((item) => item.recipeId === recipe.id) ? current.filter((item) => item.recipeId !== recipe.id) : [...current, { recipeId: recipe.id, portion: 1 }]); const setPortion = (id: string, portion: number) => setSelected((current) => current.map((item) => item.recipeId === id ? { ...item, portion: Math.max(.1, Math.min(5, Math.round(portion * 10) / 10)) } : item)); const total = selected.reduce((sum, item) => { const recipe = recipesList.find((entry) => entry.id === item.recipeId); const n = recipe ? scaledNutrition(recipe, item.portion) : { calories: 0, protein: 0 }; return { calories: sum.calories + n.calories, protein: sum.protein + n.protein }; }, { calories: 0, protein: 0 }); return <div className="stitch-add-sheet -mx-4 flex flex-col h-full"><SheetClose onClose={onClose} />
  <div className="px-4 pt-1"><SearchField value={query} onChange={setQuery} /><p className="text-[13px] text-cool-gray mb-3">料理は何個でも組み合わせられます</p><div className="bg-white rounded-[12px] overflow-hidden border border-border-color">{visible.map((recipe) => <CandidateRow key={recipe.id} recipe={recipe} selected={selected.some((item) => item.recipeId === recipe.id)} onToggle={toggle} onOpen={onOpen} />)}</div></div>
  {selected.length ? <div className="px-4 pt-5 flex flex-col gap-5">{selected.map((item) => { const recipe = recipesList.find((entry) => entry.id === item.recipeId); if (!recipe) return null; const n = scaledNutrition(recipe, item.portion); return <div className="flex flex-col gap-3 pb-4 border-b border-border-color" key={item.recipeId}><div className="flex justify-between items-start gap-2"><div className="flex-1"><h3 className="font-bold text-charcoal text-base m-0">{recipe.name}</h3><p className="text-sm text-cool-gray tabular-nums m-0">{formatNumber(n.calories)} kcal / P{formatNumber(n.protein)}g</p></div><div className="flex items-center gap-1"><div className="flex items-center bg-light-gray rounded-lg border border-border-color overflow-hidden"><button type="button" aria-label={`${recipe.name}の量を0.1減らす`} className="w-11 h-11 grid place-items-center text-primary bg-transparent border-0" onClick={() => setPortion(item.recipeId, item.portion - .1)}><Minus size={20} /></button><span className="w-14 text-center font-bold text-charcoal text-sm tabular-nums">{item.portion.toFixed(1)}人前</span><button type="button" aria-label={`${recipe.name}の量を0.1増やす`} className="w-11 h-11 grid place-items-center text-primary bg-transparent border-0" onClick={() => setPortion(item.recipeId, item.portion + .1)}><Plus size={20} /></button></div><button type="button" aria-label={`${recipe.name}を削除`} className="w-11 h-11 grid place-items-center text-cool-gray bg-transparent border-0" onClick={() => toggle(recipe)}><Trash size={20} /></button></div></div><div className="flex gap-2">{[.5, 1, 1.2, 1.5].map((portion) => <button type="button" key={portion} className={`min-h-11 flex-1 px-2 rounded-full text-sm text-center ${item.portion === portion ? "border-2 border-primary font-bold text-primary bg-primary-light" : "border border-border-color text-charcoal bg-white"}`} onClick={() => setPortion(item.recipeId, portion)}>{portion.toFixed(1)}</button>)}</div></div>; })}</div> : null}
  {selected.length ? <div className="sticky bottom-0 bg-surface p-4 pb-6 border-t border-border-color mt-5 flex flex-col gap-3"><div className="flex justify-between items-center px-1"><span className="font-bold text-charcoal">合計</span><span className="font-bold text-charcoal tabular-nums">{formatNumber(total.calories)} kcal / P{formatNumber(total.protein)}g</span></div><button type="button" className="w-full bg-primary text-white font-bold rounded-lg py-3.5 text-center border-0" onClick={onAdd}>{selected.length}品を追加</button><button type="button" className="w-full min-h-11 text-primary font-bold text-sm text-center bg-transparent border-0">料理を追加で選ぶ</button></div> : null}
</div>; }

function RecipeScreen({ recipe, plan, actual, selectedDate, selectedSlot, portion, onClose, onPortion, onSlot, onAdd, onToggleActual, onRemove }: { recipe: Recipe; plan?: Plan; actual?: Actual; selectedDate: string; selectedSlot: MealSlot; portion: number; onClose: () => void; onPortion: (portion: number) => void; onSlot: (slot: MealSlot) => void; onAdd: () => void; onToggleActual: () => void; onRemove: () => void }) { const amount = plan?.portion ?? portion; const n = scaledNutrition(recipe, amount); const changePortion = (next: number) => onPortion(Math.max(.1, Math.min(5, Math.round(next * 10) / 10))); useEffect(() => { const close = (event: KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]); return <div className="stitch-detail-screen absolute left-0 right-0 bottom-0 z-[60] bg-background flex flex-col" role="dialog" aria-modal="true" aria-label={recipe.name}>
  <header className="flex items-center justify-between px-4 h-16 w-full bg-background z-10 shrink-0"><button type="button" aria-label="戻る" className="w-11 h-11 grid place-items-center text-textSub bg-transparent border-0 rounded-full shrink-0" onClick={onClose}><ArrowLeft size={24} /></button><h2 className="font-headline text-lg font-bold text-textMain truncate px-2 m-0 min-w-0 flex-1 text-center">{recipe.name}</h2><div className="flex items-center gap-1 shrink-0"><button type="button" aria-label="お気に入り" className="w-11 h-11 grid place-items-center text-primary bg-transparent border-0 rounded-full"><Star size={24} weight={favoriteIds.has(recipe.id) ? "fill" : "regular"} /></button><button type="button" aria-label="メニュー" className="w-11 h-11 grid place-items-center text-textSub bg-transparent border-0 rounded-full"><DotsThreeVertical size={24} /></button></div></header>
  <MobileScroll className="top-16 bottom-0"><div className="px-4 pb-24 space-y-5 pt-2"><section className="bg-surface rounded-xl p-5 shadow-sm space-y-6">
    <div><div className="flex items-center justify-between mb-2"><span className="text-sm text-textSub font-medium">{amount.toFixed(1)}人前</span><span className="text-[11px] text-textSub border border-divider rounded-full px-2 py-0.5">推定</span></div><div className="flex items-baseline gap-3"><div className="flex items-baseline"><strong className="text-3xl font-bold tracking-tight text-textMain tabular-nums">{formatNumber(n.calories)}</strong><span className="text-sm font-medium text-textSub ml-1">kcal</span></div><div className="flex items-baseline"><strong className="text-xl font-bold text-textMain tabular-nums">P{formatNumber(n.protein)}</strong><span className="text-sm font-medium text-textSub">g</span></div></div></div><hr className="border-0 border-t border-divider opacity-60" />
    {!plan ? <div className="space-y-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-textMain">{formatShortDate(selectedDate)}の予定に追加</span></div><div className="grid grid-cols-4 gap-2">{slots.map((slot) => <button type="button" key={slot} className={`h-11 rounded-lg text-sm border border-solid ${selectedSlot === slot ? "border-primary bg-primary-light text-primary font-bold" : "border-divider bg-white text-textSub"}`} onClick={() => onSlot(slot)}>{slotLabels[slot]}</button>)}</div><div className="flex items-center justify-center gap-4"><button type="button" aria-label="量を0.1減らす" className="w-11 h-11 grid place-items-center rounded-full bg-background text-textSub border-0" onClick={() => changePortion(portion - .1)}><Minus size={22} /></button><span className="text-xl font-bold text-textMain w-20 text-center tabular-nums">{portion.toFixed(1)}<small className="text-sm font-medium ml-1">人前</small></span><button type="button" aria-label="量を0.1増やす" className="w-11 h-11 grid place-items-center rounded-full bg-background text-primary border-0" onClick={() => changePortion(portion + .1)}><Plus size={22} /></button></div><div className="flex justify-center gap-2">{[.5, 1, 1.2, 1.5].map((value) => <button type="button" key={value} className={`min-h-11 px-4 rounded-full text-sm border-solid ${portion === value ? "font-bold border-2 border-primary bg-primary-light text-primary" : "font-medium border border-divider text-textSub bg-white"}`} onClick={() => changePortion(value)}>{value.toFixed(1)}</button>)}</div><button type="button" className="w-full bg-primary text-surface font-bold text-base py-3.5 rounded-full border-0" onClick={onAdd}>予定に入れる</button></div> : <div className="space-y-2"><button type="button" className={`w-full font-bold text-base py-3.5 rounded-full flex items-center justify-center gap-2 ${actual ? "bg-white text-primary border border-primary" : "bg-primary text-white border-0"}`} onClick={onToggleActual}><CheckCircle size={20} weight={actual ? "fill" : "bold"} />{actual ? "食べた記録を取り消す" : "食べたとして記録"}</button><button type="button" className="w-full text-red-600 text-sm font-medium py-3 bg-transparent border-0" onClick={onRemove}><Trash size={17} className="inline mr-1" />予定から外す</button></div>}
    <hr className="border-0 border-t border-divider opacity-60" /><div><h3 className="text-base font-bold text-textMain mb-3">材料 <small className="text-xs font-normal text-textSub ml-2">({amount.toFixed(1)}人前)</small></h3><ul className="space-y-3 p-0 m-0 list-none">{recipe.ingredients.map((ingredient) => <li className="flex justify-between items-center text-sm text-textMain" key={ingredient}>{ingredient}</li>)}</ul></div><hr className="border-0 border-t border-divider opacity-60" /><div><h3 className="text-base font-bold text-textMain mb-3">作り方</h3><ol className="space-y-4 p-0 m-0 list-none">{recipe.steps.map((step, index) => <li className="flex gap-3" key={step}><span className="shrink-0 w-6 h-6 rounded-full bg-background grid place-items-center text-xs font-bold text-textSub">{index + 1}</span><p className="text-sm text-textMain leading-relaxed pt-0.5 m-0">{step}</p></li>)}</ol></div>
  </section></div></MobileScroll>
</div>; }

function RecordSheet({ recipe, onAsPlanned, onDifferent, onSkipped, onClose }: { plan: Plan; recipe: Recipe; onAsPlanned: () => void; onDifferent: () => void; onSkipped: () => void; onClose: () => void }) { return <div className="-mx-4"><SheetClose onClose={onClose} /><div className="px-4 pb-4 border-b border-divider"><div className="flex items-baseline gap-2"><span className="text-xs font-medium text-textSecondary border border-divider px-1.5 py-0.5 rounded">予定</span><strong className="text-sm font-medium text-textPrimary">{recipe.name}</strong></div><div className="mt-1 text-sm text-textSecondary">{formatNumber(recipe.nutrition.calories)} kcal　P {formatNumber(recipe.nutrition.protein)}g</div></div>
  <button type="button" className="flex items-center gap-4 px-4 min-h-[56px] w-full text-left border-0 border-b border-divider bg-white" onClick={onAsPlanned}><CheckCircle size={24} weight="fill" className="text-primary" /><span className="text-[15px] font-medium text-textPrimary">予定どおり食べた</span></button>
  <button type="button" className="flex items-center gap-4 px-4 py-3 min-h-[56px] w-full text-left border-0 border-b border-divider bg-white" onClick={onDifferent}><ArrowsLeftRight size={24} className="text-textSecondary" /><span className="flex flex-col"><strong className="text-[15px] font-medium text-textPrimary">別のものを食べた</strong><small className="text-xs text-textSecondary mt-0.5">料理候補から選びます</small></span></button>
  <button type="button" className="flex items-center gap-4 px-4 py-3 min-h-[56px] w-full text-left border-0 bg-white" onClick={onSkipped}><Minus size={24} className="text-textSecondary" /><span className="flex flex-col"><strong className="text-[15px] font-medium text-textPrimary">食べなかった</strong><small className="text-xs text-textSecondary mt-0.5">0 kcalとして記録します</small></span></button>
</div>; }

function ActualEditSheet({ actual, plan, recipe, plannedRecipe, onSave, onSkipped, onDelete, onReplace, onClose, onKeep }: { onKeep:()=>void; actual: Actual; plan?: Plan; recipe: Recipe; plannedRecipe?: Recipe; onSave: (portion: number) => void; onSkipped: () => void; onDelete: () => void; onReplace: () => void; onClose: () => void }) { const initial = actual.portion ?? (recipe.nutrition.calories ? actual.calories / recipe.nutrition.calories : 1); const [portion, setPortion] = useState(Math.max(.1, Math.round(initial * 10) / 10)); const n = scaledNutrition(recipe, portion); return <div className="-mx-4 -mt-2"><SheetClose onClose={onClose} />{actual.review ? <button className="today-flow-action m-4" onClick={onKeep}>この記録を変更せずに残す</button> : null}<div className="p-4 space-y-6"><div className="space-y-4"><div className="pb-4 border-b border-slate-100"><div className="flex justify-between items-start mb-3"><div><h3 className="font-bold text-slate-800 text-base m-0">{recipe.name}</h3><div className="text-sm text-slate-500 mt-0.5"><strong className="tabular-nums font-medium text-slate-800">{formatNumber(n.calories)}</strong> kcal / P<strong className="tabular-nums font-medium text-slate-800">{formatNumber(n.protein)}</strong>g</div></div><button type="button" aria-label="この料理を削除" className="w-11 h-11 grid place-items-center text-slate-300 bg-transparent border-0 -mr-2" onClick={onDelete}><Trash size={20} /></button></div><div className="flex items-center justify-between"><div className="flex items-center bg-slate-50 rounded-lg border border-slate-200"><button type="button" aria-label="量を0.1減らす" className="w-11 h-11 grid place-items-center text-slate-600 bg-transparent border-0" onClick={() => setPortion(Math.max(.1, portion - .1))}><Minus size={18} /></button><span className="w-12 text-center font-bold text-slate-800 tabular-nums">{portion.toFixed(1)}</span><button type="button" aria-label="量を0.1増やす" className="w-11 h-11 grid place-items-center text-slate-600 bg-transparent border-0" onClick={() => setPortion(Math.min(5, portion + .1))}><Plus size={18} /></button></div><button type="button" className="min-h-11 text-primary text-sm font-medium px-2 flex items-center gap-1 bg-transparent border-0" onClick={onReplace}><ArrowsLeftRight size={16} />候補から差し替え</button></div></div><button type="button" className="min-h-11 text-slate-500 text-sm font-medium px-4 rounded-lg flex items-center gap-2 w-full justify-center border border-dashed border-slate-300 bg-white" onClick={onReplace}><Plus size={18} />料理を追加</button></div>{plan && plannedRecipe ? <div className="bg-background rounded-lg p-3 text-sm flex flex-col gap-1"><div className="text-slate-600 text-[11px] font-medium">元の予定</div><div className="flex justify-between items-center text-slate-800"><span>{plannedRecipe.name}</span><span>{formatNumber(scaledNutrition(plannedRecipe, plan.portion).calories)} kcal / P{formatNumber(scaledNutrition(plannedRecipe, plan.portion).protein)}g</span></div></div> : null}</div><div className="p-4 border-t border-slate-100 bg-white space-y-4"><div className="flex justify-between items-end px-2"><span className="text-slate-500 text-sm font-medium">合計</span><strong className="text-slate-800 font-bold text-lg tabular-nums">{formatNumber(n.calories)} <small className="text-sm text-slate-500 font-normal">kcal</small> / P{formatNumber(n.protein)}<small className="text-sm text-slate-500 font-normal">g</small></strong></div><button type="button" className="w-full bg-primary text-white font-bold py-3.5 rounded-xl border-0 text-base shadow-sm" onClick={() => onSave(portion)}>変更を保存</button><button type="button" className="w-full min-h-11 text-slate-500 text-sm font-medium bg-transparent border-0" onClick={onSkipped}>食べなかったに変更</button></div></div>; }

function StateSpecimen({ onRetry }: { onRetry: () => void }) { return <main className="p-4 flex flex-col gap-6"><div className="mb-4"><h2 className="text-xl font-bold text-charcoal m-0">状態コンポーネント</h2><p className="text-xs text-gray-500 mt-1">Specimen Sheet</p></div><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">1. EMPTY</div><div className="bg-surface rounded-lg p-4 flex items-center justify-between min-h-[64px]"><span className="text-charcoal font-medium">間食</span><button type="button" className="w-11 h-11 grid place-items-center text-gray-400 bg-transparent border-0 rounded-full"><Plus size={22} /></button></div></section><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">2. LOADING</div><div className="bg-surface rounded-lg p-4 flex flex-col gap-4"><div className="h-6 w-32 stitch-shimmer rounded" /><div className="flex items-end justify-between h-24 gap-2 border-b border-gray-100 pb-2">{[48,64,32,80,56,24,40].map((height) => <div className="w-full stitch-shimmer rounded-t" style={{ height }} key={height} />)}</div>{[48,40,32].map((width) => <div className="h-4 stitch-shimmer rounded" style={{ width: `${width * 4}px` }} key={width} />)}</div></section><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">3. OFFLINE</div><div className="bg-gray-100 px-4 py-2 flex items-center gap-2 rounded-lg"><CloudSlash size={18} className="text-gray-500" /><span className="text-xs text-gray-600">オフラインです。最後に同期した内容を表示しています</span></div></section><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">4. SYNCING</div><div className="bg-surface rounded-lg p-4 flex items-center justify-between"><span className="flex flex-col"><strong className="text-sm font-medium text-charcoal">味噌汁</strong><small className="text-xs text-gray-500">55 kcal / P4g</small></span><ArrowsClockwise size={18} className="text-gray-400 animate-spin" /></div></section><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">5. ERROR</div><div className="bg-surface rounded-lg p-4 flex flex-col gap-2"><span className="flex flex-col"><strong className="text-sm font-medium text-charcoal">ご飯</strong><small className="text-xs text-gray-500">210 kcal / P4g</small></span><div className="flex items-center gap-2 text-error bg-orange-50 p-2 rounded text-xs"><WarningCircle size={16} /><span className="flex-1">同期できませんでした</span><button type="button" className="font-medium text-error px-2 min-h-11 bg-transparent border-0" onClick={onRetry}>再試行</button></div></div></section><section><div className="text-xs font-bold text-gray-400 tracking-wider mb-2">TOAST</div><div className="flex justify-center"><div className="bg-charcoal text-white text-xs px-4 py-2 rounded-full shadow-sm">変更を保存しました</div></div></section></main>; }

function BodyHeader({ tab, selectedDate, onTab, onDate }: { tab: BodyTab; selectedDate: string; onTab: (tab: BodyTab) => void; onDate: (date: string) => void }) {
  return <><header data-design-component="primary-header" className="bg-transparent grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 w-full shrink-0 z-40"><span aria-hidden="true" /><h1 className="font-headline font-bold text-lg text-[#333333] tracking-tight text-center m-0">コンディション</h1><label aria-label="日付を選択" className="relative w-11 h-11 grid place-items-center text-[#333333] cursor-pointer"><CalendarDots size={24} /><input type="date" value={selectedDate} onChange={(event) => event.target.value && onDate(event.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /></label></header><TopTabNavigation component="body-tabs"><SegmentedControl value={tab} options={[["week", "今週"], ["labs", "健診"]]} label="コンディションの表示" onChange={onTab} /></TopTabNavigation></>;
}

const metricIcon = (key: HealthMetricKey) => key === "sleep" ? <Moon size={16} /> : key === "recovery" ? <BatteryCharging size={16} /> : key === "circulation" ? <Pulse size={16} /> : <PersonSimpleRun size={16} />;
const conditionMetricKeys = ["sleep", "recovery", "circulation", "activity"] as const satisfies readonly HealthMetricKey[];
const conditionMetricLabels: Record<HealthMetricKey, string> = { sleep: "睡眠", recovery: "回復", circulation: "循環", activity: "活動" };
const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}時間${String(minutes % 60).padStart(2, "0")}分`;
const formatSleepClock = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "—";
};

function SleepSummaryCard({ day, allDays, debt }: { day?: DailyHealthSummary; allDays: DailyHealthSummary[]; debt: number }) {
  if (!day?.sleepMinutes) return null;
  const sleepScore = day.scores.find((metric) => metric.key === "sleep")?.value;
  const stages = day.sleepStages;
  const stageItems = [
    { label: "深い", value: stages?.deepMinutes, color: "#333333" },
    { label: "REM", value: stages?.remMinutes, color: "#777777" },
    { label: "浅い", value: stages?.lightMinutes, color: "#BDBDBD" },
    { label: stages?.awakeEstimated ? "覚醒（推定）" : "覚醒", value: stages?.awakeMinutes, color: "#E5E5E5" },
  ].filter((item): item is { label: string; value: number; color: string } => typeof item.value === "number" && item.value >= 0);
  const stageTotal = stageItems.reduce((sum, item) => sum + item.value, 0);
  const stageGuides = [
    { label: "深い", min: 13, max: 23, denominator: day.sleepMinutes },
    { label: "REM", min: 20, max: 25, denominator: day.sleepMinutes },
    { label: "浅い", min: 50, max: 60, denominator: day.sleepMinutes },
    { label: stages?.awakeEstimated ? "覚醒（推定）" : "覚醒", min: 0, max: 10, denominator: stageTotal },
  ];
  const need = sleepNeedMinutes(allDays, day);
  const hours = Math.floor(day.sleepMinutes / 60);
  const minutes = day.sleepMinutes % 60;
  return <section data-design-component="sleep-card" data-surface="card" className="bg-white rounded-[18px] border border-solid border-[#EEEEEE] p-4">
    <div className="w-full flex justify-between items-center mb-4 border-0 border-b border-solid border-gray-100 pb-3 px-0"><h2 className="text-sm font-bold text-[#1C1C1E] m-0">昨夜の睡眠</h2><span className="bg-gray-100 text-[#1C1C1E] px-2 py-1 rounded text-xs font-medium">睡眠スコア {sleepScore ?? "—"}</span></div>
    <div className="flex items-end justify-between mb-6"><div><div className="font-number font-bold text-4xl text-primary tracking-tight tabular-nums">{hours}<span className="text-lg">時間</span>{minutes}<span className="text-lg">分</span></div><div className="text-xs text-[#FF9500] mt-1 flex items-center gap-1 font-medium"><WarningCircle size={14} />睡眠負債 {formatMinutes(debt)}</div><small className="block text-[10px] text-[#8E8E93] mt-1">基準 {formatMinutes(need)}</small></div><div className="text-right space-y-1"><div className="text-xs text-[#1C1C1E]">効率 <span className="font-number font-bold tabular-nums">{day.sleepEfficiency != null ? `${Math.round(day.sleepEfficiency)}%` : "—"}</span></div><div className="text-xs text-[#1C1C1E]">SpO₂ <span className="font-number font-bold tabular-nums">{day.spo2 != null ? `${Math.round(day.spo2)}%` : "—"}</span></div></div></div>
    <div className="flex justify-between text-xs text-[#8E8E93] mb-4 px-2"><span>{formatSleepClock(day.sleepStart)} 入眠</span><span>{formatSleepClock(day.sleepEnd)} 起床</span></div>{stageItems.length && stageTotal ? <div className="mb-2"><div className="flex h-6 w-full rounded overflow-hidden" aria-label="睡眠ステージの構成比">{stageItems.map((item) => { const share = item.value / stageTotal * 100; return <i key={item.label} className="flex h-full items-center justify-center overflow-hidden whitespace-nowrap font-number text-[9px] font-bold not-italic" style={{ backgroundColor: item.color, color: share > 10 && (item.color === "#333333" || item.color === "#777777") ? "#fff" : "#111", width: `${share}%` }}>{share >= 9 ? `${Math.round(share)}%` : ""}</i>; })}</div><div className="flex justify-between text-[10px] text-[#8E8E93] mt-1 px-1"><span>{formatSleepClock(day.sleepStart)}</span><span>{formatSleepClock(day.sleepEnd)}</span></div><div data-design-role="sleep-stage-guides" className="mt-3 border-t border-solid border-gray-100 pt-2"><small className="mb-1 block text-[10px] text-[#8E8E93]">一般的な目安（成人・個人差あり）</small>{stageItems.map((item) => { const guide = stageGuides.find((candidate) => candidate.label === item.label); const actualPercent = Math.round(item.value / stageTotal * 100); const guideMinutes = guide ? `${Math.round(guide.denominator * guide.min / 100)}〜${Math.round(guide.denominator * guide.max / 100)}分` : "—"; return <div key={item.label} className="flex min-h-[30px] items-center gap-2 text-[10px]"><span className="flex min-w-0 flex-1 items-center gap-1 text-[#8E8E93]"><i className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span><strong className="w-16 text-right font-medium text-[#1C1C1E] tabular-nums">{item.value}分・{actualPercent}%</strong><span className="w-24 text-right text-[#8E8E93] tabular-nums">目安 {guideMinutes}</span></div>; })}<p className="mb-0 mt-1 text-[9px] leading-4 text-[#8E8E93]">構成比は就床時間に対する割合です。目安時間は総睡眠時間を基準に算出し、個人差があります。覚醒はAyumuによる推定です。</p></div></div> : <div className="mt-4 mb-3 text-xs text-[#8E8E93]">睡眠ステージのデータが不足しています</div>}<div className="mt-4 pt-3 border-t border-gray-100"><p className="text-xs text-[#8E8E93] flex items-center gap-1 m-0"><Star size={14} />Ayumuが過去の睡眠から推定</p></div>
  </section>;
}

function BodyToday({ health, missing, selectedDate, onDate, onMetric }: { health: HealthState; missing: boolean; selectedDate: string; onDate: (date: string) => void; onMetric: (metric: DailyHealthSummary["scores"][number]) => void }) {
  const targetConditionScore = 80;
  const latest = health.daily.at(-1);
  const healthByDate = useMemo(() => new Map(health.daily.map((day) => [day.date, day])), [health.daily]);
  const [displayedWeekStart, setDisplayedWeekStart] = useState(() => weekStartFor(selectedDate));
  const displayedWeekEnd = addDays(displayedWeekStart, 6);
  useEffect(() => {
    if (selectedDate < displayedWeekStart || selectedDate > displayedWeekEnd) setDisplayedWeekStart(weekStartFor(selectedDate));
  }, [displayedWeekEnd, displayedWeekStart, selectedDate]);
  const selected = healthByDate.get(selectedDate) ?? latest;
  const timelineEnd = [latest?.date ?? today(), addDays(weekStartFor(today()), 6), displayedWeekEnd].sort().at(-1)!;
  const timelineStart = [addDays(today(), -34), displayedWeekStart].sort()[0];
  const timelineDays = Array.from({ length: daysInclusive(timelineStart, timelineEnd) }, (_, index) => {
    const date = addDays(timelineStart, index);
    return { date, summary: healthByDate.get(date) };
  });
  const movingAverages = timelineDays.map((_, index) => {
    const values = timelineDays.slice(Math.max(0, index - 2), index + 1).flatMap((item) => item.summary?.bodyScore == null ? [] : [item.summary.bodyScore]);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  });
  const movingAverageSegments = contiguousValueSegments(movingAverages.map((value, index) => ({ value, index }))).map((segment) => segment.map(({ value, index }) => `${22 + index * 44},${80 - Math.max(32, (value ?? 0) / 100 * 80)}`).join(" "));
  if (missing || !latest?.bodyScore || !selected) return <main className="px-4 pt-4 pb-8"><section data-surface="card" className="bg-white rounded-[18px] border border-solid border-[#EEEEEE] p-5 shadow-none min-h-[172px] flex flex-col justify-center items-center text-center"><Heartbeat size={28} className="text-text-muted mb-3" /><h2 className="text-[16px] m-0 text-textMain">今日のコンディション</h2><p className="text-[13px] text-text-muted mt-2 mb-0">データが不足しています</p></section></main>;
  const selectedIsLatest = selected.date === latest.date;
  const completedSleep = completedSleepSummaries(health.daily).filter((day) => day.date <= selected.date).at(-1);
  const debt = sleepDebtMinutes(health.daily.filter((day) => day.date <= selected.date));
  const missingLabels = [["血中酸素", selected.spo2], ["睡眠効率", selected.sleepEfficiency]].flatMap(([label, value]) => value == null ? [label] : []);
  const availableMetricCount = selected.scores.filter((metric) => metric.value != null).length;
  const partialMetrics = availableMetricCount > 0 && availableMetricCount < 4;
  const lowestMetric = selected.scores.filter((metric) => metric.value != null).sort((a, b) => (a.value ?? 100) - (b.value ?? 100))[0];
  return <main data-design-component="today-main" className="p-4 pb-8 space-y-5">
    <WeeklyCard component="today-hero">
      <div className="mb-3"><WeekRangeLabel startDate={displayedWeekStart} endDate={displayedWeekEnd} /></div>
      <div className="flex justify-between items-start gap-3 mb-4"><div><h2 className="text-sm font-bold text-[#1C1C1E] m-0">{selectedIsLatest ? "今日のコンディション" : `${formatShortDate(selected.date)} ${formatWeekday(selected.date)}曜日のコンディション`}</h2>{partialMetrics ? <strong className="block mt-1 text-[11px] text-textSub">一部データ不足</strong> : null}</div><span className="text-xs font-medium text-[#FF9500] bg-[rgba(255,149,0,.1)] px-2 py-1 rounded-full flex items-center gap-1"><WarningCircle size={14} />{selected.status}</span></div>
      <div className="flex items-baseline gap-1 mb-3"><strong data-design-component="today-hero-score" className="font-number font-bold text-5xl leading-none tracking-[-1.2px] text-[#1C1C1E] tabular-nums">{selected.bodyScore}</strong><span className="text-sm text-[#8E8E93]">/ 100</span></div>
      <p className="text-sm text-[#1C1C1E] leading-relaxed mt-0 mb-6">{lowestMetric ? `${lowestMetric.label}が4つの指標の中では低めです。前後の日とあわせて傾向を確認できます。` : "この日の記録を4つの指標とあわせて確認できます。"}</p>
      <SevenDayBarChart component="today-week-chart" items={timelineDays.map(({ date, summary }) => ({ date, disabled: !summary?.bodyScore, ariaLabel: `${formatShortDate(date)} ${formatWeekday(date)}曜日 コンディション ${summary?.bodyScore ?? "データなし"}`, renderBar: (active: boolean) => <i data-design-role="weekly-bar" data-domain-bar="true" data-selected={active ? "true" : "false"} className="relative block w-8 rounded-t-[3px] not-italic" style={{ height: summary?.bodyScore == null ? 2 : `${Math.max(32, summary.bodyScore / 100 * 80)}px` }} /> }))} selectedDate={selectedDate} ariaLabel="コンディションの連続日別グラフ。横にスクロールして日付を選択" onSelect={(date) => { if (healthByDate.has(date)) onDate(date); }} underlay={<div data-design-role="condition-target-line" className="chart-target-line absolute left-0 z-0 w-full" style={{ bottom: 26 + targetConditionScore / 100 * 80 }} />} overlay={<svg viewBox={`0 0 ${timelineDays.length * 44} 80`} preserveAspectRatio="none" className="h-full w-full">{movingAverageSegments.map((points, index) => <polyline data-design-role="condition-moving-average" key={index} points={points} fill="none" stroke="var(--ayumu-chart-line)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />)}</svg>} />
      <div data-design-role="condition-chart-legend" className="-mt-1 flex justify-center gap-4 text-[10px] text-textSub"><span className="flex items-center gap-1.5"><i className="chart-target-key h-0.5 w-3" />目標コンディション {targetConditionScore}</span><span className="flex items-center gap-1.5"><i className="condition-trend-key h-0.5 w-3" />3日平均</span></div>
    </WeeklyCard>
    <section data-design-component="today-metrics" data-surface="card" className="bg-white rounded-[18px] border border-solid border-[#EEEEEE] overflow-hidden"><div className="grid grid-cols-2">{selected.scores.map((metric, index) => { const isLow = metric.value != null && metric.value < 45; const status = metric.value == null ? "データなし" : metric.value >= 65 ? "良い" : metric.value >= 45 ? "安定" : metric.key === "sleep" ? "短い" : "低め"; const concreteValue = metric.key === "sleep" && selected.sleepMinutes != null ? formatMinutes(selected.sleepMinutes) : metric.key === "recovery" && selected.hrv != null ? `HRV ${Math.round(selected.hrv)} ms` : metric.key === "activity" && selected.steps != null ? `${formatNumber(selected.steps)}歩` : metric.key === "circulation" && selected.restingHeartRate != null ? `安静時心拍 ${Math.round(selected.restingHeartRate)} bpm` : metric.detail; return <button data-design-component="today-metric-cell" type="button" key={metric.key} aria-label={`${metric.label} ${metric.value ?? "データなし"}`} onClick={() => onMetric(metric)} className={`p-4 min-h-[85px] flex flex-col items-start text-left bg-transparent border-0 ${index % 2 === 0 ? "border-r border-gray-100" : ""} ${index < 2 ? "border-b border-gray-100" : ""}`}><span className="w-full flex items-center justify-between mb-1"><span className="text-xs text-[#8E8E93]">{metric.label}</span><span className={`text-[10px] leading-[15px] ${isLow ? "text-[#FF9500]" : metric.value != null && metric.value >= 65 ? "text-primary" : "text-[#8E8E93]"}`}>{status}</span></span><strong className="font-number font-bold text-2xl leading-8 tabular-nums text-[#1C1C1E]">{metric.value ?? "—"}</strong><small className="text-[10px] leading-4 text-[#8E8E93] truncate max-w-full">{concreteValue || "データなし"}</small></button>; })}</div></section>
    <SleepSummaryCard day={completedSleep} allDays={health.daily} debt={debt} />
    {missingLabels.length ? <div className="flex justify-center"><span className="text-[11px] text-text-muted bg-white rounded-full px-3 py-1.5 shadow-sm">不足データ: {missingLabels.join("・")}</span></div> : null}
  </main>;
}

function BodyLabs({ health }: { health: HealthState }) {
  const checks = health.healthChecks.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const [selectedId,setSelectedId]=useState('');
  const check=checks.find(c=>c.id===selectedId) ?? checks[0];
  const categoryLabels = { basic: "基本項目", metabolic: "代謝・脂質", liver: "肝機能", other: "その他" };
  return <main data-design-component="body-labs" className="px-4 pt-4 pb-8 space-y-5">
    {checks.length>0 ? <Carousel ariaLabel="健診の受診日" contentClassName="flex gap-2" showScrollbar={false}>{checks.map(c=><button key={c.id} className={`min-h-11 shrink-0 rounded-[12px] px-3 border-0 text-[12px] font-bold ${check?.id===c.id?"bg-primary text-white":"bg-white text-text-sub"}`} aria-pressed={check?.id===c.id} onClick={()=>setSelectedId(c.id)}>{c.date}{checks.filter(x=>x.date===c.date).length>1 ? ` ${c.facility??''}` : ''}</button>)}</Carousel> : null}
    <WeeklyCard component="health-check-summary"><h2 className="text-[13px] text-text-sub m-0">{check ? `${check.date} 健康診断` : '健康診断'}</h2><strong className="text-[18px] text-text-main">{check ? '結果を保存済み' : 'データなし'}</strong>
      {check?.facility ? <p className="text-[12px] text-text-sub">{check.facility}</p> : null}
      {check?.overallGrade ? <p className="text-[13px] text-text-main">施設の総合判定：{check.overallGrade}</p> : null}
      {check?.categoryGrades ? Object.entries(check.categoryGrades).map(([category,grade])=><p className="text-[12px] text-text-sub" key={category}>{category}：{grade}</p>) : null}
      {check?.findings?.map((finding,index)=><p className="text-[12px] text-text-main" key={index}>{finding}</p>)}
      {check ? <p className="text-[12px] text-text-sub">施設の結果を表示しています。比較可能な過去の結果がある項目だけ、前回値を表示します。</p> : null}
    </WeeklyCard>
    {check ? (['basic','metabolic','liver','other'] as const).map(category=>{
      const values=check.values.filter(v=>v.category===category); if(!values.length)return null;
      return <WeeklyCard key={category} component={`health-check-${category}`}><h2 className="text-[12px] text-text-sub m-0 mb-2">{categoryLabels[category]}</h2>{values.map(value=>{
        const previous=previousLab(check,value,checks);
        return <div key={value.id} className="flex items-center justify-between gap-3 min-h-[62px] border-0 border-t border-solid border-[#E8E8E8]"><span><strong className="block text-[13px] text-text-main">{value.label}</strong><small className="text-[10px] text-text-sub">基準 {value.referenceLabel}</small></span><span className="text-right"><strong className={`text-[16px] ${value.attention?'text-[#E56A00]':'text-text-main'}`}>{value.value} <small className="text-[10px]">{value.unit??(typeof value.value==='number'&&value.id!=='bmi'?'単位未記載':'')}</small></strong>{value.flag ? <small className="block text-[10px]">{{high:'原本：高値',low:'原本：低値',abnormal:'原本：異常',normal:'原本：正常',unknown:'判定未記載'}[value.flag]}</small> : null}{previous ? <small className="block text-[10px] text-text-sub">前回 {previous.date}：{previous.value}</small> : null}</span></div>;
      })}</WeeklyCard>;
    }) : null}
    <WeeklyCard component="health-reports"><h2 className="text-[13px] text-text-main m-0">分析履歴</h2>{health.reports.length ? health.reports.slice().sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)).map(report=><article key={report.id} className="py-3 border-0 border-t border-solid border-[#E8E8E8]"><strong className="text-[13px] text-text-main">{report.title}</strong><small className="block text-[10px] text-text-sub">{report.source==='source-document'?'原本の転記 · ':''}{report.periodStart}〜{report.periodEnd}</small><p className="text-[12px] text-text-main">{report.summary}</p>{report.observations.length ? <details><summary className="text-[12px] text-text-sub min-h-11">詳細を読む</summary>{report.observations.map((observation,index)=><p className="text-[12px] text-text-main" key={index}>{observation}</p>)}</details> : null}</article>) : <p className="text-[12px] text-text-sub">分析履歴はまだありません</p>}</WeeklyCard>
  </main>;
}


const bodyMetricKeys: HealthMetricKey[] = ["sleep", "recovery", "activity", "circulation"];
const bodyMetricLabels: Record<HealthMetricKey, string> = { sleep: "睡眠", recovery: "回復", activity: "活動", circulation: "循環" };
const bodyMetricColors: Record<HealthMetricKey, string> = { sleep: "#7C83FD", recovery: "#34C759", activity: "#32ADE6", circulation: "#FF7A45" };

function BodyContributionHeatmap({ health, selectedDate }: { health: HealthState; selectedDate: string }) {
  const days = health.daily.slice(-14);
  if (days.length < 14) return null;
  const baselines = Object.fromEntries(bodyMetricKeys.map((key) => {
    const values = health.daily.slice(-28).flatMap((day) => {
      const value = day.scores.find((metric) => metric.key === key)?.value;
      return value == null ? [] : [value];
    });
    return [key, values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)];
  })) as Record<HealthMetricKey, number>;
  const columns = { gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))` };
  return <section data-design-component="body-contribution-heatmap" className="min-w-0 overflow-hidden rounded-[18px] border border-solid border-[#E8E8E8] bg-white p-5 shadow-none">
    <h2 className="m-0 text-[15px] font-semibold text-textMain">変化の内訳</h2>
    <p className="mb-4 mt-1 text-[11px] leading-5 text-textSub">過去14日を、いつもの状態との差で表示</p>
    <div className="grid min-w-0 gap-x-1" style={columns}><span />{days.map((day, index) => <small key={day.date} className="min-w-0 text-center text-[8px] leading-3 text-text-muted">{index % 2 === 0 || index === days.length - 1 ? <>{day.date.slice(8)}<br />{formatWeekday(day.date)}</> : null}</small>)}</div>
    <div className="mt-2 grid min-w-0 gap-x-1 gap-y-1.5" style={columns}>{bodyMetricKeys.map((key) => <div key={key} className="contents"><span className="self-center text-[10px] text-textSub">{bodyMetricLabels[key]}</span>{days.map((day) => { const value = day.scores.find((metric) => metric.key === key)?.value; const delta = value == null ? null : value - baselines[key]; const mix = delta == null ? 0 : Math.min(88, 24 + Math.abs(delta) * 4); const tone = delta == null ? "transparent" : `color-mix(in srgb, ${bodyMetricColors[key]} ${mix}%, var(--ayumu-heatmap-base))`; return <span key={`${key}-${day.date}`} role="img" aria-label={`${formatShortDate(day.date)} ${bodyMetricLabels[key]} ${value ?? "データなし"}`} className={`aspect-square min-w-0 rounded-[3px] border border-solid ${delta == null ? "border-[#8E8E93] border-dashed" : day.date === selectedDate ? "border-current" : "border-transparent"}`} style={{ backgroundColor: tone, color: bodyMetricColors[key] }} />; })}</div>)}</div>
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-text-muted">{bodyMetricKeys.map((key) => <span key={key} className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: bodyMetricColors[key] }} />{bodyMetricLabels[key]}</span>)}</div>
  </section>;
}

function BodyEightWeekTrend({ health }: { health: HealthState }) {
  const latestDate = health.daily.at(-1)?.date ?? today();
  const startDate = addDays(latestDate, -55);
  const metricSeries = Object.fromEntries(bodyMetricKeys.map((key) => [key, aggregateTimeSeries(health.daily.map((day) => ({ date: day.date, value: day.scores.find((metric) => metric.key === key)?.value })), startDate, latestDate, "weekly")])) as Record<HealthMetricKey, ReturnType<typeof aggregateTimeSeries>>;
  const values = metricSeries.sleep.map((week, index) => ({ label: formatShortDate(week.startDate), metrics: Object.fromEntries(bodyMetricKeys.map((key) => [key, metricSeries[key][index]?.value ?? null])) as Record<HealthMetricKey, number | null> }));
  const x = (index: number) => 12 + index / Math.max(1, values.length - 1) * 296;
  const y = (value: number) => 12 + (100 - value) / 100 * 88;
  return <section data-design-component="body-eight-week-trend" className="rounded-[18px] border border-solid border-[#E8E8E8] bg-white p-5 shadow-none"><div className="mb-3"><h2 className="m-0 text-[15px] font-semibold text-textMain">8週間の推移</h2></div><div className="mb-3 grid grid-cols-4 gap-2 text-[10px] text-textSub" aria-label="表示中の4指標">{bodyMetricKeys.map((key) => <span key={key} className="flex items-center gap-1"><i className="h-[3px] w-3 rounded-full" style={{ backgroundColor: bodyMetricColors[key] }} />{bodyMetricLabels[key]}</span>)}</div><div className="relative h-40"><svg viewBox="0 0 320 112" preserveAspectRatio="none" className="absolute inset-0 h-32 w-full" role="img" aria-label="過去8週間の睡眠、回復、活動、循環の推移"><line x1="8" x2="312" y1="100" y2="100" stroke="var(--ayumu-chart-grid)" strokeWidth="1" />{bodyMetricKeys.map((key) => { const segments = contiguousValueSegments(values.map((item, index) => ({ value: item.metrics[key] ?? undefined, index }))); return <g key={key}>{segments.map((segment, segmentIndex) => <polyline key={`${key}-segment-${segmentIndex}`} points={segment.map((item) => `${x(item.index)},${y(item.value!)}`).join(" ")} fill="none" stroke={bodyMetricColors[key]} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />)}{values.map((item, index) => item.metrics[key] == null ? null : <circle key={`${key}-${item.label}`} cx={x(index)} cy={y(item.metrics[key]!)} r="2.5" fill="var(--ayumu-chart-point)" stroke={bodyMetricColors[key]} strokeWidth="1.75" />)}</g>; })}</svg><div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-text-muted">{values.map((item, index) => <span key={`${item.label}-${index}`}>{index % 2 === 0 || index === values.length - 1 ? item.label : ""}</span>)}</div></div></section>;
}

function BodyWeek({ health, missing, selectedDate, onDate, onMetric }: { health: HealthState; missing: boolean; selectedDate: string; onDate: (date: string) => void; onMetric: (metric: DailyHealthSummary["scores"][number]) => void }) {
  if (missing || !health.daily.at(-1)?.bodyScore) return <div data-design-component="body-week"><BodyToday health={health} missing selectedDate={selectedDate} onDate={onDate} onMetric={onMetric} /></div>;
  return <div data-design-component="body-week"><BodyToday health={health} missing={false} selectedDate={selectedDate} onDate={onDate} onMetric={onMetric} /><div className="px-4 pb-8 -mt-3 space-y-5"><BodyContributionHeatmap health={health} selectedDate={selectedDate} /><BodyEightWeekTrend health={health} /></div></div>;
}

function MetricDetailScreen({ metric, health, initialState, onClose }: { metric: DailyHealthSummary["scores"][number]; health: HealthState; initialState: MetricDetailViewState; onClose: (state: MetricDetailViewState) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const latestDate = health.daily.at(-1)?.date ?? today();
  const [range, setRange] = useState<TimeSeriesRange>(initialState.range);
  const [periodOffset, setPeriodOffset] = useState(initialState.periodOffset);
  const [selectedDate, setSelectedDate] = useState(initialState.selectedDate);
  const rollingBounds = periodBounds(latestDate, range, periodOffset);
  const selectedWeekStart = weekStartFor(selectedDate);
  const selectedWeekEnd = addDays(selectedWeekStart, 6);
  const bounds = range === "7" ? { startDate: selectedWeekStart, endDate: selectedWeekEnd } : rollingBounds;
  const firstSeriesDate = health.daily[0]?.date ?? bounds.startDate;
  const seriesStartDate = range === "7" && selectedWeekStart < firstSeriesDate ? selectedWeekStart : firstSeriesDate;
  const seriesEndDate = range === "7" && selectedWeekEnd > latestDate ? selectedWeekEnd : latestDate;
  const scrollSeries = aggregateTimeSeries(
    health.daily.map((day) => ({ date: day.date, value: day.scores.find((item) => item.key === metric.key)?.value })),
    seriesStartDate,
    seriesEndDate,
    rangeResolution(range),
  );
  const values = scrollSeries.flatMap((item, index) => item.value == null ? [] : [{ ...item, index, value: item.value }]);
  const selectedDay = health.daily.find((day) => day.date === selectedDate);
  const selectedScore = selectedDay?.scores.find((item) => item.key === metric.key)?.value;
  const detailRows = metric.key === "sleep" ? [
    ["睡眠時間", selectedDay?.sleepMinutes != null ? formatMinutes(selectedDay.sleepMinutes) : "データなし"],
    ["睡眠効率", selectedDay?.sleepEfficiency != null ? `${Math.round(selectedDay.sleepEfficiency)}%` : "データなし"],
    ["睡眠負債", selectedDay ? formatMinutes(sleepDebtMinutes(health.daily.filter((day) => day.date <= selectedDay.date))) : "データなし"],
  ] : metric.key === "recovery" ? [
    ["HRV", selectedDay?.hrv != null ? `${Math.round(selectedDay.hrv)} ms` : "データなし"],
    ["安静時心拍", selectedDay?.restingHeartRate != null ? `${Math.round(selectedDay.restingHeartRate)} bpm` : "データなし"],
    ["皮膚温の差", selectedDay?.temperatureDeviation != null ? `${selectedDay.temperatureDeviation > 0 ? "+" : ""}${selectedDay.temperatureDeviation.toFixed(1)} ℃` : "データなし"],
  ] : metric.key === "activity" ? [
    ["歩数", selectedDay?.steps != null ? `${formatNumber(selectedDay.steps)}歩` : "データなし"],
    ["VO₂ max", selectedDay?.vo2Max != null ? `${selectedDay.vo2Max.toFixed(0)}` : "データなし"],
    ["記録した運動", `${health.exercises.filter((item) => item.date === selectedDate).length}件`],
  ] : [
    ["安静時心拍", selectedDay?.restingHeartRate != null ? `${Math.round(selectedDay.restingHeartRate)} bpm` : "データなし"],
    ["HRV", selectedDay?.hrv != null ? `${Math.round(selectedDay.hrv)} ms` : "データなし"],
    ["SpO₂", selectedDay?.spo2 != null ? `${Math.round(selectedDay.spo2)}%` : "データなし"],
  ];
  const metricExplanation: Record<HealthMetricKey, string> = {
    sleep: "睡眠時間・効率・睡眠ステージを、あなたの直近の睡眠基準と比べて見ます。睡眠負債はAyumuによる推定で、診断ではありません。",
    recovery: "HRV、安静時心拍、皮膚温など、休養後の戻り方に関係する取得値の傾向をまとめます。",
    activity: "歩数と記録した運動を中心に、普段の活動量との違いを確認します。食事の摂取目標は増やしません。",
    circulation: "安静時心拍とHRVなどの傾向をまとめた生活管理用の指標です。脈拍年齢や動脈硬化の判定ではありません。",
  };
  const selectedAggregate = values.find((item) => item.startDate <= selectedDate && item.endDate >= selectedDate) ?? values.at(-1);
  const detailContentWidth = Math.max(308, scrollSeries.length * 44);
  const x = (index: number) => 22 + index * 44;
  const y = (value: number) => 16 + (100 - value) / 100 * 84;
  const segments = contiguousValueSegments(scrollSeries).map((segment) => segment.map((item) => `${x(scrollSeries.indexOf(item))},${y(item.value!)}`).join(" "));
  const rangeLabel = `${formatShortDate(bounds.startDate)} 〜 ${formatShortDate(bounds.endDate)}`;
  const close = () => onClose({ metricKey: metric.key, range, periodOffset, selectedDate, scrollTop: rootRef.current?.querySelector<HTMLElement>(".mobile-scroll")?.scrollTop ?? 0 });
  const selectNearestRecordedDate = (startDate: string, endDate: string) => {
    const next = health.daily.filter((day) => day.date >= startDate && day.date <= endDate && day.scores.some((item) => item.key === metric.key && item.value != null)).at(-1);
    if (next) setSelectedDate(next.date);
  };
  const changeRange = (nextRange: TimeSeriesRange) => {
    setRange(nextRange);
    setPeriodOffset(periodOffsetForDate(latestDate, selectedDate, nextRange));
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroll = rootRef.current?.querySelector<HTMLElement>(".mobile-scroll");
      if (scroll) scroll.scrollTop = initialState.scrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialState.scrollTop]);
  return <div ref={rootRef} className="metric-detail-screen absolute inset-0 z-[80] bg-background flex flex-col" role="dialog" aria-modal="true" aria-label={`${metric.label}の詳細`}>
    <header className="grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 bg-white border-b border-solid border-gray-100 shrink-0"><button type="button" aria-label="コンディションへ戻る" onClick={close} className="w-11 h-11 grid place-items-center bg-transparent border-0 text-textMain"><ArrowLeft size={24} /></button><h1 className="text-[18px] font-bold text-textMain text-center m-0">{metric.label}</h1><span aria-hidden="true" /></header>
    <MobileScroll className="top-14 bottom-0"><main className="p-4 pb-10 space-y-5">
      <div><SegmentedControl value={range} options={timeSeriesRanges.map((item) => [item.value, item.label])} label="集計期間" onChange={changeRange} /><strong className="mt-2 block text-right text-[12px] text-textSub tabular-nums" aria-live="polite">{rangeLabel}</strong></div>
      <section data-surface="card" className="bg-white rounded-[18px] p-4 shadow-none border border-solid border-[#EEEEEE]"><div className="flex items-center justify-between mb-5"><span className="flex items-center gap-2 text-primary"><span className="w-9 h-9 rounded-[12px] bg-primary-light grid place-items-center">{metricIcon(metric.key)}</span><span><small className="block text-[10px] text-textSub">選択日</small><strong className="text-[13px] text-textMain">{selectedDay ? `${formatShortDate(selectedDay.date)} ${formatWeekday(selectedDay.date)}曜日` : "—"}</strong></span></span><span className="text-right"><strong className="text-[36px] leading-none tabular-nums text-textMain">{selectedScore ?? selectedAggregate?.value.toFixed(0) ?? "—"}</strong><small className="text-xs text-textSub ml-1">/100</small></span></div><div className="mb-3 text-center"><small className="text-[11px] text-textSub">{rangeResolution(range) === "daily" ? "日別" : rangeResolution(range) === "weekly" ? "週平均" : "月平均"}・横にスクロール</small></div><TimeSeriesScroller ariaLabel={`${metric.label}の連続推移。横にスクロールして日付を選択`} selectedKey={selectedAggregate?.key ?? selectedDate} viewportStartKey={range === "7" ? selectedWeekStart : undefined} className="time-series-scroller metric-detail-chart"><div data-design-component="metric-detail-time-series" data-chart-anatomy="continuous-time-series" data-period-navigation="continuous-scroll" className="relative h-44" style={{ width: detailContentWidth }}><svg role="img" aria-label={`${metric.label}の${timeSeriesRanges.find((item) => item.value === range)?.label}推移`} viewBox={`0 0 ${detailContentWidth} 120`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-36 w-full">{segments.map((points, index) => <polyline data-design-role="metric-detail-line" key={`${metric.key}-${index}`} points={points} fill="none" stroke="var(--ayumu-chart-line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}{values.map((item) => <circle key={item.key} cx={x(item.index)} cy={y(item.value)} r={item.key === selectedAggregate?.key ? 4.5 : 2.5} fill="var(--ayumu-chart-point)" stroke="var(--ayumu-chart-line)" strokeWidth="2" />)}</svg>{scrollSeries.map((item, index) => <button type="button" key={item.key} data-scroll-key={item.startDate} data-scroll-selected={item.key === selectedAggregate?.key ? "true" : undefined} aria-label={`${formatShortDate(item.startDate)} ${item.value == null ? "データなし" : `${Math.round(item.value)}点`}`} disabled={item.value == null} onClick={() => { selectNearestRecordedDate(item.startDate, item.endDate); setPeriodOffset(periodOffsetForDate(latestDate, item.endDate, range)); }} className="absolute top-0 h-36 w-11 border-0 bg-transparent disabled:pointer-events-none" style={{ left: index * 44 }} />)}<div className="absolute inset-x-0 bottom-0 flex">{scrollSeries.map((item) => <span key={`label-${item.key}`} className="w-11 min-w-[44px] text-center text-[9px] leading-3 text-textSub">{rangeResolution(range) === "monthly" ? `${Number(item.startDate.slice(5, 7))}月` : <>{formatShortDate(item.startDate)}<br />{formatWeekday(item.startDate)}</>}</span>)}</div></div></TimeSeriesScroller></section>
      <section data-surface="card" className="bg-white rounded-[18px] border border-solid border-[#EEEEEE] overflow-hidden shadow-none"><h2 className="text-sm font-bold text-textMain p-4 m-0">選択日の内訳</h2><div className="metric-detail-breakdown">{detailRows.map(([label, value]) => <div key={label} className="min-h-12 px-4 flex items-center justify-between"><span className="text-[12px] text-textSub">{label}</span><strong className="text-[13px] text-textMain tabular-nums">{value}</strong></div>)}</div></section>
      <section data-surface="card" className="bg-white rounded-[18px] p-4 border border-solid border-[#EEEEEE] shadow-none"><h2 className="text-sm font-bold text-textMain mt-0 mb-2">どう見るか</h2><p className="text-[13px] text-textSub leading-6 m-0">{metricExplanation[metric.key]}</p><p className="text-[11px] text-text-muted mt-3 mb-0">{metric.source === "derived" ? "公開デモの架空データ" : "公開デモの架空データ"}</p></section>
    </main></MobileScroll>
  </div>;
}

function MoveHeader({ tab, selectedDate, onTab, onDate }: { tab: MoveTab; selectedDate: string; onTab: (tab: MoveTab) => void; onDate: (date: string) => void }) {
  return <><header data-design-component="primary-header" className="grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 w-full bg-transparent shrink-0 z-10"><span aria-hidden="true" /><h1 className="text-[18px] font-bold text-[#333333] tracking-tight text-center m-0">運動</h1><label aria-label="日付を選択" className="relative w-11 h-11 grid place-items-center text-[#333333] cursor-pointer"><CalendarDots size={24} /><input type="date" value={selectedDate} max={today()} onChange={(event) => event.target.value && onDate(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label></header><TopTabNavigation component="move-tabs"><SegmentedControl value={tab} options={[["week", "今週"], ["menu", "メニュー"], ["history", "履歴"]]} label="運動の表示" onChange={onTab} /></TopTabNavigation></>;
}

const patternIcon = (category: MovePattern["category"]) => category === "walking" ? <PersonSimpleRun size={18} /> : category === "rest" ? <Moon size={18} /> : category === "strength" ? <Heartbeat size={18} /> : <PersonSimpleRun size={18} />;
const patternById = (state: MoveState, id: string) => state.patterns.find((pattern) => pattern.id === id);

function MoveRecordRow({ move, record }: { move: MoveState; record: MoveRecord }) {
  const status = record.outcome === "complete" ? "完了" : record.outcome === "partial" ? "一部" : "スキップ";
  const source = record.source === "merged" ? "統合" : record.source === "ultrahuman" ? "検出" : record.source === "automatic-rest" ? "自動" : "手入力";
  return <div className="flex min-h-[68px] items-start gap-3 border-0 border-b border-solid border-[#EEEEEE] bg-white px-4 py-4 last:border-b-0"><span className="w-8 shrink-0 pt-0.5 text-xs font-medium text-text-muted">{record.startedAt?.slice(11, 16) || "運動"}</span><span className="flex flex-1 flex-col gap-1"><strong className="text-sm font-medium text-textMain">{patternById(move, record.patternId || "")?.name || record.type}</strong><small className="flex items-center gap-1.5 text-[11px] text-text-muted"><CheckCircle size={14} weight={record.outcome === "complete" ? "fill" : "regular"} className={record.outcome === "complete" ? "text-primary" : "text-text-muted"} />{record.durationMinutes}分・{status}・{source}</small></span></div>;
}

function MoveWeekChart({ move, selectedDate, onDate }: { move: MoveState; selectedDate: string; onDate: (date: string) => void }) {
  const weekStart = weekStartFor(selectedDate);
  const bounds = { startDate: weekStart, endDate: addDays(weekStart, 6) };
  const includedRecords = move.records.filter((record) => record.date >= bounds.startDate && record.date <= bounds.endDate && record.outcome !== "skipped");
  const dailyDates = [...new Set(move.records.map((record) => record.date))];
  const dailyMinutes = dailyDates.map((date) => ({ date, value: activityMinutes(move.records.filter((record) => record.date === date)) }));
  const dailyLoad = dailyDates.map((date) => ({ date, value: move.records.filter((record) => record.date === date && record.outcome !== "skipped").reduce((sum, record) => sum + (record.activeCalories ?? record.durationMinutes * (record.intensity === "hard" ? 1.4 : record.intensity === "light" ? .65 : 1)), 0) }));
  const timelineBounds = {
    startDate: [addDays(today(), -34), bounds.startDate].sort()[0],
    endDate: [addDays(weekStartFor(today()), 6), bounds.endDate].sort().at(-1)!,
  };
  const timelineMinutes = aggregateTimeSeries(dailyMinutes, timelineBounds.startDate, timelineBounds.endDate, "daily");
  const timelineLoad = aggregateTimeSeries(dailyLoad, timelineBounds.startDate, timelineBounds.endDate, "daily");
  const timelineValues = timelineMinutes.map((item, index) => ({ ...item, minutes: item.value, load: timelineLoad[index]?.value }));
  const selectedRecords = move.records.filter((record) => record.date === selectedDate && record.outcome !== "skipped");
  const maxMinutes = Math.max(60, ...timelineValues.map((item) => item.minutes ?? 0));
  const maxLoad = Math.max(100, ...timelineValues.map((item) => item.load ?? 0));
  const weeklyLoadSegments = contiguousValueSegments(timelineValues.map((item, index) => ({ value: item.load, index }))).map((segment) => segment.map((item) => `${22 + item.index * 44},${80 - item.value! / maxLoad * 60}`).join(" "));
  const weeklyTarget = move.patterns.filter((pattern) => pattern.enabled).reduce((sum, pattern) => sum + (pattern.weeklyMinutes ?? (pattern.weeklyCount ?? 0) * pattern.defaultDurationMinutes), 0);
  const targetMinutes = Math.round(weeklyTarget);
  const doneMinutes = activityMinutes(includedRecords);
  const targetProgress = targetMinutes ? Math.round(doneMinutes / targetMinutes * 100) : 0;
  const remainingMinutes = Math.max(0, targetMinutes - doneMinutes);
  const graphLabel = "活動時間と運動負荷の連続日別グラフ。横にスクロールして日付を選択";
  const weeklyGraph = <SevenDayBarChart component="move-seven-day-chart" items={timelineValues.map((item) => ({ date: item.endDate, ariaLabel: `${formatShortDate(item.endDate)} ${formatWeekday(item.endDate)}曜日 活動時間 ${Math.round(item.minutes ?? 0)}分`, renderBar: (active: boolean) => item.minutes == null ? null : <i data-design-role="weekly-bar" data-domain-bar="true" data-selected={active ? "true" : "false"} className="block w-8 rounded-t-[3px] not-italic" style={{ height: `${Math.max(2, item.minutes / maxMinutes * 80)}px` }} /> }))} selectedDate={selectedDate} ariaLabel={graphLabel} onSelect={onDate} spacingClassName="mt-6 mb-2" overlay={<svg viewBox={`0 0 ${timelineValues.length * 44} 80`} preserveAspectRatio="none" className="h-full w-full">{weeklyLoadSegments.map((points, index) => <polyline key={index} points={points} fill="none" stroke="var(--ayumu-chart-secondary-line)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />)}</svg>} />;
  const goalProgress = move.patterns.filter((pattern) => pattern.enabled && (pattern.weeklyCount || pattern.weeklyMinutes)).slice(0, 3).map((pattern) => { const related = includedRecords.filter((record) => record.patternId === pattern.id); const doneCount = related.reduce((sum, record) => sum + (record.outcome === "complete" ? 1 : record.outcome === "partial" ? .5 : 0), 0); const minutes = related.reduce((sum, record) => sum + record.durationMinutes, 0); return { label: pattern.name, value: pattern.weeklyMinutes ? `${minutes}/${pattern.weeklyMinutes}分` : `${doneCount}/${pattern.weeklyCount ?? 0}回` }; });
  const progressWidth = Math.max(0, Math.min(100, targetProgress));
  return <><WeeklyCard component="move-week-chart"><WeekRangeLabel startDate={bounds.startDate} endDate={bounds.endDate} /><div className="mt-4 text-[20px] font-bold tracking-tight">{bounds.endDate === addDays(weekStartFor(today()), 6) ? "今週あと" : "週の残り"} <span className="text-[28px] font-extrabold text-primary tabular-nums">{remainingMinutes}</span> <span className="text-[14px] font-medium">分</span></div>{weeklyGraph}<div data-design-role="move-chart-legend" className="mt-5 flex justify-center gap-4 text-[10px] text-textSub"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-primary" />活動時間</span><span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-[#666666]" />運動負荷</span></div>{targetMinutes || goalProgress.length ? <div data-design-role="move-goal-progress" className="mt-5 border-0 border-t border-solid border-[#EEEEEE] pt-3"><div className="mb-2 flex items-end justify-between gap-3"><span><small className="mb-0.5 block text-[11px] font-medium text-textSub">今週の進捗</small><strong className="text-[22px] leading-none text-textMain tabular-nums">{targetProgress}%</strong></span><span className="pb-0.5 text-right text-[12px] text-textSub tabular-nums"><strong className="text-[15px] text-textMain">{doneMinutes}</strong> / {targetMinutes || "—"}分</span></div><span className="mb-4 block h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="今週の運動目標の達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressWidth}><i className="block h-full rounded-full bg-primary" style={{ width: `${progressWidth}%` }} /></span>{goalProgress.length ? <div className="flex flex-col gap-2">{goalProgress.map((item) => <div key={item.label} className="flex items-center justify-between"><span className="text-[13px] font-medium text-textMain">{item.label}</span><strong className="text-[14px] tabular-nums text-textMain">{item.value}</strong></div>)}</div> : null}</div> : <div className="mt-5 border-0 border-t border-solid border-[#EEEEEE] pt-3"><div className="flex items-center justify-between"><span className="text-[13px] font-medium text-textMain">実績</span><strong className="text-[14px] tabular-nums">{doneMinutes}<small className="text-[11px] font-normal text-textSub">分</small></strong></div></div>}</WeeklyCard><div className="mt-5"><HistoryGroup date={selectedDate} summary={<>{activityMinutes(selectedRecords)}<small className="text-xs font-normal text-text-muted">分</small></>}>{selectedRecords.length ? selectedRecords.map((record) => <MoveRecordRow key={record.id} move={move} record={record} />) : <p className="m-0 px-4 py-7 text-center text-[13px] text-text-muted">この日の記録はありません</p>}</HistoryGroup></div></>;
}

function MoveToday({ move, health, selectedDate, onDate }: { move: MoveState; health: HealthState; selectedDate: string; onDate: (date: string) => void }) {
  const displayedMove = useMemo(() => moveRecordsForDisplay(move, health.exercises), [move, health.exercises]);
  return <main data-design-component="move-week" className="px-4 pt-4 pb-8"><MoveWeekChart move={displayedMove} selectedDate={selectedDate} onDate={onDate} /></main>;
}

function MoveHistory({ move, health }: { move: MoveState; health: HealthState }) {
  const displayedMove = useMemo(() => moveRecordsForDisplay(move, health.exercises), [move, health.exercises]);
  const [period, setPeriod] = useState<TimeSeriesRange>("28"); const bounds = periodBounds(today(), period, 0);
  const records = displayedMove.records.filter((record) => record.date >= bounds.startDate && record.date <= bounds.endDate).slice().sort((a, b) => b.date.localeCompare(a.date)); const complete = records.reduce((sum, record) => sum + (record.outcome === "complete" ? 1 : record.outcome === "partial" ? .5 : 0), 0); const minutes = activityMinutes(records);
  const grouped = [...new Set(records.map((record) => record.date))].map((date) => ({ date, records: records.filter((record) => record.date === date) }));
  const completionRate = records.length ? Math.round(complete / records.length * 100) : 0;
  return <main className="px-4 pt-4 pb-8"><div className="mb-5"><SegmentedControl value={period} options={timeSeriesRanges.map((item) => [item.value, item.label])} label="運動履歴の期間" onChange={setPeriod} /></div><div className="mb-6"><WeeklyCard component="move-history-summary"><WeekRangeLabel startDate={bounds.startDate} endDate={bounds.endDate} /><div className="mt-4 flex items-end justify-between gap-3"><div><span className="block text-[12px] text-textSub">達成率</span><strong className="text-[36px] leading-none tabular-nums">{completionRate}%</strong></div><span className="pb-1 text-[12px] text-textSub tabular-nums">{complete}/{records.length}回・合計 {minutes}分</span></div></WeeklyCard></div>{grouped.map((group) => { const dayMinutes = activityMinutes(group.records); return <HistoryGroup key={group.date} date={group.date} summary={<>{dayMinutes}<small className="text-xs font-normal text-text-muted">分</small></>}>
    {group.records.map((record) => <MoveRecordRow key={record.id} move={displayedMove} record={record} />)}
  </HistoryGroup>; })}{records.length === 0 ? <EmptyStateCard title="運動の記録はまだありません" description="Todayから運動を始めるか、クイック記録すると履歴に追加されます。" icon={<PersonSimpleRun size={20} />} /> : null}</main>;
}

function MovePatterns({ move, onToggle, onEdit, onDuplicate }: { move: MoveState; onToggle: (id: string) => void; onEdit: (id?: string) => void; onDuplicate: (id: string) => void }) {
  const [query, setQuery] = useState(""); const filtered = move.patterns.filter((pattern) => pattern.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="px-4 pt-6 pb-8"><div className="mb-4 flex items-end justify-between"><h2 className="m-0 text-[18px] font-bold leading-none text-gray-800">運動メニュー</h2><span className="pb-0.5 text-[12px] leading-none text-gray-500">{filtered.length}件</span></div><SearchField value={query} onChange={setQuery} label="運動メニューを検索" placeholder="メニュー名で検索" /><div className="mb-3 flex justify-end"><span className="min-h-11 px-2 flex items-center text-[12px] text-gray-500">有効なメニューを優先</span></div>{filtered.length ? <section className="overflow-hidden rounded-[12px] bg-white shadow-sm">{filtered.sort((a, b) => Number(b.enabled) - Number(a.enabled)).map((pattern) => <div key={pattern.id} className="flex min-h-[64px] items-center border-b border-gray-100 px-4 last:border-b-0"><button type="button" aria-label={`${pattern.name}を${pattern.enabled ? "無効" : "有効"}にする`} aria-pressed={pattern.enabled} onClick={() => onToggle(pattern.id)} className={`-ml-2 mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-md border-0 bg-transparent ${pattern.enabled ? "text-primary" : "text-gray-400"}`}><span className={`grid h-6 w-6 place-items-center rounded-md border border-solid ${pattern.enabled ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-transparent"}`}><Check size={15} weight="bold" /></span></button><button type="button" className="flex min-h-[64px] min-w-0 flex-1 items-center justify-between border-0 bg-transparent p-0 text-left" onClick={() => onEdit(pattern.id)}><span className="flex min-w-0 flex-col"><strong className="mb-1 truncate text-[16px] font-medium leading-tight text-gray-800">{pattern.name}</strong><small className="text-[12px] font-normal leading-tight text-gray-500">{pattern.weeklyMinutes ? `${pattern.weeklyMinutes}分/週` : `${pattern.weeklyCount ?? 0}回/週`} / 1回 {pattern.defaultDurationMinutes}分</small></span><CaretRight size={20} className="ml-2 shrink-0 text-gray-300" /></button><button type="button" aria-label={`${pattern.name}を複製`} onClick={() => onDuplicate(pattern.id)} className="-mr-2 grid h-11 w-11 shrink-0 place-items-center border-0 bg-transparent text-gray-400"><ArrowsClockwise size={18} /></button></div>)}</section> : <EmptyStateCard title="メニューが見つかりません" description="別の名前で検索するか、Todayから新しい運動メニューを追加してください。" icon={<MagnifyingGlass size={20} />} />}<p className="mt-5 text-center text-[11px] text-text-muted">新しいメニューの追加はTodayから行えます</p></main>;
}

function QuickMoveSheet({ pattern, onSave, onClose }: { pattern: MovePattern; onSave: (minutes: number) => void; onClose: () => void }) {
  const [minutes, setMinutes] = useState(String(pattern.defaultDurationMinutes || 20)); return <div className="px-4 pb-6"><SheetClose onClose={onClose} /><p className="text-[13px] text-textSub mt-0">今日行った時間を入力してください。</p><label className="block text-[12px] text-textSub mb-4">時間（分）<KeyboardInput inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-2 w-full h-12 rounded-[8px] bg-white border border-solid border-[#E2E2E2] px-3 text-[16px]" /></label><button type="button" className="w-full h-12 rounded-[10px] border-0 bg-primary text-white font-bold" onClick={() => onSave(Math.max(1, Number(minutes) || pattern.defaultDurationMinutes || 20))}>記録する</button></div>;
}

function PatternSheet({ pattern, onSave, onClose }: { pattern?: MovePattern; onSave: (pattern: MovePattern) => void; onClose: () => void }) {
  const [name, setName] = useState(pattern?.name || ""); const [duration, setDuration] = useState(String(pattern?.defaultDurationMinutes ?? 30)); const [weekly, setWeekly] = useState(String(pattern?.weeklyCount ?? 1)); const [category, setCategory] = useState<MovePattern["category"]>(pattern?.category || "strength"); const [intensity, setIntensity] = useState<MovePattern["defaultIntensity"]>(pattern?.defaultIntensity || "moderate"); const [weekdays, setWeekdays] = useState(pattern?.preferredWeekdays || []); const [timeWindow, setTimeWindow] = useState<NonNullable<MovePattern["preferredTimeWindow"]>>(pattern?.preferredTimeWindow || "evening"); const [exerciseNames, setExerciseNames] = useState(pattern?.exercises.map((item) => item.name).join("、") || "");
  const toggleWeekday = (day: number) => setWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  return <div className="px-4 pb-6"><SheetClose onClose={onClose} /><div className="space-y-4"><label className="block text-[12px] text-textSub">名前<KeyboardInput value={name} onChange={(event) => setName(event.target.value)} placeholder="例：全身" className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] px-3" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-[12px] text-textSub">種類<select value={category} onChange={(event) => setCategory(event.target.value as MovePattern["category"])} className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] bg-white px-3"><option value="strength">筋力</option><option value="walking">歩く</option><option value="running">走る</option><option value="cycling">自転車</option><option value="light">軽い運動</option><option value="rest">休息</option><option value="other">その他</option></select></label><label className="block text-[12px] text-textSub">強度<select value={intensity} onChange={(event) => setIntensity(event.target.value as MovePattern["defaultIntensity"])} className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] bg-white px-3"><option value="light">軽い</option><option value="moderate">中程度</option><option value="hard">高い</option></select></label></div><div className="grid grid-cols-2 gap-3"><label className="block text-[12px] text-textSub">1回の時間（分）<KeyboardInput inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] px-3" /></label><label className="block text-[12px] text-textSub">週の回数<KeyboardInput inputMode="numeric" value={weekly} onChange={(event) => setWeekly(event.target.value)} className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] px-3" /></label></div>{category === "strength" ? <label className="block text-[12px] text-textSub">種目（読点区切り）<KeyboardInput value={exerciseNames} onChange={(event) => setExerciseNames(event.target.value)} placeholder="スクワット、プランク" className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] px-3" /></label> : null}<fieldset className="border-0 p-0 m-0"><legend className="text-[12px] text-textSub mb-2">希望曜日</legend><div className="grid grid-cols-7 gap-1">{["日", "月", "火", "水", "木", "金", "土"].map((label, day) => <button type="button" key={label} aria-pressed={weekdays.includes(day)} onClick={() => toggleWeekday(day)} className={`h-11 rounded-full text-[11px] ${weekdays.includes(day) ? "border-0 bg-primary text-white" : "border border-solid border-[#E2E2E2] bg-white text-textSub"}`}>{label}</button>)}</div></fieldset><label className="block text-[12px] text-textSub">希望時間帯<select value={timeWindow} onChange={(event) => setTimeWindow(event.target.value as NonNullable<MovePattern["preferredTimeWindow"]>)} className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] bg-white px-3"><option value="morning">朝</option><option value="daytime">日中</option><option value="evening">夜</option></select></label><button type="button" disabled={!name.trim()} className="w-full h-12 rounded-[10px] border-0 bg-primary text-white font-bold disabled:opacity-50" onClick={() => { const exercises = exerciseNames.split(/[、,]/).map((item) => item.trim()).filter(Boolean).map((exerciseName, index) => ({ id: `${pattern?.id || "custom"}-exercise-${index + 1}`, name: exerciseName, defaultSets: 3, defaultReps: 10 })); onSave({ ...(pattern ?? { id: `custom-${crypto.randomUUID()}`, exercises: [], enabled: true }), name: name.trim(), category, exercises: category === "strength" ? exercises : [], defaultDurationMinutes: category === "rest" ? 0 : Math.max(1, Number(duration) || 30), defaultIntensity: intensity, weeklyCount: Math.max(0, Number(weekly) || 0), weeklyMinutes: undefined, preferredWeekdays: weekdays, preferredTimeWindow: timeWindow }); }}>保存</button></div></div>;
}

function DetectedMoveSheet({ ring, move, onMerge, onKeep, onIgnore, onClose }: { ring: MoveRecord; move: MoveState; onMerge: (manual: MoveRecord) => void; onKeep: () => void; onIgnore: () => void; onClose: () => void }) {
  const candidate = findDetectedWorkoutMatch(ring, move.records); const suggested = ring.classification?.suggestedPatternId ? patternById(move, ring.classification.suggestedPatternId) : undefined; return <div className="px-4 pb-6"><SheetClose onClose={onClose} /><div className="bg-background rounded-[10px] p-4 mb-4"><strong className="text-[16px]">{ring.durationMinutes}分の運動</strong><div className="text-[12px] text-textSub mt-2">平均心拍 {ring.averageHeartRate ?? "—"} bpm　{ring.activeCalories ?? "—"} kcal</div>{suggested ? <div className="text-[12px] text-textMain mt-2">分類候補: {suggested.name}（{ring.classification?.confidence === "high" ? "自動適用" : "確認が必要"}）</div> : null}</div><p className="text-[14px] font-medium">この記録とまとめますか？</p><div className="min-h-[56px] px-3 flex items-center bg-white border border-solid border-[#E2E2E2] rounded-[10px] text-[13px] mb-4">{candidate ? `${patternById(move, candidate.patternId || "")?.name || candidate.type}・開始時刻と長さが近い手入力` : "一致する手入力記録はありません"}</div><button type="button" disabled={!candidate} className="w-full h-12 rounded-[10px] border-0 bg-primary text-white font-bold disabled:opacity-40" onClick={() => candidate && onMerge(candidate)}>まとめる</button><button type="button" className="w-full h-12 mt-2 rounded-[10px] border border-solid border-primary bg-white text-primary font-bold" onClick={onKeep}>別々に残す</button><button type="button" className="w-full h-11 mt-1 border-0 bg-transparent text-textSub" onClick={onIgnore}>今回は無視</button><p className="text-[11px] text-text-muted text-center mb-0">まとめた場合、消費カロリーは1回だけ数えます。</p></div>;
}

function MoveSubstituteSheet({ move, candidates, onSelect, onClose }: { move: MoveState; candidates: MoveCandidate[]; onSelect: (candidate: MoveCandidate) => void; onClose: () => void }) {
  return <div className="px-4 pb-6"><SheetClose onClose={onClose} /><p className="text-[13px] leading-5 text-textSub mt-0">今日の体調と避けた部位を反映した候補だけを表示しています。</p><div className="space-y-2">{candidates.map((candidate) => { const pattern = patternById(move, candidate.patternId); return <button type="button" key={candidate.patternId} onClick={() => onSelect(candidate)} className="w-full min-h-[68px] rounded-[10px] border border-solid border-[#E2E2E2] bg-white px-4 text-left flex items-center justify-between"><span><strong className="block text-[14px] text-textMain">{pattern?.name ?? candidate.patternId}</strong><small className="text-[11px] text-textSub">{candidate.reasons.join("・")}</small></span><span className="text-[13px] font-bold tabular-nums text-primary">{candidate.durationMinutes}分</span></button>; })}</div>{!candidates.length ? <p className="py-6 text-center text-[13px] text-textMuted">選べる候補がありません</p> : null}</div>;
}

function WorkoutFeedbackSheet({ record, onSave }: { record: MoveRecord; onSave: (outcome: MoveRecord["outcome"], intensity: NonNullable<MoveRecord["perceivedIntensity"]>, unwell: boolean, bodyAreaAvoided?: string) => void }) {
  const [outcome, setOutcome] = useState(record.outcome); const [intensity, setIntensity] = useState<NonNullable<MoveRecord["perceivedIntensity"]>>(record.perceivedIntensity || "moderate"); const [unwell, setUnwell] = useState(Boolean(record.unwell)); const [bodyArea, setBodyArea] = useState(record.bodyAreaAvoided || "");
  return <div className="px-4 pb-6"><p className="text-[13px] text-textSub mt-0 mb-3">どこまでできましたか？</p><div className="grid grid-cols-3 gap-2 mb-5">{[["complete", "完了"], ["partial", "一部"], ["skipped", "スキップ"]].map(([id, label]) => <button type="button" key={id} onClick={() => setOutcome(id as MoveRecord["outcome"])} className={`h-11 rounded-[9px] ${outcome === id ? "bg-primary text-white border-0" : "bg-white text-textSub border border-solid border-[#E2E2E2]"}`}>{label}</button>)}</div><p className="text-[13px] text-textSub mb-3">体感の強さ</p><div className="grid grid-cols-3 gap-2 mb-4">{[["light", "軽い"], ["moderate", "ちょうどいい"], ["hard", "きつい"]].map(([id, label]) => <button type="button" key={id} onClick={() => setIntensity(id as NonNullable<MoveRecord["perceivedIntensity"]>)} className={`min-h-[44px] rounded-[9px] text-[12px] ${intensity === id ? "bg-primary text-white border-0" : "bg-white text-textSub border border-solid border-[#E2E2E2]"}`}>{label}</button>)}</div><button type="button" aria-pressed={unwell} onClick={() => setUnwell((value) => !value)} className={`w-full h-11 rounded-[9px] text-[12px] mb-3 ${unwell ? "bg-primary-light text-primary border border-solid border-primary/20" : "bg-white text-textSub border border-solid border-[#E2E2E2]"}`}>体調がよくなかった</button><label className="block text-[12px] text-textSub mb-5">避けた部位（任意）<KeyboardInput value={bodyArea} onChange={(event) => setBodyArea(event.target.value)} placeholder="例：右ひざ" className="mt-2 w-full h-11 rounded-[8px] border border-solid border-[#E2E2E2] px-3" /></label><button type="button" className="w-full h-12 rounded-[10px] border-0 bg-primary text-white font-bold" onClick={() => onSave(outcome, intensity, unwell, bodyArea.trim() || undefined)}>保存</button></div>;
}

function ActiveWorkout({ pattern, startedAt, sets, onSet, onFinish, onClose }: { pattern: MovePattern; startedAt: number; sets: WorkoutSet[]; onSet: (sets: WorkoutSet[]) => void; onFinish: (outcome: "complete" | "partial") => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []); const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000)); const currentIndex = Math.max(0, sets.findIndex((set) => !set.completed)); const current = sets[currentIndex] ?? sets.at(-1); const exercise = pattern.exercises.find((item) => item.id === current?.exerciseId) ?? pattern.exercises[0];
  const completeSet = () => { if (!current) return; const next = sets.map((set, index) => index === currentIndex ? { ...set, completed: true } : set); onSet(next); if (next.every((set) => set.completed)) onFinish("complete"); };
  return <div className="absolute inset-0 z-[80] bg-background flex flex-col"><header className="h-14 px-4 flex items-center justify-between bg-background"><button type="button" aria-label="閉じる" className="w-11 h-11 grid place-items-center border-0 bg-transparent" onClick={onClose}><X size={22} /></button><strong className="text-[16px]">{pattern.name}</strong><span className="w-16 text-right tabular-nums text-[13px]">{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span></header><MobileScroll className="top-14 bottom-[72px]"><main className="px-4 py-5 space-y-5"><section className="bg-white rounded-[12px] p-4 shadow-soft"><div className="text-[12px] text-textSub mb-1">種目 {Math.min(pattern.exercises.length, pattern.exercises.findIndex((item) => item.id === exercise?.id) + 1)}/{pattern.exercises.length || 1}</div><h1 className="text-[22px] mt-0 mb-1">{exercise?.name || pattern.name}</h1><div className="text-[12px] text-textSub mb-5">セット {current?.set || 1}/{exercise?.defaultSets || 1}　前回 {current?.weightKg ?? "—"}kg × {current?.reps ?? "—"}回</div><div className="grid grid-cols-2 gap-3 mb-5"><div className="bg-background rounded-[10px] p-4 text-center"><strong className="text-[28px] tabular-nums">{current?.weightKg ?? "—"}</strong><small className="ml-1 text-textSub">kg</small></div><div className="bg-background rounded-[10px] p-4 text-center"><strong className="text-[28px] tabular-nums">{current?.reps ?? "—"}</strong><small className="ml-1 text-textSub">回</small></div></div><button type="button" className="w-full h-12 rounded-[10px] border-0 bg-primary text-white font-bold" onClick={completeSet}>セット完了</button></section><section className="bg-white rounded-[12px] shadow-soft overflow-hidden"><h2 className="text-[13px] text-textSub p-4 m-0">このあとの種目</h2>{pattern.exercises.filter((item) => item.id !== exercise?.id).map((item) => <div key={item.id} className="min-h-[54px] px-4 flex items-center border-t border-solid border-[#E8E8E8] text-[13px]">{item.name}</div>)}</section></main></MobileScroll><footer className="absolute bottom-0 left-0 right-0 h-[72px] px-4 grid grid-cols-2 gap-3 items-center bg-white border-t border-solid border-[#E8E8E8]"><button type="button" className="h-12 rounded-[10px] border border-solid border-[#E2E2E2] bg-white text-textSub font-bold" onClick={() => onFinish("partial")}>一部で終了</button><button type="button" className="h-12 rounded-[10px] border-0 bg-primary text-white font-bold" onClick={() => onFinish("complete")}>完了</button></footer></div>;
}

function SimpleHeader({ title, onSettings }: { title: string; onSettings?: () => void }) { return <header data-design-component="today-header" className="grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 w-full bg-[#F4F4F4] shrink-0 z-10"><span aria-hidden="true" /><h1 className="text-[18px] font-bold text-[#333333] tracking-tight text-center m-0">{title}</h1>{onSettings ? <button type="button" aria-label="設定" className="w-11 h-11 grid place-items-center rounded-full bg-transparent border-0 text-[#333333] active:bg-black/5" onClick={onSettings}><GearSix size={24} /></button> : <span aria-hidden="true" />}</header>; }

function SettingsHeader({ onBack }: { onBack: () => void }) { return <header data-design-component="settings-header" className="grid grid-cols-[44px_1fr_44px] items-center px-3 h-14 w-full bg-transparent border-0 shrink-0 z-10"><button type="button" aria-label="今日へ戻る" className="w-11 h-11 grid place-items-center rounded-full bg-transparent border-0 text-[#333333] active:bg-black/5" onClick={onBack}><ArrowLeft size={24} /></button><h1 className="text-[18px] font-bold text-[#333333] tracking-tight text-center m-0">設定</h1><span aria-hidden="true" /></header>; }

const spherePreviewProfiles: Record<string, { label: string; scores: Record<HealthMetricKey, number> }> = {
  "sleep-low": { label: "睡眠低めを試用中", scores: { sleep: 20, recovery: 82, circulation: 76, activity: 84 } },
  "recovery-low": { label: "回復低めを試用中", scores: { sleep: 84, recovery: 20, circulation: 76, activity: 82 } },
  "circulation-low": { label: "循環低めを試用中", scores: { sleep: 84, recovery: 82, circulation: 20, activity: 78 } },
  "activity-low": { label: "活動低めを試用中", scores: { sleep: 84, recovery: 82, circulation: 76, activity: 20 } },
  "all-high": { label: "全要素高めを試用中", scores: { sleep: 94, recovery: 91, circulation: 89, activity: 96 } },
  "all-low": { label: "全要素低めを試用中", scores: { sleep: 24, recovery: 31, circulation: 38, activity: 20 } },
};

function conditionSpherePreview(source: DailyHealthSummary | undefined) {
  const profile = spherePreviewProfiles[new URLSearchParams(window.location.search).get("sphere") ?? ""];
  if (!source || !profile) return source;
  const scores = source.scores.map((metric) => ({ ...metric, value: profile.scores[metric.key] }));
  const score = Math.round(mapConditionToMembrane({ scores: profile.scores, dataCompleteness: 1 }).score);
  return { ...source, scores, bodyScore: score, status: profile.label };
}

function TodayView({ planner, health, move, recommendation, substitutes, onStart, onQuick, onDetected, onSubstitute, onAddPattern, onTab, onAddMeal, onPlan, onActual, onRecord }: { planner: PlannerState; health: HealthState; move: MoveState; recommendation: ReturnType<typeof deterministicRecommendation>; substitutes: MoveCandidate[]; onStart: (pattern: MovePattern) => void; onQuick: (pattern: MovePattern) => void; onDetected: (record: MoveRecord) => void; onSubstitute: () => void; onAddPattern: () => void; onTab: (tab: GlobalTab) => void; onAddMeal: (slot: MealSlot) => void; onPlan: (plan: Plan) => void; onActual: (actual: Actual) => void; onRecord: (plan: Plan) => void }) {
  const latest = conditionSpherePreview(health.daily.at(-1)); const debt = sleepDebtMinutes(health.daily); const main = patternById(move, recommendation.main.patternId); const actual = planner.actuals.filter((item) => item.date === today() && !item.skipped).reduce((sum, item) => ({ calories: sum.calories + item.calories, protein: sum.protein + item.protein }), { calories: 0, protein: 0 });
  const recipes = new Map([...recipesJson, ...planner.customRecipes].map((recipe) => [recipe.id, recipe as Recipe]));
  const plans = planner.plans.filter((plan) => plan.date === today());
  const actuals = planner.actuals.filter((record) => record.date === today());
  const pending = plans.filter((plan) => !actuals.some((record) => record.planId === plan.id));
  const planned = pending.reduce((sum, plan) => { const recipe = recipes.get(plan.recipeId); const n = recipe ? scaledNutrition(recipe, plan.portion) : { calories: 0, protein: 0 }; return { calories: sum.calories + n.calories, protein: sum.protein + n.protein }; }, { calories: 0, protein: 0 });
  const slots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
  const hour = currentHour();
  const currentSlot: MealSlot = hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner";
  const nextPlan = pending.find((plan) => plan.slot === currentSlot) ?? pending.find((plan) => slots.indexOf(plan.slot) > slots.indexOf(currentSlot));
  const detected = move.records.filter((record) => record.source === "ultrahuman" && !record.linkedRecordIds?.length);
  const displayedMove = moveRecordsForDisplay(move, health.exercises);
  const completed = displayedMove.records.filter((record) => record.date === today() && record.outcome !== "skipped" && (record.source !== "ultrahuman" || record.linkedRecordIds?.length));
  const fresh = latest?.date === today();
  const currentSlotRecorded = actuals.some((record) => record.slot === currentSlot);
  const [adjusting, setAdjusting] = useState(false);
  const actionClass = "today-flow-action";

  const sphereMetrics = conditionMetricKeys.map((key) => {
    const metric = latest?.scores.find((item) => item.key === key);
    return { key, label: metric?.label ?? conditionMetricLabels[key], value: metric?.value };
  });
  const sphereScores = Object.fromEntries(sphereMetrics.map((metric) => [metric.key, metric.value]));
  const sphereCompleteness = sphereMetrics.filter((metric) => metric.value != null).length / conditionMetricKeys.length;
  const sphereSummary = sphereMetrics.map((metric) => `${metric.label} ${metric.value ?? "データなし"}`).join("、");
  return <main className="today-screen px-4 pt-4 pb-8 space-y-5"><div className="today-date"><span>{formatShortDate(today())} {formatWeekday(today())}曜日</span><span>{latest ? `${formatShortDate(latest.date)}のコンディション` : "コンディション未取得"}</span></div>{latest?.bodyScore != null ? <section data-design-component="today-condition-sphere" className="relative h-[324px] overflow-hidden rounded-[18px] bg-black text-white"><MembraneSphere className="absolute inset-0 !aspect-auto" scores={sphereScores} dataCompleteness={sphereCompleteness} ariaLabel={`睡眠・回復・循環・活動の状態を反映したコンディションスフィア。${sphereSummary}`} /><div aria-hidden="true" className="absolute inset-0 z-10 grid place-items-center pointer-events-none"><div className="flex flex-col items-center justify-center text-center drop-shadow-[0_2px_12px_rgba(0,0,0,.95)]"><small className="mb-1 text-[9px] font-bold tracking-[0.16em] text-white/60">総合</small><strong data-design-role="sphere-total-score" className="font-number text-[52px] leading-none tabular-nums tracking-[-1.5px] text-white">{latest.bodyScore}</strong><span className="mt-2 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur-sm">{latest.status ?? "データ確認中"}</span></div></div><div aria-hidden="true" className="absolute left-4 top-4 z-10 pointer-events-none"><small className="block text-[10px] font-bold tracking-[0.12em] text-white/55">TODAY CONDITION</small></div><div className="absolute bottom-0 left-0 right-0 z-10 grid grid-cols-4 gap-1 border-t border-white/10 bg-black/40 px-3 py-3 backdrop-blur-sm pointer-events-none">{sphereMetrics.map((metric) => <span key={metric.key} className="text-center"><small className="block text-[9px] text-white/55">{metric.label}</small><strong className="mt-0.5 block text-[12px] tabular-nums text-white/90">{metric.value ?? "—"}</strong></span>)}</div><button type="button" aria-label={`総合コンディション ${latest.bodyScore}。${sphereSummary}。睡眠負債 ${health.daily.length ? formatMinutes(debt) : "データなし"}。詳細を開く`} onClick={() => onTab("body")} className="absolute inset-0 z-20 rounded-[18px] border-0 bg-transparent" /></section> : <button type="button" onClick={() => onTab("body")} className="w-full min-h-[160px] rounded-[18px] border-0 bg-white text-textSub">コンディションのデータが不足しています</button>}<p className="today-brief">{!fresh ? "今の体調を優先して、無理のない一日に。" : latest?.bodyScore != null && latest.bodyScore < 60 ? "今日は回復を優先。運動は軽めに。" : "食事を整えて、自分のペースで。"}</p>
  <WeeklyCard component="today-outlook"><div className="today-section-heading"><h2>今日の進み具合</h2><button className={actionClass} onClick={() => onTab("meals")}>詳細</button></div>
    {[{ label: "食事", value: actual.calories, planned: planned.calories, target: planner.dailyTargets.calories, unit: "kcal" }, { label: "たんぱく質", value: actual.protein, planned: planned.protein, target: planner.dailyTargets.protein, unit: "g" }].map((metric) => { const total = metric.value + metric.planned; const scale = Math.max(metric.target, total, 1); return <div className="today-progress" key={metric.label}><div className="today-outlook-row"><span>{metric.label}</span><span><strong>{Math.round(metric.value)}</strong><small> / {metric.target} {metric.unit}</small></span></div><div className="today-progress-track" role="img" aria-label={`${metric.label}：記録済み${Math.round(metric.value)}、未記録の予定${Math.round(metric.planned)}、目安${metric.target}${metric.unit}`}><i style={{width: `${metric.value / scale * 100}%`}}/><i className="is-planned" style={{width: `${metric.planned / scale * 100}%`}}/></div>{metric.planned > 0 ? <small className="today-progress-note">予定込み {Math.round(total)} {metric.unit}</small> : null}</div>; })}
    <div className="today-progress-legend"><span><i/>記録済み</span><span><i className="is-planned"/>予定</span><span><i className="is-remaining"/>目安まで</span></div>
    <div className="today-mini-metrics"><button onClick={() => onTab("move")}><PersonSimpleRun size={18}/><span>活動</span><strong>{activityMinutes(completed)}<small> 分記録</small></strong></button><button onClick={() => onTab("body")}><Moon size={18}/><span>直近の睡眠</span><strong>{latest?.sleepMinutes != null ? formatMinutes(latest.sleepMinutes) : "—"}</strong></button></div>
  </WeeklyCard>
  <section aria-label="これから"><div className="today-section-heading"><h2>これから</h2><button className={actionClass} aria-expanded={adjusting} onClick={() => setAdjusting(!adjusting)}>追加・調整</button></div>
    {adjusting ? <WeeklyCard component="today-adjust"><div className="today-adjust-options">{slots.map((slot) => <button key={slot} className={actionClass} onClick={() => onAddMeal(slot)}>{slotLongLabels[slot]}を追加</button>)}<button className={actionClass} disabled={!substitutes.length} onClick={onSubstitute}>運動の候補を変更</button></div></WeeklyCard> : null}
    <WeeklyCard component="today-flow">
      {pending.filter((plan) => slots.indexOf(plan.slot) >= slots.indexOf(currentSlot)).sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot) || a.order - b.order).map((plan, index) => <div className="today-flow-block" key={plan.id}><div className="today-flow-label"><ForkKnife size={18}/><h3>{slotLongLabels[plan.slot]}</h3><small className="today-muted">{index === 0 ? "次の食事" : "予定"}</small></div><button className="today-flow-content" onClick={() => onPlan(plan)}><strong>{recipes.get(plan.recipeId)?.name ?? "料理を確認"}</strong></button>{index === 0 ? <div className="today-button-row"><button className="today-primary" onClick={() => onRecord(plan)}>食べた記録へ</button><button className={actionClass} onClick={() => onPlan(plan)}>内容・量</button></div> : <button className={actionClass} onClick={() => onRecord(plan)}>記録</button>}</div>)}
      {!nextPlan && !currentSlotRecorded ? <div className="today-flow-block"><div className="today-flow-label"><ForkKnife size={18}/><h3>{slotLongLabels[currentSlot]}</h3></div><button className="today-empty-slot" onClick={() => onAddMeal(currentSlot)}>メニューを選ぶ<Plus size={18}/></button></div> : null}
      {!completed.length && main ? <div className="today-flow-block"><div className="today-flow-label"><PersonSimpleRun size={18}/><h3>運動</h3><small className="today-muted">提案</small></div><div className="today-flow-item"><span><strong>{main.name}</strong><span>{main.category === "rest" ? "休息を選ぶ日" : `${recommendation.main.durationMinutes}分`}</span></span><button className={actionClass} disabled={!substitutes.length} onClick={onSubstitute}>別の候補</button></div><button className="today-primary" onClick={() => onStart(main)}>{main.category === "rest" ? "休息日にする" : "開始"}</button></div> : null}
      <div className="today-flow-block"><div className="today-flow-label"><Moon size={18}/><h3>夜 · 休養</h3></div><button className="today-empty-slot" onClick={() => onTab("body")}>睡眠と回復を確認<CaretRight size={16}/></button></div>
    </WeeklyCard>
  </section>
  {planner.actuals.some(a=>a.review) ? <WeeklyCard component="meal-review"><h2 className="text-[13px] text-text-main">食事記録の確認</h2><p className="text-[12px] text-text-sub">同じ予定に複数の実績がありました。記録と栄養値は残しています。内容を確認し、重複なら取り消してください。</p>{planner.actuals.filter(a=>a.review).map(a=><button key={a.id} className="today-flow-action" onClick={()=>onActual(a)}>{a.date} · {a.recipeSnapshot?.name??recipes.get(a.recipeId)?.name??"食事"}</button>)}</WeeklyCard> : null}
  <WeeklyCard component="today-records"><details><summary className="today-record-summary">済んだこと・確認待ち<span>{actuals.length + completed.length}件の記録{detected.length + pending.filter((plan) => slots.indexOf(plan.slot) < slots.indexOf(currentSlot)).length > 0 ? " · 確認あり" : ""}</span></summary>
    {actuals.map((record) => <button className="today-flow-item" key={record.id} onClick={() => onActual(record)}><span><small>{slotLongLabels[record.slot]} · {record.skipped ? "見送り" : "記録済み"}</small><strong>{recipes.get(record.recipeId)?.name ?? "食事"}</strong></span><CheckCircle size={18}/></button>)}
    {completed.map((record) => <div className="today-flow-item" key={record.id}><span><small>{record.outcome === "partial" ? "一部実施" : "記録済み"}</small><strong>{record.type} · {record.durationMinutes}分</strong></span><CheckCircle size={18}/></div>)}
    {pending.filter((plan) => slots.indexOf(plan.slot) < slots.indexOf(currentSlot)).map((plan) => <button className="today-empty-slot" key={plan.id} onClick={() => onRecord(plan)}>{slotLongLabels[plan.slot]} · {recipes.get(plan.recipeId)?.name}を確認<CaretRight size={16}/></button>)}
    {detected.map((record) => <button className="today-empty-slot" key={record.id} onClick={() => onDetected(record)}>{formatShortDate(record.date)} · {record.durationMinutes}分の検出活動<CaretRight size={16}/></button>)}
    {!actuals.length && !completed.length && !detected.length ? <p className="today-muted">記録はまだありません</p> : null}
  </details><details className="today-record-options"><summary>運動を記録・メニューを追加</summary>{move.patterns.filter((pattern) => pattern.enabled && pattern.category !== "rest").map((pattern) => <button key={pattern.id} className="today-empty-slot" onClick={() => onQuick(pattern)}>{pattern.name}を記録<Plus size={16}/></button>)}<button className={actionClass} onClick={onAddPattern}>新しいメニュー</button></details></WeeklyCard>
  </main>;
}

function BottomNavigation({ active, onSelect }: { active: GlobalTab; onSelect: (tab: GlobalTab) => void }) {
  const entries = [["today", "Today", "今日", <House size={30} />], ["meals", "Meals", "食事", <ForkKnife size={30} />], ["move", "Move", "運動", <PersonSimpleRun size={30} />], ["body", "Body", "コンディション", <Heartbeat size={30} />]] as Array<[GlobalTab, string, string, ReactNode]>;
  const activeIndex = entries.findIndex(([id]) => id === active);
  const dragSession = useRef<{ pointerId: number; x: number; y: number; lastX: number; lastY: number; lastTime: number; velocityX: number; velocityY: number; axis: "horizontal" | "vertical" | null; scrollTop: number; scroller: HTMLElement | null } | null>(null);
  const didGesture = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragAxis, setDragAxis] = useState<"horizontal" | "vertical" | null>(null);
  const selectAdjacent = (direction: -1 | 1) => { const next = entries[activeIndex + direction]?.[0]; if (next) onSelect(next); };
  return <div className="app-bottom-nav-shell absolute inset-x-0 bottom-0 z-50" data-navigation-style="liquid-glass">
    <nav
      className="app-bottom-nav relative flex items-center"
      aria-label="メインナビゲーション"
      data-swipe-navigation="adjacent-screen"
      data-scroll-navigation="vertical-page-scroll"
      data-drag-axis={dragAxis ?? "idle"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const scroller = event.currentTarget.closest(".stitch-app")?.querySelector<HTMLElement>(".stitch-main-scroll .mobile-scroll") ?? null;
        dragSession.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), velocityX: 0, velocityY: 0, axis: null, scrollTop: scroller?.scrollTop ?? 0, scroller };
        didGesture.current = false;
        setDragOffset(0);
        setDragAxis(null);
      }}
      onPointerMove={(event) => {
        const session = dragSession.current;
        if (!session || session.pointerId !== event.pointerId) return;
        const dx = event.clientX - session.x;
        const dy = event.clientY - session.y;
        const now = performance.now();
        const elapsed = Math.max(1, now - session.lastTime);
        session.velocityX = (event.clientX - session.lastX) / elapsed;
        session.lastX = event.clientX;
        if (!session.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 7) {
          session.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
          didGesture.current = true;
          setDragAxis(session.axis);
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic QA events may not own a native pointer. */ }
        }
        if (session.axis === "horizontal") {
          event.preventDefault();
          const itemWidth = event.currentTarget.getBoundingClientRect().width / entries.length;
          const atStart = activeIndex === 0 && dx > 0;
          const atEnd = activeIndex === entries.length - 1 && dx < 0;
          const resistance = atStart || atEnd ? 0.28 : 0.72;
          setDragOffset(Math.max(-itemWidth * 0.82, Math.min(itemWidth * 0.82, dx * resistance)));
        } else if (session.axis === "vertical" && session.scroller) {
          event.preventDefault();
          session.scroller.scrollTop = session.scrollTop - dy;
          session.velocityY = (event.clientY - session.lastY) / elapsed;
          session.lastY = event.clientY;
        }
        session.lastTime = now;
      }}
      onPointerCancel={() => { dragSession.current = null; setDragOffset(0); setDragAxis(null); }}
      onPointerUp={(event) => {
        const session = dragSession.current;
        dragSession.current = null;
        if (!session || session.pointerId !== event.pointerId) return;
        const dx = session.lastX - session.x;
        if (session.axis === "horizontal") {
          const itemWidth = event.currentTarget.getBoundingClientRect().width / entries.length;
          const direction = Math.abs(session.velocityX) > 0.18 ? session.velocityX : dx;
          if (Math.abs(dx) >= itemWidth * 0.22 || Math.abs(session.velocityX) > 0.18) selectAdjacent(direction < 0 ? -1 : 1);
        }
        if (session.axis === "vertical" && session.scroller && Math.abs(session.velocityY) > 0.08) {
          const projected = Math.max(-420, Math.min(420, -session.velocityY * 170));
          const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
          session.scroller.scrollBy({ top: projected, behavior });
        }
        setDragOffset(0);
        setDragAxis(null);
        window.setTimeout(() => { didGesture.current = false; }, 180);
      }}
    >
      <span aria-hidden="true" className="app-bottom-nav__indicator" style={{ transform: `translateX(calc(${activeIndex * 100}% + ${dragOffset}px))` }} />
      {entries.map(([id, label, accessibleLabel, icon]) => <button type="button" key={id} aria-label={accessibleLabel} aria-current={active === id ? "page" : undefined} className={`app-bottom-nav__item relative z-10 flex flex-1 flex-col items-center justify-center border-0 bg-transparent ${active === id ? "is-active text-primary" : "text-[#8E8E93]"}`} onClick={() => { if (!didGesture.current) onSelect(id); }}><span className="app-bottom-nav__icon">{isValidElement(icon) ? cloneElement(icon as ReactElement<{ weight?: "fill" | "regular" }>, { weight: active === id ? "fill" : "regular" }) : icon}</span><span aria-hidden="true" className={`app-bottom-nav__label font-body leading-none ${active === id ? "font-bold" : "font-medium"}`}>{label}</span></button>)}
    </nav>
  </div>;
}

function DemoSettings({ themeMode, onThemeMode }: { themeMode: ThemeMode; onThemeMode: (mode: ThemeMode) => void }) {
  return <main className="px-4 pt-4 pb-8 space-y-5">
    <section className="bg-white rounded-[18px] p-4 border border-solid border-[#EEEEEE]">
      <h2 className="text-base mt-0">公開デモについて</h2>
      <p className="text-sm leading-6">2030年4月11日を例に、食事の予定と実績、運動、コンディションを試せます。すべて架空のデータです。数値や候補は画面・ロジックの検証用で、健康上の助言ではありません。</p>
      <p className="text-sm leading-6">操作した内容はこの画面を閉じるまで保持します。再読み込みすると初期状態に戻ります。</p>
      <button className="today-flow-action" onClick={() => window.location.reload()}>デモをリセット</button>
    </section>
    <section><h2 className="text-sm">表示</h2><div className="flex gap-2">
      {([["system", "システム"], ["light", "ライト"], ["dark", "ダーク"]] as [ThemeMode, string][]).map(([mode, label]) => <button key={mode} className="today-flow-action" aria-pressed={themeMode === mode} onClick={() => onThemeMode(mode)}>{label}</button>)}
    </div></section>
  </main>;
}

function loadHealthForView(qaCapture: boolean, bodyState: string | null) {
  const state = healthStateStore.load();
  if (qaCapture && bodyState === "partial") {
    const latest = state.daily.at(-1);
    if (latest) latest.scores = latest.scores.map((metric) => metric.key === "circulation" ? { ...metric, value: undefined, detail: "データなし" } : metric);
  }
  return state;
}

export default function Prototype() {
  const clock = useAppClock();
  const query = new URLSearchParams(window.location.search); const showStateSpecimen = query.get("state") === "specimen"; const qaCapture = query.get("qa") === "1";
  const requestedScreen = query.get("screen") || (qaCapture ? "meals" : "today"); const initialScreen = (["today", "meals", "move", "body"].includes(requestedScreen) ? requestedScreen : "today") as GlobalTab;
  const requestedBodyTab = query.get("bodyTab"); const initialBodyTab: BodyTab = requestedBodyTab === "labs" ? "labs" : "week";
  const requestedMoveTab = query.get("moveTab"); const initialMoveTab: MoveTab = requestedMoveTab === "history" ? "history" : requestedMoveTab === "menu" || requestedMoveTab === "patterns" ? "menu" : "week";
  const [globalTab, setGlobalTab] = useState<GlobalTab>(initialScreen); const [globalTransition, setGlobalTransition] = useState<{ direction: "left" | "right"; revision: number }>({ direction: "right", revision: 0 }); const [settingsOpen, setSettingsOpen] = useState(requestedScreen === "settings" || requestedScreen === "more"); const [themeMode, setThemeMode] = useState<ThemeMode>(() => { const stored = window.localStorage.getItem("ayumu-portfolio:theme:v1"); return stored === "light" || stored === "dark" ? stored : "system"; }); const [bodyTab, setBodyTab] = useState<BodyTab>(initialBodyTab); const [moveTab, setMoveTab] = useState<MoveTab>(initialMoveTab); const [health, setHealth] = useState<HealthState>(() => loadHealthForView(qaCapture, query.get("bodyState"))); const [bodySelectedDate, setBodySelectedDate] = useState(() => loadHealthForView(qaCapture, query.get("bodyState")).daily.at(-1)?.date ?? today()); const [moveSelectedDate, setMoveSelectedDate] = useState(today()); const [move, setMove] = useState<MoveState>(() => { const state = moveStateStore.load(); if (!qaCapture || state.records.length) return state; return { ...state, records: [{ id: "manual-upper-demo", date: today(), patternId: "upper", type: "筋力トレーニング", startedAt: `${today()}T18:30:00+09:00`, durationMinutes: 35, outcome: "complete", source: "manual" }, { id: "ring-demo", date: today(), type: "検出した運動", startedAt: `${today()}T18:32:00+09:00`, durationMinutes: 52, outcome: "complete", source: "ultrahuman", averageHeartRate: 121, activeCalories: 312 }] }; }); const [selectedMetric, setSelectedMetric] = useState<DailyHealthSummary["scores"][number] | null>(null); const [metricDetailState, setMetricDetailState] = useState<MetricDetailViewState | null>(null);
  const [planner, setPlanner] = useState<PlannerState>(() => plannerStateStore.load()); const [tab, setTab] = useState<TabId>("week"); const [weekStart, setWeekStart] = useState(weekStartFor(today())); const [selectedDate, setSelectedDate] = useState(today()); const [selectedSlot, setSelectedSlot] = useState<MealSlot>("dinner"); const [sheet, setSheet] = useState<SheetState>(null); const [selection, setSelection] = useState<Selection[]>([]); const [detailPortion, setDetailPortion] = useState(1); const [toast, setToast] = useState<string | null>(null);
  const previousToday = useRef(today());
  useEffect(() => { const before=previousToday.current; const next=today(); if(before===next)return; previousToday.current=next; setSelectedDate(value=>value===before?next:value); setMoveSelectedDate(value=>value===before?next:value); setBodySelectedDate(value=>value===before?next:value); setWeekStart(value=>value===weekStartFor(before)?weekStartFor(next):value); },[clock]);
  const [activeWorkout, setActiveWorkout] = useState<{ pattern: MovePattern; startedAt: number; sets: WorkoutSet[] } | null>(null);
  useEffect(() => { plannerStateStore.save(planner); }, [planner]);
  useEffect(() => { healthStateStore.saveLatestSummary(health); moveStateStore.save(move); }, [health, move]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 2200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { const media = window.matchMedia("(prefers-color-scheme: dark)"); const applyTheme = () => { const resolved = themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode; document.documentElement.dataset.ayumuTheme = resolved; }; window.localStorage.setItem("ayumu-portfolio:theme:v1", themeMode); applyTheme(); media.addEventListener("change", applyTheme); return () => media.removeEventListener("change", applyTheme); }, [themeMode]);
  useEffect(() => { if (qaCapture) return; const yesterday = addDays(today(), -1); if (move.records.some((record) => record.date === yesterday && record.source === "automatic-rest")) return; const plannedRest = move.recommendations.find((item) => item.date === yesterday && move.patterns.find((pattern) => pattern.id === item.main.patternId)?.category === "rest"); const highIntensityDetected = move.records.some((record) => record.date === yesterday && record.source === "ultrahuman" && (record.intensity === "hard" || (record.averageHeartRate ?? 0) >= 140)); if (!plannedRest || highIntensityDetected) return; const restPattern = move.patterns.find((pattern) => pattern.id === plannedRest.main.patternId); setMove((current) => ({ ...current, records: [...current.records, { id: `rest-auto-${yesterday}`, date: yesterday, patternId: restPattern?.id, type: restPattern?.name || "休息日", durationMinutes: 0, outcome: "complete", source: "automatic-rest" }] })); }, [move, qaCapture]);
  useEffect(() => { setMove((current) => { let changed = false; const records = current.records.map((record) => { const classified = applyDetectedWorkoutClassification(record, current.patterns); if (classified !== record) changed = true; return classified; }); return changed ? { ...current, records } : current; }); }, []);
  const allRecipes = useMemo(() => [...recipes, ...planner.customRecipes], [planner.customRecipes]); const recipesById = useMemo(() => new Map(allRecipes.map((recipe) => [recipe.id, recipe])), [allRecipes]); const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]); const dayPlans = useMemo(() => planner.plans.filter((plan) => plan.date === selectedDate).sort((a, b) => a.order - b.order), [planner.plans, selectedDate]);
  const metrics = useMemo<DayMetric[]>(() => mealMetricsForDates(dates, planner, recipesById), [dates, planner, recipesById]);
  const mealTimelineDates = useMemo(() => Array.from({ length: 70 }, (_, index) => addDays(today(), index - 34)), [clock]);
  const mealTimelineMetrics = useMemo(() => mealMetricsForDates(mealTimelineDates, planner, recipesById), [mealTimelineDates, planner, recipesById]);
  const wellnessRevision = "portfolio-example-v1"; const latestBodyScore = health.daily.at(-1)?.bodyScore; const allowedMoveCandidates = useMemo(() => buildMoveCandidates(move, today(), latestBodyScore), [move, latestBodyScore, clock]); const savedRecommendation = move.recommendations.find((item) => item.date === today() && isMoveRecommendation(item, allowedMoveCandidates, wellnessRevision, today())); const recommendation = savedRecommendation ?? deterministicRecommendation(move, today(), wellnessRevision, latestBodyScore);
  const substituteCandidates = allowedMoveCandidates.filter((candidate) => candidate.role === "main" && candidate.patternId !== recommendation.main.patternId);
  const emptyMeals = dates.reduce((sum, date) => sum + (["breakfast", "lunch", "dinner"] as MealSlot[]).filter((slot) => !planner.plans.some((plan) => plan.date === date && plan.slot === slot)).length, 0);
  const selectedRecipe = sheet?.kind === "recipe" ? recipesById.get(sheet.recipeId) : undefined; const selectedPlan = sheet?.kind === "recipe" && sheet.planId ? planner.plans.find((plan) => plan.id === sheet.planId) : undefined; const selectedActual = selectedPlan ? planner.actuals.find((actual) => actual.planId === selectedPlan.id) : undefined; const recordPlan = sheet?.kind === "record" ? planner.plans.find((plan) => plan.id === sheet.planId) : undefined; const recordRecipe = recordPlan ? recipesById.get(recordPlan.recipeId) : undefined; const editingActual = sheet?.kind === "editActual" ? planner.actuals.find((actual) => actual.id === sheet.actualId) : undefined; const editingPlan = editingActual?.planId ? planner.plans.find((plan) => plan.id === editingActual.planId) : undefined; const editingRecipe = editingActual ? recipesById.get(editingActual.recipeId) : undefined; const editingPlannedRecipe = editingPlan ? recipesById.get(editingPlan.recipeId) : undefined;
  const quickPattern = sheet?.kind === "quickMove" ? patternById(move, sheet.patternId) : undefined; const detectedRing = sheet?.kind === "detectedMove" ? move.records.find((record) => record.id === sheet.ringId) : undefined; const editingPattern = sheet?.kind === "pattern" && sheet.patternId ? patternById(move, sheet.patternId) : undefined; const feedbackRecord = sheet?.kind === "workoutFeedback" ? move.records.find((record) => record.id === sheet.recordId) : undefined;
  const openMetricDetail = (metric: DailyHealthSummary["scores"][number]) => { const latestDate = health.daily.at(-1)?.date ?? today(); setMetricDetailState((current) => current?.metricKey === metric.key ? current : { metricKey: metric.key, range: "7", periodOffset: periodOffsetForDate(latestDate, bodySelectedDate, "7"), selectedDate: bodySelectedDate, scrollTop: 0 }); setSelectedMetric(metric); };
  const openRecipe = (recipe: Recipe, planId?: string) => { setDetailPortion(1); setSheet({ kind: "recipe", recipeId: recipe.id, planId }); }; const openAdd = (slot: MealSlot) => { setSelectedSlot(slot); setSelection([]); setSheet({ kind: "add" }); };
  const addPlan = (recipeId: string) => { setPlanner((current) => ({ ...current, plans: [...current.plans, { id: `plan-${crypto.randomUUID()}-${recipeId}`, date: selectedDate, slot: selectedSlot, recipeId, portion: detailPortion, order: current.plans.filter((plan) => plan.date === selectedDate).length }] })); setSheet(null); setTab("week"); setToast(`${formatShortDate(selectedDate)}の${slotLabels[selectedSlot]}に追加しました`); };
  const addSelection = () => { const now = crypto.randomUUID(); setPlanner((current) => ({ ...current, plans: [...current.plans, ...selection.map((item, index) => ({ id: `plan-${now}-${index}`, date: selectedDate, slot: selectedSlot, recipeId: item.recipeId, portion: item.portion, order: current.plans.filter((plan) => plan.date === selectedDate).length + index }))] })); setSheet(null); setSelection([]); setToast(`${selection.length}品を予定に追加しました`); };
  const recordActual = (plan: Plan, skipped = false) => { const recipe = recipesById.get(plan.recipeId); if (!recipe) return; const n = scaledNutrition(recipe, plan.portion); setPlanner((current) => current.actuals.some((item) => item.planId === plan.id) ? current : ({ ...current, actuals: [...current.actuals.filter((actual) => actual.planId !== plan.id), { id: `actual-${crypto.randomUUID()}`, planId: plan.id, date: plan.date, slot: plan.slot, recipeId: plan.recipeId, calories: skipped ? 0 : Math.round(n.calories), protein: skipped ? 0 : Math.round(n.protein), portion: plan.portion ?? 1, nutrition: skipped ? {calories:0,protein:0,fat:0,carbs:0,fiber:0} : scaledRecipeNutrition(recipe,plan.portion ?? 1), recipeSnapshot: {name:recipe.name}, skipped, recordedAt: new Date().toISOString() }] })); setSheet(null); setToast(skipped ? "食べなかったとして記録しました" : "予定どおり記録しました"); };
  const toggleActual = (plan: Plan) => { const existing = planner.actuals.find((actual) => actual.planId === plan.id); if (existing) { setPlanner((current) => ({ ...current, actuals: current.actuals.filter((actual) => actual.id !== existing.id) })); setToast("食べた記録を取り消しました"); return; } const recipe = recipesById.get(plan.recipeId); if (!recipe) return; const n = scaledNutrition(recipe, plan.portion); setPlanner((current) => ({ ...current, actuals: [...current.actuals, { id: `actual-${crypto.randomUUID()}`, planId: plan.id, date: plan.date, slot: plan.slot, recipeId: plan.recipeId, calories: Math.round(n.calories), protein: Math.round(n.protein), portion: plan.portion ?? 1, nutrition: scaledRecipeNutrition(recipe,plan.portion ?? 1), recipeSnapshot:{name:recipe.name}, recordedAt: new Date().toISOString() }] })); setToast("食べた記録に追加しました"); };
  const removePlan = (plan: Plan) => { setPlanner((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== plan.id) })); setSheet(null); setToast("予定から外しました"); };
  const saveActual = (actual: Actual, recipe: Recipe, portion: number) => { const n = scaledNutrition(recipe, portion); setPlanner((current) => ({ ...current, actuals: current.actuals.map((item) => item.id === actual.id ? { ...item, calories: Math.round(n.calories), protein: Math.round(n.protein), portion, nutrition: scaledRecipeNutrition(recipe,portion), recipeSnapshot:{name:recipe.name}, skipped:false, review:undefined, edited: true } : item) })); setSheet(null); setToast("変更を保存しました"); };
  const markSkipped = (actual: Actual) => { setPlanner((current) => ({ ...current, actuals: current.actuals.map((item) => item.id === actual.id ? { ...item, calories: 0, protein: 0, nutrition:{calories:0,protein:0,fat:0,carbs:0,fiber:0}, skipped: true, edited: true } : item) })); setSheet(null); setToast("食べなかったに変更しました"); };
  const deleteActual = (actual: Actual) => { setPlanner((current) => ({ ...current, actuals: current.actuals.filter((item) => item.id !== actual.id) })); setSheet(null); setToast("記録を削除しました"); };
  const startWorkout = (pattern: MovePattern) => { if (pattern.category === "rest") { setMove((current) => ({ ...current, records: [...current.records, { id: `rest-${crypto.randomUUID()}`, date: today(), patternId: pattern.id, type: pattern.name, durationMinutes: 0, outcome: "complete", source: "automatic-rest" }] })); setToast("休息日として記録しました"); return; } const previous = move.records.filter((record) => record.patternId === pattern.id && record.sets?.length).sort((a, b) => b.date.localeCompare(a.date))[0]; const sets = pattern.exercises.flatMap((exercise) => Array.from({ length: exercise.defaultSets || 1 }, (_, index): WorkoutSet => { const prior = previous?.sets?.find((set) => set.exerciseId === exercise.id && set.set === index + 1); return { exerciseId: exercise.id, set: index + 1, weightKg: prior?.weightKg ?? exercise.defaultWeightKg, reps: prior?.reps ?? exercise.defaultReps, completed: false }; })); setActiveWorkout({ pattern, startedAt: Date.now(), sets }); };
  const finishWorkout = (outcome: "complete" | "partial") => { if (!activeWorkout) return; const minutes = Math.max(1, Math.round((Date.now() - activeWorkout.startedAt) / 60000)); const record: MoveRecord = { id: `move-${crypto.randomUUID()}`, date: today(), patternId: activeWorkout.pattern.id, type: activeWorkout.pattern.name, startedAt: new Date(activeWorkout.startedAt).toISOString(), durationMinutes: minutes, intensity: activeWorkout.pattern.defaultIntensity, outcome, source: "manual", sets: activeWorkout.sets, perceivedIntensity: "moderate" }; setMove((current) => ({ ...current, records: [...current.records, record] })); setActiveWorkout(null); setSheet({ kind: "workoutFeedback", recordId: record.id }); };
  const quickRecord = (pattern: MovePattern, minutes: number) => { setMove((current) => ({ ...current, records: [...current.records, { id: `move-${crypto.randomUUID()}`, date: today(), patternId: pattern.id, type: pattern.name, durationMinutes: minutes, intensity: pattern.defaultIntensity, outcome: "complete", source: "manual" }] })); setSheet(null); setToast(`${pattern.name}を記録しました`); };
  const savePattern = (pattern: MovePattern) => { setMove((current) => ({ ...current, patterns: current.patterns.some((item) => item.id === pattern.id) ? current.patterns.map((item) => item.id === pattern.id ? pattern : item) : [...current.patterns, pattern] })); setSheet(null); setToast("パターンを保存しました"); };
  const selectSubstitute = (candidate: MoveCandidate) => { setMove((current) => ({ ...current, recommendations: [...current.recommendations.filter((item) => item.date !== today()), { ...recommendation, id: `substitute-${today()}-${candidate.patternId}-${crypto.randomUUID()}`, generatedAt: new Date().toISOString(), source: "deterministic", inputRevision: wellnessRevision, main: candidate, rationale: `${patternById(current, candidate.patternId)?.name ?? "代替メニュー"}に変更しました。` }] })); setSheet(null); setToast("今日のおすすめを変更しました"); };
  const mergeDetected = (ring: MoveRecord, manual: MoveRecord) => { const merged = mergeDetectedWorkout(ring, manual); setMove((current) => ({ ...current, records: [...current.records.filter((record) => record.id !== ring.id && record.id !== manual.id), merged] })); setSheet(null); setToast("運動記録をまとめました"); };
  const duplicatePattern = (id: string) => { const source = move.patterns.find((pattern) => pattern.id === id); if (!source) return; const copy = { ...structuredClone(source), id: `${source.id}-copy-${crypto.randomUUID()}`, name: `${source.name}（コピー）`, enabled: false }; setMove((current) => ({ ...current, patterns: [...current.patterns, copy] })); setToast(`${source.name}を複製しました`); };
  const selectGlobalTab = (next: GlobalTab) => { const order: GlobalTab[] = ["today", "meals", "move", "body"]; const currentIndex = order.indexOf(globalTab); const nextIndex = order.indexOf(next); setSettingsOpen(false); setSelectedMetric(null); setSheet(null); if (next !== globalTab) { setGlobalTransition((current) => ({ direction: nextIndex > currentIndex ? "right" : "left", revision: current.revision + 1 })); setGlobalTab(next); } if (next === "meals") { setTab("week"); setWeekStart(weekStartFor(today())); setSelectedDate(today()); } };
  return <div className={`stitch-app absolute inset-0 bg-[#F4F4F4] flex flex-col overflow-hidden font-body text-[#333333] ${qaCapture ? "qa-capture" : ""}`}>
    <div className="portfolio-disclosure">公開デモ · 架空データ · 2030/4/11</div>
    <div className="contents">
    {settingsOpen ? <SettingsHeader onBack={() => setSettingsOpen(false)} /> : globalTab === "body" ? <BodyHeader tab={bodyTab} selectedDate={bodySelectedDate} onTab={setBodyTab} onDate={setBodySelectedDate} /> : globalTab === "move" ? <MoveHeader tab={moveTab} selectedDate={moveSelectedDate} onTab={setMoveTab} onDate={setMoveSelectedDate} /> : globalTab === "meals" ? <StitchHeader tab={tab} selectedDate={selectedDate} onTab={setTab} onDate={(date) => { setSelectedDate(date); setWeekStart(weekStartFor(date)); }} /> : <SimpleHeader title="今日" onSettings={() => setSettingsOpen(true)} />}
    <MobileScroll key={`${settingsOpen ? "settings" : globalTab}-${bodyTab}-${moveTab}-${tab}`} className={`stitch-main-scroll ${settingsOpen ? "bottom-0 compact-header" : "bottom-[104px]"} ${!settingsOpen && globalTab === "today" ? "compact-header" : ""} ${!settingsOpen && globalTab === "body" ? "body-standard-scroll" : ""}`}>
      <div key={`${globalTab}-${globalTransition.revision}`} data-design-component="global-screen-transition" data-transition-direction={globalTransition.direction} className={`global-screen-transition global-screen-transition--${globalTransition.direction}`}>
      {settingsOpen ? <DemoSettings themeMode={themeMode} onThemeMode={setThemeMode} /> : globalTab === "today" ? <TodayView planner={planner} health={health} move={move} recommendation={recommendation} substitutes={substituteCandidates} onStart={startWorkout} onQuick={(pattern) => setSheet({ kind: "quickMove", patternId: pattern.id })} onDetected={(record) => setSheet({ kind: "detectedMove", ringId: record.id })} onSubstitute={() => setSheet({ kind: "substituteMove" })} onAddPattern={() => setSheet({ kind: "pattern" })} onTab={selectGlobalTab} onAddMeal={(slot) => { setSelectedDate(today()); openAdd(slot); }} onPlan={(plan) => { const recipe = recipesById.get(plan.recipeId); if (recipe) { setSelectedDate(today()); setSelectedSlot(plan.slot); openRecipe(recipe, plan.id); } }} onActual={(actual) => setSheet({ kind: "editActual", actualId: actual.id })} onRecord={(plan) => setSheet({ kind: "record", planId: plan.id })} /> : globalTab === "body" ? bodyTab === "week" ? <BodyWeek health={health} missing={query.get("bodyState") === "missing"} selectedDate={bodySelectedDate} onDate={setBodySelectedDate} onMetric={openMetricDetail} /> : <BodyLabs health={health} /> : globalTab === "move" ? moveTab === "week" ? <MoveToday move={move} health={health} selectedDate={moveSelectedDate} onDate={setMoveSelectedDate} /> : moveTab === "history" ? <MoveHistory move={move} health={health} /> : <MovePatterns move={move} onToggle={(id) => setMove((current) => ({ ...current, patterns: current.patterns.map((pattern) => pattern.id === id ? { ...pattern, enabled: !pattern.enabled } : pattern) }))} onEdit={(id) => setSheet({ kind: "pattern", patternId: id })} onDuplicate={duplicatePattern} /> : showStateSpecimen ? <StateSpecimen onRetry={() => setToast("再同期しました")} /> : tab === "week" ? <main className="pb-8 px-4 pt-4 space-y-5"><WeekSummary metrics={metrics} timelineMetrics={mealTimelineMetrics} selectedDate={selectedDate} weekTarget={planner.weekTargetCalories} dailyTarget={planner.dailyTargets.calories} proteinTarget={planner.dailyTargets.protein} emptyMeals={emptyMeals} onSelect={(date) => { setSelectedDate(date); setWeekStart(weekStartFor(date)); }} /><DailyMeals date={selectedDate} plans={dayPlans} actuals={planner.actuals} recipesById={recipesById} onOpen={(plan) => { const actual = planner.actuals.find((item) => item.planId === plan.id); if (actual) setSheet({ kind: "editActual", actualId: actual.id }); else { const recipe = recipesById.get(plan.recipeId); if (recipe) openRecipe(recipe, plan.id); } }} onOpenActual={(actual) => setSheet({ kind: "editActual", actualId: actual.id })} onAdd={openAdd} onRecord={(plan) => setSheet({ kind: "record", planId: plan.id })} /><button type="button" className="w-full min-h-11 px-2 text-primary text-[12px] font-bold flex items-center justify-center gap-1 bg-transparent border-0" onClick={() => setTab("candidates")}>メニューをもっと見る<CaretRight size={16} /></button></main> : tab === "candidates" ? <CandidatesView recipesList={allRecipes} onOpen={(recipe) => openRecipe(recipe)} /> : <HistoryView actuals={planner.actuals} plans={planner.plans} recipesById={recipesById} dates={dates} onOpen={(actual) => setSheet({ kind: "editActual", actualId: actual.id })} />}
      </div>
    </MobileScroll>
    {!settingsOpen ? <BottomNavigation active={globalTab} onSelect={selectGlobalTab} /> : null}
    {toast ? <div className="absolute z-[70] bottom-20 left-1/2 -translate-x-1/2 bg-charcoal text-white text-xs px-4 py-2 rounded-full shadow-sm whitespace-nowrap" role="status">{toast}</div> : null}
    {sheet?.kind === "recipe" && selectedRecipe ? <RecipeScreen recipe={selectedRecipe} plan={selectedPlan} actual={selectedActual} selectedDate={selectedDate} selectedSlot={selectedSlot} portion={detailPortion} onClose={() => setSheet(null)} onPortion={setDetailPortion} onSlot={setSelectedSlot} onAdd={() => addPlan(selectedRecipe.id)} onToggleActual={() => selectedPlan && toggleActual(selectedPlan)} onRemove={() => selectedPlan && removePlan(selectedPlan)} /> : null}
    <BottomSheet open={Boolean(sheet && sheet.kind !== "recipe")} onOpenChange={(open) => { if (!open) setSheet(null); }} title={sheet?.kind === "add" ? `${slotLongLabels[selectedSlot]}に追加` : sheet?.kind === "record" ? `${recordPlan ? slotLongLabels[recordPlan.slot] : "食事"}を記録` : sheet?.kind === "editActual" ? `${editingActual ? slotLongLabels[editingActual.slot] : "食事"}の記録を修正` : sheet?.kind === "quickMove" ? quickPattern?.name || "運動を記録" : sheet?.kind === "detectedMove" ? "検出した運動を確認" : sheet?.kind === "substituteMove" ? "別の運動を選ぶ" : sheet?.kind === "pattern" ? editingPattern ? "パターンを編集" : "パターンを追加" : sheet?.kind === "workoutFeedback" ? "運動を振り返る" : ""} description={sheet?.kind === "add" ? `${weekdayLabels[(new Date(`${selectedDate}T12:00:00Z`).getUTCDay() + 6) % 7]} ${formatShortDate(selectedDate)}` : sheet?.kind === "editActual" && editingActual ? `${formatShortDate(editingActual.date)}・編集済み` : undefined} snap={sheet?.kind === "add" || sheet?.kind === "editActual" || sheet?.kind === "pattern" || sheet?.kind === "substituteMove" ? .86 : .64}>
      {sheet?.kind === "add" ? <AddSheet recipesList={allRecipes} selected={selection} setSelected={setSelection} onOpen={openRecipe} onAdd={addSelection} onClose={() => setSheet(null)} /> : sheet?.kind === "record" && recordPlan && recordRecipe ? <RecordSheet plan={recordPlan} recipe={recordRecipe} onAsPlanned={() => recordActual(recordPlan)} onDifferent={() => { setSelectedSlot(recordPlan.slot); setSelection([]); setSheet({ kind: "add" }); }} onSkipped={() => recordActual(recordPlan, true)} onClose={() => setSheet(null)} /> : sheet?.kind === "editActual" && editingActual && editingRecipe ? <ActualEditSheet onKeep={()=>{setPlanner(current=>({...current,actuals:current.actuals.map(a=>a.id===editingActual.id?{...a,review:undefined}:a)}));setSheet(null);setToast("記録を残しました");}} actual={editingActual} plan={editingPlan} recipe={editingRecipe} plannedRecipe={editingPlannedRecipe} onSave={(portion) => saveActual(editingActual, editingRecipe, portion)} onSkipped={() => markSkipped(editingActual)} onDelete={() => deleteActual(editingActual)} onReplace={() => { setSelectedSlot(editingActual.slot); setSelection([]); setSheet({ kind: "add" }); }} onClose={() => setSheet(null)} /> : sheet?.kind === "quickMove" && quickPattern ? <QuickMoveSheet pattern={quickPattern} onSave={(minutes) => quickRecord(quickPattern, minutes)} onClose={() => setSheet(null)} /> : sheet?.kind === "substituteMove" ? <MoveSubstituteSheet move={move} candidates={substituteCandidates} onSelect={selectSubstitute} onClose={() => setSheet(null)} /> : sheet?.kind === "detectedMove" && detectedRing ? <DetectedMoveSheet ring={detectedRing} move={move} onMerge={(manual) => mergeDetected(detectedRing, manual)} onKeep={() => { setMove((current) => ({ ...current, records: current.records.map((record) => record.id === detectedRing.id ? { ...record, patternId: record.patternId ?? record.classification?.suggestedPatternId, linkedRecordIds: [record.id] } : record) })); setSheet(null); }} onIgnore={() => { setMove((current) => ({ ...current, records: current.records.filter((record) => record.id !== detectedRing.id) })); setSheet(null); }} onClose={() => setSheet(null)} /> : sheet?.kind === "pattern" ? <PatternSheet pattern={editingPattern} onSave={savePattern} onClose={() => setSheet(null)} /> : sheet?.kind === "workoutFeedback" && feedbackRecord ? <WorkoutFeedbackSheet record={feedbackRecord} onSave={(outcome, intensity, unwell, bodyAreaAvoided) => { const updated = { ...feedbackRecord, outcome, perceivedIntensity: intensity, unwell, bodyAreaAvoided }; setMove((current) => ({ ...current, records: current.records.map((record) => record.id === updated.id ? updated : record) })); const next = nextLoadSuggestion(updated); setSheet(null); setToast(next != null ? `次回の目安 ${next}kg` : "振り返りを保存しました"); }} /> : null}
    </BottomSheet>
    {selectedMetric && metricDetailState ? <MetricDetailScreen metric={selectedMetric} health={health} initialState={metricDetailState} onClose={(state) => { setMetricDetailState(state); setBodySelectedDate(state.selectedDate); setSelectedMetric(null); }} /> : null}
    {activeWorkout ? <ActiveWorkout pattern={activeWorkout.pattern} startedAt={activeWorkout.startedAt} sets={activeWorkout.sets} onSet={(sets) => setActiveWorkout((current) => current ? { ...current, sets } : current)} onFinish={finishWorkout} onClose={() => setActiveWorkout(null)} /> : null}
    </div>
  </div>;
}
