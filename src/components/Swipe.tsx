import * as Haptics from 'expo-haptics'
import { useMemo, useRef, type ReactNode } from 'react'
import { Animated, PanResponder, type StyleProp, type ViewStyle } from 'react-native'

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
