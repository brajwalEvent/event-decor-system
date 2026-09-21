"use client";
import React, { useState, useEffect } from "react";
import { db } from "../../lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

export default function LaborMasterPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [labors, setLabors] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState(""); // e.g., Florist Labor, Loading Labor, Fabric Labor
  const [tradeCategory, setTradeCategory] = useState("Floral"); // Floral, Loading/Rigging, Fabric, Carpentry, Electrical
  const [ratePerShift, setRatePerShift] = useState<number>(500); // Cost per shift
  const [defaultShiftsPerDay, setDefaultShiftsPerDay] = useState<number>(2); // 2, 3, or 4 shifts per day
  const [mealsPerDay, setMealsPerDay] = useState<number>(3); // Standard 3 meals per day
  const [defaultCostPerMeal, setDefaultCostPerMeal] = useState<number>(150); // ₹150 per meal
  const [defaultTravelCost, setDefaultTravelCost] = useState<number>(800); // One-time round trip (arrival + departure)
  const [notes, setNotes] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  // Guard: Sales team cannot access labor configuration
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && role === "sales" && !isSuperAdmin) router.push("/handovers");
  }, [user, role, isSuperAdmin, loading, router]);

  const fetchLabors = async () => {
    try {
      const q = query(collection(db, "labor_master"), orderBy("name", "asc"));
      const snap = await getDocs(q);
      setLabors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching labors:", err);
    }
  };

  useEffect(() => {
    if (user) fetchLabors();
  }, [user]);

  const resetForm = () => {
    setName("");
    setTradeCategory("Floral");
    setRatePerShift(500);
    setDefaultShiftsPerDay(2);
    setMealsPerDay(3);
    setDefaultCostPerMeal(150);
    setDefaultTravelCost(800);
    setNotes("");
    setIsEditing(false);
    setEditId(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setIsEditing(true);
    setEditId(item.id);
    setName(item.name || "");
    setTradeCategory(item.tradeCategory || "Floral");
    setRatePerShift(Number(item.ratePerShift) || 500);
    setDefaultShiftsPerDay(Number(item.defaultShiftsPerDay) || 2);
    setMealsPerDay(Number(item.mealsPerDay) || 3);
    setDefaultCostPerMeal(Number(item.defaultCostPerMeal) || 150);
    setDefaultTravelCost(Number(item.defaultTravelCost) || 800);
    setNotes(item.notes || "");
    setShowModal(true);
  };

  const handleDelete = async (id: string, laborName: string) => {
    if (!window.confirm(`Delete labor type "${laborName}"?`)) return;
    try {
      await deleteDoc(doc(db, "labor_master", id));
      setLabors((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert("Failed to delete labor type.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const laborData = {
        name: name.trim(),
        tradeCategory,
        ratePerShift: Number(ratePerShift) || 0,
        defaultShiftsPerDay: Number(defaultShiftsPerDay) || 2,
        mealsPerDay: Number(mealsPerDay) || 3,
        defaultCostPerMeal: Number(defaultCostPerMeal) || 0,
        defaultTravelCost: Number(defaultTravelCost) || 0,
        notes: notes.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "labor_master", editId), laborData);
      } else {
        await addDoc(collection(db, "labor_master"), {
          ...laborData,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchLabors();
    } catch (err) {
      console.error(err);
      alert("Failed to save labor type.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLabors = labors.filter((l) =>
    !searchQuery ||
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.tradeCategory?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading Labor Master...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-100 text-amber-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-amber-300">
                Backend Operations Engine
              </span>
              <h1 className="text-3xl font-black text-gray-900">Labor Master Directory</h1>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Feed standard shift rates, meals per day (3), food cost, and round-trip travel once for all labor teams.
            </p>
          </div>

          <button
            onClick={openNewModal}
            className="bg-amber-600 hover:bg-amber-700 text-white font-black px-6 py-3 rounded-lg shadow transition flex items-center gap-2"
          >
            + Add New Labor Trade
          </button>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm">
          <input
            placeholder="Search labor by trade (e.g. Florist, Loading, Fabric, Carpentry)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-2 border-gray-300 p-2.5 rounded-lg text-xs font-bold bg-white text-gray-900"
          />
        </div>

        {/* Labor Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredLabors.map((l) => (
            <div
              key={l.id}
              className="bg-white border-2 border-gray-300 rounded-xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                    {l.tradeCategory}
                  </span>
                  <span className="text-xs font-mono font-bold bg-amber-50 text-amber-900 px-2 py-0.5 rounded border border-amber-200">
                    ₹{l.ratePerShift} / Shift
                  </span>
                </div>

                <h3 className="text-xl font-black text-gray-900 leading-tight">
                  👷 {l.name}
                </h3>

                {/* Standard Rules Breakdown */}
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-xs font-medium space-y-1.5 text-gray-700">
                  <p>
                    ⏱️ <strong>Shifts:</strong> {l.defaultShiftsPerDay} shifts/day (₹{l.ratePerShift * l.defaultShiftsPerDay}/day/person)
                  </p>
                  <p>
                    🍽️ <strong>Food:</strong> {l.mealsPerDay} meals/day @ ₹{l.defaultCostPerMeal}/meal (₹{l.mealsPerDay * l.defaultCostPerMeal}/day/person)
                  </p>
                  <p>
                    🚌 <strong>Travel:</strong> ₹{l.defaultTravelCost} per person (Round-trip coming + return)
                  </p>
                </div>

                {l.notes && (
                  <p className="text-xs text-gray-500 italic bg-amber-50/50 p-2 rounded border border-amber-100">
                    {l.notes}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 grid grid-cols-2 gap-2">
                <button
                  onClick={() => openEditModal(l)}
                  className="bg-white border-2 border-gray-300 hover:bg-gray-100 text-gray-900 font-bold py-1.5 rounded text-xs transition"
                >
                  Edit Rates
                </button>
                <button
                  onClick={() => handleDelete(l.id, l.name)}
                  className="bg-red-50 border-2 border-red-300 hover:bg-red-100 text-red-700 font-bold py-1.5 rounded text-xs transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {filteredLabors.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white border-2 border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-600 font-bold text-lg">No labor types configured yet.</p>
              <p className="text-gray-400 text-xs mt-1">
                Click "+ Add New Labor Trade" above to define Florist, Loading, Fabric, or Carpentry teams.
              </p>
            </div>
          )}
        </div>

        {/* MODAL: ADD / EDIT LABOR */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-xl font-black text-gray-900">
                  {isEditing ? "Edit Labor Rates & Parameters" : "Configure New Labor Trade"}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 font-black text-xl hover:text-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Labor Trade Name *</label>
                  <input
                    required
                    placeholder="e.g. Florist Karigar, Loading & Rigging Team, Fabric Drapery"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Department / Category</label>
                    <select
                      value={tradeCategory}
                      onChange={(e) => setTradeCategory(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    >
                      <option value="Floral">Floral Team</option>
                      <option value="Loading/Rigging">Loading / Rigging / Truss</option>
                      <option value="Fabric">Fabric & Drapery</option>
                      <option value="Carpentry">Carpentry & Wooden Props</option>
                      <option value="Electrical">Electrical & Lighting</option>
                      <option value="Housekeeping">Housekeeping & Cleaning</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Rate Per Shift (₹) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 500"
                      value={ratePerShift || ""}
                      onChange={(e) => setRatePerShift(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Default Shifts Per Day *</label>
                    <select
                      value={defaultShiftsPerDay}
                      onChange={(e) => setDefaultShiftsPerDay(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    >
                      <option value={1}>1 Shift / Day (8 hrs)</option>
                      <option value={2}>2 Shifts / Day (16 hrs - Standard)</option>
                      <option value={3}>3 Shifts / Day (Heavy setup)</option>
                      <option value={4}>4 Shifts / Day (Round the clock)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Meals Per Day (Default 3) *</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      required
                      value={mealsPerDay}
                      onChange={(e) => setMealsPerDay(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Cost Per Meal (₹) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 150"
                      value={defaultCostPerMeal || ""}
                      onChange={(e) => setDefaultCostPerMeal(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Round-Trip Travel Cost / Person (₹) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 800 (Coming + Return)"
                      value={defaultTravelCost || ""}
                      onChange={(e) => setDefaultTravelCost(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Notes / Trade Specifics</label>
                  <input
                    placeholder="e.g. Requires separate tool kit; overtime beyond 2 shifts paid @ 1.5x"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border font-bold rounded text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded text-xs shadow"
                  >
                    {submitting ? "Saving..." : isEditing ? "Update Labor" : "Save to Directory"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}