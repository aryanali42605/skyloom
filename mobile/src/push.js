// Expo push notifications: permission, Expo push token, and handing it to Back4App.
// Back4App Cloud Code (../cloud/main.js) sends the digests through Expo's push service.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Backend } from "./backend";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

let token = null;

async function ensurePermission() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Sky digests", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") throw new Error("Notifications are off for Skyloom. Turn them on in your phone's settings.");
}

// Remote push needs a real device, Back4App and an EAS project id (run `npx eas init` once).
// Expo Go on Android can't receive remote pushes (use a development build there); local previews still work.
async function getToken() {
  if (token) return token;
  if (!Device.isDevice) throw new Error("Push notifications need a real phone, not a simulator.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Run `npx eas init` in the mobile folder once to link an Expo project, then restart.");
  token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return token;
}

export const pushLive = () => Backend.mode === "back4app";

export async function enablePush(prefs) {
  await ensurePermission();
  if (!pushLive()) return { simulated: true };
  await Backend.savePush({ expoToken: await getToken(), ...prefs });
  return { simulated: false };
}

export async function updatePushPrefs(prefs) {
  if (!pushLive() || !token) return;
  await Backend.savePush({ expoToken: token, ...prefs });
}

export async function disablePush() {
  if (pushLive() && token) await Backend.removePush({ expoToken: token }).catch(() => {});
}

export async function testPush(localDigest) {
  await ensurePermission();
  if (pushLive()) {
    try {
      await getToken();
      await Backend.testPush();
      return "Sent from Back4App. It should arrive in a few seconds.";
    } catch (e) {
      // Fall through to an on-device preview so the user still sees what a digest looks like.
      await Notifications.scheduleNotificationAsync({ content: localDigest, trigger: null });
      return `Showing an on-device preview. Remote push isn't ready: ${e.message}`;
    }
  }
  await Notifications.scheduleNotificationAsync({ content: localDigest, trigger: null });
  return "Preview shown on this phone. Connect Back4App for real scheduled pushes.";
}
