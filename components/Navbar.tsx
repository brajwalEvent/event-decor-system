"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, role, isSuperAdmin } = useAuth();

  if (!user) return null;

  const isSales = role === "sales";
  const isProduction = role === "production";
  const isAccountant = role === "accountant" as any;
  const canAccessProduction = isSuperAdmin || isProduction || role === "admin";
  const canAccessSales = isSuperAdmin || isSales || role === "admin";
  const canAccessAccounting = isSuperAdmin || isAccountant || role === "admin";

  return (
    <header className="bg-gray-900 text-white border-b border-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          <span className="font-black text-lg sm:text-xl tracking-tight text-white whitespace-nowrap">
            🎪 BRAJWAL<span className="text-blue-500">EVENTS</span>
          </span>

          <nav className="flex items-center gap-1 sm:gap-2">
            {/* 1. Super Admin Exclusive */}
            {isSuperAdmin && (
              <Link
                href="/admin/team"
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-black whitespace-nowrap transition ${
                  pathname === "/admin/team" 
                    ? "bg-red-600 text-white shadow" 
                    : "bg-red-950 text-red-200 hover:bg-red-900"
                }`}
              >
                👑 Team
              </Link>
            )}

            {/* 2. ACCOUNTING ERP (SUPER ADMIN & ACCOUNTANT) */}
            {canAccessAccounting && (
              <Link
                href="/accounting"
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-black whitespace-nowrap transition ${
                  pathname.startsWith("/accounting")
                    ? "bg-emerald-600 text-white shadow"
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
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                  pathname.startsWith("/crm") 
                    ? "bg-amber-600 text-white shadow" 
                    : "text-amber-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                💼 CRM & Quotes
              </Link>
            )}

            {/* 4. Wedding Handovers */}
            <Link
              href="/handovers"
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                pathname.startsWith("/handovers") 
                  ? "bg-purple-700 text-white shadow" 
                  : "text-purple-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              📋 Handovers
            </Link>

            {/* 5. Production Master Libraries */}
            {canAccessProduction && (
              <>
                <Link
                  href="/components"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/components" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  🏛️ Components
                </Link>

                <Link
                  href="/flowers"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/flowers" ? "bg-pink-700 text-white shadow" : "text-pink-300 hover:bg-gray-800"
                  }`}
                >
                  🌸 Flowers
                </Link>

                <Link
                  href="/labors"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/labors" ? "bg-amber-600 text-white shadow" : "text-amber-300 hover:bg-gray-800"
                  }`}
                >
                  👷 Labor
                </Link>

                <Link
                  href="/entertainment"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/entertainment" ? "bg-purple-800 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  📦 Other Items
                </Link>

                <Link
                  href="/elements"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/elements" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  📦 Props
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className="text-xs text-gray-300 font-semibold">{user.email}</p>
            <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded border ${
              isSuperAdmin 
                ? "bg-red-950 text-red-300 border-red-700" 
                : isAccountant
                ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                : isSales 
                ? "bg-amber-950 text-amber-300 border-amber-800" 
                : "bg-blue-950 text-blue-300 border-blue-800"
            }`}>
              {isSuperAdmin ? "👑 Super Admin" : isAccountant ? "📊 Accountant" : isSales ? "💼 Sales" : "🛠️ Production"}
            </span>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="text-xs font-bold bg-gray-800 hover:bg-red-700 hover:text-white px-3 py-1.5 rounded transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}