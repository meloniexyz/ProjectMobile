/** Self-check for works.ts: `npx tsx src/core/works.check.ts` (throws on a regression). */
import { workGroups } from './works'

const same = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
}
const t = (s: string) => s
// two movements of one work group; numbered pieces of a set ("1 in C Major") don't
same(
  workGroups(['Op. 33: I. Allegro', 'Op. 33: II. Adagio', 'Nocturne', 'Préludes: 1 in C Major', 'Préludes: 2 in A Minor', 'S. 178: I. Lento', 'S. 178: II. Andante'], t, t).map((g) => [g.start, g.count, g.title]),
  [[0, 2, 'Op. 33'], [5, 2, 'S. 178']],
)
// a saved work wins and keeps its title and Live flag
same(workGroups(['a', 'b', 'c'], t, t, [{ Id: 1, Title: 'Saved', IsLive: true, TrackItemIds: ['b', 'c'] }]), [{ start: 1, count: 2, title: 'Saved', live: true }])
// " - " when there's no ": " (PAKM071), and "Hob. XVI:52" (no space) isn't a separator
same(
  workGroups(['Sonata No. 62, Hob. XVI:52 - I. Allegro moderato', 'Sonata No. 62, Hob. XVI:52 - II. Adagio', 'Vers la flamme, Op. 72'], t, t).map((g) => [g.start, g.count, g.title]),
  [[0, 2, 'Sonata No. 62, Hob. XVI:52']],
)
// the short work name repeated after the full one (Grieg on the Moiseiwitsch album)
same(
  workGroups(['Concerto, Op. 16: Concerto: I. Allegro', 'Concerto, Op. 16: II. Adagio'], t, t).map((g) => [g.start, g.count, g.title]),
  [[0, 2, 'Concerto, Op. 16']],
)
console.log('works ok')
