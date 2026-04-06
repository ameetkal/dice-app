import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = '@dice_app_settings_v1';
const LOGS_KEY = '@dice_app_roll_logs_v1';
const SITE_URL = 'https://dicetheory.org';

type RollLogEntry = {
  id: string;
  createdAt: string;
  description: string;
  outcomeSummary: string;
  people: string[];
};

function newLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildOutcomeSummary(
  numDice: number,
  sides: number,
  vals: number[],
): string {
  const vs = vals.join(', ');
  const prefix = `${numDice}d${sides}`;
  if (numDice > 1) {
    const t = vals.reduce((a, b) => a + b, 0);
    return `${prefix} · ${vs} · total ${t}`;
  }
  return `${prefix} · ${vs}`;
}

function parsePeople(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidLogEntry(x: unknown): x is RollLogEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.description === 'string' &&
    typeof o.outcomeSummary === 'string' &&
    Array.isArray(o.people) &&
    o.people.every((p) => typeof p === 'string')
  );
}

function formatLogTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

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
  const [logsHydrated, setLogsHydrated] = useState(false);
  const [screen, setScreen] = useState<'main' | 'history'>('main');
  const [numDice, setNumDice] = useState(1);
  const [sides, setSides] = useState<number>(6);
  const [values, setValues] = useState<number[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<RollLogEntry[]>([]);

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logOutcomeSummary, setLogOutcomeSummary] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logPeople, setLogPeople] = useState('');

  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void (async () => {
      const [settingsRaw, logsRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(LOGS_KEY),
      ]);
      const parsed = parseStored(settingsRaw);
      if (parsed?.numDice != null) setNumDice(parsed.numDice);
      if (parsed?.sides != null) setSides(parsed.sides);
      if (logsRaw) {
        try {
          const arr = JSON.parse(logsRaw) as unknown;
          if (Array.isArray(arr)) {
            setLogs(arr.filter(isValidLogEntry));
          }
        } catch {
          /* ignore */
        }
      }
      setSettingsReady(true);
      setLogsHydrated(true);
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
    if (!logsHydrated) return;
    void AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [logs, logsHydrated]);

  const sortedLogs = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [logs],
  );

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

  const closeLogModal = useCallback(() => {
    setLogModalOpen(false);
    setEditingLogId(null);
    setLogDescription('');
    setLogPeople('');
    setLogOutcomeSummary('');
  }, []);

  const openLogCreate = useCallback(() => {
    if (!values?.length) return;
    setEditingLogId(null);
    setLogOutcomeSummary(buildOutcomeSummary(numDice, sides, values));
    setLogDescription('');
    setLogPeople('');
    setLogModalOpen(true);
  }, [numDice, sides, values]);

  const openLogEdit = useCallback((entry: RollLogEntry) => {
    setEditingLogId(entry.id);
    setLogOutcomeSummary(entry.outcomeSummary);
    setLogDescription(entry.description);
    setLogPeople(entry.people.join(', '));
    setLogModalOpen(true);
  }, []);

  const saveLog = useCallback(() => {
    const peopleArr = parsePeople(logPeople);
    if (editingLogId) {
      setLogs((prev) =>
        prev.map((e) =>
          e.id === editingLogId
            ? {
                ...e,
                description: logDescription.trim(),
                people: peopleArr,
              }
            : e,
        ),
      );
    } else {
      const entry: RollLogEntry = {
        id: newLogId(),
        createdAt: new Date().toISOString(),
        description: logDescription.trim(),
        outcomeSummary: logOutcomeSummary,
        people: peopleArr,
      };
      setLogs((prev) => [entry, ...prev]);
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    closeLogModal();
  }, [
    closeLogModal,
    editingLogId,
    logDescription,
    logOutcomeSummary,
    logPeople,
  ]);

  const confirmDeleteLog = useCallback(() => {
    if (!editingLogId) return;
    Alert.alert(
      'Delete entry?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setLogs((prev) => prev.filter((e) => e.id !== editingLogId));
            closeLogModal();
          },
        },
      ],
    );
  }, [closeLogModal, editingLogId]);

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
        {screen === 'main' ? (
          <>
            <View style={styles.topBar}>
              <Pressable
                onPress={() => setScreen('history')}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.iconBtnPressed,
                ]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Roll log"
              >
                <Ionicons name="list-outline" size={26} color={ACCENT} />
              </Pressable>
              <Pressable
                onPress={() => setSettingsOpen(true)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.iconBtnPressed,
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

              {values ? (
                total != null ? (
                  <Text style={styles.totalLine}>Total: {total}</Text>
                ) : (
                  <View style={styles.totalSpacerSmall} />
                )
              ) : (
                <View style={styles.totalPlaceholder} />
              )}

              {values ? (
                <Pressable
                  onPress={openLogCreate}
                  style={({ pressed }) => [
                    styles.logThisRollBtn,
                    pressed && styles.logThisRollBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Log this roll"
                >
                  <Text style={styles.logThisRollText}>Log this roll</Text>
                </Pressable>
              ) : null}

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
          </>
        ) : (
          <>
            <View style={styles.topBarHistory}>
              <Pressable
                onPress={() => setScreen('main')}
                style={({ pressed }) => [
                  styles.historyBackBtn,
                  pressed && styles.historyBackPressed,
                ]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={28} color={DIE} />
              </Pressable>
              <Text style={styles.historyHeaderTitle}>Roll log</Text>
              <View style={styles.topBarHistorySpacer} />
            </View>
            <FlatList
              style={styles.historyList}
              contentContainerStyle={styles.historyListContent}
              data={sortedLogs}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.historyEmpty}>
                  No entries yet. Roll the dice, then use Log this roll to add one.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openLogEdit(item)}
                  style={({ pressed }) => [
                    styles.logCard,
                    pressed && styles.logCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityHint="Open to edit"
                >
                  <Text style={styles.logCardTime}>
                    {formatLogTime(item.createdAt)}
                  </Text>
                  <Text style={styles.logCardDesc} numberOfLines={3}>
                    {item.description.trim() || 'No description'}
                  </Text>
                  <Text style={styles.logCardOutcome}>{item.outcomeSummary}</Text>
                  {item.people.length > 0 ? (
                    <Text style={styles.logCardPeople} numberOfLines={2}>
                      {item.people.join(' · ')}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
          </>
        )}

        <Modal
          visible={logModalOpen}
          animationType="slide"
          transparent
          onRequestClose={closeLogModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoid}
          >
            <View style={styles.modalOverlay}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={closeLogModal}
                accessibilityRole="button"
                accessibilityLabel="Close log"
              />
              <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.logSheetScroll}
                >
                  <View style={styles.modalHandle} />
                  <Text style={styles.modalTitle}>
                    {editingLogId ? 'Edit log entry' : 'Log this roll'}
                  </Text>
                  <Text style={styles.sectionLabel}>Roll</Text>
                  <Text style={styles.outcomeReadonly}>{logOutcomeSummary}</Text>

                  <Text style={styles.sectionLabel}>What was it for?</Text>
                  <TextInput
                    value={logDescription}
                    onChangeText={setLogDescription}
                    placeholder="Short description (optional)"
                    placeholderTextColor="rgba(138, 145, 153, 0.7)"
                    style={[styles.textInput, styles.textInputMultiline]}
                    multiline
                  />

                  <Text style={styles.sectionLabel}>People</Text>
                  <TextInput
                    value={logPeople}
                    onChangeText={setLogPeople}
                    placeholder="Comma-separated names (optional)"
                    placeholderTextColor="rgba(138, 145, 153, 0.7)"
                    style={styles.textInput}
                    autoCapitalize="words"
                    autoCorrect
                  />

                  {editingLogId ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteLogButton,
                        pressed && styles.deleteLogButtonPressed,
                      ]}
                      onPress={confirmDeleteLog}
                      accessibilityRole="button"
                      accessibilityLabel="Delete log entry"
                    >
                      <Text style={styles.deleteLogLabel}>Delete entry</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.doneButton,
                      pressed && styles.doneButtonPressed,
                    ]}
                    onPress={saveLog}
                    accessibilityRole="button"
                    accessibilityLabel="Save log entry"
                  >
                    <Text style={styles.doneLabel}>Save</Text>
                  </Pressable>
                  <Pressable
                    onPress={closeLogModal}
                    style={styles.cancelLink}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.cancelLinkText}>Cancel</Text>
                  </Pressable>
                </ScrollView>
              </SafeAreaView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  topBarHistory: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  historyBackBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  historyBackPressed: {
    opacity: 0.75,
  },
  historyHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: DIE,
  },
  topBarHistorySpacer: {
    width: 44,
  },
  historyList: {
    flex: 1,
    width: '100%',
  },
  historyListContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  historyEmpty: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 16,
    lineHeight: 24,
    color: MUTED,
    paddingHorizontal: 16,
  },
  logCard: {
    backgroundColor: '#151c24',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3340',
    padding: 16,
    marginBottom: 12,
  },
  logCardPressed: {
    opacity: 0.92,
    borderColor: 'rgba(201, 162, 39, 0.35)',
  },
  logCardTime: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 8,
  },
  logCardDesc: {
    fontSize: 16,
    fontWeight: '600',
    color: DIE,
    marginBottom: 8,
    lineHeight: 22,
  },
  logCardOutcome: {
    fontSize: 14,
    color: MUTED,
    fontVariant: ['tabular-nums'],
    marginBottom: 6,
  },
  logCardPeople: {
    fontSize: 13,
    color: 'rgba(138, 145, 153, 0.9)',
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3340',
    backgroundColor: '#151c24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    opacity: 0.85,
    borderColor: ACCENT,
  },
  keyboardAvoid: {
    flex: 1,
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
  totalSpacerSmall: {
    height: 8,
    marginBottom: 16,
  },
  logThisRollBtn: {
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.45)',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  logThisRollBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(201, 162, 39, 0.08)',
  },
  logThisRollText: {
    color: ACCENT,
    opacity: 0.82,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  logSheetScroll: {
    paddingBottom: 24,
  },
  outcomeReadonly: {
    fontSize: 16,
    fontWeight: '600',
    color: DIE,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#2a3340',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    fontVariant: ['tabular-nums'],
  },
  textInput: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#2a3340',
    borderRadius: 12,
    padding: 14,
    color: DIE,
    fontSize: 16,
    marginBottom: 20,
  },
  textInputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  deleteLogButton: {
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(180, 90, 90, 0.5)',
    alignItems: 'center',
    backgroundColor: 'rgba(80, 40, 40, 0.25)',
  },
  deleteLogButtonPressed: {
    opacity: 0.85,
  },
  deleteLogLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d88a8a',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: MUTED,
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
