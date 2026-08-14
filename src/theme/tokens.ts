/**
 * Design tokens extracted verbatim from `project/Calendar App v15.dc.html`.
 *
 * The prototype is a single-file HTML/React design. Every literal in here was
 * lifted from it (or from the plan's "Design tokens" section, which summarises
 * it) so the Expo app renders the same values rather than approximations.
 */

/* ------------------------------------------------------------------ colors */

export const lightColors = {
  /** Primary text / active states. */
  ink: '#0F0F0F',
  /** Screen background inside the device. */
  canvas: '#FFFFFF',
  /** Page background behind the device frame. */
  pageBg: '#EDEBE7',

  /** Row separators and segmented-control track. */
  hairline: '#F5F5F3',
  /** Slightly darker rule — tab bar top border, detail metadata top border. */
  hairlineStrong: '#F0F0EE',
  /** Warm rule used in the onboarding / settings surfaces. */
  hairlineWarm: '#F1EFEC',
  /** Faintest rule — between detail metadata rows. */
  hairlineFaint: '#F8F8F6',

  /** Secondary text. */
  muted: '#999999',
  /** Section labels, inactive tab icons/labels. */
  faint: '#C0C0C0',
  /** Date labels beside the day heading in the Events list. */
  faintWarm: '#B0B0B0',
  /** Chevron stroke. */
  chevron: '#CCCCCC',
  /** Gear icon stroke. */
  iconMuted: '#888888',
  /** Long-form body copy on the detail page. */
  body: '#555555',

  /** TODAY pill, links and Save only — never decorative. */
  blue: '#4361EE',
  blueHover: '#3451DE',
  green: '#1B8C5A',
  /** Destructive text (Delete / Disconnect). */
  red: '#D14343',
  /** The red of the event colour trio. */
  redEvent: '#E8453C',

  /** Off state of the settings toggle track. */
  toggleOff: '#E4E3DF',
  /** Input fill. */
  fieldBg: '#FAFAF8',
  /** Input border. */
  fieldBorder: '#E8E8E6',
} as const;

/**
 * A light/dark pair is keyed identically; `Colors` is the shared shape. The
 * dark palette brightens text, dims backgrounds, and lightens the accent hues
 * so they stay legible on a near-black canvas.
 */
export type Colors = { [K in keyof typeof lightColors]: string };

export const darkColors: Colors = {
  ink: '#F2F2F0',
  canvas: '#111113',
  pageBg: '#0A0A0B',
  hairline: '#232326',
  hairlineStrong: '#2A2A2E',
  hairlineWarm: '#26262A',
  hairlineFaint: '#1D1D20',
  muted: '#8A8A8F',
  faint: '#5A5A60',
  faintWarm: '#6A6A70',
  chevron: '#4A4A50',
  iconMuted: '#7A7A80',
  body: '#B8B8BC',
  blue: '#6B8AFF',
  blueHover: '#8099FF',
  green: '#34C083',
  red: '#E86060',
  redEvent: '#E8453C',
  toggleOff: '#2E2E33',
  fieldBg: '#1A1A1D',
  fieldBorder: '#2C2C31',
};

export type ThemeName = 'light' | 'dark';
export type ThemePreference = ThemeName | 'system';

export const themes: Record<ThemeName, Colors> = {
  light: lightColors,
  dark: darkColors,
};

/**
 * Event colour trio. Calendar colour maps here; when a calendar has no colour
 * the event id is hashed into this palette so the choice is stable per event.
 */
export const eventColors = {
  red: '#E8453C',
  green: '#1B8C5A',
  blue: '#4361EE',
} as const;

export type EventColorName = keyof typeof eventColors;

/** Ordered trio, for hashing an id into a colour. */
export const eventPalette = [
  eventColors.red,
  eventColors.green,
  eventColors.blue,
] as const;

/* ------------------------------------------------------------------- fonts */

/**
 * Font family names as registered by `useFonts` in the root layout. Use these
 * rather than `fontWeight` — only the loaded faces exist on native, and RN
 * cannot synthesise weights for a custom family.
 */
export const fonts = {
  light: 'PlusJakartaSans_300Light',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontName = keyof typeof fonts;

/** Numeric weight -> family name, for places that think in CSS weights. */
export const fontByWeight = {
  300: fonts.light,
  400: fonts.regular,
  500: fonts.medium,
  600: fonts.semibold,
  700: fonts.bold,
  800: fonts.extrabold,
} as const;

/* --------------------------------------------------------------- type scale */

/**
 * The design's type scale. `fontFamily` carries the weight; `fontWeight` is
 * deliberately omitted so native and web render identically.
 */
export const type = {
  /** 52/300 — the big day number in the calendar header. */
  dayNumber: {
    fontSize: 52,
    fontFamily: fonts.light,
    letterSpacing: -2,
    lineHeight: 56,
  },
  /** 38/300 — onboarding hero ("One calendar, every source."). */
  hero: {
    fontSize: 38,
    fontFamily: fonts.light,
    letterSpacing: -1.4,
    lineHeight: 44,
  },
  /** 32/800 — event / tracking detail titles. */
  detailTitle: {
    fontSize: 32,
    fontFamily: fonts.extrabold,
    letterSpacing: -1.2,
    lineHeight: 35,
  },
  /** 26/800 — screen titles ("Upcoming", "Settings"). */
  screenTitle: {
    fontSize: 26,
    fontFamily: fonts.extrabold,
    letterSpacing: -1,
  },
  /** 15/600 — list row titles. */
  rowTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    letterSpacing: -0.2,
  },
  /** 15/400 — settings row labels. */
  rowLabel: {
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  /** 15/400 — detail page body copy. */
  body: {
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 26,
  },
  /** 13/700 — the relative day heading in the Events list. */
  dayLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  /** 13/600 — segmented control labels. */
  segment: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  /** 12/400 — list row subtitles. */
  rowSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  /** 11/700 uppercase — section labels. */
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  /** 10/500|700 — tab bar labels. */
  tabLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },
} as const;

/* ------------------------------------------------------------------ easing */

/**
 * Cubic-bezier control points as `[x1, y1, x2, y2]`, ready to spread into
 * Reanimated's `Easing.bezier(...)`.
 */
export const easing = {
  /** `cubic-bezier(.22,1,.36,1)` — the standard curve for nearly everything. */
  standard: [0.22, 1, 0.36, 1] as const,
  /** `cubic-bezier(.34,1.56,.5,1)` — overshoots; segmented controls, toggles. */
  bouncy: [0.34, 1.56, 0.5, 1] as const,
};

/** Durations in ms, matching the prototype's transitions. */
export const durations = {
  /** Colour / opacity cross-fades. */
  fast: 150,
  /** Icon and label state changes. */
  base: 200,
  /** Page push / pop. */
  page: 250,
  /** Segmented control thumb, toggle knob. */
  spring: 280,
  /** fadeUp entrances. */
  entrance: 450,
} as const;

/**
 * Reanimated spring configs approximating the `bouncy` bezier's overshoot.
 * A real spring feels better than a bezier on a gesture-driven surface, and
 * these are tuned to land in roughly the same ~280ms with a visible overshoot.
 */
export const springs = {
  /** Segmented control thumb. */
  bouncy: { damping: 15, stiffness: 220, mass: 0.7 },
  /** Toggle knob — a touch tighter so it doesn't wobble at 23px. */
  toggle: { damping: 16, stiffness: 260, mass: 0.7 },
  /** Press-in / press-out feedback. */
  press: { damping: 20, stiffness: 400, mass: 0.5 },
} as const;

/* ------------------------------------------------------------------ layout */

export const layout = {
  /** Horizontal page gutter. */
  gutter: 24,
  /** Space reserved for the status bar inside the device frame. */
  statusBarInset: 58,
  /** Timeline scale — 66px per hour. */
  pixelsPerHour: 66,
  hairlineWidth: 1,
} as const;

export const radii = {
  /** Segmented control track. */
  track: 9,
  /** Segmented control thumb. */
  thumb: 7,
  /** Toggle track (46x27 pill). */
  toggle: 14,
  field: 10,
  row: 8,
  send: 8,
} as const;

export const shadows = {
  /** Segmented control thumb: `0 1px 3px rgba(0,0,0,0.1)`. */
  thumb: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Toggle knob: `0 1px 3px rgba(0,0,0,0.18)`. */
  knob: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
} as const;

/** Press feedback magnitudes, from the design's `style-active` rules. */
export const press = {
  /** Rows nudge right and fade. */
  rowTranslateX: 3,
  rowOpacity: 0.7,
  /** Buttons scale down. */
  buttonScale: 0.96,
  /** Segmented labels / toggles use a shallower squeeze. */
  labelScale: 0.94,
} as const;

const tokens = {
  eventColors,
  eventPalette,
  fonts,
  fontByWeight,
  type,
  easing,
  durations,
  springs,
  layout,
  radii,
  shadows,
  press,
};

export default tokens;
