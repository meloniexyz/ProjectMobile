import { ServerGrid } from './albums'

/** Side panel → Artists: the server's album artists, two per row. */
export default function ServerArtists() {
  return <ServerGrid kind="artists" />
}
