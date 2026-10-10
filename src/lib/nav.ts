import { router, useNavigation } from 'expo-router'
import { useCallback } from 'react'

/**
 * "Back" for the current screen, using the screen's own navigator (works from inside
 * full-screen modals, where the global router.back() can miss).
 */
export function useGoBack() {
  const navigation = useNavigation()
  return useCallback(() => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack()
        return
      }
    } catch (err) {
      console.warn('[nav] goBack failed', err)
    }
    router.replace('/')
  }, [navigation])
}
