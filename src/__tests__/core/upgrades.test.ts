import { purchaseUpgrade } from '../../game/core/engine';
import { defaultSave, Save } from '../../game/core/save';
import { affordableUpgrades, buyUpgrade, canBuyUpgrade, nextUpgradeCost, upgradeLevels } from '../../game/core/upgrades';

function withCoins(coins: number): Save {
  const save = defaultSave();
  return { ...save, profile: { ...save.profile, coins } };
}

describe('upgrades (AC-10)', () => {
  it('costs 100 / 250 / 500 for levels 1 / 2 / 3, then is maxed', () => {
    let save = withCoins(1000);
    expect(nextUpgradeCost(save, 'blocks', 'preview')).toBe(100);
    save = (buyUpgrade(save, 'blocks', 'preview') as { save: Save }).save;
    expect(nextUpgradeCost(save, 'blocks', 'preview')).toBe(250);
    save = (buyUpgrade(save, 'blocks', 'preview') as { save: Save }).save;
    expect(nextUpgradeCost(save, 'blocks', 'preview')).toBe(500);
    save = (buyUpgrade(save, 'blocks', 'preview') as { save: Save }).save;
    expect(nextUpgradeCost(save, 'blocks', 'preview')).toBeNull();
    expect(buyUpgrade(save, 'blocks', 'preview')).toMatchObject({ refused: 'maxed' });
    expect(save.profile.coins).toBe(150);
    expect(save.games.blocks.upgrades.preview).toBe(3);
  });

  it('with 300 coins: level 1 bought (200 left), level 2 refused as unaffordable', () => {
    const first = buyUpgrade(withCoins(300), 'garden', 'extra_move');
    expect(first).toMatchObject({ level: 1, cost: 100 });
    const save = (first as { save: Save }).save;
    expect(save.profile.coins).toBe(200);
    expect(save.profile.upgradesBought).toBe(1);
    const second = buyUpgrade(save, 'garden', 'extra_move');
    expect(second).toMatchObject({ refused: 'unaffordable' });
    expect((second as { save: Save }).save).toBe(save);
    expect(canBuyUpgrade(save, 'garden', 'extra_move')).toBe(false);
    expect(canBuyUpgrade(save, 'garden', 'cascade')).toBe(true);
  });

  it('refuses an upgrade that does not belong to the game', () => {
    expect(buyUpgrade(withCoins(1000), 'blocks', 'aim')).toMatchObject({ refused: 'unknown' });
  });

  it('counts affordable upgrades for the sheet badge and exposes levels for the engines', () => {
    expect(affordableUpgrades(withCoins(0), 'bubbles')).toBe(0);
    expect(affordableUpgrades(withCoins(100), 'bubbles')).toBe(3);
    expect(upgradeLevels(withCoins(0), 'bubbles')).toEqual({ aim: 0, next: 0, coins: 0 });
  });

  it('a purchase unlocks « Bricoleur » and the third level « Expert »', () => {
    let save = withCoins(2000);
    const first = purchaseUpgrade(save, 'blocks', 'coins');
    expect(first.achievementsUnlocked).toEqual(['first_upgrade']);
    save = first.save;
    expect(save.profile.coins).toBe(2000 - 100 + 50);
    save = purchaseUpgrade(save, 'blocks', 'coins').save;
    const third = purchaseUpgrade(save, 'blocks', 'coins');
    expect(third.achievementsUnlocked).toEqual(['maxed_upgrade']);
  });
});
