"use client";
import { Notice, Button } from "@/components/ui";
import { useInventory } from "@/components/use-inventory";
import { useSource } from "@/components/source-context";
export default function Page() {
  const { source } = useSource();
  const { snapshot, reload, error } = useInventory();
  return (
    <div className="page settings-page">
      <h1>Connection settings</h1>
      <section className="card">
        <h2>{source?.label || "Checking source…"}</h2>
        <Notice>
          {source?.kind === "demo"
            ? "Fictional fixtures. Saves persist only on this computer."
            : source?.kind === "sheet-snapshot"
              ? "Real values read through the existing authorized Sheets connection. This is a timestamped snapshot, not continuous live synchronization. Refreshing this page reloads the snapshot; an authorized Sheet reread is needed to update it."
              : source?.readOnly
                ? "Authenticated server reads; writes disabled."
                : "Controlled local Sheet backend. Writes require approved configuration and exclusive writer ownership."}
        </Notice>
        {error && <Notice warning>{error}</Notice>}
        <dl>
          <div>
            <dt>Records loaded</dt>
            <dd>
              {snapshot
                ? `${snapshot.assets.length} assets · ${snapshot.people.length} employee rows · ${snapshot.history.length} events`
                : "Not confirmed"}
            </dd>
          </div>
          <div>
            <dt>Source read time</dt>
            <dd>
              {source?.checkedAt
                ? new Date(source.checkedAt).toLocaleString("en-GB", {
                    timeZone: "UTC",
                  }) + " UTC"
                : source?.kind === "demo"
                  ? "Local fixtures"
                  : "Read on request"}
            </dd>
          </div>
          <div>
            <dt>Writes</dt>
            <dd>
              {source?.readOnly
                ? "Disabled · original Sheet unchanged"
                : source?.kind === "demo"
                  ? "Local demo only"
                  : "Controlled Sheet writer"}
            </dd>
          </div>
          <div>
            <dt>Photo recognition</dt>
            <dd>
              {(source?.ocrEnabled ?? source?.aiEnabled)
                ? "Server provider enabled; human review required"
                : "Not configured · camera/upload and manual entry work"}
            </dd>
          </div>
          <div>
            <dt>Resale research</dt>
            <dd>
              {(source?.resaleEnabled ?? source?.aiEnabled)
                ? "Current cited AED sources; may return no comparable"
                : "Not configured · no estimate fabricated"}
            </dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Deferred · this Mac’s loopback preview only</dd>
          </div>
        </dl>
        <Button variant="secondary" onClick={reload}>
          {source?.kind === "sheet-snapshot"
            ? "Reload imported snapshot"
            : "Reload inventory"}
        </Button>
        <p>
          Live providers require secure server configuration. Never paste keys
          into chat or browser fields. Production records, headers and historic
          events have not been changed.
        </p>
      </section>
    </div>
  );
}
