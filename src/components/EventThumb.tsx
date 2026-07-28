import { Image } from 'expo-image';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { imageSource } from '@/api/client';
import { getCachedSession } from '@/api/session';
import { thumbFor, type Thumb } from '@/lib/thumbs';

/**
 * The feed's thumbnail surface (design lines 143-172 + 505-652).
 *
 * The prototype had no real images — every card was a CSS gradient plus a
 * stroked glyph. Yot events can carry an `image_path`, so the real photo wins
 * when there is one and the deterministic gradient is the fallback.
 *
 * The gradient is drawn with `react-native-svg` rather than
 * `expo-linear-gradient`: adding an npm dependency was out of scope for this
 * stage, and SVG is already a dependency for the icon set.
 */

/* ---------------------------------------------------------------- gradient */

export interface ThumbGradientProps {
  thumb: Thumb;
  /** Rounded to match the parent's `borderRadius`. */
  radius?: number;
}

/**
 * An absolutely-filling two-stop gradient. `useId` keeps the `<Defs>` id
 * unique — SVG gradient ids are document-global on web, so a shared literal
 * would make every card render the first card's colours.
 */
export function ThumbGradient({ thumb, radius = 0 }: ThumbGradientProps) {
  const gradientId = `thumb-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={thumb.grad[0]} />
          <Stop offset="1" stopColor={thumb.grad[1]} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill={`url(#${gradientId})`}
      />
    </Svg>
  );
}

/**
 * The vertical scrim the design paints under card captions —
 * `linear-gradient(transparent, rgba(0,0,0,0.06))` on the Dynamic hero,
 * `linear-gradient(transparent, rgba(255,255,255,0.7))` on the Magazine card.
 */
export function VerticalScrim({
  color,
  toOpacity,
  fromOpacity = 0,
}: {
  color: string;
  toOpacity: number;
  fromOpacity?: number;
}) {
  const gradientId = `scrim-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={fromOpacity} />
          <Stop offset="1" stopColor={color} stopOpacity={toOpacity} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gradientId})`} />
    </Svg>
  );
}

/* -------------------------------------------------------------------- icon */

export interface ThumbIconProps {
  thumb: Thumb;
  size: number;
  /** The design passes 0.4 by default, 0.15/0.12 for the giant faded glyphs. */
  opacity?: number;
  /** 1.2 on small glyphs, 0.8/0.6 on the oversized ones. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/** The stroked 16x16 glyph that sits on the gradient (design line 513). */
export function ThumbIcon({
  thumb,
  size,
  opacity = 0.4,
  strokeWidth = 1.2,
  style,
}: ThumbIconProps) {
  return (
    <View style={style} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" opacity={opacity}>
        <Path
          d={thumb.iconPath}
          stroke={thumb.iconColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------- thumb */

export interface EventThumbProps {
  /** Event id — hashed into the thumbnail pool. */
  id: string;
  /** Server-relative image path, when the event has a cover. */
  imagePath?: string;
  /** Glyph size; `0` suppresses the glyph (used behind a real image). */
  iconSize?: number;
  iconOpacity?: number;
  iconStrokeWidth?: number;
  /** Layout for the surface itself — height, radius, flex. */
  style?: StyleProp<ViewStyle>;
  /** Matches the container radius so the SVG corners line up on Android. */
  radius?: number;
  /** Overlays: time chips, title blocks. Rendered above the background. */
  children?: React.ReactNode;
  /**
   * Where the glyph sits. The design centres it on ordinary cards, pins it
   * right-of-centre on the Dynamic hero (line 538), lets it bleed off the
   * bottom-right corner on the Magazine card (line 585) and tucks it into the
   * bottom-left of a Mosaic cell (line 612).
   */
  iconPosition?: 'center' | 'right' | 'bottom-right' | 'bottom-left';
  testID?: string;
}

/**
 * A thumbnail surface: real cover image when the event has one, otherwise the
 * deterministic gradient + glyph. Children render on top of either.
 */
export default function EventThumb({
  id,
  imagePath,
  iconSize = 28,
  iconOpacity,
  iconStrokeWidth,
  style,
  radius = 0,
  children,
  iconPosition = 'center',
  testID,
}: EventThumbProps) {
  const thumb = thumbFor(id);
  const session = getCachedSession();
  // Without a session there is no base URL and no bearer key, so the request
  // would 401 — fall back to the gradient rather than render a broken box.
  const source =
    imagePath && session ? imageSource(session.baseUrl, imagePath, session.key) : null;

  return (
    <View
      style={[styles.surface, { borderRadius: radius }, style]}
      testID={testID}
      collapsable={false}
    >
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
          testID={testID ? `${testID}-image` : undefined}
        />
      ) : (
        <>
          <ThumbGradient thumb={thumb} radius={radius} />
          {iconSize > 0 ? (
            <ThumbIcon
              thumb={thumb}
              size={iconSize}
              opacity={iconOpacity}
              strokeWidth={iconStrokeWidth}
              style={iconStyles[iconPosition]}
            />
          ) : null}
        </>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    position: 'relative',
  },
});

const iconStyles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 20,
    justifyContent: 'center',
  },
  'bottom-right': {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
  'bottom-left': {
    position: 'absolute',
    left: 10,
    bottom: 10,
  },
});
