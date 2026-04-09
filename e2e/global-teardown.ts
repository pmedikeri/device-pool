// Clean up test data after E2E tests run
async function globalTeardown() {
  try {
    const res = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "cleanup", password: "testing123" }),
    });
    if (!res.ok) return;
    // Test data has IPs 10.0.0.1 or 10.99.0.1 — real devices don't
    // The cleanup is done via the DB directly, not API, since there's no bulk delete endpoint
    console.log("E2E test cleanup: test data should be cleaned via scripts/cleanup-test-data.sh");
  } catch {
    // Server might not be running
  }
}

export default globalTeardown;
