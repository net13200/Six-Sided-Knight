/**
 * The backstory: Oddmere, where a tired Queen wished never to decide
 * anything again, and everyone turned into dice. You are the one die that
 * still rolls on purpose. Shown as short illustrated pages: the intro before
 * level 1, a card as each chapter begins, the ending after the last level.
 */
import { CHAPTER_NAMES, CHAPTER_SIZE } from '../meta/progress';

export type StoryArt =
  'queen' | 'well' | 'dice' | 'you' | 'chapter' | 'bottom' | 'sentence' | 'awaken' | 'depths';

export interface StoryPage {
  readonly art: StoryArt;
  readonly title?: string;
  readonly text: string;
  /** For chapter cards: which chapter (0-based). */
  readonly chapter?: number;
}

export const INTRO: readonly StoryPage[] = [
  {
    art: 'queen',
    title: 'Oddmere',
    text: 'The Queen of Oddmere decided everything: wars, weddings, what to name the new bridge. After forty years, she was tired.',
  },
  {
    art: 'well',
    text: 'So she went to the Old Well and wished never to have to decide anything again. The Well was generous. Too generous.',
  },
  {
    art: 'dice',
    text: "By morning, everyone in Oddmere was a die, even the goat that ate the council's notes. Nobody is to blame for anything now. Most people rather like it.",
  },
  {
    art: 'you',
    text: "You don't. You were halfway through saying something important when it happened, and you mean to finish the sentence.",
  },
];

/** One line per chapter, matching what the chapter teaches. */
export const CHAPTER_LINES: readonly string[] = [
  'Everyone else is rolling. Only you are choosing.',
  "Some floors won't let you stop. Pick your direction before you commit.",
  'The treasurers turned to stone guarding the gold. They still check your receipt.',
  "The garrison can't tell friend from foe, so it shoots at intent.",
  'Down here, even time has stopped deciding.',
  "The Queen's chair is empty. The Well is under it.",
];

export const ENDING: readonly StoryPage[] = [
  {
    art: 'bottom',
    title: 'The bottom of the Well',
    text: 'There is no villain down here. Just the Queen: a small, tired die.',
  },
  {
    art: 'sentence',
    text: "You can't break a wish. But you can finish a sentence: “You don't have to decide everything. Just the next move.”",
  },
  {
    art: 'awaken',
    text: 'She rolls. On purpose. And one by one, all across Oddmere, dice begin to choose.',
  },
  {
    art: 'depths',
    text: 'Not all of them. The ones who like it better this way are still down in the Depths.',
  },
];

/** Save flags (in `hints`) for what has been shown. */
export const STORY_KEYS = {
  intro: 'story:intro',
  ending: 'story:ending',
  chapter: (i: number) => `story:ch${i + 1}`,
} as const;

export function chapterPage(i: number): StoryPage {
  return {
    art: 'chapter',
    chapter: i,
    title: `Chapter ${i + 1}: ${CHAPTER_NAMES[i] ?? ''}`,
    text: CHAPTER_LINES[i] ?? '',
  };
}

/**
 * What to show before playing campaign level `index`: the intro (then the
 * chapter 1 card) before a first level 1, or a chapter's card before its
 * first level. Players who already beat that level see nothing.
 */
export function storyBeforeLevel(
  index: number,
  seen: (key: string) => boolean,
  completed: boolean,
): { pages: StoryPage[]; keys: string[] } {
  if (completed || index % CHAPTER_SIZE !== 0) return { pages: [], keys: [] };
  const chapter = index / CHAPTER_SIZE;
  const pages: StoryPage[] = [];
  const keys: string[] = [];
  if (chapter === 0 && !seen(STORY_KEYS.intro)) {
    pages.push(...INTRO);
    keys.push(STORY_KEYS.intro);
  }
  if (!seen(STORY_KEYS.chapter(chapter))) {
    pages.push(chapterPage(chapter));
    keys.push(STORY_KEYS.chapter(chapter));
  }
  return { pages, keys };
}

/** The story so far, for "Story" on the title screen: intro, chapters reached, ending if earned. */
export function storySoFar(seen: (key: string) => boolean, chaptersOpen: number): StoryPage[] {
  const pages: StoryPage[] = [...INTRO];
  for (let i = 0; i < Math.max(1, chaptersOpen); i++) pages.push(chapterPage(i));
  if (seen(STORY_KEYS.ending)) pages.push(...ENDING);
  return pages;
}
