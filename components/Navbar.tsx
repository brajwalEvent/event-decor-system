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
  const canAccessProduction = isSuperAdmin || isProduction || role === "admin";

  return (
    <header className="bg-gray-900 text-white border-b border-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          <span className="font-black text-lg sm:text-xl tracking-tight text-white whitespace-nowrap">
            🎪 DECOR<span className="text-blue-500">OPS</span>
          </span>

          <nav className="flex items-center gap-1 sm:gap-2">
            {/* Super Admin Exclusive */}
            {isSuperAdmin && (
              <Link
                href="/admin/team"
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-black whitespace-nowrap transition ${
                  pathname === "/admin/team" 
                    ? "bg-red-600 text-white shadow" 
                    : "bg-red-950 text-red-200 hover:bg-red-900"
                }`}
              >
                👑 Team Management
              </Link>
            )}

            {/* Wedding Handovers */}
            <Link
              href="/handovers"
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                pathname.startsWith("/handovers") ? "bg-purple-700 text-white shadow" : "text-purple-300 hover:bg-gray-800"
              }`}
            >
              📋 Wedding Handovers
            </Link>

            {/* Production Master Libraries */}
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
                  🌸 Natural Flowers
                </Link>

                {/* NEW: LABOR MASTER LIBRARY */}
                <Link
                  href="/labors"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/labors" ? "bg-amber-600 text-white shadow" : "text-amber-300 hover:bg-gray-800"
                  }`}
                >
                  👷 Labor Master
                </Link>

                <Link
                  href="/entertainment"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/entertainment" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  🎤 Entertainment & SFX
                </Link>

                <Link
                  href="/elements"
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap transition ${
                    pathname === "/elements" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  📦 Warehouse Props
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
                : isSales 
                ? "bg-purple-950 text-purple-300 border-purple-800" 
                : "bg-blue-950 text-blue-300 border-blue-800"
            }`}>
              {isSuperAdmin ? "👑 Super Admin" : isSales ? "💼 Front Sales Team" : "🛠️ Production Team"}
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