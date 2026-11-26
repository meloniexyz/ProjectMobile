import { useRef, useState } from 'react'
import { Modal, PanResponder, Pressable, ScrollView, Switch, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fxOf, PITCH_MAX, PITCH_MIN, RATE_MAX, RATE_MIN, setKeep, setLinked, setPitch, setRate, setReverb, setReverbLevel } from '../lib/effects'
import { useSettings } from '../lib/settings'
import { alpha, useColors } from '../lib/theme'
import { Icon, Txt } from './ui'

/**
 * The Speed panel (the desktop app's, for touch): speed presets, speed and pitch rulers you drag
 * with a finger, "Link speed to pitch", "Keep across tracks", reverb and its level. Opens as a
 * sheet from the Speed chip on the player screen.
 */

const PRESETS = [
  { label: 'x0.8', value: 0.8 },
  { label: 'x0.9', value: 0.9 },
  { label: 'x1.0', value: 1 },
  { label: 'x1.15', value: 1.15 },
  { label: 'x1.25', value: 1.25 },
  { label: 'x1.35', value: 1.35 },
]

export function SpeedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  useSettings() // re-render on every change
  const fx = fxOf()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close speed panel" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View
        testID="speed-sheet"
        style={{
          backgroundColor: c.bg2,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: insets.bottom + 16,
          maxHeight: '86%',
        }}
      >
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: alpha(c.text, 0.25), marginBottom: 12 }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {PRESETS.map((p) => {
              const on = Math.abs(fx.rate - p.value) < 0.02
              return (
                <Pressable
                  key={p.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Speed ${p.label}`}
                  onPress={() => setRate(p.value)}
                  style={{ flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.text : alpha(c.text, 0.08) }}
                >
                  <Txt size={12} weight="700" style={{ color: on ? c.bg : c.text2 }}>
                    {p.label}
                  </Txt>
                </Pressable>
              )
            })}
          </View>

          <Dial label="Speed" value={fx.rate} min={RATE_MIN} max={RATE_MAX} step={0.05} neutral={1} format={(v) => `x${v.toFixed(2)}`} onChange={setRate} />
          <Dial
            label="Pitch"
            value={fx.pitch}
            min={PITCH_MIN}
            max={PITCH_MAX}
            step={0.5}
            neutral={0}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`}
            onChange={setPitch}
          />

          <Toggle
            title="Link speed to pitch"
            hint={fx.linked ? 'Vinyl & tape style: speed alters pitch' : 'Key lock: keeps the original key while changing speed'}
            on={fx.linked}
            onChange={setLinked}
          />
          <Toggle title="Keep across tracks" hint="Keeps settings active for upcoming tracks" on={fx.keep} onChange={setKeep} />
          <Toggle title="Reverb" sparkle hint="Atmospheric space & ambient depth" on={fx.reverb} onChange={setReverb} />
          {fx.reverb ? (
            <Dial label="Reverb" value={fx.reverbLevel} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={setReverbLevel} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

/** points of drag per step: one tick (3) and its gap (5) */
const TICK = 8
/** extra ticks drawn past each end, so the ruler never runs out under the marker */
const PAD = 24

/** A ruler you drag sideways, one tick per step, the value under the marker; below it −, the value (tap: back to normal) and +. */
function Dial({
  label,
  value,
  min,
  max,
  step,
  neutral,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  neutral?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const c = useColors()
  const [width, setWidth] = useState(0)
  const snap = (v: number) => Math.min(max, Math.max(min, Number((min + Math.round((v - min) / step) * step).toFixed(3))))
  // the latest value and handler, for the drag (the responder is made once)
  const live = useRef({ value, onChange, snap })
  live.current = { value, onChange, snap }
  const start = useRef(value)
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = live.current.value
      },
      onPanResponderMove: (_, g) => {
        const v = live.current.snap(start.current - (g.dx / TICK) * step)
        if (v !== live.current.value) live.current.onChange(v)
      },
    }),
  ).current
  const set = (v: number) => {
    const s = snap(v)
    if (s !== value) onChange(s)
  }
  const count = Math.round((max - min) / step) + 1
  const index = (value - min) / step
  const text = format(value)
  return (
    <View style={{ gap: 6 }}>
      <Txt size={14} weight="700">
        {label}
      </Txt>
      <View
        {...pan.panHandlers}
        testID={`dial-${label.toLowerCase()}`}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: 44, overflow: 'hidden', borderRadius: 6 }}
      >
        <View style={{ position: 'absolute', top: 0, left: width / 2 - 7, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: alpha(c.text, 0.45) }} />
        <View
          style={{
            position: 'absolute',
            top: 18,
            bottom: 4,
            left: width / 2,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 5,
            transform: [{ translateX: -(index + PAD) * TICK - 1.5 }],
          }}
        >
          {Array.from({ length: count + PAD * 2 }, (_, i) => {
            const n = i - PAD
            const dist = Math.abs(n - index) * TICK
            // fade toward the edges, like the desktop ruler
            const fade = width ? Math.max(0, 1 - Math.max(0, dist - width * 0.28) / (width * 0.22)) : 1
            const cur = n === Math.round(index)
            const out = n < 0 || n >= count
            return <View key={i} style={{ width: 3, height: '100%', borderRadius: 2, backgroundColor: cur ? c.text : alpha(c.text, out ? 0.12 : 0.35), opacity: fade }} />
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StepButton icon="remove" label={`Lower ${label.toLowerCase()}`} disabled={value <= min} onPress={() => set(value - step)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={neutral === undefined ? text : `${text}, tap to reset`}
          disabled={neutral === undefined}
          onPress={() => neutral !== undefined && onChange(neutral)}
          style={{ minWidth: 72, height: 32, paddingHorizontal: 12, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c.text, 0.1) }}
        >
          <Txt size={14} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
            {text}
          </Txt>
        </Pressable>
        <StepButton icon="add" label={`Raise ${label.toLowerCase()}`} disabled={value >= max} onPress={() => set(value + step)} />
      </View>
    </View>
  )
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 44, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c.text, 0.1), opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={18} color={c.text} />
    </Pressable>
  )
}

function Toggle({ title, hint, on, onChange, sparkle }: { title: string; hint: string; on: boolean; onChange: (on: boolean) => void; sparkle?: boolean }) {
  const c = useColors()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt size={14} weight="700">
            {title}
          </Txt>
          {sparkle ? <Icon name="sparkles" size={13} color="#fbbf24" /> : null}
        </View>
        <Txt tone="text3" size={12}>
          {hint}
        </Txt>
      </View>
      <Switch accessibilityLabel={title} value={on} onValueChange={onChange} trackColor={{ true: c.accent }} />
    </View>
  )
}
