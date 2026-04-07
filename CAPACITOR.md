# Capacitor iOS Setup

Watchr uses [Capacitor](https://capacitorjs.com/) to ship the same React web app as a native iOS app.

## Prerequisites

- **macOS** with Xcode 15+ installed
- **CocoaPods**: `sudo gem install cocoapods`
- Node.js 18+ and npm

## Quick Start

```bash
# Build the web app and open in Xcode
npm run ios
```

This runs `vite build`, syncs to the iOS project, and opens Xcode.
Then press **Cmd+R** in Xcode to run on a simulator or device.

## Development with Hot Reload

For development, you can point the iOS app at your Vite dev server:

1. Find your Mac's local IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
2. Start the dev server: `npm run dev`
3. Start the Express backend: `npm run start` (in another terminal)
4. Edit `capacitor.config.ts` and uncomment the server block:
   ```ts
   server: {
     url: 'http://YOUR_LOCAL_IP:5173',
     cleartext: true,
   },
   ```
5. Run: `npx cap sync ios && npx cap run ios`

The app will load from your Vite dev server with full HMR.

**Remember to comment out the `server` block before production builds.**

## When to Run `npx cap sync`

Run `npx cap sync` after:
- Installing or removing Capacitor plugins
- Changing `capacitor.config.ts`
- Running `npm run build` (to copy new web assets to iOS)

You do NOT need to sync for:
- Code changes during development (if using the dev server URL)
- CSS-only changes (HMR handles these)

## Production Build for TestFlight

```bash
# 1. Build the web app
npm run build

# 2. Sync to iOS
npx cap sync ios

# 3. Open Xcode
npx cap open ios
```

In Xcode:
1. Select your team under **Signing & Capabilities**
2. Set the scheme to **Any iOS Device (arm64)**
3. **Product > Archive**
4. In the Organizer, click **Distribute App > App Store Connect**
5. Upload to TestFlight

## API Configuration

The iOS app needs to reach your Express backend. In production:

1. Deploy `server.prod.js` to a server (e.g., Railway, Fly.io, Render)
2. Set `VITE_API_BASE=https://your-domain.com` in `.env`
3. Rebuild: `npm run build && npx cap sync ios`

For local development, the Vite dev server proxies all API calls, so no extra config is needed.

## Project Structure

```
ios/
├── App/
│   ├── App/              # Xcode project files
│   │   ├── public/       # Built web assets (copied by cap sync)
│   │   ├── Assets.xcassets/
│   │   └── capacitor.config.json
│   ├── App.xcodeproj
│   └── Podfile
└── .gitignore
```

## Plugins Installed

- `@capacitor/splash-screen` — Brand green splash on launch
- `@capacitor/status-bar` — Dark status bar styling
- `@capacitor/haptics` — Tactile feedback on interactions
- `@capacitor/browser` — Open external links in Safari
