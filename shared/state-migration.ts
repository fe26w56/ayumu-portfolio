/** Additive, non-destructive migration for historical duplicate plan links.
 * Keeps every actual and its nutrition; the first link matches legacy UI's find().
 * Further links keep their original target as an explicit review item.
 */
export function migratePlanner<T>(input:T):T {
 if(!input || typeof input!=='object')return input;
 const state=structuredClone(input) as Record<string, unknown>;
 if(!Array.isArray(state.actuals))return input;
 const seen=new Set<string>();
 state.actuals=state.actuals.map((actual: unknown)=>{
   if(!actual || typeof actual !== 'object' || !('planId' in actual) || typeof actual.planId!=='string')return actual;
   if(!seen.has(actual.planId)){seen.add(actual.planId);return actual;}
   const {planId,...rest}=actual;
   return {...rest,review:{reason:'duplicate-plan-link',planId}};
 });
 return state as T;
}
