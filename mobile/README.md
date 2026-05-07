# DiamondEdge mobile (optional)

This folder is **not** something you ask fans or customers to install.

It is an **optional** Expo + WebView shell around the same public URL (`https://diamond-edge-simulator.vercel.app` by default), mainly if **you** want a Play Store build later.

**Everyone else:** open the website on their phone and use **Add to Home Screen** / **Install app** in the browser — no Expo, no QR codes, no “download another app first.”

## Owner preview (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

## Owner Android APK (EAS)

```bash
npm i -g eas-cli
eas login
cd mobile
eas build:configure
eas build -p android --profile preview
```
