"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Database, Settings } from "lucide-react";
import { Button } from "./ui";
import { useSource } from "./source-context";
export function Shell({ children }: { children: React.ReactNode }) {
  const { source } = useSource();
  const path = usePathname(),
    [menu, setMenu] = useState(false);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Hello Chef HCAssets home">
          <img src="/hello-chef.svg" alt="Hello Chef" />
          <span>HCAssets</span>
        </Link>
        <Button
          variant="quiet"
          className="mobile-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </Button>
        <nav aria-label="Main navigation" className={menu ? "open" : ""}>
          {[
            ["/", "Inventory"],
            ["/people", "People"],
            ["/locations", "Locations"],
            ["/activity", "Activity"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={
                path === href || (href === "/" && path.startsWith("/assets"))
                  ? "active"
                  : ""
              }
              aria-current={path === href ? "page" : undefined}
              onClick={() => setMenu(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            className="nav-settings"
            href="/settings"
            onClick={() => setMenu(false)}
          >
            Settings
          </Link>
        </nav>
        <div className="header-meta">
          <span className="demo-badge">
            <Database />
            {source?.label || "Checking source…"}
          </span>
          <Link
            href="/settings"
            className="settings-link"
            aria-label="Settings"
          >
            <Settings />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        {source?.kind === "demo"
          ? "Fictional preview data · Saves stay on this computer"
          : source?.kind === "sheet-snapshot"
            ? `Real Sheet snapshot · Read only · Read ${source.checkedAt ? new Date(source.checkedAt).toLocaleString("en-GB") : "Unknown"} · Refreshing this page does not reread Google Sheets`
            : source
              ? `${source.label} · ${source.readOnly ? "Writes disabled" : "Controlled staging writes"}`
              : "Source not confirmed · Writes unavailable"}
      </footer>
    </>
  );
}
