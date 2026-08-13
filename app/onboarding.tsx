import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { completePairing, probeHealth } from '@/api/client';
import { saveBaseUrl } from '@/api/session';
import { BackChevronIcon } from '@/components/icons';
import PluginPicker from '@/components/feed/PluginPicker';
import { listPlugins } from '@/plugins/loader';
import type { PluginMeta } from '@/plugins/schema';
import { useEvents } from '@/store/events';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/context';
import { easing, fonts, radii, springs } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * The four-stage pairing flow — design lines 1143–1216, rendered as one screen
 * with internal state exactly like the prototype's `obScreen`.
 *
 * Two sanctioned deviations from the prototype:
 *  - **six** PIN boxes, because Yot mints 6-digit PINs (the design showed 4);
 *  - a **failure path** back to the PIN stage, which the prototype never had.
 */

type Stage = 'welcome' | 'connect' | 'pin' | 'verifying' | 'plugins';
type ServerStatus = 'idle' | 'checking' | 'reachable' | 'error';

const PIN_LENGTH = 6;
/** Debounce before the health probe fires — design line 96. */
const PROBE_DEBOUNCE_MS = 700;
/** How long the drawn checkmark holds before the app takes over. */
const CONNECTED_HOLD_MS = 900;

const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, monospace',
}) as string;

const DEVICE_NAME = Platform.select({
  ios: 'iPhone',
  android: 'Android phone',
  web: 'Web browser',
  default: 'Device',
}) as string;

const STANDARD = Easing.bezier(...easing.standard);
/** The prototype's `popIn` curve: `cubic-bezier(.22,1.4,.4,1)`. */
const POP = Easing.bezier(0.22, 1.4, 0.4, 1);

/* ------------------------------------------------------------------ pieces */

/** A ring with one coloured arc, spinning — the design's `spin` keyframe. */
function Spinner({
  size,
  borderWidth,
  track,
  head,
  durationMs = 700,
}: {
  size: number;
  borderWidth: number;
  track: string;
  head: string;
  durationMs?: number;
}) {
  const angle = useSharedValue(0);

  useEffect(() => {
    angle.value = withRepeat(withTiming(360, { duration: durationMs, easing: Easing.linear }), -1);
    return () => cancelAnimation(angle);
  }, [angle, durationMs]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: track,
          borderTopColor: head,
        },
        style,
      ]}
    />
  );
}

/** Scale + fade entrance, matching the design's `popIn` keyframe. */
function PopIn({
  children,
  durationMs = 300,
  style,
}: {
  children: React.ReactNode;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: durationMs, easing: POP });
  }, [progress, durationMs]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.4 + progress.value * 0.6 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * The onboarding primary button — full width, 15/700 white on ink, radius 12,
 * `0 6px 18px rgba(15,15,15,0.16)`, pressing to `scale(0.97)`. Disabled is
 * `#EEEDEA` with `#C0C0C0` text and no shadow (design lines 1147–1152).
 */
function PrimaryButton({
  label,
  onPress,
  enabled = true,
  testID,
}: {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
  }));

  return (
    <Animated.View style={[styles.primaryWrap, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPressIn={() => {
          if (enabled) pressed.value = withSpring(1, springs.press);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, springs.press);
        }}
        onPress={onPress}
        style={[styles.primaryBtn, enabled ? styles.primaryOn : styles.primaryOff]}
      >
        <Text
          style={[styles.primaryLabel, enabled ? styles.primaryLabelOn : styles.primaryLabelOff]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backLink, pressed && styles.pressedFade]}
    >
      <BackChevronIcon size={16} color={colors.muted} strokeWidth={1.5} />
      <Text style={styles.backLabel}>Back</Text>
    </Pressable>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The 48px ink disc with the checkmark drawn on (design lines 1207–1210). */
function DrawnCheck() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const offset = useSharedValue(26);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  useEffect(() => {
    offset.value = withDelay(
      120,
      withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
    );
  }, [offset]);

  return (
    <PopIn durationMs={350} style={styles.verifyDisc}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <AnimatedPath
          d="M6 12.5l4 4 8-9"
          stroke="#fff"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={26}
          animatedProps={animatedProps}
        />
      </Svg>
    </PopIn>
  );
}

/**
 * One presentational digit box. Six of these sit under a single hidden
 * `TextInput`; the focused box grows to `scale(1.06)` with a soft shadow, as
 * the prototype's real inputs did (design line 1194).
 */
function PinBox({
  digit,
  focused,
  filled,
  index,
}: {
  digit: string;
  focused: boolean;
  filled: boolean;
  index: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, {
      duration: 220,
      easing: Easing.bezier(...easing.bouncy),
    });
  }, [active, focused]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.06 }],
  }));

  return (
    <Animated.View
      testID={`ob-pin-box-${index}`}
      style={[
        styles.pinBox,
        (focused || filled) && styles.pinBoxLive,
        focused && styles.pinBoxFocused,
        style,
      ]}
    >
      <Text style={styles.pinDigit}>{digit}</Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ screen */

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [stage, setStage] = useState<Stage>('welcome');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ServerStatus>('idle');
  /** The address `probeHealth` actually answered on (scheme resolved). */
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  const [pin, setPin] = useState('');
  const [pinFocused, setPinFocused] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [verifyDone, setVerifyDone] = useState(false);

  const [allPlugins, setAllPlugins] = useState<PluginMeta[]>([]);

  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a slow probe landing after a newer keystroke. */
  const probeSeq = useRef(0);

  /* ------------------------------------------------------- stage transition */

  const stageOpacity = useSharedValue(0);
  const stageShift = useSharedValue(8);

  useEffect(() => {
    // `fadeIn 0.4s` from the design, plus the slight rise the plan asks for.
    stageOpacity.value = 0;
    stageShift.value = 8;
    stageOpacity.value = withTiming(1, { duration: 400, easing: STANDARD });
    stageShift.value = withTiming(0, { duration: 400, easing: STANDARD });
  }, [stage, stageOpacity, stageShift]);

  const stageStyle = useAnimatedStyle(() => ({
    opacity: stageOpacity.value,
    transform: [{ translateY: stageShift.value }],
  }));

  useEffect(
    () => () => {
      if (probeTimer.current) clearTimeout(probeTimer.current);
    },
    [],
  );

  // Fetch the plugin list once pairing has succeeded, before showing the
  // plugin-selection stage.
  useEffect(() => {
    if (stage === 'plugins') {
      void listPlugins().then(setAllPlugins);
    }
  }, [stage]);

  /* ----------------------------------------------------------- server probe */

  const onChangeUrl = useCallback((value: string) => {
    setUrl(value);
    setBaseUrl(null);
    if (probeTimer.current) clearTimeout(probeTimer.current);

    const trimmed = value.trim();
    if (trimmed.length <= 3) {
      probeSeq.current += 1;
      setStatus('idle');
      return;
    }

    setStatus('checking');
    const seq = (probeSeq.current += 1);
    probeTimer.current = setTimeout(() => {
      void (async () => {
        const result = await probeHealth(trimmed);
        if (seq !== probeSeq.current) return;
        if (result.ok) {
          setBaseUrl(result.baseUrl);
          setStatus('reachable');
          // Worth keeping even if the user backs out mid-PIN.
          void saveBaseUrl(result.baseUrl);
        } else {
          setStatus('error');
        }
      })();
    }, PROBE_DEBOUNCE_MS);
  }, []);

  /* ------------------------------------------------------------------- pin */

  const onChangePin = useCallback((value: string) => {
    // A single hidden field holds the digits, so backspace "jumps back" for
    // free and there is no cross-input focus race to lose (design 102–113).
    setPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
    setPinError(null);
  }, []);

  const goToPin = useCallback(() => {
    setPin('');
    setPinError(null);
    setStage('pin');
  }, []);

  /* -------------------------------------------------------------- verifying */

  const verify = useCallback(() => {
    if (pin.length !== PIN_LENGTH || !baseUrl) return;
    setVerifyDone(false);
    setStage('verifying');

    void (async () => {
      const result = await completePairing(baseUrl, pin, DEVICE_NAME);

      if (!result.ok) {
        // The prototype had no failure path; a real PIN can be wrong, expired
        // or rate-limited, so drop back to the boxes with the reason.
        setPin('');
        setPinError(result.message);
        setStage('pin');
        return;
      }

      setVerifyDone(true);
      await new Promise((resolve) => setTimeout(resolve, CONNECTED_HOLD_MS));

      // Paired — offer the plugin picker before handing over to the app.
      setStage('plugins');
    })();
  }, [baseUrl, pin]);

  const finishOnboarding = useCallback(() => {
    useSettings.getState().update({ onboarded: true, serverUrl: baseUrl });
    void useEvents.getState().sync();

    const view = useSettings.getState().defaultView;
    router.replace(view === 'events' ? '/events' : view === 'feed' ? '/feed' : '/');
  }, [baseUrl]);

  /* ---------------------------------------------------------------- stages */

  let body: React.ReactNode;

  if (stage === 'welcome') {
    body = (
      <View style={styles.welcome}>
        <View style={styles.welcomeCentre}>
          <Text style={styles.hero}>{'One calendar,\nevery source.'}</Text>
          <Text style={styles.heroSub}>
            Connect your server and the agent turns your email and chats into calendar events.
          </Text>
        </View>
        <PrimaryButton
          testID="ob-welcome-cta"
          label="Connect your server"
          onPress={() => setStage('connect')}
        />
      </View>
    );
  } else if (stage === 'connect') {
    body = (
      <View style={styles.stage}>
        <BackLink onPress={() => setStage('welcome')} />
        <Text style={styles.title}>Connect your server</Text>
        <Text style={styles.subcopy}>Enter the address of your self-hosted instance.</Text>
        <Text style={styles.fieldLabel}>Server address</Text>

        <View style={[styles.field, status === 'reachable' && styles.fieldReady]}>
          <TextInput
            testID="ob-url-input"
            accessibilityLabel="Server address"
            value={url}
            onChangeText={onChangeUrl}
            placeholder="cal.yourdomain.com"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="done"
            style={styles.input}
          />
          {status === 'checking' ? (
            <Spinner
              size={15}
              borderWidth={2}
              track="#E0E0DE"
              head={colors.muted}
              durationMs={600}
            />
          ) : null}
          {status === 'reachable' ? (
            <PopIn style={[styles.statusDisc, { backgroundColor: colors.green }]}>
              <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                <Path
                  d="M4 8.5l2.5 2.5L12 5"
                  stroke="#fff"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </PopIn>
          ) : null}
          {status === 'error' ? (
            <PopIn style={[styles.statusDisc, { backgroundColor: colors.red }]}>
              <Svg width={11} height={11} viewBox="0 0 16 16" fill="none">
                <Path d="M4 4l8 8M12 4l-8 8" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </PopIn>
          ) : null}
        </View>

        <View style={styles.spacer} />
        <PrimaryButton
          testID="ob-connect-cta"
          label="Continue"
          enabled={status === 'reachable' && !!baseUrl}
          onPress={goToPin}
        />
      </View>
    );
  } else if (stage === 'pin') {
    const focusIndex = Math.min(pin.length, PIN_LENGTH - 1);

    body = (
      <View style={styles.stage}>
        <BackLink onPress={() => setStage('connect')} />
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={styles.subcopy}>Find the one-time code in your server’s admin panel.</Text>

        <View style={styles.pinRow}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <PinBox
              key={i}
              index={i}
              digit={pin[i] ?? ''}
              focused={pinFocused && i === focusIndex}
              filled={!!pin[i]}
            />
          ))}
          <TextInput
            testID="ob-pin-input"
            accessibilityLabel="PIN"
            value={pin}
            onChangeText={onChangePin}
            onFocus={() => setPinFocused(true)}
            onBlur={() => setPinFocused(false)}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            maxLength={PIN_LENGTH}
            autoFocus
            caretHidden
            style={styles.pinCapture}
          />
        </View>

        {pinError ? (
          <Text testID="ob-pin-error" style={styles.pinErrorText}>
            {pinError}
          </Text>
        ) : null}

        <View style={styles.spacer} />
        <PrimaryButton
          testID="ob-pin-cta"
          label="Verify & connect"
          enabled={pin.length === PIN_LENGTH}
          onPress={verify}
        />
      </View>
    );
  } else if (stage === 'plugins') {
    body = (
      <View style={styles.stage}>
        <Text style={styles.title}>Choose plugins</Text>
        <Text style={styles.subcopy}>
          Add the tracking plugins you want to follow. You can add more later.
        </Text>
        <ScrollView style={styles.pluginList}>
          <PluginPicker plugins={allPlugins} />
        </ScrollView>
        <PrimaryButton testID="ob-plugins-cta" label="Done" onPress={finishOnboarding} />
      </View>
    );
  } else {
    body = (
      <View style={styles.verifying}>
        {verifyDone ? (
          <DrawnCheck />
        ) : (
          <Spinner size={44} borderWidth={3} track={colors.pageBg} head={colors.ink} />
        )}
        <Text style={styles.verifyTitle}>{verifyDone ? 'Connected' : 'Syncing your calendar'}</Text>
        <Text style={styles.verifyUrl}>{url || 'cal.yourdomain.com'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View key={stage} style={[styles.stageHost, stageStyle]}>
        {body}
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  stageHost: {
    flex: 1,
  },

  /* welcome */
  welcome: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  welcomeCentre: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  hero: {
    fontSize: 38,
    fontFamily: fonts.light,
    color: colors.ink,
    letterSpacing: -2,
    lineHeight: 40,
  },
  heroSub: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.muted,
    lineHeight: 23,
    maxWidth: 300,
  },

  /* shared stage chrome */
  stage: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 22,
    alignSelf: 'flex-start',
  },
  pressedFade: {
    opacity: 0.6,
  },
  backLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 29,
  },
  subcopy: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 30,
  },
  spacer: {
    flex: 1,
  },
  pluginList: {
    flex: 1,
    marginBottom: 16,
  },

  /* connect */
  fieldLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    borderRadius: radii.field,
    backgroundColor: colors.fieldBg,
  },
  fieldReady: {
    borderColor: colors.ink,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 16,
    color: colors.ink,
    fontFamily: MONO,
  },
  statusDisc: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  /* pin */
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  pinBox: {
    width: 48,
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.fieldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxLive: {
    borderColor: colors.ink,
  },
  pinBoxFocused: {
    backgroundColor: colors.canvas,
    shadowColor: '#0F0F0F',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  pinDigit: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.ink,
    textAlign: 'center',
  },
  /** Invisible field laid over the boxes so a tap anywhere raises the keypad. */
  pinCapture: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
  pinErrorText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.red,
  },

  /* verifying */
  verifying: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: 40,
  },
  verifyDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  verifyUrl: {
    fontSize: 13,
    fontFamily: MONO,
    color: colors.faint,
  },

  /* primary button */
  primaryWrap: {
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOn: {
    backgroundColor: colors.ink,
    shadowColor: '#0F0F0F',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    shadowOpacity: 0.16,
    elevation: 6,
  },
  primaryOff: {
    backgroundColor: '#EEEDEA',
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
  primaryLabelOn: {
    color: colors.canvas,
  },
  primaryLabelOff: {
    color: colors.faint,
  },
});
