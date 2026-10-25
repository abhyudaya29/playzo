export type PlaygroundKind = 'players' | 'communities' | 'games';
export type PlaygroundChoices = {
  kind: PlaygroundKind;
  gender: string;
  sport: string;
  skill_level: string;
  pincode: string;
  locality: string;
  city: string;
  state: string;
};
export type PlaygroundItem = {
  id: string;
  name: string;
  sport: string;
  area: string;
  description: string;
  action: string;
  skill_level?: string;
  member_count?: number;
  capacity?: number;
  starts_at?: string;
  spots_left?: number;
};
const storageKey = 'playhud:playground-choice';
const intentKey = 'playhud:playground-intent';
const maxAge = 60 * 60 * 1000;
const kinds: PlaygroundKind[] = ['players', 'communities', 'games'];
const genders = [
  'man',
  'woman',
  'non_binary',
  'other',
  'prefer_not_to_say',
  '',
];
const levels = ['hobby', 'beginner', 'intermediate', 'advanced', 'pro'];

export function rememberPlayground(
  choices: PlaygroundChoices,
  item?: PlaygroundItem,
  sample = false,
) {
  try {
    const timestamp = Date.now();
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ ...choices, timestamp }),
    );
    sessionStorage.setItem(
      intentKey,
      JSON.stringify({
        kind: choices.kind,
        id: sample ? null : item?.id,
        timestamp,
      }),
    );
  } catch {
    /* Signup remains available when browser storage is disabled. */
  }
}

export function readPlaygroundChoices(): PlaygroundChoices | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (
      !value ||
      !Number.isFinite(value.timestamp) ||
      Date.now() - value.timestamp > maxAge ||
      value.timestamp > Date.now() ||
      !kinds.includes(value.kind) ||
      !genders.includes(value.gender) ||
      !levels.includes(value.skill_level) ||
      typeof value.sport !== 'string' ||
      value.sport.length < 2 ||
      value.sport.length > 60
    )
      return null;
    return {
      kind: value.kind,
      gender: value.gender,
      sport: value.sport,
      skill_level: value.skill_level,
      pincode:
        typeof value.pincode === 'string' && /^[1-9]\d{5}$/.test(value.pincode)
          ? value.pincode
          : '',
      city: typeof value.city === 'string' ? value.city.slice(0, 160) : '',
      locality:
        typeof value.locality === 'string' ? value.locality.slice(0, 160) : '',
      state: typeof value.state === 'string' ? value.state.slice(0, 160) : '',
    };
  } catch {
    return null;
  }
}

export function playgroundDestination(
  kind: PlaygroundKind,
  id?: string | null,
) {
  if (
    kind === 'players' &&
    id &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    return `/players/${id}`;
  return kind === 'communities'
    ? '/groups'
    : kind === 'games'
      ? '/games'
      : '/dashboard';
}

export function consumePlaygroundDestination(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(intentKey) || 'null');
    sessionStorage.removeItem(intentKey);
    sessionStorage.removeItem(storageKey);
    if (
      !value ||
      !kinds.includes(value.kind) ||
      !Number.isFinite(value.timestamp) ||
      Date.now() - value.timestamp > maxAge ||
      value.timestamp > Date.now()
    )
      return null;
    return playgroundDestination(value.kind, value.id);
  } catch {
    return null;
  }
}

export function playgroundExamples(
  kind: PlaygroundKind,
  sport: string,
): PlaygroundItem[] {
  if (kind === 'players')
    return [
      {
        id: 'sample-player-1',
        name: 'Aarav',
        sport,
        area: 'Playground community',
        skill_level: 'beginner',
        description:
          'Getting back into a regular game. Easygoing sessions and a post-game chai.',
        action: 'Connect',
      },
      {
        id: 'sample-player-2',
        name: 'Sana',
        sport,
        area: 'Playground community',
        skill_level: 'intermediate',
        description:
          'Looking for a regular playing partner and a friendly challenge.',
        action: 'Connect',
      },
      {
        id: 'sample-player-3',
        name: 'Riya',
        sport,
        area: 'Playground community',
        skill_level: 'hobby',
        description:
          'Here for fresh air, new faces, and making the weekend count.',
        action: 'Connect',
      },
    ];
  if (kind === 'communities')
    return [
      {
        id: 'sample-group-1',
        name: 'The Weekend Crew',
        sport,
        area: 'Playground community',
        member_count: 18,
        capacity: 30,
        description:
          'A friendly local crew with room for new faces. All skill levels welcome.',
        action: 'Join community',
      },
      {
        id: 'sample-group-2',
        name: 'After Hours Club',
        sport,
        area: 'Playground community',
        member_count: 12,
        capacity: 24,
        description:
          'Make time to play after work. Regular sessions, familiar faces.',
        action: 'Join community',
      },
    ];
  return [
    {
      id: 'sample-game-1',
      name: `A friendly ${sport.toLowerCase()} session`,
      sport,
      area: 'Playground community',
      spots_left: 3,
      description:
        'A casual weekend game with a few open spots. Bring your enthusiasm.',
      action: 'Join game',
    },
    {
      id: 'sample-game-2',
      name: 'The evening reset',
      sport,
      area: 'Playground community',
      spots_left: 2,
      description: 'Trade the screen for a game and meet a new local crew.',
      action: 'Join game',
    },
  ];
}
