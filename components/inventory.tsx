"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  ScanLine,
  Plus,
  ArrowRight,
  X,
  MapPin,
  User,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import { Asset, statuses, categories } from "@/lib/model";
import { useInventory } from "./use-inventory";
import { Button, Badge, Device, Notice, Empty, date } from "./ui";
import { MoveDialog } from "./move-dialog";
export function Inventory() {
  const { snapshot, error, loading, reload } = useInventory();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [location, setLocation] = useState(""),
    [person, setPerson] = useState(""),
    [selected, setSelected] = useState<Asset | null>(null),
    [move, setMove] = useState(false),
    [sort, setSort] = useState(false),
    [showFilters, setShowFilters] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const assets = useMemo(() => {
    const q = query.toLowerCase().trim();
    return (snapshot?.assets || [])
      .filter(
        (a) =>
          (!q ||
            [a.name, a.id, a.serial, a.brand, a.model, a.assignee].some((v) =>
              v.toLowerCase().includes(q),
            )) &&
          (!status || a.status === status) &&
          (!category || a.category === category) &&
          (!location || a.location === location) &&
          (!person ||
            (person === "unassigned" ? !a.assignee : a.assignee === person)),
      )
      .sort((a, b) =>
        sort
          ? a.name.localeCompare(b.name)
          : b.updatedAt.localeCompare(a.updatedAt),
      );
  }, [snapshot, query, status, category, location, person, sort]);
  const reset = () => {
    setQuery("");
    setStatus("");
    setCategory("");
    setLocation("");
    setPerson("");
  };
  return (
    <div className="page inventory-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKPLACE, IN VIEW</p>
          <h1>Inventory</h1>
          <p className="subtitle">
            {snapshot
              ? `${snapshot.assets.length} demo assets across your workplace`
              : "Know what you have. Find it fast."}
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/scan" className="button primary">
            <ScanLine />
            Scan asset
          </Link>
          <Link href="/scan?manual=1" className="button secondary">
            <Plus />
            Add asset
          </Link>
        </div>
      </div>
      <div className="status-tabs" aria-label="Filter by status">
        {["", "Available", "Assigned", "Needs review"].map((s) => (
          <button
            key={s}
            className={status === s ? "selected" : ""}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s || "All"}
            <span>
              {snapshot?.assets.filter((a) => !s || a.status === s).length ??
                "—"}
            </span>
          </button>
        ))}
      </div>
      <div className={`inventory-layout ${selected ? "with-preview" : ""}`}>
        <section className="inventory-panel" aria-label="Asset inventory">
          <div className="search-bar">
            <Search />
            <input
              ref={search}
              aria-label="Search assets, serials or people"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search asset, serial or person"
            />
            <kbd>⌘ K</kbd>
            <Button
              className="filter-toggle"
              variant="quiet"
              aria-label="Toggle filters"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal />
            </Button>
          </div>
          <div className={`filters ${showFilters ? "expanded" : ""}`}>
            <label>
              <span className="sr-only">Location filter</span>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">All locations</option>
                {Array.from(
                  new Set(snapshot?.assets.map((a) => a.location)),
                ).map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Assignee filter</span>
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              >
                <option value="">All people</option>
                <option value="unassigned">Unassigned</option>
                {snapshot?.people.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Category filter</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Status filter</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <Button variant="quiet" onClick={reset}>
              Reset
            </Button>
          </div>
          {error ? (
            <div className="panel-padding">
              <Notice warning>{error}</Notice>
              <Button onClick={reload}>Retry inventory</Button>
            </div>
          ) : loading ? (
            <div className="loading" role="status">
              Loading inventory…
            </div>
          ) : assets.length === 0 ? (
            <Empty title="No assets found">
              Try a different search or reset your filters.{" "}
              <button className="text-button" onClick={reset}>
                Reset filters
              </button>
            </Empty>
          ) : (
            <>
              <div className="desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">
                        <button
                          className="sort-button"
                          onClick={() => setSort(!sort)}
                        >
                          Asset <ArrowUpDown />
                        </button>
                      </th>
                      <th scope="col">Tag / serial</th>
                      <th scope="col">Assignee</th>
                      <th scope="col">Location</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Preview</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr
                        key={a.id}
                        className={selected?.id === a.id ? "row-selected" : ""}
                      >
                        <td>
                          <div className="asset-cell">
                            <Device asset={a} />
                            <div>
                              <Link
                                href={`/assets/${encodeURIComponent(a.id)}`}
                              >
                                {a.name}
                              </Link>
                              <small>{a.category}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="tag">{a.id}</span>
                          <small className="serial">
                            {a.serial || "Unknown serial"}
                          </small>
                        </td>
                        <td>
                          <div className="person-cell">
                            <span
                              className={`avatar ${!a.assignee ? "unassigned" : ""}`}
                            >
                              {a.assignee ? (
                                a.assignee
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                              ) : (
                                <User />
                              )}
                            </span>
                            {a.assignee || "Unassigned"}
                          </div>
                        </td>
                        <td>
                          <span className="location-cell">
                            <MapPin />
                            {a.location || "Unknown"}
                          </span>
                        </td>
                        <td>
                          <Badge status={a.status} />
                        </td>
                        <td>
                          <Button
                            variant="quiet"
                            aria-label={`Preview ${a.name}`}
                            onClick={() => setSelected(a)}
                          >
                            <ArrowRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-assets">
                {assets.map((a) => (
                  <Link
                    key={a.id}
                    className="mobile-asset"
                    href={`/assets/${encodeURIComponent(a.id)}`}
                  >
                    <Device asset={a} />
                    <div className="mobile-asset-content">
                      <strong>{a.name}</strong>
                      <span className="serial">{a.serial || a.id}</span>
                      <small>
                        {a.assignee || "Unassigned"} · {a.location}
                      </small>
                      <Badge status={a.status} />
                    </div>
                    <ArrowRight />
                  </Link>
                ))}
              </div>
              <div className="results-count" aria-live="polite">
                Showing {assets.length} of {snapshot?.assets.length} demo assets
              </div>
            </>
          )}
        </section>
        {selected && (
          <aside
            className="asset-preview"
            key={selected.id}
            aria-label="Asset preview"
          >
            <div className="preview-heading">
              <h2>Asset preview</h2>
              <Button
                variant="quiet"
                aria-label="Close preview"
                onClick={() => setSelected(null)}
              >
                <X />
              </Button>
            </div>
            <Device asset={selected} large />
            <h2>{selected.name}</h2>
            <div className="preview-meta">
              <span className="tag">{selected.id}</span>
              <Badge status={selected.status} />
            </div>
            <div className="preview-facts">
              <p>
                <User />
                {selected.assignee || "Unassigned"}
              </p>
              <p>
                <MapPin />
                {selected.location}
              </p>
              <p>Condition: {selected.condition}</p>
              <small>Updated {date(selected.updatedAt)}</small>
            </div>
            <Link
              className="button dark"
              href={`/assets/${encodeURIComponent(selected.id)}`}
            >
              Open asset <ArrowRight />
            </Link>
            <Button
              variant="secondary"
              disabled={selected.status === "Retired"}
              onClick={() => setMove(true)}
            >
              Move or assign
            </Button>
            <div className="preview-tip">
              Registering a device?
              <br />
              <Link href="/scan">Start with its label →</Link>
            </div>
          </aside>
        )}
      </div>
      {selected && snapshot && (
        <MoveDialog
          key={`${selected.id}-${selected.version}`}
          asset={selected}
          people={snapshot.people}
          open={move}
          onClose={() => setMove(false)}
          onSaved={() => {
            setSelected(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
