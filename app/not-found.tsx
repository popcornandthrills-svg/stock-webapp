export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ marginBottom: 12 }}>Page not found</h1>
        <p style={{ margin: 0, color: "#66788f" }}>The stock page you requested does not exist.</p>
      </section>
    </main>
  );
}
