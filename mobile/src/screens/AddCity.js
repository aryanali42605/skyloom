// Search any place on Earth, or add where you are right now.
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CountryBadge, Glass, Icon, IconButton, T } from "../components/ui";
import { FONTS, useTheme } from "../theme";
import * as W from "../weather";

export default function AddCity({ visible, onClose, onAdd, toast }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const timer = useRef();

  useEffect(() => { if (visible) { setQ(""); setResults([]); setStatus(""); } }, [visible]);

  function onChange(text) {
    setQ(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (text.trim().length < 2) { setResults([]); setStatus(""); return; }
      try {
        const r = await W.search(text);
        setResults(r);
        setStatus(r.length ? "" : `No places match "${text}". Try another spelling.`);
      } catch {
        setStatus("Search is unavailable right now.");
      }
    }, 280);
  }

  async function useLocation() {
    setLocating(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") { toast("Location permission was declined."); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await onAdd(await W.reverse(pos.coords.latitude, pos.coords.longitude));
    } catch {
      toast("Couldn't work out where you are.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4,6,18,0.5)" }}>
        <Glass strong style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: insets.bottom + 16, maxHeight: "88%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <T kind="serif">Add a city</T>
            <IconButton name="close" onPress={onClose} label="Close" />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.lineStrong, backgroundColor: t.glass, borderRadius: 14, paddingHorizontal: 12, marginBottom: 10 }}>
            <Icon name="search" size={18} color={t.ink3} />
            <TextInput value={q} onChangeText={onChange} placeholder="Search any city, town or village…" placeholderTextColor={t.ink3} autoFocus autoCorrect={false}
              style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 10, color: t.ink, fontFamily: FONTS.body, fontSize: 16 }} />
          </View>
          <Button title={locating ? "Finding you…" : "Use my current location"} kind="ghost" icon="locate" onPress={useLocation} disabled={locating} />
          <FlatList
            style={{ marginTop: 12 }}
            data={results}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(r, i) => `${r.lat},${r.lon},${i}`}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            ListEmptyComponent={<T kind="small" muted style={{ textAlign: "center", marginTop: 8 }}>{status || "Search covers millions of places worldwide."}</T>}
            renderItem={({ item: r }) => (
              <Pressable onPress={() => onAdd(r)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: pressed ? t.aura : t.line, backgroundColor: t.glass })}>
                <CountryBadge code={W.countryCode(r.countryCode)} color={t.ink} />
                <View style={{ flex: 1 }}>
                  <T kind="bold">{r.name}</T>
                  <T kind="small" style={{ color: t.ink3 }}>{[r.admin1, r.country].filter(Boolean).join(", ")}{r.population ? ` · ${r.population.toLocaleString()} people` : ""}</T>
                </View>
                <Icon name="plus" />
              </Pressable>
            )}
          />
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}
