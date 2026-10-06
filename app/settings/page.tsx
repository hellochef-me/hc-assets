import { Notice } from "@/components/ui";
export default function Page() {
  return (
    <div className="page settings-page">
      <h1>Preview settings</h1>
      <section className="card">
        <h2>Local demo mode</h2>
        <Notice>
          This preview uses fictional assets and people. Saves persist only to
          this computer.
        </Notice>
        <dl>
          <div>
            <dt>Inventory</dt>
            <dd>Local file · confirmed saves</dd>
          </div>
          <div>
            <dt>Google Sheets</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Photo recognition</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Market research</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Deferred · private local preview only</dd>
          </div>
        </dl>
        <p>
          Existing inventory IDs and Sheet data have not been changed. Live
          integration, authentication and secure reuse of the approved API key
          will be configured separately.
        </p>
      </section>
    </div>
  );
}
