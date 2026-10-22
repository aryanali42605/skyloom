# Skyloom

**Weave every sky you love into one place.**

Skyloom is a weather app where every saved city has its own *living sky*: a full-screen canvas painted from the city's real conditions and its local time. You see sun and moon on their arcs, drifting clouds, rain, snow, fog, lightning, and an aurora on clear nights. You can save any city, town or village in the world.

Skyloom comes in two versions that share one **Back4App** backend for accounts, saved cities, settings and push notifications. If you sign in on both, your cities sync between them.
- **Web app** (this folder): runs in any browser and can be installed as a PWA. Uses Web Push.
- **Mobile app** (`mobile/`): React Native with Expo, runs in **Expo Go**. Uses Expo push notifications. See [Mobile app (Expo)](#mobile-app-expo).

---

## Features

| Feature | What it does |
|---|---|
| **Log in / Sign up** | Email and password accounts on Back4App (Parse `_User`), with password-reset emails. |
| **Living sky** | An animated canvas driven by the WMO weather code, cloud cover, wind and the sun's real altitude for that city. |
| **Time drift** | Drag the slider through the next 24 hours. The sky, temperature and app tint change to match. |
| **The loom** | Your saved cities as a strip of "threads". Each one is tinted by its sky and temperature and shows its local time. |
| **Any city on Earth** | Search covers millions of places (Open-Meteo geocoding), or you can add your current location. |
| **Sky sentence** | A short line written for each city based on the current weather, time of day and how warm it feels. |
| **Sky twins** | Ranks your saved cities by how alike their weather feels right now. |
| **Wear & carry** | Suggestions for what to wear and bring, based on the next 12 hours (layers, umbrella, sunscreen, boots). |
| **Seven tides & sun thread** | A 7-day range chart and a sunrise/sunset arc with the daylight remaining. |
| **Aura tint** | The interface's accent colour follows the temperature, from icy blue to ember. |
| **Settings** | °C/°F, km/h, mph or m/s, 12/24-hour clock, Aurora/Paper/Auto theme, motion on/off, aura on/off, notifications. |
| **Push notifications** | A daily "sky digest" of your saved cities, sent from Back4App Cloud Code at your chosen hour. Optional storm and extreme heat/cold alerts. |
| **Offline shell** | The service worker caches the app so it opens without a connection. |

### Defaults (`defaults.js`)
A new account starts with: °C, km/h, 24-hour clock, the **Aurora** dark theme, sky animation on, aura tint on, notifications off (they need your permission), digest at 07:00, and alerts on. It also gets three starter cities (Tokyo, Reykjavík, Marrakesh) to show off very different skies. Change any of these in `defaults.js`.

---

## Project layout

```
weather-app/
├─ index.html            App shell: auth, main view, add-city and settings sheets
├─ styles.css            Theme tokens (Aurora / Paper / Auto) and all styles
├─ config.js             ← your Back4App keys and VAPID public key go here
├─ defaults.js           Defaults for new accounts
├─ sw.js                 Service worker: receives pushes, offline cache
├─ manifest.webmanifest  PWA manifest
├─ icon.svg              App icon
├─ server.js             Tiny local dev server (no dependencies)
├─ mobile/               Expo (React Native) app; see "Mobile app (Expo)" below
├─ js/
│  ├─ weather.js         Open-Meteo forecast + geocoding, units, sentences, twins, wear tips
│  ├─ sky.js             The living-sky canvas engine
│  ├─ backend.js         Back4App (Parse) backend + local fallback
│  ├─ push.js            Web Push subscription on the client
│  └─ app.js             UI wiring
└─ cloud/
   ├─ main.js            Back4App Cloud Code: rules, push functions (web + Expo), hourly digest job
   ├─ package.json       Cloud Code dependency (web-push)
   └─ back4app-env.txt   Your generated VAPID keys. PRIVATE: don't upload or share it.
```

---

## Run it locally

You need Node.js. From the `weather-app` folder:

```bash
node server.js
```

Open **http://localhost:5173**. Until you add Back4App keys, Skyloom runs in **local mode**: accounts and cities are stored only in this browser, and notifications are previewed on your device. Everything else works the same.

---

## Connect Back4App

### 1. Create the app
1. Sign in at [back4app.com](https://www.back4app.com) and create a new app (Backend as a Service).
2. Open **App Settings → Security & Keys** and copy the **Application ID** and **JavaScript key**.
3. Paste them into `config.js`:
   ```js
   back4app: { appId: "…", jsKey: "…", serverURL: "https://parseapi.back4app.com/" }
   ```

### 2. Turn on email features
In **App Settings → Server Settings**, open **Verification emails** / **Password reset** and enable them, so "Forgot password?" sends a reset email.

### 3. Data model
Skyloom creates these classes the first time they're used. You don't need to set anything up:

| Class | Fields | Access |
|---|---|---|
| `_User` | `username`, `email`, `password`, `displayName`, `settings` (object) | The user's own record |
| `City` | `name`, `admin1`, `country`, `countryCode`, `lat`, `lon`, `tz`, `order`, `owner` → `_User` | ACL: only the owner. `beforeSave` enforces this. |
| `PushSub` | `user` → `_User`, `kind` (`web` or `expo`), `endpoint` + `keys` (web) or `expoToken` (phone), `notify`, `notifyHour`, `alerts`, `temp`, `timezone`, `lastDigestDay`, `lastAlertDay` | Master key only |

For extra safety, open **Database → City → Security (CLP)** and disable public *Find* and *Get* for unauthenticated users. The ACLs already keep each user's cities private.

### 4. Push notifications (Web Push from Cloud Code)
1. Generate a VAPID key pair:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Put the **public** key into `config.js` → `vapidPublicKey`.
3. In Back4App, go to **App Settings → Server Settings → Environment Variables** and add:
   ```
   VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:you@yourdomain.com
   ```
4. Go to **Cloud Code → Functions & Web Hosting**, upload `cloud/main.js` and `cloud/package.json` into the `cloud` folder, and click **Deploy**.
5. Go to **App Settings → Server Settings → Background Jobs → Schedule a job**, pick `skyloomDigest` and set it to run **every hour**.

How it works:
- When you turn on *Daily sky digest* in Settings, the browser creates a push subscription and the app saves it with the Cloud Function `savePushSubscription`. The save includes your chosen hour, timezone, units and alert preference.
- Every hour, `skyloomDigest` checks each subscription. If it's your chosen hour in your timezone, it fetches the weather for your saved cities and sends something like *"⛅ Tokyo 18° (14–21°) · 🌧️ Reykjavík 4° (2–6°) · ☔ Umbrella day in Reykjavík"*.
- If alerts are on, it also sends at most one alert per day (between 06:00 and 22:00) for thunderstorms, heavy rain or snow, extreme heat (feels like ≥ 38°C) or dangerous cold (feels like ≤ −20°C) in the next 12 hours.
- *Send me a test notification* calls `sendTestPush`, which sends your digest right away.
- Subscriptions the browser has discarded (HTTP 404/410) are cleaned up automatically.

> Push needs **https** (or `localhost`). On iPhone and iPad, Web Push only works after you add the app to the Home Screen (iOS 16.4+).

### 5. Host it on Back4App
1. Build the upload folder (run again after any change, including adding your keys):
   ```bash
   node prepare-b4a.js
   ```
   This creates `b4a-deploy/cloud` (the backend) and `b4a-deploy/public` (the web app). Secrets and dev-only files are left out.
2. In Back4App, open **Cloud Code → Functions & Web Hosting**. Upload the files from `b4a-deploy/cloud` into the **cloud** folder and the contents of `b4a-deploy/public` (including the `js` folder) into the **public** folder. Click **Deploy**.
3. To publish the site, open **App Settings → Server Settings → Web Hosting and Live Query**, tick **Activate Back4App Hosting**, choose a subdomain (for example `skyloom`), and save. Your app is live at `https://<subdomain>.b4a.app`. This needs a paid Back4App plan; the free route is below.

#### Free hosting: Back4App Web Deployment (from GitHub)
The repo includes a `Dockerfile` (nginx) that serves the web app.
1. Push this project to GitHub.
2. In Back4App, open **Web Deployment** → **Deploy a web app** → connect GitHub and pick this repository.
3. Keep the root directory as `/` and the branch as `main`, then deploy. Back4App builds the Dockerfile and gives you a free `*.b4a.run` link.
4. Every push to `main` redeploys automatically.

Prefer the command line? Install the [Back4App CLI](https://www.back4app.com/docs/local-development/parse-cli), run `b4a new` once inside `b4a-deploy` to link your app, then `b4a deploy` after each `node prepare-b4a.js`.

Any other static host (Netlify, Vercel, GitHub Pages) works too: just upload `b4a-deploy/public`.

---

## Mobile app (Expo)

The `mobile/` folder is Skyloom for phones. It has the same features, the same look and the same Back4App classes as the web app.

```
mobile/
├─ App.js                Main screen, app state, the loom of saved cities
├─ app.json              Expo config (name, icons, notification + location permissions)
├─ metro.config.js       Gives Parse a small "crypto" shim so it runs on phones
└─ src/
   ├─ config.js          ← your Back4App keys (the SAME ones as ../config.js)
   ├─ defaults.js        Defaults for new accounts
   ├─ weather.js         Forecast, search, units and personality (mirrors ../js/weather.js)
   ├─ backend.js         Back4App (Parse) + local fallback
   ├─ push.js            Expo push token → Back4App
   ├─ theme.js           Aurora / Paper theme tokens
   ├─ components/        Sky (living sky), Panels (forecast cards), ui (shared pieces)
   └─ screens/           Auth, AddCity, Settings
```

### Run it in Expo Go
1. Install the packages (first time only):
   ```bash
   cd mobile
   npm install
   ```
2. Start the dev server:
   ```bash
   npx expo start
   ```
3. Scan the QR code with **Expo Go** (Android) or the **Camera** app (iPhone). Your phone and computer must be on the same Wi-Fi. If they're on different networks, use `npx expo start --tunnel`.

Until you add keys, the app runs in **local mode** (data stays on the phone).

### Connect it to Back4App
Put the same **Application ID** and **JavaScript key** you used in `../config.js` into `mobile/src/config.js`, then reload the app. Accounts and saved cities now sync with the web app.

### Push notifications on the phone
The mobile app gets an **Expo push token**, and the Cloud Code job sends digests through Expo's push service. No VAPID keys are needed for the phone.
1. Link the app to an Expo project (once). This asks you to log in to your Expo account:
   ```bash
   cd mobile
   npx eas init
   ```
   This writes a `projectId` into `app.json`, which Expo needs to issue push tokens.
2. Make sure the updated `cloud/main.js` is deployed to Back4App and the `skyloomDigest` job runs hourly (see above).
3. In the app, open **Settings**, turn on **Daily sky digest**, allow notifications, then tap **Send me a test notification**.

> **Expo Go limits:** remote push notifications work in Expo Go on **iPhone**. On **Android**, Expo Go no longer supports remote push, so the test button shows an on-device preview instead. For real pushes on Android, make a development build (`npx expo run:android` or `eas build --profile development`). Everything else works in Expo Go on both.

---

## Data sources
- **Forecasts:** [Open-Meteo](https://open-meteo.com) (free, no key, CC BY 4.0)
- **Place search:** Open-Meteo Geocoding API
- **"Use my location" place names:** BigDataCloud reverse-geocoding (client endpoint)

## Cloud Functions reference

| Name | Type | Purpose |
|---|---|---|
| `savePushSubscription` | Function (logged-in user) | Saves or updates this device's Web Push subscription (`subscription`) or Expo token (`expoToken`) and its notification preferences |
| `removePushSubscription` | Function (logged-in user) | Removes this device's subscription (by `endpoint` or `expoToken`) |
| `sendTestPush` | Function (logged-in user) | Sends the digest to all of the user's devices right now |
| `skyloomDigest` | Background job (run hourly) | Sends daily digests and same-day severe-weather alerts |
| `beforeSave City` | Trigger | Sets the owner and ACL, blocks edits to other users' cities, validates coordinates |
