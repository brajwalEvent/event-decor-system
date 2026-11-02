"use client";
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../lib/firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc 
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

export default function VendorCostsMasterPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  // Hardcoded Read-Only Auditor Check
  const READ_ONLY_EMAIL = "itsmanisharora@gmail.com";
  const isReadOnlyViewer =
    user?.email?.toLowerCase().trim() === READ_ONLY_EMAIL.toLowerCase().trim();

  const isProduction = role === "production";
  const isAdmin = role === "admin" || isSuperAdmin;
  const canAccess = isAdmin || isProduction || isReadOnlyViewer;
  const canEdit = !isReadOnlyViewer && (isAdmin || isProduction);

  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterCostStatus, setFilterCostStatus] = useState<"All" | "Missing" | "Configured">("All");

  // Protect page
  useEffect(() => {
    if (!loading && (!user || !canAccess)) {
      alert("Unauthorized: Sales team cannot view internal vendor costs.");
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, canAccess, router]);

  // Robust check if item uses variants (matching OtherItemsPage logic)
  const checkHasVariants = (item: any): boolean => {
    return Boolean(
      item.hasVariants || (Array.isArray(item.variants) && item.variants.length > 0)
    );
  };

  // Safe fetch without Firestore orderBy dropping items
  const fetchItems = async () => {
    try {
      const snap = await getDocs(collection(db, "entertainment"));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return dateB - dateA;
        });

      setItems(list);
    } catch (err) {
      console.error("Error fetching items:", err);
    }
  };

  useEffect(() => {
    if (user && canAccess) {
      fetchItems();
    }
  }, [user, canAccess]);

  // Handle Input Changes for Single Price Items
  const handleSingleCostChange = (itemId: string, newCost: number | "") => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, internalVendorCost: newCost } : it))
    );
  };

  // Handle Input Changes for Variants
  const handleVariantCostChange = (itemId: string, variantId: string, newCost: number | "") => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          const updatedVariants = (it.variants || []).map((v: any) =>
            v.id === variantId ? { ...v, internalVendorCost: newCost } : v
          );
          return { ...it, variants: updatedVariants };
        }
        return it;
      })
    );
  };

  // Save specific item to database
  const handleSaveCosts = async (item: any) => {
    if (!canEdit) return;
    setSavingId(item.id);

    try {
      const hasVariants = checkHasVariants(item);
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };

      if (hasVariants) {
        // Sanitize variants array (strip any undefined fields to prevent Firestore crashes)
        updateData.variants = (item.variants || []).map((v: any) => {
          const cleanedVariant: any = {
            id: v.id || Date.now().toString(),
            name: v.name || "Option",
            price: Number(v.price) || 0,
            pricingUnit: v.pricingUnit || "Per Event",
            internalVendorCost: Number(v.internalVendorCost) || 0,
            notes: v.notes || "",
          };
          if (v.customUnit) cleanedVariant.customUnit = v.customUnit.trim();
          return cleanedVariant;
        });
      } else {
        updateData.internalVendorCost = Number(item.internalVendorCost) || 0;
      }

      await updateDoc(doc(db, "entertainment", item.id), updateData);

      // Brief visual flash
      setTimeout(() => setSavingId(null), 1000);
    } catch (err: any) {
      console.error("Failed to save vendor cost:", err);
      alert("Failed to save vendor cost: " + err.message);
      setSavingId(null);
    }
  };

  // Helper to determine if an item is missing costs
  const isItemMissingCost = (item: any): boolean => {
    const hasVariants = checkHasVariants(item);
    if (hasVariants) {
      if (!item.variants || item.variants.length === 0) return true;
      return item.variants.some((v: any) => !v.internalVendorCost || Number(v.internalVendorCost) <= 0);
    }
    return !item.internalVendorCost || Number(item.internalVendorCost) <= 0;
  };

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCat = filterCategory === "All" || item.category === filterCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (item.variants &&
          item.variants.some((v: any) =>
            v.name?.toLowerCase().includes(searchQuery.toLowerCase().trim())
          ));

      const missingCost = isItemMissingCost(item);
      const matchesStatus =
        filterCostStatus === "All"
          ? true
          : filterCostStatus === "Missing"
          ? missingCost
          : !missingCost;

      return matchesCat && matchesSearch && matchesStatus;
    });
  }, [items, filterCategory, searchQuery, filterCostStatus]);

  const missingCostCount = useMemo(() => {
    return items.filter((i) => isItemMissingCost(i)).length;
  }, [items]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-mono text-sm uppercase tracking-wider text-gray-500 font-bold">
        Loading Vendor Costs Master...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-emerald-300">
                Backend Operations Engine
              </span>
              {isReadOnlyViewer && (
                <span className="bg-blue-100 text-blue-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-blue-300">
                  Auditor / View-Only
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1">Vendor Costs Master</h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-600 mt-1">
              Set your internal procurement / buying prices for all SFX, Audio, Artists, and Printing. This data directly feeds into the Production Budget.
            </p>
          </div>

          <button
            onClick={() => router.push("/components")}
            className="bg-gray-900 hover:bg-black text-white font-black px-5 py-2.5 rounded-lg text-xs shadow transition self-start md:self-auto"
          >
            ← Back to Library
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 rounded-2xl border-2 border-gray-300 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <input
              placeholder="Search item name or variant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-80 border-2 border-gray-300 p-2 rounded-lg text-xs font-bold bg-white text-gray-900 outline-none"
            />

            <div className="flex items-center gap-2 w-full md:w-auto">
              <label className="text-xs font-black text-gray-700 whitespace-nowrap">Category:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border-2 border-gray-300 p-2 rounded-lg font-bold text-xs bg-white text-gray-900 w-full md:w-64 outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "All" ? "✨ All Categories" : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="flex items-center gap-1.5 w-full md:w-auto bg-gray-100 p-1 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterCostStatus("All")}
                className={`px-3 py-1.5 rounded-md transition ${
                  filterCostStatus === "All"
                    ? "bg-white text-gray-900 shadow-sm font-black"
                    : "text-gray-600 hover:text-black"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterCostStatus("Missing")}
                className={`px-3 py-1.5 rounded-md transition ${
                  filterCostStatus === "Missing"
                    ? "bg-amber-500 text-white shadow-sm font-black"
                    : "text-amber-800 hover:bg-amber-100"
                }`}
              >
                ⚠️ Missing Cost ({missingCostCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterCostStatus("Configured")}
                className={`px-3 py-1.5 rounded-md transition ${
                  filterCostStatus === "Configured"
                    ? "bg-emerald-600 text-white shadow-sm font-black"
                    : "text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                ✅ Configured ({items.length - missingCostCount})
              </button>
            </div>
          </div>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const hasVariants = checkHasVariants(item);
            const missingCost = isItemMissingCost(item);
            const singleUnitDisplay =
              item.pricingUnit === "Custom Unit"
                ? (item.customUnit || "Custom Unit")
                : (item.pricingUnit || "Per Event");

            return (
              <div
                key={item.id}
                className="bg-white border-2 border-gray-300 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div>
                  {/* Photo Header */}
                  <div className="h-36 bg-gray-200 relative overflow-hidden">
                    {item.images && item.images.length > 0 ? (
                      <img
                        src={item.images[0]}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs font-bold text-gray-400">
                        No Photo
                      </div>
                    )}

                    <span className="absolute top-2 left-2 bg-blue-100 text-blue-900 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-blue-200">
                      {item.category}
                    </span>

                    {/* Cost Status Badge */}
                    <span
                      className={`absolute bottom-2 left-2 text-[10px] font-black uppercase px-2 py-0.5 rounded shadow ${
                        missingCost
                          ? "bg-amber-500 text-white"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {missingCost ? "⚠️ Cost Missing" : "✅ Cost Set"}
                    </span>

                    {/* Sales Price Reference */}
                    {!hasVariants && (
                      <span className="absolute top-2 right-2 bg-gray-900/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded font-mono">
                        Sales: ₹{Number(item.price || 0).toLocaleString()} / {singleUnitDisplay}
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <h3 className="font-black text-lg text-gray-900 leading-snug">
                      {item.name}
                    </h3>

                    {/* INTERNAL COST ENTRY FORMS */}
                    <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl space-y-3">
                      <span className="text-[10px] font-black uppercase text-emerald-950 block border-b border-emerald-200 pb-1">
                        🛠️ Internal Vendor Buying Cost
                      </span>

                      {!hasVariants ? (
                        // Case A: Single Price Item Input
                        <div className="flex justify-between items-center gap-2 text-xs">
                          <span className="font-bold text-gray-700 truncate max-w-[150px]">
                            Buying Cost ({singleUnitDisplay}):
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-gray-500 font-mono">₹</span>
                            <input
                              type="number"
                              min="0"
                              disabled={!canEdit}
                              value={
                                item.internalVendorCost !== undefined && item.internalVendorCost !== null
                                  ? item.internalVendorCost
                                  : ""
                              }
                              onChange={(e) =>
                                handleSingleCostChange(
                                  item.id,
                                  e.target.value === "" ? "" : Number(e.target.value)
                                )
                              }
                              className="w-24 border-2 border-emerald-400 p-1.5 rounded-lg font-black text-xs text-right bg-white font-mono outline-none disabled:opacity-60"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ) : (
                        // Case B: Variants Cost Inputs
                        <div className="space-y-2">
                          <span className="text-[10px] text-gray-500 font-bold uppercase block">
                            Set Buying Cost per Option ({item.variants?.length || 0}):
                          </span>
                          {(item.variants || []).map((v: any) => {
                            const variantUnit =
                              v.pricingUnit === "Custom Unit"
                                ? (v.customUnit || "Custom Unit")
                                : (v.pricingUnit || "Per Event");

                            return (
                              <div
                                key={v.id}
                                className="bg-white p-2.5 rounded-lg border border-gray-200 flex justify-between items-center gap-2 shadow-sm text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-900 truncate">
                                    {v.name}
                                  </p>
                                  <p className="text-[10px] text-gray-500 font-mono">
                                    Sales: ₹{Number(v.price || 0).toLocaleString()} / {variantUnit}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-gray-500 font-mono text-[10px]">
                                    Cost: ₹
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!canEdit}
                                    value={
                                      v.internalVendorCost !== undefined && v.internalVendorCost !== null
                                        ? v.internalVendorCost
                                        : ""
                                    }
                                    onChange={(e) =>
                                      handleVariantCostChange(
                                        item.id,
                                        v.id,
                                        e.target.value === "" ? "" : Number(e.target.value)
                                      )
                                    }
                                    className="w-20 border-2 border-emerald-400 p-1 rounded font-black text-xs text-right bg-white font-mono outline-none disabled:opacity-60"
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                {canEdit && (
                  <div className="p-3 border-t border-gray-200 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => handleSaveCosts(item)}
                      disabled={savingId === item.id}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-2 rounded-lg text-xs transition shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {savingId === item.id ? "Saving..." : "💾 Save Internal Cost"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white border-2 border-dashed border-gray-300 rounded-2xl">
              <p className="text-gray-600 font-bold text-sm">No items found matching the selected filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}