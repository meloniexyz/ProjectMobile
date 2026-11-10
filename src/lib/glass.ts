import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Platform } from 'react-native'
import { useSettings } from './settings'

/** iOS 26+: Apple's real Liquid Glass material (UIGlassEffect) can be drawn. */
export const glassSupported = (): boolean => {
  if (Platform.OS !== 'ios') return false
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

/** True when the Liquid Glass interface is on and the phone can draw real glass. */
export function useGlass(): boolean {
  return useSettings().uiStyle === 'glass' && glassSupported()
}
