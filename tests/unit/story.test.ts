import { describe, expect, it } from 'vitest';
import { CHAPTER_NAMES } from '../../src/meta/progress';
import {
  CHAPTER_LINES,
  ENDING,
  INTRO,
  STORY_KEYS,
  storyBeforeLevel,
  storySoFar,
} from '../../src/game/story';

const none = () => false;
const seenAll = () => true;

describe('story', () => {
  it('the intro and the chapter 1 card come before a first level 1', () => {
    const { pages, keys } = storyBeforeLevel(0, none, false);
    expect(pages.map((p) => p.art)).toEqual([...INTRO.map((p) => p.art), 'chapter']);
    expect(keys).toEqual([STORY_KEYS.intro, STORY_KEYS.chapter(0)]);
  });

  it('each chapter card shows before its first level, once', () => {
    const { pages, keys } = storyBeforeLevel(20, none, false);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.title).toBe(`Chapter 3: ${CHAPTER_NAMES[2]}`);
    expect(keys).toEqual([STORY_KEYS.chapter(2)]);
    expect(storyBeforeLevel(20, seenAll, false).pages).toEqual([]);
  });

  it('nothing mid-chapter, or on a level already beaten (existing players)', () => {
    expect(storyBeforeLevel(3, none, false).pages).toEqual([]);
    expect(storyBeforeLevel(0, none, true).pages).toEqual([]);
  });

  it('the replay holds the intro, the chapters reached, and the ending once earned', () => {
    expect(storySoFar(none, 2)).toHaveLength(INTRO.length + 2);
    const all = storySoFar((k) => k === STORY_KEYS.ending, 6);
    expect(all).toHaveLength(INTRO.length + 6 + ENDING.length);
    expect(all.at(-1)!.art).toBe('depths');
  });

  it('there is a line for every chapter, and every page is short enough to fit', () => {
    expect(CHAPTER_LINES).toHaveLength(CHAPTER_NAMES.length);
    for (const p of [...INTRO, ...ENDING]) expect(p.text.length, p.text).toBeLessThanOrEqual(160);
    for (const line of CHAPTER_LINES) expect(line.length, line).toBeLessThanOrEqual(90);
  });
});
