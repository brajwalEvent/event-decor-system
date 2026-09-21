"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../../../../context/AuthContext";

export default function EntertainmentSheetPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const loadData = async () => {
      if (!handoverId) return;
      try {
        const hSnap = await getDoc(doc(db, "handovers", handoverId));
        if (hSnap.exists()) setHandover(hSnap.data());
      } catch (err) {
        console.error("Error loading entertainment data:", err);
      }
    };
    loadData();
  }, [handoverId]);

  const handlePrintPdf = () => {
    window.print();
  };

  if (loading || !handover) {
    return <div className="p-12 text-center text-xl font-bold">Compiling Entertainment & SFX Sheet...</div>;
  }

  // =========================================================================
  // EXTRACTION & CATEGORY FILTERING ENGINE
  // =========================================================================

  // Collect all unique categories used in this handover
  const usedCategoriesSet = new Set<string>();
  handover.days?.forEach((day: any) => {
    day.events?.forEach((ev: any) => {
      ev.entertainmentElements?.forEach((ent: any) => {
        if (ent.category) usedCategoriesSet.add(ent.category);
      });
    });
  });
  const availableCategories = ["All", ...Array.from(usedCategoriesSet)];

  // Group items Event-by-Event based on the selected category filter
  const eventWiseEntertainment: any[] = [];
  let grandTotalCost = 0;
  let totalItemsCount = 0;

  handover.days?.forEach((day: any) => {
    day.events?.forEach((ev: any) => {
      const filteredElements = (ev.entertainmentElements || []).filter((ent: any) => {
        return selectedCategoryFilter === "All" || ent.category === selectedCategoryFilter;
      });

      if (filteredElements.length > 0) {
        const eventCost = filteredElements.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
        grandTotalCost += eventCost;
        totalItemsCount += filteredElements.length;

        eventWiseEntertainment.push({
          dayName: day.dayName,
          eventName: ev.eventName,
          location: ev.locationInResort,
          setupReadyTime: ev.setupReadyTime,
          items: filteredElements,
          subtotalCost: eventCost,
        });
      }
    });
  });

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:bg-white print:p-0">
      {/* FLOATING ACTION BAR (HIDDEN IN PDF PRINT) */}
      <header className="sticky top-0 z-40 bg-gray-900 text-white px-6 py-3.5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/handovers/${handoverId}`)}
            className="text-xs font-bold bg-gray-800 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            ← Back to Handover Workspace
          </button>
          <span className="text-xs text-gray-300 hidden md:inline">
            Entertainment & SFX Order: <strong>{handover.title}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* CATEGORY FILTER DROPDOWN */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-black text-purple-300">Category Filter:</label>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-gray-800 border-2 border-purple-500 text-white font-bold p-1.5 rounded-lg text-xs outline-none"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "All" ? "✨ All Entertainment & SFX (Complete Package)" : cat}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handlePrintPdf}
            className="bg-purple-600 hover:bg-purple-700 text-white font-black px-5 py-2 rounded-lg text-xs shadow-lg transition flex items-center gap-1.5"
          >
            🖨️ Download / Save as PDF
          </button>
        </div>
      </header>

      {/* DOCUMENT WRAPPER */}
      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 print:max-w-full print:p-2 print:space-y-6">

        {/* 1. DOCUMENT HEADER & WEDDING OVERVIEW */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 shadow-sm print:border print:rounded-none print:p-6 print:shadow-none">
          <div className="flex justify-between items-start border-b-2 border-purple-800 pb-4">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-purple-900 bg-purple-50 px-2.5 py-1 rounded border border-purple-200">
                Official Vendor Procurement & Technical Rider Sheet
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-2 leading-tight">
                {selectedCategoryFilter === "All" ? "Entertainment & SFX Order" : `${selectedCategoryFilter} Order`}
              </h1>
              <p className="text-sm font-bold text-gray-600 mt-1">
                Wedding: <strong>{handover.title}</strong> | 📍 Venue: {handover.resortName || "Destination Resort"}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-black uppercase text-gray-500 block">Total Package Value:</span>
              <span className="text-2xl font-black text-purple-800 font-mono">
                ₹{grandTotalCost.toLocaleString()}
              </span>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                Generated: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-xs">
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Event Dates</span>
              <strong className="text-gray-900">{handover.startDate} to {handover.endDate}</strong>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Items / Acts</span>
              <strong className="text-purple-900 text-sm">{totalItemsCount} Deployments</strong>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Scope Selected</span>
              <strong className="text-gray-900 uppercase">{selectedCategoryFilter}</strong>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Sales Coordinator</span>
              <strong className="text-gray-900">{handover.salesLead?.name}</strong>
              <p className="text-gray-600">{handover.salesLead?.phone}</p>
            </div>
          </div>
        </section>

        {/* 2. EVENT-WISE SEGREGATED DEPLOYMENT TABLES */}
        <section className="space-y-6">
          <div className="border-b-2 border-gray-900 pb-2">
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
              🗓️ Event-Wise Deployment Schedule & Technical Specs
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Detailed event schedule, setup timings, audio configurations, and vendor instructions.
            </p>
          </div>

          {eventWiseEntertainment.map((evData, evIdx) => (
            <article
              key={evIdx}
              className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-4 print:border print:rounded-none print:shadow-none print:break-before-page"
            >
              {/* Event Sub-Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-purple-200 pb-3 gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">
                    {evData.dayName}
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 leading-tight">
                    {evData.eventName}
                  </h3>
                  <p className="text-xs font-semibold text-gray-600">
                    📍 Location: <strong>{evData.location || "Venue Area"}</strong> | ⏰ Sound Check / Ready By: <strong>{evData.setupReadyTime || "TBD"}</strong>
                  </p>
                </div>

                <div className="bg-purple-50 border border-purple-300 px-3 py-1.5 rounded-xl text-left sm:text-right">
                  <span className="text-[10px] font-black uppercase text-purple-900 block">Event Subtotal:</span>
                  <span className="text-base font-black text-purple-950 font-mono">
                    ₹{evData.subtotalCost.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-purple-50/50 border-b border-purple-200 text-purple-950 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Category</th>
                      <th className="p-3">Item / Service Name</th>
                      <th className="p-3">Configuration / Option</th>
                      <th className="p-3 text-right">Cost (₹)</th>
                      <th className="p-3">Execution Notes & Technical Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-medium">
                    {evData.items.map((item: any, iIdx: number) => (
                      <tr key={iIdx} className="hover:bg-gray-50">
                        <td className="p-3">
                          <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                            {item.category || "Entertainment"}
                          </span>
                        </td>
                        <td className="p-3 font-black text-gray-900 text-sm">
                          🎤 {item.name}
                        </td>
                        <td className="p-3 font-bold text-purple-800">
                          {item.variantName ? `Option: ${item.variantName}` : "Standard Setup"}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-gray-900">
                          ₹{item.price?.toLocaleString()} <span className="text-[10px] font-normal text-gray-500">/{item.pricingUnit}</span>
                        </td>
                        <td className="p-3 text-xs space-y-1">
                          {item.notes && (
                            <p className="text-gray-800">
                              <strong>Client/Sales Brief:</strong> {item.notes}
                            </p>
                          )}
                          {item.productionRemarks && (
                            <p className="text-blue-900 bg-blue-50 p-1.5 rounded border border-blue-200">
                              <strong>🛠️ Production Note:</strong> {item.productionRemarks}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold text-xs">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase">Event Total:</td>
                      <td className="p-2.5 text-right text-purple-900 font-black font-mono">
                        ₹{evData.subtotalCost.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>
          ))}

          {eventWiseEntertainment.length === 0 && (
            <div className="bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-300">
              <p className="text-gray-500 font-bold">No items found for the category: "{selectedCategoryFilter}".</p>
              <p className="text-xs text-gray-400 mt-1">
                Select "✨ All Entertainment & SFX" above to view the complete package.
              </p>
            </div>
          )}
        </section>

        {/* 3. VENDOR & TECHNICAL ACKNOWLEDGMENT SIGN-OFF */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 space-y-6 print:border print:rounded-none print:break-before-page">
          <h3 className="font-black text-sm uppercase text-gray-900 border-b pb-2">
            Technical Rider & Vendor Order Acceptance
          </h3>

          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">{handover.salesLead?.name || "Sales Lead"}</p>
              <p className="text-xs text-gray-500 font-semibold">Event Producer Sign & Date</p>
            </div>

            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Audio / SFX / Artist Supplier</p>
              <p className="text-xs text-gray-500 font-semibold">Vendor Representative Sign & Stamp</p>
            </div>
          </div>
        </section>
      </main>

      {/* PRINT-OPTIMIZED STYLES */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, nav, button {
            display: none !important;
          }
          .print\\:break-before-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}