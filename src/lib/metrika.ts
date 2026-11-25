const COUNTER_ID = 114671329;

type YmFn = (...args: unknown[]) => void;

function ym(): YmFn | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as { ym?: YmFn }).ym;
  return typeof fn === 'function' ? fn : null;
}

// Fire-and-forget: never throws, never blocks UI, sends nothing but the goal name
export function reachGoal(name: string) {
  try {
    ym()?.(COUNTER_ID, 'reachGoal', name);
  } catch {
    // analytics must never break the app
  }
}

export function hit(url?: string) {
  try {
    ym()?.(COUNTER_ID, 'hit', url ?? window.location.href);
  } catch {
    // analytics must never break the app
  }
}
