// Skyloom configuration — fill these in from your Back4App dashboard.
// App Settings → Security & Keys gives you the Application ID and JavaScript key.
// While they are left as placeholders, Skyloom runs in "local mode": accounts and
// cities are kept in this browser only, and push is simulated on-device.
window.SKYLOOM_CONFIG = {
  back4app: {
    appId: "Te3fk79tTsFbRXrXAXhpVUspfVPz8opdHJZowXAn",
    jsKey: "qISpPI7jBT2B24dFyM5r9j5kJwZHCHjB2iKFhGNB",
    serverURL: "https://parseapi.back4app.com/",
  },
  // Public VAPID key for Web Push. Generate a pair with `npx web-push generate-vapid-keys`,
  // put the public one here and both in Back4App's environment variables (see README).
  vapidPublicKey: "BHO3QqVy9a0opWzDLBonJpfXOe0hgSp5wc8NXV-i8cz57JND9vPPlRQSZ4Pqs7wi9qweT-5oXAQbGyOGeQEv4Hw",
};
