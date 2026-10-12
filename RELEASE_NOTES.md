**Install / update:** download the `.ipa` below and install it with [Sideloadly](https://sideloadly.io) using the same Apple ID as before (your data stays). With a free Apple ID, reinstall every 7 days.

**New in 1.3.1**
- **YouTube songs that failed with "response has status 403" now play:** the app checks YouTube's audio address before using it. If YouTube refuses it, the other connection methods are tried (including your signed-in YouTube account), and if all are refused the song plays from SoundCloud instead of failing.
- **Playlist sync sign-in fixed:** leaving the app to enter the code on GitHub no longer fails with "The network connection was lost". Syncing also retries when the connection drops for a moment.

**From 1.3.0**
- **Playlist sync:** Settings → Playlist sync → Connect GitHub. Your ProjectM playlists stay the same on this phone, ProjectM on your PC (1.0.12+) and your other phones, stored in your private `projectm-sync` GitHub repository.
- **Save to my playlists:** Spotify, YouTube and SoundCloud playlists can be saved as ProjectM playlists, which mix songs from any service (like on PC).
- **Right version of songs:** Spotify songs now play the explicit version when Spotify's is explicit (clean when it's clean); clean, censored, edited and radio-version copies are skipped. Songs are matched again with the new rules.
- **Seek bar fixed:** you can drag it on SoundCloud songs (it stayed locked if the player opened while the song was loading).
- **Equalizer:** the page no longer scrolls while you drag a band.
- **Local songs across devices:** a song from your own files in a synced playlist plays this phone's copy if it has the same song.

**From 1.2.1**
- **Feishin theme** (Settings → Themes): the Feishin look with the Inter font, white rounded play buttons and flat chips, same as the new Feishin theme on Windows (ProjectM 1.0.11). Works with your own accent colour; nothing else changes.

**From 1.2.0**
- **Swipe controls:** playing bar: swipe left/right for next/previous, up to open the player. Player: swipe the cover left/right to skip, down (cover or top bar) to close. Song lists: swipe a song right to add it to the queue.
- **YouTube works through more connections:** if YouTube shows its "confirm you're not a bot" check, the app tries a YouTube-issued session and then your signed-in YouTube account (Settings → Accounts), and remembers what works. Songs still fall back to SoundCloud if nothing does.
- **Diagnostics:** new "YouTube connection methods" check shows what YouTube accepts on your phone.

Also includes everything from 1.1.0: Liquid Glass interface, playing bar on every screen, "Spotify songs play from" setting, and source → route logos.
