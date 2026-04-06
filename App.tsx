import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = '@dice_app_settings_v1';
const SITE_URL = 'https://dicetheory.org';

/** Standard polyhedral set — common for tabletop / RPG. */
const SIDES_OPTIONS = [4, 6, 8, 10, 12, 20] as const;
type SidesOption = (typeof SIDES_OPTIONS)[number];
const MAX_DICE = 6;

type StoredSettings = { numDice: number; sides: number };

const EMPTY_GRID: boolean[][] = [
  [false, false, false],
  [false, false, false],
  [false, false, false],
];

const PIP_LAYOUT: Record<number, boolean[][]> = {
  1: [
    [false, false, false],
    [false, true, false],
    [false, false, false],
  ],
  2: [
    [true, false, false],
    [false, false, false],
    [false, false, true],
  ],
  3: [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ],
  4: [
    [true, false, true],
    [false, false, false],
    [true, false, true],
  ],
  5: [
    [true, false, true],
    [false, true, false],
    [true, false, true],
  ],
  6: [
    [true, false, true],
    [true, false, true],
    [true, false, true],
  ],
};

function rollOne(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function getDieSize(numDice: number): number {
  if (numDice <= 1) return 168;
  if (numDice <= 3) return 104;
  if (numDice === 4) return 96;
  return 82;
}

function DiceFace({ value, size }: { value: number | null; size: number }) {
  const grid = value != null && value >= 1 && value <= 6 ? PIP_LAYOUT[value] : EMPTY_GRID;
  const pip = Math.max(10, Math.round(size * 0.12));
  const pad = Math.round(size * 0.085);
  const r = Math.round(size * 0.12);

  return (
    <View style={[styles.dice, { width: size, height: size, borderRadius: r, padding: pad }]}>
      {grid.map((row, ri) => (
        <View key={ri} style={styles.diceRow}>
          {row.map((show, ci) => (
            <View key={ci} style={styles.pipCell}>
              {show ? (
                <View
                  style={[styles.pipStatic, { width: pip, height: pip, borderRadius: pip / 2 }]}
                />
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function NumericDie({
  value,
  size,
  sides,
}: {
  value: number | null;
  size: number;
  sides: number;
}) {
  const r = Math.round(size * 0.12);
  const show = value != null ? String(value) : '';
  const maxVal = sides;
  const twoDigit = maxVal >= 10;
  const fontSize = twoDigit
    ? value != null && value >= 10
      ? Math.round(size * 0.36)
      : Math.round(size * 0.44)
    : Math.round(size * 0.48);

  return (
    <View
      style={[
        styles.numericDie,
        { width: size, height: size, borderRadius: r },
      ]}
    >
      <Text
        style={[styles.numericDieText, { fontSize }]}
        adjustsFontSizeToFit
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {show}
      </Text>
    </View>
  );
}

function DieTile({
  value,
  size,
  sides,
}: {
  value: number | null;
  size: number;
  sides: number;
}) {
  if (sides === 6) {
    return <DiceFace value={value} size={size} />;
  }
  return <NumericDie value={value} size={size} sides={sides} />;
}

function parseStored(raw: string | null): Partial<StoredSettings> | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as StoredSettings;
    const out: Partial<StoredSettings> = {};
    if (
      typeof p.numDice === 'number' &&
      p.numDice >= 1 &&
      p.numDice <= MAX_DICE
    ) {
      out.numDice = p.numDice;
    }
    if (
      typeof p.sides === 'number' &&
      SIDES_OPTIONS.includes(p.sides as SidesOption)
    ) {
      out.sides = p.sides;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [settingsReady, setSettingsReady] = useState(false);
  const [numDice, setNumDice] = useState(1);
  const [sides, setSides] = useState<number>(6);
  const [values, setValues] = useState<number[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void (async () => {
      const parsed = parseStored(await AsyncStorage.getItem(STORAGE_KEY));
      if (parsed?.numDice != null) setNumDice(parsed.numDice);
      if (parsed?.sides != null) setSides(parsed.sides);
      setSettingsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    void AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ numDice, sides } satisfies StoredSettings),
    );
  }, [numDice, sides, settingsReady]);

  useEffect(() => {
    setValues(null);
  }, [numDice, sides]);

  const dieSize = useMemo(() => getDieSize(numDice), [numDice]);

  const animateRoll = useCallback(() => {
    spin.setValue(0);
    scale.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(spin, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(spin, {
          toValue: 0,
          friction: 5,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.92,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [scale, spin]);

  const onRoll = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    animateRoll();
    const next = Array.from({ length: numDice }, () => rollOne(sides));
    setValues(next);
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 180);
    }
  }, [animateRoll, numDice, sides]);

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '18deg'],
  });

  const configLabel = `${numDice} ${numDice === 1 ? 'die' : 'dice'} · d${sides}`;
  const title = numDice === 1 ? 'Roll the die' : 'Roll the dice';
  const total =
    values && numDice > 1 ? values.reduce((a, b) => a + b, 0) : null;

  const slotValues =
    values ??
    Array.from({ length: numDice }, () => null as number | null);

  const dieGap = numDice <= 3 ? 14 : 10;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.topBar}>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [
              styles.settingsBtn,
              pressed && styles.settingsBtnPressed,
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={26} color={ACCENT} />
          </Pressable>
        </View>
        <View style={styles.inner}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.configHint}>{configLabel}</Text>
          </View>

          <Pressable
            onPress={onRoll}
            accessibilityRole="button"
            accessibilityLabel={`Roll ${numDice} ${numDice === 1 ? 'die' : 'dice'}, ${sides} sides each`}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Animated.View
              style={[
                styles.diceWrap,
                {
                  transform: [{ rotate: spinInterpolate }, { scale }],
                },
              ]}
            >
              <View
                style={[
                  styles.diceGrid,
                  { gap: dieGap, marginHorizontal: -dieGap / 2 },
                ]}
              >
                {slotValues.map((v, i) => (
                  <View key={i} style={{ marginHorizontal: dieGap / 2 }}>
                    <DieTile value={v} size={dieSize} sides={sides} />
                  </View>
                ))}
              </View>
            </Animated.View>
          </Pressable>

          {total != null ? (
            <Text style={styles.totalLine}>Total: {total}</Text>
          ) : (
            <View style={styles.totalPlaceholder} />
          )}

          <Pressable
            onPress={onRoll}
            style={({ pressed }) => [
              styles.rollButton,
              pressed && styles.rollButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Roll again"
          >
            <Text style={styles.rollLabel}>Roll</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void Linking.openURL(SITE_URL)}
          style={({ pressed }) => [
            styles.siteFooter,
            pressed && styles.siteFooterPressed,
          ]}
          accessibilityRole="link"
          accessibilityHint="Opens in your browser"
        >
          <Text style={styles.siteFooterText}>dicetheory.org</Text>
        </Pressable>

        <Modal
          visible={settingsOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setSettingsOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setSettingsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            />
            <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Dice setup</Text>
              <Text style={styles.modalCaption}>
                Choose how many dice to roll and how many sides each has.
              </Text>

              <Text style={styles.sectionLabel}>Number of dice</Text>
              <View style={styles.chipRow}>
                {Array.from({ length: MAX_DICE }, (_, i) => i + 1).map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setNumDice(n)}
                    style={[
                      styles.chip,
                      numDice === n && styles.chipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: numDice === n }}
                    accessibilityLabel={`${n} dice`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        numDice === n && styles.chipTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Sides per die</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sidesScroll}
              >
                {SIDES_OPTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSides(s)}
                    style={[
                      styles.sideChip,
                      sides === s && styles.sideChipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sides === s }}
                    accessibilityLabel={`d${s}`}
                  >
                    <Text
                      style={[
                        styles.sideChipText,
                        sides === s && styles.sideChipTextActive,
                      ]}
                    >
                      d{s}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [
                  styles.doneButton,
                  pressed && styles.doneButtonPressed,
                ]}
                onPress={() => setSettingsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.doneLabel}>Done</Text>
              </Pressable>
            </SafeAreaView>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const BG = '#0f1419';
const DIE = '#e8e4dc';
const PIP = '#1a1f26';
const ACCENT = '#c9a227';
const MUTED = '#8a9199';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 24,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: DIE,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  configHint: {
    marginTop: 6,
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },
  settingsBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3340',
    backgroundColor: '#151c24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnPressed: {
    opacity: 0.85,
    borderColor: ACCENT,
  },
  siteFooter: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  siteFooterPressed: {
    opacity: 0.7,
  },
  siteFooterText: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    opacity: 0.66,
    letterSpacing: 0.3,
  },
  diceWrap: {
    marginBottom: 20,
  },
  diceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 400,
  },
  dice: {
    backgroundColor: DIE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  diceRow: {
    flex: 1,
    flexDirection: 'row',
  },
  pipCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipStatic: {
    backgroundColor: PIP,
  },
  numericDie: {
    backgroundColor: DIE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  numericDieText: {
    fontWeight: '800',
    color: PIP,
    fontVariant: ['tabular-nums'],
  },
  totalLine: {
    fontSize: 18,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  totalPlaceholder: {
    height: 34,
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.92,
  },
  rollButton: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  rollButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  rollLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: BG,
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    backgroundColor: '#151c24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderColor: '#2a3340',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2a3340',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: DIE,
    marginBottom: 8,
  },
  modalCaption: {
    fontSize: 15,
    color: MUTED,
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    minWidth: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3340',
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chipActive: {
    borderColor: ACCENT,
    backgroundColor: '#2a2310',
  },
  chipText: {
    fontSize: 18,
    fontWeight: '700',
    color: MUTED,
    fontVariant: ['tabular-nums'],
  },
  chipTextActive: {
    color: ACCENT,
  },
  sidesScroll: {
    gap: 10,
    paddingBottom: 8,
    marginBottom: 20,
  },
  sideChip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3340',
    backgroundColor: BG,
  },
  sideChipActive: {
    borderColor: ACCENT,
    backgroundColor: '#2a2310',
  },
  sideChipText: {
    fontSize: 16,
    fontWeight: '700',
    color: MUTED,
  },
  sideChipTextActive: {
    color: ACCENT,
  },
  doneButton: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  doneButtonPressed: {
    opacity: 0.9,
  },
  doneLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: BG,
  },
});
