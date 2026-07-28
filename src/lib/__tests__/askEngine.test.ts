import {
  answer,
  buildInsight,
  buildInsights,
  buildSuggestions,
  type AskEvent,
} from '../askEngine';

const JUL = 6;
const at = (day: number, h: number, m = 0) => new Date(2026, JUL, day, h, m, 0, 0);

const NOW = at(14, 11, 20); // Jul 14 2026, 11:20 AM

const events: AskEvent[] = [
  {
    id: 'standup',
    title: 'Team standup',
    start: at(14, 10, 0),
    end: at(14, 10, 30),
    description: 'Daily sync — sprint progress, blockers.',
  },
  { id: 'dentist', title: 'Dentist', start: at(14, 14, 30), end: at(14, 15, 30) },
  {
    id: 'dinner',
    title: 'Dinner with Sam',
    start: at(14, 18, 0),
    end: at(14, 20, 0),
    description: 'Nopa, 560 Divisadero St.',
  },
  { id: 'coffee', title: 'Coffee with Maya', start: at(15, 9, 0), end: at(15, 9, 30) },
  { id: 'review', title: 'Design review', start: at(15, 14, 0), end: at(15, 15, 0) },
  { id: 'jazz', title: 'Live jazz', start: at(24, 19, 30), end: at(24, 22, 0) },
];

// Today = standup(10), dentist(14), dinner(18) → busy hours {10,14,18}
// Free working hours = 9, 11, 12, 13, 15, 16, 17 → 7 free.

describe('buildSuggestions', () => {
  it('offers a morning brief before noon', () => {
    const labels = buildSuggestions(events, at(14, 9, 0)).map((s) => s.label);
    expect(labels[0]).toBe('Brief me on today');
    expect(labels).toContain('Find free time');
    expect(labels).toContain('Summarize my week');
  });

  it('switches to a retrospective in the evening', () => {
    const labels = buildSuggestions(events, at(14, 19, 0)).map((s) => s.label);
    expect(labels[0]).toBe('How was my day?');
    expect(labels).not.toContain('Brief me on today');
  });

  it('names the next event that has not started', () => {
    expect(buildSuggestions(events, NOW).map((s) => s.label)).toContain('Prep for Dentist');
    expect(buildSuggestions(events, at(14, 9, 0)).map((s) => s.label)).toContain(
      'Prep for Team standup',
    );
  });

  it('omits the prep chip when nothing is upcoming', () => {
    const labels = buildSuggestions([], NOW).map((s) => s.label);
    expect(labels.some((l) => l.startsWith('Prep for'))).toBe(false);
    expect(labels).toEqual(['Brief me on today', 'Find free time', 'Summarize my week']);
  });

  it('omits the free-time chip on a fully booked day', () => {
    const packed: AskEvent[] = [9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => ({
      id: `e${h}`,
      title: `Block ${h}`,
      start: at(14, h, 0),
      end: at(14, h, 50),
    }));
    expect(buildSuggestions(packed, NOW).map((s) => s.label)).not.toContain('Find free time');
  });
});

describe('answer — brief me on today', () => {
  const r = answer('Brief me on today', events, NOW);

  it('counts events, names the first and reports free hours', () => {
    expect(r.text).toBe(
      'You have 3 events today. Starting with Team standup at 10:00 AM. 7 free hours available.',
    );
  });

  it('offers block + see-day actions and previews up to 3 events', () => {
    expect(r.actions.map((a) => a.label)).toEqual(['Block free time', 'See full day']);
    expect(r.previewEventIds).toEqual(['standup', 'dentist', 'dinner']);
  });

  it('handles an empty day without a dangling sentence', () => {
    const empty = answer('brief me on today', [], NOW);
    expect(empty.text).toBe('You have 0 events today. 9 free hours available.');
    expect(empty.previewEventIds).toEqual([]);
  });

  it('honours the 24h setting', () => {
    expect(answer('brief me on today', events, NOW, { timeFormat: '24h' }).text).toContain(
      'at 10:00.',
    );
  });
});

describe('answer — how was my day', () => {
  it('reflects on a busy day', () => {
    const r = answer('How was my day?', events, NOW);
    expect(r.text).toBe('You had 3 events today. Busy day! 7 hours were free.');
    expect(r.actions).toEqual([{ label: 'Review tomorrow', icon: '→' }]);
    expect(r.previewEventIds).toEqual(['standup', 'dentist', 'dinner']);
  });

  it('reflects on a light day', () => {
    const r = answer('how was my day', [events[0]], NOW);
    expect(r.text).toBe('You had 1 event today. A light day. 8 hours were free.');
  });
});

describe('answer — prep for', () => {
  it('preps the next upcoming event', () => {
    const r = answer('Prep for Dentist', events, NOW);
    expect(r.text).toBe('Dentist is at 2:30 PM on Jul 14. No notes added yet.');
    expect(r.actions.map((a) => a.label)).toEqual(['Add notes', 'Reschedule']);
    expect(r.previewEventIds).toEqual(['dentist']);
  });

  it('uses the event description as the notes when present', () => {
    expect(answer('prep for dinner with sam', events, NOW).text).toBe(
      'Dinner with Sam is at 6:00 PM on Jul 14. Nopa, 560 Divisadero St.',
    );
  });

  it('falls back to the next event when the query names none', () => {
    expect(answer('prep for whatever', events, NOW).previewEventIds).toEqual(['dentist']);
  });

  it('says so when nothing is upcoming', () => {
    expect(answer('prep for', [], NOW)).toEqual({
      text: 'Nothing upcoming.',
      actions: [],
      previewEventIds: [],
    });
  });
});

describe('answer — find free time', () => {
  const r = answer('Find free time', events, NOW);

  it('lists the open working hours', () => {
    expect(r.text).toBe(
      "You're free at 9AM, 11AM, 12PM, 1PM, 3PM, 4PM, 5PM. That's 7 open hours.",
    );
  });

  it('offers blocking actions and no previews', () => {
    expect(r.actions.map((a) => a.label)).toEqual(['Block 1 hour', 'Block afternoon']);
    expect(r.previewEventIds).toEqual([]);
  });

  it('singularises a lone free hour', () => {
    const packed: AskEvent[] = [9, 10, 11, 12, 13, 14, 15, 16].map((h) => ({
      id: `e${h}`,
      title: `Block ${h}`,
      start: at(14, h, 0),
      end: at(14, h, 50),
    }));
    expect(answer('find free time', packed, NOW).text).toBe(
      "You're free at 5PM. That's 1 open hour.",
    );
  });
});

describe('answer — summarize my week', () => {
  const r = answer('Summarize my week', events, NOW);

  it('counts the next seven days and comments on today', () => {
    // Jul 14–20 covers standup, dentist, dinner, coffee, review — jazz (Jul 24) is out
    expect(r.text).toBe(
      '5 events this week. Busiest day is today with 3 events. You have room to breathe today.',
    );
    expect(r.actions).toEqual([{ label: 'See busiest day', icon: '→' }]);
    expect(r.previewEventIds).toEqual(['standup', 'dentist', 'dinner', 'coffee']);
  });

  it('switches the closing line when today is packed', () => {
    const packed: AskEvent[] = [9, 10, 11, 12, 13, 14].map((h) => ({
      id: `e${h}`,
      title: `Block ${h}`,
      start: at(14, h, 0),
      end: at(14, h, 50),
    }));
    expect(answer('summarize my week', packed, NOW).text).toContain('Pretty packed today.');
  });
});

describe('answer — fallback', () => {
  it('reports the upcoming count and nudges toward a known route', () => {
    const r = answer('what is the airspeed velocity of a swallow', events, NOW);
    expect(r.text).toBe(
      // dentist, dinner, coffee, review, jazz — standup already ended at 10:30
      'You have 5 upcoming events. Try asking me to brief you on today or find free time.',
    );
    expect(r.actions).toEqual([{ label: 'Brief me on today', icon: '→' }]);
    expect(r.previewEventIds).toEqual(['dentist', 'dinner']);
  });

  it('matches routes case-insensitively anywhere in the query', () => {
    expect(answer('hey, could you BRIEF ME ON TODAY please?', events, NOW).text).toContain(
      'You have 3 events today',
    );
  });

  it('is used for an empty query', () => {
    expect(answer('', events, NOW).text).toContain('upcoming events');
  });
});

describe('buildInsight', () => {
  it('collects every applicable ambient insight', () => {
    // Tomorrow has 2 events — neither empty nor packed — so it stays quiet.
    expect(buildInsights(events, NOW)).toEqual([
      'Packed day — 3 events',
      '7 free hours today',
    ]);
  });

  it('counts a quiet today without the "packed" wording', () => {
    expect(buildInsights([events[0], events[1]], NOW)[0]).toBe('2 events today');
    expect(buildInsights([events[0]], NOW)[0]).toBe('1 event today');
  });

  it('is deterministic for a given seed', () => {
    const all = buildInsights(events, NOW);
    expect(buildInsight(events, NOW, 0)).toBe(all[0]);
    expect(buildInsight(events, NOW, 1)).toBe(all[1]);
    expect(buildInsight(events, NOW, all.length)).toBe(all[0]); // wraps
  });

  it('describes a clear day', () => {
    expect(buildInsights([], NOW)).toEqual([
      'Clear day — no events scheduled',
      'Tomorrow is wide open',
      '9 free hours today',
    ]);
  });

  it('warns about a busy tomorrow', () => {
    const busyTomorrow: AskEvent[] = [9, 11, 13].map((h) => ({
      id: `t${h}`,
      title: `T${h}`,
      start: at(15, h, 0),
      end: at(15, h, 50),
    }));
    expect(buildInsights(busyTomorrow, NOW)).toContain('Heads up — 3 events tomorrow');
  });

  it('still picks an insight when no seed is supplied', () => {
    expect(buildInsights(events, NOW)).toContain(buildInsight(events, NOW));
  });
});
