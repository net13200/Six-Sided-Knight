/**
 * The backstory: Oddmere, where a tired Queen wished never to decide
 * anything again, and everyone turned into dice. You are the one die that
 * still rolls on purpose. Shown as short illustrated pages: the intro before
 * level 1, a card as each chapter begins, the ending after the last level.
 */
import { CHAPTER_NAMES, CHAPTER_SIZE } from '../meta/progress';
import { t, tk } from '../i18n';

export type StoryArt =
  | 'queen'
  | 'well'
  | 'dice'
  | 'you'
  | 'chapter'
  | 'bottom'
  | 'sentence'
  | 'awaken'
  | 'depths'
  | 'greenwood'
  | 'soon';

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
    title: tk('Oddmere'),
    text: tk(
      'The Queen of Oddmere decided everything: wars, weddings, what to name the new bridge. After forty years, she was tired.',
    ),
  },
  {
    art: 'well',
    text: tk(
      'So she went to the Old Well and wished never to have to decide anything again. The Well was generous. Too generous.',
    ),
  },
  {
    art: 'dice',
    text: tk(
      "By morning, everyone in Oddmere was a die, even the goat that ate the council's notes. Nobody is to blame for anything now. Most people rather like it.",
    ),
  },
  {
    art: 'you',
    text: tk(
      "You don't. You were halfway through saying something important when it happened, and you mean to finish the sentence.",
    ),
  },
];

/** One line per chapter, matching what the chapter teaches. */
export const CHAPTER_LINES: readonly string[] = [
  tk('Everyone else is rolling. Only you are choosing.'),
  tk("Some floors won't let you stop. Pick your direction before you commit."),
  tk('The treasurers turned to stone guarding the gold. They still check your receipt.'),
  tk("The garrison can't tell friend from foe, so it shoots at intent."),
  tk('Down here, even time has stopped deciding.'),
  tk("The Queen's chair is empty. The Well is under it."),
];

export const ENDING: readonly StoryPage[] = [
  {
    art: 'bottom',
    title: tk('The bottom of the Well'),
    text: tk('There is no villain down here. Just the Queen: a small, tired die.'),
  },
  {
    art: 'sentence',
    text: tk(
      "You can't break a wish. But you can finish a sentence: “You don't have to decide everything. Just the next move.”",
    ),
  },
  {
    art: 'awaken',
    text: tk('She rolls. On purpose. And one by one, all across Oddmere, dice begin to choose.'),
  },
  {
    art: 'depths',
    text: tk('Not all of them. The ones who like it better this way are still down in the Depths.'),
  },
  {
    art: 'greenwood',
    title: tk('Meanwhile, in the Greenwood'),
    text: tk(
      'Past the edge of Oddmere, something with eight sides is rolling on purpose too. A bonus chapter is open on the title screen.',
    ),
  },
];

/** Before the first bonus stage. */
export const RANGER_INTRO: readonly StoryPage[] = [
  {
    art: 'greenwood',
    title: tk('Bonus: The Greenwood'),
    text: tk(
      'Meet the Eight-Sided Ranger. Eight faces, three ways to roll, and a forest full of wolves.',
    ),
  },
];

/** After the last bonus stage. */
export const RANGER_OUTRO: readonly StoryPage[] = [
  {
    art: 'soon',
    title: tk('Coming soon'),
    text: tk(
      'The Ranger has a story of their own, and it is still being written. Coming soon: Eight-Sided Ranger.',
    ),
  },
];

/** Save flags (in `hints`) for what has been shown. */
export const STORY_KEYS = {
  intro: 'story:intro',
  ending: 'story:ending',
  rangerIntro: 'story:ranger',
  rangerOutro: 'story:ranger-end',
  chapter: (i: number) => `story:ch${i + 1}`,
} as const;

export function chapterPage(i: number): StoryPage {
  return {
    art: 'chapter',
    chapter: i,
    title: t('Chapter {n}: {name}', { n: i + 1, name: t(CHAPTER_NAMES[i] ?? '') }),
    text: CHAPTER_LINES[i] ?? '',
  };
}

/**
 * What to show before playing campaign level `index`: the intro (then the
 * chapter 1 card) before a first level 1, or a chapter's card before its
 * first level. Players who already beat that level see nothing.
 *
 * With `playFirst` (portals: new players land in gameplay), level 1 starts
 * straight away and the intro and chapter 1 card come before level 2 instead.
 */
export function storyBeforeLevel(
  index: number,
  seen: (key: string) => boolean,
  completed: boolean,
  playFirst = false,
): { pages: StoryPage[]; keys: string[] } {
  if (playFirst && index === 0) return { pages: [], keys: [] };
  if (playFirst && index === 1 && !completed) {
    const pages: StoryPage[] = [];
    const keys: string[] = [];
    if (!seen(STORY_KEYS.intro)) {
      pages.push(...INTRO);
      keys.push(STORY_KEYS.intro);
    }
    if (!seen(STORY_KEYS.chapter(0))) {
      pages.push(chapterPage(0));
      keys.push(STORY_KEYS.chapter(0));
    }
    return { pages, keys };
  }
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
  if (seen(STORY_KEYS.rangerIntro)) pages.push(...RANGER_INTRO);
  if (seen(STORY_KEYS.rangerOutro)) pages.push(...RANGER_OUTRO);
  return pages;
}
