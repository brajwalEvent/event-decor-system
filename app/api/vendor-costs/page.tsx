"use client";
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  query,
  orderBy 
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

export default function VendorCostsMasterPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  // Protect page: Only Production & Admin
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && role === "sales" && !isSuperAdmin) {
      alert("Unauthorized: Sales team cannot view internal vendor costs.");
      router.push("/handovers");
    }
  }, [user, role, isSuperAdmin, loading, router]);

  const fetchItems = async () => {
    try {
      const q = query(collection(db, "entertainment"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching items:", err);
    }
  };

  useEffect(() => {
    if (user && (isSuperAdmin || role === "production" || role === "admin")) {
      fetchItems();
    }
  }, [user, isSuperAdmin, role]);

  // Handle Input Changes for Single Price Items
  const handleSingleCostChange = (itemId: string, newCost: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, internalVendorCost: newCost } : it))
    );
  };

  // Handle Input Changes for Variants
  const handleVariantCostChange = (itemId: string, variantId: string, newCost: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          const updatedVariants = it.variants.map((v: any) =>
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
    setSavingId(item.id);
    try {
      const updateData: any = {};
      
      if (item.hasVariants) {
        updateData.variants = item.variants;
      } else {
        updateData.internalVendorCost = Number(item.internalVendorCost) || 0;
      }

      await updateDoc(doc(db, "entertainment", item.id), updateData);
      
      // Briefly show success state
      setTimeout(() => setSavingId(null), 1000);
    } catch (err) {
      console.error(err);
      alert("Failed to save vendor cost.");
      setSavingId(null);
    }
  };

  const categories = ["All", ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];

  const filteredItems = items.filter((i) => {
    const matchesCat = filterCategory === "All" || i.category === filterCategory;
    const matchesSearch = !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (loading) return <div className="p-12 text-center text-xl font-bold">Loading Vendor Costs Master...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-emerald-300">
                Backend Operations Engine
              </span>
              <h1 className="text-3xl font-black text-gray-900">Vendor Costs Master</h1>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Set your internal procurement prices for all Other Items (SFX, Sound, Artists). This data is strictly hidden from the Sales team.
            </p>
          </div>

          <button
            onClick={() => router.push("/components")}
            className="bg-gray-800 hover:bg-black text-white font-black px-5 py-2.5 rounded-lg text-xs shadow transition"
          >
            ← Back to Library
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm flex flex-col sm:flex-row items-center gap-4">
          <input
            placeholder="Search item name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-96 border-2 border-gray-300 p-2 rounded-lg text-xs font-bold bg-white text-gray-900"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs font-black text-gray-700 whitespace-nowrap">Category:</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="border-2 border-gray-300 p-2 rounded-lg font-bold text-xs bg-white text-gray-900 w-full"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat === "All" ? "✨ All Categories" : cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="h-32 bg-gray-200 relative overflow-hidden">
                  {item.images && item.images.length > 0 ? (
                    <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs font-bold text-gray-400">No Photo</div>
                  )}
                  <span className="absolute top-2 left-2 bg-blue-100 text-blue-900 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-blue-200">
                    {item.category}
                  </span>
                  
                  {/* Shows Selling Price as Reference */}
                  {!item.hasVariants && (
                    <span className="absolute top-2 right-2 bg-gray-900/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                      Sales Price: ₹{item.price?.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <h3 className="font-black text-lg text-gray-900 leading-snug">{item.name}</h3>

                  {/* INTERNAL COST ENTRY FORMS */}
                  <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl space-y-3">
                    <span className="text-[10px] font-black uppercase text-emerald-900 block border-b border-emerald-200 pb-1">
                      🛠️ Internal Vendor Costing
                    </span>

                    {!item.hasVariants ? (
                      // Single Price Item Input
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs font-bold text-gray-700">Cost ({item.pricingUnit === "Custom Unit" ? item.customUnit : item.pricingUnit})</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-gray-500">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={item.internalVendorCost || ""}
                            onChange={(e) => handleSingleCostChange(item.id, Number(e.target.value))}
                            className="w-24 border-2 border-emerald-400 p-1.5 rounded-lg font-black text-xs text-right bg-white"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ) : (
                      // Multiple Variants Inputs
                      <div className="space-y-2">
                        {item.variants?.map((v: any) => (
                          <div key={v.id} className="bg-white p-2 rounded-lg border border-gray-200 flex justify-between items-center gap-2 shadow-sm">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-gray-900 truncate">{v.name}</p>
                              <p className="text-[9px] text-gray-500 font-semibold">Sales: ₹{v.price} / {v.pricingUnit === "Custom Unit" ? v.customUnit : v.pricingUnit}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-gray-500">Cost: ₹</span>
                              <input
                                type="number"
                                min="0"
                                value={v.internalVendorCost || ""}
                                onChange={(e) => handleVariantCostChange(item.id, v.id, Number(e.target.value))}
                                className="w-20 border-2 border-emerald-400 p-1 rounded font-black text-[11px] text-right bg-white"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => handleSaveCosts(item)}
                  disabled={savingId === item.id}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-2 rounded-lg text-xs transition shadow"
                >
                  {savingId === item.id ? "Saving..." : "💾 Save Internal Cost"}
                </button>
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="col-span-full py-12 text-center bg-white border-2 border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-600 font-bold text-sm">No items found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}