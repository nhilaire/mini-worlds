// Icons of the v0.2.0 games (one file per game in src/art/icons, each a 12×12 sprite).
import type { GameId } from '../game/core/content';
import type { Sprite } from './sprites';
import { ICON as tower } from './icons/tower';
import { ICON as hop } from './icons/hop';
import { ICON as lights } from './icons/lights';
import { ICON as pipes } from './icons/pipes';
import { ICON as flood } from './icons/flood';
import { ICON as socks } from './icons/socks';
import { ICON as twentyone } from './icons/twentyone';
import { ICON as candles } from './icons/candles';
import { ICON as parrot } from './icons/parrot';
import { ICON as moles } from './icons/moles';
import { ICON as fruit } from './icons/fruit';
import { ICON as slide } from './icons/slide';
import { ICON as cardline } from './icons/cardline';
import { ICON as marbles } from './icons/marbles';
import { ICON as quicksum } from './icons/quicksum';
import { ICON as army } from './icons/army';
import { ICON as merge } from './icons/merge';
import { ICON as maze } from './icons/maze';
import { ICON as trail } from './icons/trail';
import { ICON as treasure } from './icons/treasure';

export type IconGameId = Exclude<GameId, 'blocks' | 'garden' | 'bubbles'>;

export const GAME_ICONS: Record<IconGameId, Sprite> = { tower, hop, lights, pipes, flood, socks, twentyone, candles, parrot, moles, fruit, slide, cardline, marbles, quicksum, army, merge, maze, trail, treasure };
