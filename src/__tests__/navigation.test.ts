import { current, initialNavigation, pop, popTo, push, replace, selectTab } from '../navigation';

describe('navigation model', () => {
  it('pushes, pops and replaces routes on top of the active tab', () => {
    let nav = push(initialNavigation, { name: 'sheet', game: 'blocks' });
    nav = push(nav, { name: 'game', game: 'blocks', seed: 1 });
    expect(current(nav)?.name).toBe('game');
    nav = replace(nav, { name: 'daily' });
    expect(nav.stack.map((r) => r.name)).toEqual(['sheet', 'daily']);
    nav = pop(nav);
    expect(current(nav)?.name).toBe('sheet');
    expect(pop(pop(nav))).toEqual({ tab: 'home', stack: [] });
  });

  it('popTo unwinds to a named route or empties the stack', () => {
    let nav = push(initialNavigation, { name: 'world', world: 'arcade' });
    nav = push(nav, { name: 'sheet', game: 'blocks' });
    nav = push(nav, { name: 'upgrades', game: 'blocks' });
    expect(popTo(nav, 'sheet').stack.map((r) => r.name)).toEqual(['world', 'sheet']);
    expect(popTo(nav, 'daily').stack).toEqual([]);
  });

  it('selecting a tab clears the stack', () => {
    const nav = push(initialNavigation, { name: 'settings' });
    expect(selectTab(nav, 'games')).toEqual({ tab: 'games', stack: [] });
    expect(current(initialNavigation)).toBeNull();
  });
});
