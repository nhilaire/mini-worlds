// Route model: three tabs and a stack of screens pushed on top. Pure helpers, unit-tested.
import type { GameId, WorldId } from './game/core/content';
import type { RoundResult } from './game/core/engine';

export type Tab = 'home' | 'games' | 'profile';

export type Route =
  | { name: 'world'; world: WorldId }
  | { name: 'sheet'; game: GameId }
  | { name: 'upgrades'; game: GameId }
  | { name: 'game'; game: GameId; seed: number }
  | { name: 'result'; game: GameId; result: RoundResult }
  | { name: 'daily' }
  | { name: 'settings' }
  | { name: 'about' };

export type Navigation = { tab: Tab; stack: Route[] };

export const initialNavigation: Navigation = { tab: 'home', stack: [] };

export function push(nav: Navigation, route: Route): Navigation {
  return { ...nav, stack: [...nav.stack, route] };
}

/** Replaces the top route (result → game replay, game → result). */
export function replace(nav: Navigation, route: Route): Navigation {
  return { ...nav, stack: [...nav.stack.slice(0, -1), route] };
}

export function pop(nav: Navigation): Navigation {
  return nav.stack.length === 0 ? nav : { ...nav, stack: nav.stack.slice(0, -1) };
}

/** Pops until a route of the given name is on top (or the stack is empty). */
export function popTo(nav: Navigation, name: Route['name']): Navigation {
  const index = nav.stack.map((r) => r.name).lastIndexOf(name);
  return { ...nav, stack: index < 0 ? [] : nav.stack.slice(0, index + 1) };
}

export function selectTab(nav: Navigation, tab: Tab): Navigation {
  return { tab, stack: [] };
}

export function current(nav: Navigation): Route | null {
  return nav.stack[nav.stack.length - 1] ?? null;
}
