// Icon of the game « laser » (12×12): a red beam turns on a leaning mirror and goes up to a square target.
import type { Sprite } from '../sprites';

export const ICON: Sprite = {
  legend: { k: 'outline', r: 'red', s: 'sky', y: 'yellow' },
  rows: [
    '......kkkk..',
    '......kyyk..',
    '......kyyk..',
    '......kkkk..',
    '.......rr..s',
    '.......rr.ss',
    'kk.....rrss.',
    'krrrrrrrss..',
    'krrrrrrss...',
    'kk....ss....',
    '.....ss.....',
    '....ss......',
  ],
};
