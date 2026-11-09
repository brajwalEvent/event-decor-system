"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, role, isSuperAdmin } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown and mobile menu when path changes
  useEffect(() => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  if (!user) return null;

  // Hardcoded Read-Only Auditor Check
  const READ_ONLY_ACCOUNTING_EMAIL = "itsmanisharora@gmail.com";
  const isAccountingAuditor =
    user?.email?.toLowerCase().trim() === READ_ONLY_ACCOUNTING_EMAIL.toLowerCase().trim();

  const isSales = role === "sales";
  const isProduction = role === "production";
  const isAccountant = (role as any) === "accountant";
  const canAccessProduction = isSuperAdmin || isProduction || role === "admin";
  const canAccessSales = isSuperAdmin || isSales || role === "admin";
  const canAccessAccounting =
    isSuperAdmin || isAccountant || role === "admin" || isAccountingAuditor;

  // Catalog items grouped inside the Production Dropdown
  const masterCatalogs = [
    {
      name: "Flowers Catalog",
      href: "/flowers",
      icon: "🌸",
      desc: "Mandi procurement rates & floral specs",
    },
    {
      name: "Components Library",
      href: "/components",
      icon: "🏛️",
      desc: "Decor structures, setups & stages",
    },
    {
      name: "Labor & Manpower",
      href: "/labors",
      icon: "👷",
      desc: "Shift rates, meals, travel & roles",
    },
    {
      name: "Vendor Costs Master",
      href: "/vendor-costs",
      icon: "💰",
      desc: "Supplier pricing benchmarks",
    },
    {
      name: "Other Items & SFX",
      href: "/entertainment",
      icon: "📦",
      desc: "Audio-visual, SFX & entertainment gear",
    },
    {
      name: "Props & Elements",
      href: "/elements",
      icon: "🎭",
      desc: "Reusable props, signages & assets",
    },
  ];

  const isCatalogActive = masterCatalogs.some((c) => pathname.startsWith(c.href));

  return (
    <header className="bg-gray-950/90 backdrop-blur-md text-white border-b border-gray-800 sticky top-0 z-50 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* BRAND LOGO */}
        <div className="flex items-center gap-6">
          <Link href="/handovers" className="flex items-center gap-2 group">
            <span className="text-xl">🎪</span>
            <span className="font-black text-lg tracking-tight text-white group-hover:text-blue-400 transition">
              BRAJWAL<span className="text-blue-500">EVENTS</span>
            </span>
          </Link>

          {/* DESKTOP NAVIGATION */}
          <nav className="hidden lg:flex items-center gap-1.5 text-xs font-bold">
            {/* 1. Super Admin Exclusive */}
            {isSuperAdmin && (
              <Link
                href="/admin/team"
                className={`px-3 py-1.5 rounded-lg transition ${
                  pathname === "/admin/team"
                    ? "bg-red-600 text-white shadow-sm font-black"
                    : "text-red-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                👑 Team
              </Link>
            )}

            {/* 2. Accounting ERP */}
            {canAccessAccounting && (
              <Link
                href="/accounting"
                className={`px-3 py-1.5 rounded-lg transition ${
                  pathname.startsWith("/accounting")
                    ? "bg-emerald-600 text-white shadow-sm font-black"
                    : "text-emerald-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                📊 Accounting ERP
              </Link>
            )}

            {/* 3. Sales CRM & Quotes */}
            {canAccessSales && (
              <Link
                href="/crm"
                className={`px-3 py-1.5 rounded-lg transition ${
                  pathname.startsWith("/crm")
                    ? "bg-amber-600 text-white shadow-sm font-black"
                    : "text-amber-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                💼 CRM & Quotes
              </Link>
            )}

            {/* 4. Wedding Handovers (Universal) */}
            <Link
              href="/handovers"
              className={`px-3 py-1.5 rounded-lg transition ${
                pathname.startsWith("/handovers")
                  ? "bg-purple-700 text-white shadow-sm font-black"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              📋 Handovers
            </Link>

            {/* 5. Production Links */}
            {canAccessProduction && (
              <>
                {/* Centralized Procurement Hub */}
                <Link
                  href="/procurement"
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                    pathname.startsWith("/procurement")
                      ? "bg-indigo-600 text-white shadow-sm font-black"
                      : "text-indigo-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <span>🛒</span>
                  <span>Procurement Hub</span>
                </Link>

                {/* Modern Dropdown for Catalogs & Libraries */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 outline-none ${
                      isCatalogActive
                        ? "bg-blue-600/30 text-blue-300 border border-blue-500/50 font-black"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <span>📚</span>
                    <span>Master Libraries</span>
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        dropdownOpen ? "rotate-180 text-blue-400" : "text-gray-400"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu Panel */}
                  {dropdownOpen && (
                    <div className="absolute left-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-2 border-b border-gray-800 mb-1">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                          Standard Production Catalogs
                        </span>
                      </div>
                      <div className="space-y-1">
                        {masterCatalogs.map((item) => {
                          const isItemActive = pathname === item.href;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={`flex items-start gap-3 p-2.5 rounded-xl transition group ${
                                isItemActive
                                  ? "bg-blue-600 text-white font-bold"
                                  : "hover:bg-gray-800/80 text-gray-300 hover:text-white"
                              }`}
                            >
                              <span className="text-lg p-1 bg-gray-800 rounded-lg group-hover:scale-110 transition">
                                {item.icon}
                              </span>
                              <div>
                                <div className="text-xs font-black tracking-tight">{item.name}</div>
                                <div
                                  className={`text-[10px] font-medium leading-tight ${
                                    isItemActive ? "text-blue-100" : "text-gray-400"
                                  }`}
                                >
                                  {item.desc}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* RIGHT SECTION: USER PROFILE PILL & LOGOUT */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-200 font-bold leading-tight">{user.email}</p>
            <span
              className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full border inline-block mt-0.5 ${
                isSuperAdmin
                  ? "bg-red-950/80 text-red-300 border-red-700"
                  : isAccountingAuditor
                  ? "bg-blue-950/80 text-blue-300 border-blue-700"
                  : isAccountant
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-700"
                  : isSales
                  ? "bg-amber-950/80 text-amber-300 border-amber-800"
                  : "bg-blue-950/80 text-blue-300 border-blue-800"
              }`}
            >
              {isSuperAdmin
                ? "👑 Super Admin"
                : isAccountingAuditor
                ? "🔍 Auditor"
                : isAccountant
                ? "📊 Accountant"
                : isSales
                ? "💼 Sales"
                : "🛠️ Production"}
            </span>
          </div>

          <button
            onClick={() => signOut(auth)}
            className="text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-gray-800/80 border border-gray-800 hover:border-red-900/50 px-3 py-1.5 rounded-lg transition"
          >
            Logout
          </button>

          {/* MOBILE HAMBURGER BUTTON */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
            aria-label="Toggle Navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER MENU */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-800 bg-gray-950 px-4 pt-3 pb-6 space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-col gap-1 text-sm font-bold">
            {isSuperAdmin && (
              <Link href="/admin/team" className="p-2 rounded-lg hover:bg-gray-800 text-red-300">
                👑 Team
              </Link>
            )}

            {canAccessAccounting && (
              <Link href="/accounting" className="p-2 rounded-lg hover:bg-gray-800 text-emerald-300">
                📊 Accounting ERP
              </Link>
            )}

            {canAccessSales && (
              <Link href="/crm" className="p-2 rounded-lg hover:bg-gray-800 text-amber-300">
                💼 CRM & Quotes
              </Link>
            )}

            <Link href="/handovers" className="p-2 rounded-lg hover:bg-gray-800 text-purple-300">
              📋 Handovers
            </Link>

            {canAccessProduction && (
              <>
                <Link href="/procurement" className="p-2 rounded-lg hover:bg-gray-800 text-indigo-300 flex items-center gap-2">
                  <span>🛒</span>
                  <span>Procurement Hub</span>
                </Link>

                <div className="pt-2 border-t border-gray-800/80">
                  <span className="text-[10px] font-black uppercase text-gray-500 px-2 block mb-1">
                    Master Libraries & Catalogs
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    {masterCatalogs.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="p-2 rounded-lg hover:bg-gray-800 text-xs text-gray-300 flex items-center gap-2"
                      >
                        <span>{item.icon}</span>
                        <span>{item.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}