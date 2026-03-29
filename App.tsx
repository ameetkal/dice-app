import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

/** 3×3 grid: which cells show a pip (standard die layouts). */
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

function rollValue(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function DiceFace({ value }: { value: number | null }) {
  const grid = value ? PIP_LAYOUT[value] : EMPTY_GRID;
  return (
    <View style={styles.dice}>
      {grid.map((row, ri) => (
        <View key={ri} style={styles.diceRow}>
          {row.map((show, ci) => (
            <View key={ci} style={styles.pipCell}>
              {show ? <View style={styles.pip} /> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function App() {
  const [face, setFace] = useState<number | null>(null);
  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

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
    const next = rollValue();
    setFace(next);
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 180);
    }
  }, [animateRoll]);

  const spinInterpolate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '18deg'],
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.inner}>
          <Text style={styles.title}>Roll the die</Text>
          <Text style={styles.subtitle}>Tap the die or button</Text>

          <Pressable
            onPress={onRoll}
            accessibilityRole="button"
            accessibilityLabel="Roll six-sided die"
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
              <DiceFace value={face} />
            </Animated.View>
          </Pressable>

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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const BG = '#0f1419';
const DIE = '#e8e4dc';
const PIP = '#1a1f26';
const ACCENT = '#c9a227';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: DIE,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8a9199',
    marginBottom: 40,
  },
  diceWrap: {
    marginBottom: 36,
  },
  dice: {
    width: 168,
    height: 168,
    borderRadius: 22,
    backgroundColor: DIE,
    padding: 14,
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
  pip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PIP,
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
});
