# ProjectMobile

The iPhone version of [ProjectM](https://github.com/meloniexyz/ProjectM): local files, YouTube Music, SoundCloud and Spotify in one dark-themed app.

## Features

- Search YouTube Music, SoundCloud and Spotify (plus your local files); songs from every platform play in one queue
- Your liked songs and playlists from each platform, ProjectM playlists that mix everything (with custom covers), and a Spotify-style **Save in** sheet
- **Spotify-style data use:**
  - Low / Mid / Best quality, set separately for Wi-Fi, mobile data and downloads
  - Songs you've played stay on the phone, so replays use no data
  - **Download** switch on any playlist or Liked Songs list (Wi-Fi only unless you allow mobile data)
  - **Offline mode**
- Background playback, lock screen / Control Center / headphone controls, gapless queueing
- Volume leveling (Quiet / Normal / Loud), 3/5/7-band equalizer with presets, synced lyrics, song info, listening history and stats, 12 themes

Spotify songs play from YouTube Music or SoundCloud (the closest match), because iPhones don't let other apps play Spotify's audio.

## Install

Download `ProjectMobile-…ipa` from [Releases](../../releases) and sideload it with your Apple ID:

- **[Sideloadly](https://sideloadly.io)** (Windows/Mac) or **[AltStore](https://altstore.io)**: with a free Apple ID the app must be refreshed every 7 days.
- With a paid Apple Developer account the app lasts a year.

## Build

The app is built and tested on GitHub's Macs (`.github/workflows/ios.yml`): it builds a simulator copy, runs an end-to-end test (search, play, in-app diagnostics), and on a `v*` tag builds the `.ipa` and publishes a release.

```bash
npm install
npx tsc --noEmit                    # typecheck
npx expo export --platform ios      # bundle check (works on Windows)
```

For personal use. YouTube and SoundCloud playback uses their unofficial web APIs.
