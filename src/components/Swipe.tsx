import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Animated, PanResponder, View, type StyleProp, type ViewStyle } from 'react-native'

export interface SwipeHandlers {
  onLeft?: () => void
  onRight?: () => void
  onUp?: () => void
  onDown?: () => void
}

const DISTANCE = 60
const VELOCITY = 0.45
const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})

/**
 * Wraps content that reacts to swipes (Spotify-style): the content follows your finger along the
 * swipe's axis, and a far/fast enough swipe triggers the action. Taps still go through.
 * `follow` limits which directions visibly move the content (e.g. only down for "swipe to close").
 */
export function Swipeable({
  children,
  style,
  follow = 'x',
  ...handlers
}: SwipeHandlers & { children: ReactNode; style?: StyleProp<ViewStyle>; follow?: 'x' | 'y' | 'down' | 'none' }) {
  const x = useRef(new Animated.Value(0)).current
  const y = useRef(new Animated.Value(0)).current
  const h = useRef(handlers)
  h.current = handlers
  const axis = useRef<'x' | 'y' | null>(null)

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => {
          const horizontal = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4
          const vertical = Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4
          if (horizontal && (h.current.onLeft || h.current.onRight)) {
            axis.current = 'x'
            return true
          }
          if (vertical && ((g.dy < 0 && h.current.onUp) || (g.dy > 0 && h.current.onDown))) {
            axis.current = 'y'
            return true
          }
          return false
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          if (axis.current === 'x' && follow === 'x') x.setValue(g.dx * 0.6)
          if (axis.current === 'y' && (follow === 'y' || (follow === 'down' && g.dy > 0))) y.setValue(follow === 'down' ? g.dy : g.dy * 0.4)
        },
        onPanResponderRelease: (_, g) => {
          const hh = h.current
          let fired = false
          if (axis.current === 'x') {
            if ((g.dx < -DISTANCE || g.vx < -VELOCITY) && hh.onLeft) {
              hh.onLeft()
              fired = true
            } else if ((g.dx > DISTANCE || g.vx > VELOCITY) && hh.onRight) {
              hh.onRight()
              fired = true
            }
          } else if (axis.current === 'y') {
            if ((g.dy < -DISTANCE || g.vy < -VELOCITY) && hh.onUp) {
              hh.onUp()
              fired = true
            } else if ((g.dy > DISTANCE * 1.5 || g.vy > VELOCITY * 1.5) && hh.onDown) {
              hh.onDown()
              fired = true
            }
          }
          if (fired) tick()
          axis.current = null
          Animated.parallel([
            Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }),
            Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
          ]).start()
        },
        onPanResponderTerminate: () => {
          axis.current = null
          Animated.parallel([
            Animated.spring(x, { toValue: 0, useNativeDriver: true }),
            Animated.spring(y, { toValue: 0, useNativeDriver: true }),
          ]).start()
        },
      }),
    [follow, x, y],
  )

  return (
    <Animated.View style={[style, { transform: [{ translateX: x }, { translateY: y }] }]} {...responder.panHandlers}>
      {children}
    </Animated.View>
  )
}

const QUEUE_AT = 72

/**
 * Spotify's swipe right to add to queue: the row follows your finger, a queue icon shows behind it
 * and fills in (with a tick) once you've gone far enough; let go there to add the song. A short or
 * mostly vertical drag does nothing, so scrolling stays easy.
 */
export function SwipeToQueue({ children, onQueue, color }: { children: ReactNode; onQueue: () => void; color: string }) {
  const x = useRef(new Animated.Value(0)).current
  const armed = useRef(false)
  const cb = useRef(onQueue)
  cb.current = onQueue
  const [ready, setReady] = useState(false)

  const responder = useMemo(
    () =>
      PanResponder.create({
        // only a clearly sideways drag to the right
        onMoveShouldSetPanResponder: (_, g) => g.dx > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          const dx = Math.max(0, g.dx)
          // follows the finger, then resists past the trigger point
          x.setValue(dx < QUEUE_AT ? dx : QUEUE_AT + (dx - QUEUE_AT) * 0.35)
          const now = dx >= QUEUE_AT
          if (now !== armed.current) {
            armed.current = now
            setReady(now)
            if (now) tick()
          }
        },
        onPanResponderRelease: () => {
          if (armed.current) {
            cb.current()
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
          }
          armed.current = false
          setReady(false)
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 5, speed: 18 }).start()
        },
        onPanResponderTerminate: () => {
          armed.current = false
          setReady(false)
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
        },
      }),
    [x],
  )

  const reveal = x.interpolate({ inputRange: [0, QUEUE_AT], outputRange: [0, 1], extrapolate: 'clamp' })
  return (
    <View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: QUEUE_AT + 40, justifyContent: 'center', paddingLeft: 22, opacity: reveal }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? color : 'transparent', borderWidth: 2, borderColor: color }}>
          <Ionicons name="list" size={18} color={ready ? '#000' : color} />
        </View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}
