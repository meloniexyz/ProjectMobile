**Install / update:** download the `.ipa` below and install it with [Sideloadly](https://sideloadly.io) using the same Apple ID as before (your data stays). With a free Apple ID, reinstall every 7 days.

**New in 1.5.0: everything follows your ProjectM account** (with ProjectM 1.2.0 on Windows)
- **Look, sound and quality:** theme, accent, logo, style, equalizer, loudness, volume leveling and your Wi-Fi / mobile data / download quality. A newly logged-in phone takes on your account's settings.
- **Listening history:** plays from every device in one History, "Jump back in" and "Most played".
- **YouTube Music and SoundCloud sign-ins** come with your account, encrypted on the device; logging out removes them. Spotify gets your Client ID, so connecting is one tap.
- **Your own songs:** local songs in synced playlists arrive from your other devices (on Wi-Fi unless "download on mobile data" is on) and are deleted from the server once every device has them.
- **Search tabs:** Songs, Artists, Playlists and Profiles, for one platform or **All**.
- **New releases on Home**, only from the people you follow on Spotify, SoundCloud and YouTube (music only, Spotify first). Songs over 8 minutes are skipped; change it in Settings → Display.
- **Spotify:** reconnect once so ProjectM can see the artists you follow.

**From 1.4.0: ProjectM accounts.** Log in on any iPhone or PC (ProjectM 1.1.0+) and your playlists are there.
- **First launch:** ProjectM asks you to log in or create a free account. You can also do it any time in Settings → ProjectM account.
- **What syncs:** your ProjectM playlists (mixed Spotify/YouTube/SoundCloud/local songs) and covers you picked from your photos, a few seconds after a change, when you open the app and every 2 minutes.
- **Devices:** see every PC and iPhone on your account, and log out one you don't use any more.
- **Your password never leaves your phone.** It's turned into keys on the phone; the server can't read it.
- **Forgot your password?** Set a new one from any device that's still logged in (no old password needed), use your recovery code, or ask the server owner to allow a reset.
- **Replaces GitHub playlist sync:** after you log in, your playlists move to your account and the old GitHub sign-in is removed.

**From 1.3.2**
- **New ProjectM logo and app icon.**
- **Logo styles:** Settings → Themes → Logo. Pick the M or round M on the theme surface, dark, or charcoal, in your accent colour. Your home screen icon changes with it (iOS shows a short "icon changed" notice), and the logo appears on Home and in Settings. Custom accent colours use the closest of the 13 theme colours for the icon.

**From 1.3.1**
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
