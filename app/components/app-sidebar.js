"use client";

import Link from "next/link";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Connections", href: "/connections" },
  { label: "Files", href: "/files" },
  { label: "Editor", href: "/editor" },
  { label: "Services", href: "/services" },
  { label: "Audit", href: "/audit" },
  { label: "Notices", href: "#" },
  { label: "Settings", href: "#" },
];

export default function AppSidebar({ activeItem, helperText, username }) {
  return (
    <aside className="hidden border-r border-white/10 bg-[#111111] px-5 py-6 lg:block">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-[#e95420] font-bold shadow-lg shadow-[#e95420]/20">
            UA
          </div>
          <div>
            <p className="text-sm text-white/54">Ubuntu</p>
            <p className="font-bold">Admin Panel</p>
          </div>
        </div>

        <nav className="mt-9 grid gap-1">
          {navigationItems.map((item) => {
            const isActive = item.label === activeItem;
            const className = isActive
              ? "rounded-md bg-[#e95420] px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#e95420]/20"
              : "rounded-md px-3 py-2.5 text-sm font-semibold text-white/66 transition hover:bg-white/8 hover:text-white";

            if (item.href === "#") {
              return (
                <a className={className} href={item.href} key={item.label}>
                  {item.label}
                </a>
              );
            }

            return (
              <Link className={className} href={item.href} key={item.label}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-[#ffb088]">Signed in as</p>
          <p className="mt-1 truncate text-base font-bold">{username}</p>
          <p className="mt-2 text-sm leading-6 text-white/56">{helperText}</p>
        </div>
      </div>
    </aside>
  );
}

export function AppMobileNav({ activeItem }) {
  return (
    <nav className="grid gap-2 border-b border-white/10 bg-[#111111]/95 px-4 py-3 lg:hidden">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-[#e95420] text-sm font-bold">
          UA
        </div>
        <span className="font-bold">Ubuntu Admin Panel</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {navigationItems
          .filter((item) => item.href !== "#")
          .map((item) => (
            <Link
              className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${
                item.label === activeItem
                  ? "bg-[#e95420] text-white"
                  : "bg-white/8 text-white/68"
              }`}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
      </div>
    </nav>
  );
}
