"use client";
import React, { useState, useEffect } from "react";
import { db, storage } from "../../lib/firebase";
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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";

export default function FlowersPage() {
  const { user, role, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const [flowers, setFlowers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [variety, setVariety] = useState(""); // e.g., Dutch, Desi, Imported
  const [color, setColor] = useState(""); // e.g., Dark Red, Yellow, Orange, White
  const [unit, setUnit] = useState("Per Bunch");
  const [customUnit, setCustomUnit] = useState("");
  const [approxPrice, setApproxPrice] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  // Guard: Sales team cannot modify master flower catalog
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && role === "sales" && !isSuperAdmin) router.push("/handovers");
  }, [user, role, isSuperAdmin, loading, router]);

  const fetchFlowers = async () => {
    try {
      const q = query(collection(db, "natural_flowers"), orderBy("name", "asc"));
      const snap = await getDocs(q);
      setFlowers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching flowers:", err);
    }
  };

  useEffect(() => {
    if (user) fetchFlowers();
  }, [user]);

  const resetForm = () => {
    setName("");
    setVariety("");
    setColor("");
    setUnit("Per Bunch");
    setCustomUnit("");
    setApproxPrice(0);
    setNotes("");
    setImageFile(null);
    setExistingImageUrl("");
    setIsEditing(false);
    setEditId(null);
  };

  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (fl: any) => {
    setIsEditing(true);
    setEditId(fl.id);
    setName(fl.name || "");
    setVariety(fl.variety || "");
    setColor(fl.color || "");
    setUnit(fl.unit || "Per Bunch");
    setCustomUnit(fl.customUnit || "");
    setApproxPrice(fl.approxPrice || 0);
    setNotes(fl.notes || "");
    setExistingImageUrl(fl.imageUrl || "");
    setImageFile(null);
    setShowModal(true);
  };

  const handleDelete = async (id: string, flowerName: string) => {
    if (!window.confirm(`Delete "${flowerName}" from Natural Flowers Library?`)) return;
    try {
      await deleteDoc(doc(db, "natural_flowers", id));
      setFlowers((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      alert("Failed to delete flower.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let finalImageUrl = existingImageUrl;
      if (imageFile) {
        const fileRef = ref(storage, `flowers/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalImageUrl = await getDownloadURL(fileRef);
      }

      const flowerData = {
        name: name.trim(),
        variety: variety.trim(),
        color: color.trim(),
        unit,
        customUnit: unit === "Custom" ? customUnit.trim() : "",
        approxPrice: Number(approxPrice) || 0,
        notes: notes.trim(),
        imageUrl: finalImageUrl,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "natural_flowers", editId), flowerData);
      } else {
        await addDoc(collection(db, "natural_flowers"), {
          ...flowerData,
          createdAt: new Date().toISOString(),
        });
      }

      setShowModal(false);
      resetForm();
      fetchFlowers();
    } catch (err) {
      console.error(err);
      alert("Failed to save flower.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFlowers = flowers.filter((f) =>
    !searchQuery ||
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.variety?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.color?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-xl font-bold">Loading Natural Flowers...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border-2 border-gray-300 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-pink-100 text-pink-900 text-xs uppercase font-black px-2.5 py-0.5 rounded border border-pink-300">
                Procurement Catalog
              </span>
              <h1 className="text-3xl font-black text-gray-900">Natural Flowers Master Library</h1>
            </div>
            <p className="text-sm font-semibold text-gray-600 mt-1">
              Standardized flowers, mandi units (Per Bunch, Per Kg, Per Stem), and approx market costing.
            </p>
          </div>

          <button
            onClick={openNewModal}
            className="bg-pink-700 hover:bg-pink-800 text-white font-black px-6 py-3 rounded-lg shadow transition flex items-center gap-2"
          >
            + Add New Flower
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 rounded-xl border-2 border-gray-300 shadow-sm">
          <input
            placeholder="Search flowers by name, variety (Dutch/Desi), or color..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border-2 border-gray-300 p-2.5 rounded-lg text-xs font-bold bg-white text-gray-900"
          />
        </div>

        {/* Flowers Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredFlowers.map((fl) => (
            <div
              key={fl.id}
              className="bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition"
            >
              <div>
                <div className="h-44 bg-gray-100 relative overflow-hidden">
                  {fl.imageUrl ? (
                    <img src={fl.imageUrl} alt={fl.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs font-bold text-gray-400">
                      No Photo
                    </div>
                  )}
                  <span className="absolute top-2 right-2 bg-pink-700 text-white text-xs font-black px-2.5 py-1 rounded shadow">
                    ₹{fl.approxPrice?.toLocaleString()} / {fl.unit === "Custom" ? fl.customUnit : fl.unit}
                  </span>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    {fl.variety && (
                      <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                        {fl.variety}
                      </span>
                    )}
                    {fl.color && (
                      <span className="text-[10px] font-black bg-pink-50 text-pink-900 px-2 py-0.5 rounded border border-pink-200">
                        {fl.color}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-xl text-gray-900 leading-tight">{fl.name}</h3>

                  {fl.notes && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border">
                      {fl.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-gray-200 grid grid-cols-2 gap-2 bg-gray-50">
                <button
                  onClick={() => openEditModal(fl)}
                  className="bg-white border-2 border-gray-300 hover:bg-gray-100 text-gray-900 font-bold py-1.5 rounded text-xs transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(fl.id, fl.name)}
                  className="bg-red-50 border-2 border-red-300 hover:bg-red-100 text-red-700 font-bold py-1.5 rounded text-xs transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {filteredFlowers.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white border-2 border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-600 font-bold text-lg">No flowers added yet.</p>
              <p className="text-gray-400 text-xs mt-1">Click "+ Add New Flower" above to build your floral catalog.</p>
            </div>
          )}
        </div>

        {/* MODAL: ADD / EDIT FLOWER */}
        {showModal && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 border-2 border-gray-400 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h2 className="text-xl font-black text-gray-900">
                  {isEditing ? "Edit Natural Flower" : "Add New Natural Flower"}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 font-black text-xl hover:text-black">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Flower Name *</label>
                  <input
                    required
                    placeholder="e.g. Dutch Red Rose, Marigold (Genda), Baby's Breath"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Variety / Origin</label>
                    <input
                      placeholder="e.g. Dutch, Desi, Imported, Local"
                      value={variety}
                      onChange={(e) => setVariety(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Color</label>
                    <input
                      placeholder="e.g. Dark Red, Yellow, Peach, White"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Procurement Unit *</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    >
                      <option value="Per Bunch">Per Bunch</option>
                      <option value="Per Kg">Per Kg</option>
                      <option value="Per Stem">Per Stem</option>
                      <option value="Per Garland">Per Garland</option>
                      <option value="Per Box">Per Box</option>
                      <option value="Custom">Custom Unit...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-800 mb-1">Approx Base Price (₹) *</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 250"
                      value={approxPrice || ""}
                      onChange={(e) => setApproxPrice(Number(e.target.value))}
                      className="w-full border-2 border-gray-400 p-2 rounded-lg font-bold text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>

                {unit === "Custom" && (
                  <div>
                    <label className="block text-xs font-black text-blue-900 mb-1">Specify Custom Unit *</label>
                    <input
                      required
                      placeholder="e.g. Per 50 Stems Bundle"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="w-full border-2 border-blue-400 p-2 rounded-lg font-bold text-xs bg-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Notes / Seasonal Details</label>
                  <input
                    placeholder="e.g. Available year-round; price spikes during Diwali/Wedding season"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border-2 border-gray-400 p-2 rounded-lg font-medium text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-800 mb-1">Photo (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files ? e.target.files[0] : null)}
                    className="block w-full text-xs border border-gray-400 rounded p-1.5 bg-white cursor-pointer"
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
                    className="px-5 py-2 bg-pink-700 hover:bg-pink-800 text-white font-black rounded text-xs shadow"
                  >
                    {submitting ? "Saving..." : isEditing ? "Update Flower" : "Save to Library"}
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