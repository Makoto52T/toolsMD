export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: '0 24px', fontFamily: 'system-ui', color: '#e6edf3', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Privacy Policy</h1>
      <p><strong>Last updated:</strong> May 2026</p>
      <p>toolsMD collects only the minimum data needed to provide the service:</p>
      <ul>
        <li><strong>Google Account:</strong> email, name, and profile picture (via Google OAuth)</li>
        <li><strong>Project Data:</strong> diagrams and nodes you create are stored in our database</li>
      </ul>
      <p>We do not share, sell, or use your data for advertising.</p>
      <p>You can request data deletion by contacting the project owner.</p>
    </main>
  );
}
