"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const pathname = usePathname();
  const { user, role } = useAuth();

  if (!user) return null;

  return (
    <header className="bg-gray-900 text-white border-b border-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-black text-xl tracking-tight text-white">
            🎪 DECOR<span className="text-blue-500">OPS</span>
          </span>

          <nav className="flex items-center gap-2">
            <Link
              href="/elements"
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                pathname === "/elements"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              📦 Elements (Props & Gear)
            </Link>
            <Link
              href="/components"
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                pathname === "/components"
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              🏛️ Components (Stages & Gates)
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400 font-semibold">{user.email}</p>
            <span className="text-xs uppercase font-black bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
              {role}
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