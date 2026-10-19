import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { ProfileCard } from '../components/Profile'
import { Empty, Header, Spinner } from '../components/ui'
import { person, type ShownProfile } from '../lib/sync'
import { useColors } from '../lib/theme'

/** Someone's profile, from Search → ProjectM. */
export default function PersonScreen() {
  const c = useColors()
  const { handle } = useLocalSearchParams<{ handle: string }>()
  const [p, setP] = useState<ShownProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setP(null)
    setError(null)
    person(handle).then(setP, (e) => setError(String((e as Error)?.message ?? e)))
  }, [handle])
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={`@${handle}`} />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>{error ? <Empty icon="person-outline" title={`@${handle}`} text={error} /> : p ? <ProfileCard profile={p} /> : <Spinner />}</ScrollView>
    </View>
  )
}
