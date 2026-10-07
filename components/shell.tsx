"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Menu,
  X,
  Database,
  Settings,
  ScanLine,
  MessageCircle,
  Layers,
} from "lucide-react";
import { Button } from "./ui";
import { useSource } from "./source-context";
import "./ask-it.css";
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
        <Link className="brand" href="/" aria-label="Hello Assets home">
          <img
            src="/brand/hello-assets-logo.png"
            alt="Hello Assets"
            width={196}
            height={40}
          />
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
            ["/scan", "Scan"],
            ...(source?.assistantEnabled || source?.kind === "demo"
              ? [["/ask-it", "Ask IT"]]
              : []),
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
              ? `${source.label} · ${source.readOnly ? "Writes disabled" : source.kind === "staging" ? "Controlled staging writes" : "Saves sync to Google Sheets"}`
              : "Source not confirmed · Writes unavailable"}
      </footer>
      {(source?.assistantEnabled || source?.kind === "demo") && (
        <nav className="it-mobile-nav" aria-label="Quick navigation">
          {[
            ["/", "Inventory", Layers],
            ["/scan", "Scan", ScanLine],
            ["/ask-it", "Ask IT", MessageCircle],
          ].map(([href, label, Icon]) => {
            const NavIcon = Icon as typeof Layers;
            return (
              <Link
                key={String(href)}
                href={String(href)}
                aria-current={path === href ? "page" : undefined}
              >
                <NavIcon />
                {String(label)}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
