// Outside services the Worker talks to. Routes and jobs receive them as `deps`
// so tests can swap in fakes; production builds them from env in realDeps().

export interface Deps {
  now: () => Date;
  /** Outbound HTTP (channel feeds). */
  fetch: typeof fetch;
}

export function realDeps(_env: Env): Deps {
  return {
    now: () => new Date(),
    fetch: (input, init) => fetch(input, init),
  };
}
