import tokens, {
  darkColors,
  easing,
  eventPalette,
  fonts,
  lightColors,
  themes,
  type,
} from '@/theme/tokens';

/**
 * Smoke test: proves the jest harness runs, resolves the `@/` path alias, and
 * that the tokens carry the exact values taken from the design.
 */
describe('design tokens', () => {
  it('exposes the core palette from the v15 design', () => {
    expect(lightColors.ink).toBe('#0F0F0F');
    expect(lightColors.canvas).toBe('#FFFFFF');
    expect(lightColors.pageBg).toBe('#EDEBE7');
    expect(lightColors.muted).toBe('#999999');
    expect(lightColors.blue).toBe('#4361EE');
  });

  it('has a dark palette keyed identically to the light one', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    expect(darkColors.canvas).not.toBe(lightColors.canvas);
    expect(themes.light).toBe(lightColors);
    expect(themes.dark).toBe(darkColors);
  });

  it('has the three-colour event palette', () => {
    expect(eventPalette).toEqual(['#E8453C', '#1B8C5A', '#4361EE']);
  });

  it('maps every Plus Jakarta Sans weight the design uses', () => {
    expect(Object.keys(fonts)).toHaveLength(6);
    expect(fonts.light).toBe('PlusJakartaSans_300Light');
    expect(fonts.extrabold).toBe('PlusJakartaSans_800ExtraBold');
  });

  it('keeps the type scale anchors', () => {
    expect(type.dayNumber.fontSize).toBe(52);
    expect(type.detailTitle.fontSize).toBe(32);
    expect(type.screenTitle.fontSize).toBe(26);
    expect(type.sectionLabel.fontSize).toBe(11);
  });

  it('exports easing curves as bezier control points', () => {
    expect(easing.standard).toEqual([0.22, 1, 0.36, 1]);
    expect(easing.bouncy).toEqual([0.34, 1.56, 0.5, 1]);
    // The bouncy curve must overshoot, otherwise the segmented control and
    // toggle lose the character the design is built around.
    expect(easing.bouncy[1]).toBeGreaterThan(1);
  });

  it('has a default export bundling every group', () => {
    expect(tokens.fonts).toBe(fonts);
  });
});
