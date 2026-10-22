// Units, look, notifications and account.
import { Modal, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backend } from "../backend";
import { pushLive } from "../push";
import { Button, Glass, IconButton, Seg, T } from "../components/ui";
import { useTheme } from "../theme";

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 22, gap: 10 }}>
      <T kind="eyebrow">{title}</T>
      {children}
    </View>
  );
}

function Row({ label, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <T style={{ flex: 1 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.aura, false: t.lineStrong }} thumbColor="#fff" />
    </View>
  );
}

export default function Settings({ visible, onClose, settings, onChange, onToggleNotify, onTestPush, onSignOut, user }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const set = (k) => (v) => onChange({ ...settings, [k]: v });
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4,6,18,0.5)" }}>
        <Glass strong style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: "92%", paddingBottom: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <T kind="serif">Settings</T>
            <IconButton name="close" onPress={onClose} label="Close" />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            <Section title="Units">
              <Seg options={[["C", "°C"], ["F", "°F"]]} value={settings.temp} onChange={set("temp")} />
              <Seg options={[["kmh", "km/h"], ["mph", "mph"], ["ms", "m/s"]]} value={settings.wind} onChange={set("wind")} />
              <Seg options={[["24", "24-hour"], ["12", "12-hour"]]} value={settings.clock} onChange={set("clock")} />
            </Section>

            <Section title="Look">
              <Seg options={[["aurora", "Aurora"], ["paper", "Paper"], ["auto", "Auto"]]} value={settings.theme} onChange={set("theme")} />
              <Row label="Living sky animation" value={settings.motion} onChange={set("motion")} />
              <Row label="Tint the app by temperature" value={settings.aura} onChange={set("aura")} />
            </Section>

            <Section title="Notifications">
              <Row label="Daily sky digest for my saved cities" value={settings.notify} onChange={onToggleNotify} />
              <T muted>Send at</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <View key={h} style={{ borderRadius: 999, overflow: "hidden" }}>
                    <T kind="semi" onPress={() => set("notifyHour")(h)}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: settings.notifyHour === h ? t.aura : t.line, color: settings.notifyHour === h ? "#fff" : t.ink2 }}>
                      {`${String(h).padStart(2, "0")}:00`}
                    </T>
                  </View>
                ))}
              </ScrollView>
              <Row label="Storm & extreme alerts" value={settings.alerts} onChange={set("alerts")} />
              <Button title="Send me a test notification" kind="ghost" onPress={onTestPush} />
              <T kind="small" muted>
                {pushLive()
                  ? "Digests are sent by Back4App Cloud Code at your chosen hour, in your timezone."
                  : "Push is in preview mode until Back4App keys are added to src/config.js."}
              </T>
            </Section>

            <Section title="Account">
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T muted>Signed in as</T><T kind="bold">{user?.email}</T></View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T muted>Backend</T><T kind="bold">{Backend.mode === "back4app" ? "Back4App" : "This phone only"}</T></View>
              <View style={{ height: StyleSheet.hairlineWidth }} />
              <Button title="Sign out" kind="danger" onPress={onSignOut} />
            </Section>
          </ScrollView>
        </Glass>
      </View>
    </Modal>
  );
}
