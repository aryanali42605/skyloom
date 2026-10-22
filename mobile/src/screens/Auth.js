// Log in / sign up, over the living sky.
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { Backend } from "../backend";
import { Button, Glass, T } from "../components/ui";
import { FONTS, useTheme } from "../theme";

export function Mark({ size = 30 }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ffd27a" /><Stop offset="1" stopColor="#ff7ab6" /></LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="13" fill="url(#mg)" />
      <Path d="M4 40c10-6 18-6 28 0s18 6 28 0" fill="none" stroke={t.ink} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M4 50c10-6 18-6 28 0s18 6 28 0" fill="none" stroke={t.ink} strokeWidth={3.5} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

function Field({ label, ...props }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T kind="semi" muted style={{ fontSize: 12.5 }}>{label}</T>
      <TextInput placeholderTextColor={t.ink3} {...props}
        style={{ borderWidth: 1, borderColor: t.lineStrong, backgroundColor: t.glassStrong, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: t.ink, fontFamily: FONTS.body, fontSize: 16 }} />
    </View>
  );
}

export default function Auth({ onAuthed, toast }) {
  const t = useTheme();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError("Enter a valid email.");
    if (password.length < 6) return setError("Passwords need at least 6 characters.");
    setBusy(true);
    try {
      const user = mode === "signup" ? await Backend.signUp({ name: name.trim(), email: e, password }) : await Backend.logIn({ email: e, password });
      setPassword("");
      await onAuthed(user, mode === "signup");
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!email.trim()) return toast("Type your email above first.");
    try { await Backend.resetPassword(email.trim()); toast("Check your inbox for a reset link."); } catch (ex) { toast(ex.message); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }} keyboardShouldPersistTaps="handled">
        <Glass strong style={{ padding: 26 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <Mark size={44} />
            <T kind="serif" style={{ fontSize: 44 }}>Skyloom</T>
          </View>
          <T kind="italic" muted style={{ textAlign: "center", marginTop: 4, marginBottom: 20 }}>Weave every sky you love into one place.</T>

          <View style={{ flexDirection: "row", backgroundColor: t.line, borderRadius: 999, padding: 4, marginBottom: 18 }}>
            {[["login", "Log in"], ["signup", "Sign up"]].map(([m, label]) => (
              <Pressable key={m} onPress={() => { setMode(m); setError(""); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", backgroundColor: mode === m ? t.glassStrong : "transparent" }}>
                <T kind="semi" style={{ color: mode === m ? t.ink : t.ink2 }}>{label}</T>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 12 }}>
            {mode === "signup" && <Field label="Your name" value={name} onChangeText={setName} placeholder="What should the sky call you?" autoComplete="nickname" />}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry
              autoComplete={mode === "login" ? "current-password" : "new-password"} textContentType={mode === "login" ? "password" : "newPassword"} onSubmitEditing={submit} />
            {!!error && <T style={{ color: t.danger, fontSize: 13.5 }}>{error}</T>}
            <Button title={mode === "login" ? "Log in" : "Create my account"} onPress={submit} disabled={busy} />
            {mode === "login" && (
              <Pressable onPress={forgot} style={{ alignItems: "center", padding: 6 }}>
                <T muted style={{ textDecorationLine: "underline" }}>Forgot password?</T>
              </Pressable>
            )}
          </View>

          {Backend.mode === "local" && (
            <View style={{ marginTop: 16, padding: 12, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: t.lineStrong }}>
              <T kind="small" muted>
                <T kind="small" style={{ fontFamily: FONTS.bold }}>Back4App isn't connected yet. </T>
                Add your keys to src/config.js for real accounts and push. Until then, accounts stay on this phone.
              </T>
            </View>
          )}
        </Glass>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
