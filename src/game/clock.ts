// Injectable clock: the only place that reads the device time. Tests and the seed deep link override it.
import { localDate } from './core/daily';

let nowImpl: () => number = () => Date.now();

export function now(): number {
  return nowImpl();
}

/** Local date of now, YYYY-MM-DD. */
export function today(): string {
  return localDate(now());
}

/** Replaces the clock (tests); returns a function that restores the previous one. */
export function setClock(impl: () => number): () => void {
  const previous = nowImpl;
  nowImpl = impl;
  return () => {
    nowImpl = previous;
  };
}
