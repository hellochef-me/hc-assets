"use client";
import Link from "next/link";
import { useState } from "react";
import { User, MapPin, Search } from "lucide-react";
import { useInventory } from "./use-inventory";
import { Button, Empty, Notice, Timeline, Badge } from "./ui";
import { useSource } from "./source-context";
import { locations, hasValidStorageLocation } from "@/lib/model";
export function Directory({
  kind,
}: {
  kind: "people" | "locations" | "activity";
}) {
  const { source } = useSource();
  const { snapshot, error, loading, reload } = useInventory();
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState("");
  const title = kind[0].toUpperCase() + kind.slice(1);
  const groups =
    kind === "people"
      ? snapshot?.people.map((p) => ({ name: p.name, secondary: p.department }))
      : locations.map((name) => ({ name, secondary: "Storage location" }));
  const unconfirmedLocations =
    snapshot?.assets.filter((asset) => !hasValidStorageLocation(asset))
      .length || 0;
  const filtered = groups?.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKPLACE, IN VIEW</p>
          <h1>{title}</h1>
          <p className="subtitle">
            {kind === "activity"
              ? source?.kind === "demo"
                ? "Every demo movement, with the person and time recorded."
                : "Sheet history; fields never recorded remain Unknown."
              : kind === "locations"
                ? "Unassigned equipment is stored in Engineering Area or Locker."
                : source?.kind === "demo"
                  ? "Fictional preview directory"
                  : `${source?.label || "Sheet directory"} · ${snapshot?.people.length ?? "…"} employee rows${source?.readOnly ? " · Read only" : ""}`}
          </p>
        </div>
      </div>
      {error ? (
        <>
          <Notice warning>{error}</Notice>
          <Button onClick={reload}>Retry</Button>
        </>
      ) : loading ? (
        <div className="loading">Loading {kind}…</div>
      ) : kind === "activity" ? (
        <section className="card activity-list">
          <label className="search-bar">
            <Search />
            <input
              aria-label="Search activity"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset, actor or notes"
            />
          </label>
          {snapshot!.history
            .filter((e) =>
              [e.assetId, e.action, e.actor, e.notes].some((t) =>
                t.toLowerCase().includes(query.toLowerCase()),
              ),
            )
            .map((e) => (
              <div className="activity-event" key={e.id}>
                <Link href={`/assets/${encodeURIComponent(e.assetId)}`}>
                  {snapshot!.assets.find((a) => a.id === e.assetId)?.name ||
                    e.assetId}
                </Link>
                <Timeline events={[e]} />
              </div>
            ))}
          {!snapshot!.history.length && (
            <Empty title="No activity yet">
              Save an asset or record a movement to begin its timeline.
            </Empty>
          )}
        </section>
      ) : (
        <>
          {kind === "locations" && unconfirmedLocations > 0 && (
            <Notice warning>
              {unconfirmedLocations} existing{" "}
              {unconfirmedLocations === 1 ? "asset has" : "assets have"} a
              missing or different recorded location. Review these in{" "}
              <Link href="/">Inventory</Link> before confirming storage.
              Existing records have not been changed.
            </Notice>
          )}
          <label className="search-bar directory-search">
            <Search />
            <input
              aria-label={`Search ${kind}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind}`}
            />
          </label>
          <div className="directory-layout">
            <section className="directory-grid">
              {filtered?.map((g) => {
                const assets = snapshot!.assets.filter((a) =>
                  kind === "people"
                    ? a.assignee === g.name
                    : (a.location || "Unknown") === g.name,
                );
                return (
                  <button
                    key={g.name}
                    className={`directory-card ${selected === g.name ? "selected" : ""}`}
                    onClick={() => setSelected(g.name)}
                    aria-pressed={selected === g.name}
                  >
                    {kind === "people" ? <User /> : <MapPin />}
                    <h2>{g.name}</h2>
                    <p>{g.secondary}</p>
                    <strong>
                      {assets.length} {assets.length === 1 ? "asset" : "assets"}
                    </strong>
                  </button>
                );
              })}
              {!filtered?.length && (
                <Empty title={`No ${kind} found`}>
                  Try a different search.
                </Empty>
              )}
            </section>
            {selected && (
              <section className="card directory-assets">
                <h2>{selected}</h2>
                {snapshot!.assets
                  .filter((a) =>
                    kind === "people"
                      ? a.assignee === selected
                      : (a.location || "Unknown") === selected,
                  )
                  .map((a) => (
                    <Link
                      key={a.id}
                      href={`/assets/${encodeURIComponent(a.id)}`}
                    >
                      <span>{a.name}</span>
                      <Badge status={a.status} />
                    </Link>
                  ))}
                {!snapshot!.assets.some((a) =>
                  kind === "people"
                    ? a.assignee === selected
                    : (a.location || "Unknown") === selected,
                ) && <p>No assets here.</p>}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
