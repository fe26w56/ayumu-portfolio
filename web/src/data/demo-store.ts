/** Session-only, validated copies. No network and no operational cache access. */
export function createDemoStore<T>(seed: T, validate: (value: unknown) => value is T) {
  const initial = structuredClone(seed);
  let state = structuredClone(initial);
  if (!validate(state)) throw new Error("Invalid demo fixture");
  return {
    load() { return structuredClone(state); },
    save(next: T) {
      if (!validate(next)) throw new Error("Invalid demo state");
      state = structuredClone(next);
    },
    reset() { state = structuredClone(initial); },
  };
}
