// Load backend/.env into process.env before anything else reads it.
// Uses Node's built-in loader (Node 20.12+/21.7+) — no dependency. Missing file
// is fine: in production you set real env vars instead of shipping a .env.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — rely on the ambient environment */
}
