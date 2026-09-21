"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../../../context/AuthContext";

export default function FlowerProcurementSheetPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [componentsLibrary, setComponentsLibrary] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const loadData = async () => {
      if (!handoverId) return;
      try {
        const hSnap = await getDoc(doc(db, "handovers", handoverId));
        if (hSnap.exists()) setHandover(hSnap.data());

        const cSnap = await getDocs(collection(db, "components"));
        setComponentsLibrary(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading flower sheet data:", err);
      }
    };
    loadData();
  }, [handoverId]);

  const handlePrintPdf = () => {
    window.print();
  };

  if (loading || !handover) {
    return <div className="p-12 text-center text-xl font-bold">Generating Floral Procurement Sheet...</div>;
  }

  // =========================================================================
  // FLOWER EXTRACTION & MULTI-TIER AGGREGATION ENGINE
  // =========================================================================

  // 1. Event-Wise Grouped Flowers
  const eventWiseFlowerData: any[] = [];

  // 2. Whole Wedding Master Consolidated Flowers Map
  const masterConsolidatedFlowers: {
    [flowerId: string]: {
      flowerName: string;
      unit: string;
      approxPrice: number;
      totalQuantity: number;
      usedInEvents: { eventName: string; qty: number }[];
    };
  } = {};

  let grandTotalFloralCost = 0;

  handover.days?.forEach((day: any) => {
    day.events?.forEach((ev: any) => {
      const eventFlowerMap: {
        [flowerId: string]: {
          flowerName: string;
          unit: string;
          approxPrice: number;
          quantity: number;
          componentsUsedIn: string[];
        };
      } = {};

      let eventSubtotalCost = 0;

      // Inspect every component attached to this event
      ev.decorComponents?.forEach((comp: any) => {
        const masterComp = componentsLibrary.find((c) => c.id === comp.componentId);
        const compFlowers = masterComp?.naturalFlowers || [];

        compFlowers.forEach((f: any) => {
          const qty = Number(f.quantity) || 1;
          const cost = (Number(f.approxPrice) || 0) * qty;

          // Add to Event Aggregation
          if (!eventFlowerMap[f.flowerId]) {
            eventFlowerMap[f.flowerId] = {
              flowerName: f.flowerName,
              unit: f.unit,
              approxPrice: Number(f.approxPrice) || 0,
              quantity: 0,
              componentsUsedIn: [],
            };
          }
          eventFlowerMap[f.flowerId].quantity += qty;
          eventFlowerMap[f.flowerId].componentsUsedIn.push(comp.name);
          eventSubtotalCost += cost;

          // Add to Master Whole Wedding Aggregation
          if (!masterConsolidatedFlowers[f.flowerId]) {
            masterConsolidatedFlowers[f.flowerId] = {
              flowerName: f.flowerName,
              unit: f.unit,
              approxPrice: Number(f.approxPrice) || 0,
              totalQuantity: 0,
              usedInEvents: [],
            };
          }
          masterConsolidatedFlowers[f.flowerId].totalQuantity += qty;
          grandTotalFloralCost += cost;
        });
      });

      // Update event reference list in master
      Object.keys(eventFlowerMap).forEach((fId) => {
        masterConsolidatedFlowers[fId].usedInEvents.push({
          eventName: `${day.dayName} > ${ev.eventName}`,
          qty: eventFlowerMap[fId].quantity,
        });
      });

      const eventFlowerList = Object.values(eventFlowerMap);
      if (eventFlowerList.length > 0) {
        eventWiseFlowerData.push({
          dayName: day.dayName,
          eventName: ev.eventName,
          location: ev.locationInResort,
          setupReadyTime: ev.setupReadyTime,
          flowers: eventFlowerList,
          subtotalCost: eventSubtotalCost,
        });
      }
    });
  });

  const masterFlowerList = Object.values(masterConsolidatedFlowers);

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:bg-white print:p-0">
      {/* FLOATING HEADER (HIDDEN IN PDF PRINT) */}
      <header className="sticky top-0 z-40 bg-gray-900 text-white px-6 py-3.5 shadow-md flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/handovers/${handoverId}`)}
            className="text-xs font-bold bg-gray-800 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            ← Back to Handover Workspace
          </button>
          <span className="text-xs text-gray-300 hidden sm:inline">
            Floral Procurement Sheet: <strong>{handover.title}</strong>
          </span>
        </div>

        <button
          onClick={handlePrintPdf}
          className="bg-pink-700 hover:bg-pink-800 text-white font-black px-6 py-2.5 rounded-lg text-xs shadow-lg transition flex items-center gap-2"
        >
          🖨️ Download / Save as PDF
        </button>
      </header>

      {/* DOCUMENT WRAPPER */}
      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 print:max-w-full print:p-2 print:space-y-6">

        {/* 1. DOCUMENT HEADER & WEDDING OVERVIEW */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 shadow-sm print:border print:rounded-none print:p-6 print:shadow-none">
          <div className="flex justify-between items-start border-b-2 border-pink-700 pb-4">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-pink-900 bg-pink-50 px-2.5 py-1 rounded border border-pink-200">
                Official Floral Mandi Procurement Order
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-2 leading-tight">
                {handover.title} - Flower Purchase Sheet
              </h1>
              <p className="text-sm font-bold text-gray-600 mt-1">
                📍 Venue: {handover.resortName || "Destination Venue"} | 📅 Dates: {handover.startDate} to {handover.endDate}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-black uppercase text-gray-500 block">Total Estimated Floral Budget:</span>
              <span className="text-2xl font-black text-pink-700 font-mono">
                ₹{grandTotalFloralCost.toLocaleString()}
              </span>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                Generated: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-xs">
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Guest Count</span>
              <strong className="text-gray-900 text-sm">{handover.paxCount} Pax</strong>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Flower Varieties</span>
              <strong className="text-pink-800 text-sm">{masterFlowerList.length} Types</strong>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Sales Contact</span>
              <strong className="text-gray-900">{handover.salesLead?.name}</strong>
              <p className="text-gray-600">{handover.salesLead?.phone}</p>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Family Contact</span>
              <strong className="text-gray-900">{handover.familyPoc?.name || "N/A"}</strong>
              <p className="text-gray-600">{handover.familyPoc?.phone}</p>
            </div>
          </div>
        </section>

        {/* 2. WHOLE WEDDING CONSOLIDATED MANDI BUYING LIST */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-4 print:border print:rounded-none print:shadow-none">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
                🌸 1. Master Consolidated Mandi Buying List (Whole Wedding)
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Consolidated totals across all events. Use this summary for placing orders directly at the flower market.
              </p>
            </div>
            <span className="text-xs font-black bg-pink-100 text-pink-900 border border-pink-300 px-3 py-1 rounded-full">
              {masterFlowerList.length} Varieties Total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-100 border-b-2 border-gray-300 text-gray-700 font-black uppercase text-[11px]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Flower Name</th>
                  <th className="p-3 text-center">Total Quantity to Buy</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Mandi Rate (Est.)</th>
                  <th className="p-3 text-right">Total Cost (₹)</th>
                  <th className="p-3">Events Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {masterFlowerList.map((fl, idx) => {
                  const flowerTotalCost = fl.totalQuantity * fl.approxPrice;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-400">{idx + 1}</td>
                      <td className="p-3 font-black text-gray-900 text-sm">{fl.flowerName}</td>
                      <td className="p-3 text-center font-black text-base text-pink-800 bg-pink-50/50">
                        {fl.totalQuantity}
                      </td>
                      <td className="p-3 font-bold text-gray-700">{fl.unit}</td>
                      <td className="p-3 text-right font-mono font-bold text-gray-600">₹{fl.approxPrice}</td>
                      <td className="p-3 text-right font-mono font-black text-gray-900">
                        ₹{flowerTotalCost.toLocaleString()}
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {fl.usedInEvents.map((e, eIdx) => (
                          <span key={eIdx} className="inline-block bg-gray-100 px-1.5 py-0.5 rounded mr-1 mb-0.5 font-semibold text-[10px]">
                            {e.eventName}: <strong>{e.qty}</strong>
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-black text-sm">
                <tr>
                  <td colSpan={5} className="p-3 text-right uppercase">Grand Floral Budget:</td>
                  <td className="p-3 text-right text-pink-800 font-mono text-base">
                    ₹{grandTotalFloralCost.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* 3. EVENT-WISE SEGREGATED PROCUREMENT LIST */}
        <section className="space-y-6">
          <div className="border-b-2 border-gray-900 pb-2">
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
              🗓️ 2. Event-Wise Segregated Floral Breakdowns
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Specific quantities allocated to each event so site workers and florists know exactly where each bunch belongs.
            </p>
          </div>

          {eventWiseFlowerData.map((evData, evIdx) => (
            <article
              key={evIdx}
              className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-4 print:border print:rounded-none print:shadow-none print:break-before-page"
            >
              {/* Event Sub-Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-pink-200 pb-3 gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">
                    {evData.dayName}
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 leading-tight">
                    {evData.eventName}
                  </h3>
                  <p className="text-xs font-semibold text-gray-600">
                    📍 Location: <strong>{evData.location || "Venue"}</strong> | ⏰ Setup Ready By: <strong>{evData.setupReadyTime || "TBD"}</strong>
                  </p>
                </div>

                <div className="bg-pink-50 border border-pink-300 px-3 py-1.5 rounded-xl text-left sm:text-right">
                  <span className="text-[10px] font-black uppercase text-pink-900 block">Event Flower Subtotal:</span>
                  <span className="text-base font-black text-pink-950 font-mono">
                    ₹{evData.subtotalCost.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Event Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-pink-50/50 border-b border-pink-200 text-pink-950 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">Flower Name</th>
                      <th className="p-2.5 text-center">Required Qty</th>
                      <th className="p-2.5">Unit</th>
                      <th className="p-2.5 text-right">Rate (₹)</th>
                      <th className="p-2.5 text-right">Subtotal (₹)</th>
                      <th className="p-2.5">Components Deployed In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 font-medium">
                    {evData.flowers.map((f: any, fIdx: number) => {
                      const itemTotal = f.quantity * f.approxPrice;
                      return (
                        <tr key={fIdx} className="hover:bg-gray-50">
                          <td className="p-2.5 font-bold text-gray-900">{f.flowerName}</td>
                          <td className="p-2.5 text-center font-black text-pink-800 bg-pink-50/30">
                            {f.quantity}
                          </td>
                          <td className="p-2.5 text-gray-700 font-semibold">{f.unit}</td>
                          <td className="p-2.5 text-right font-mono text-gray-600">₹{f.approxPrice}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-gray-900">
                            ₹{itemTotal.toLocaleString()}
                          </td>
                          <td className="p-2.5 text-xs text-gray-600 italic">
                            {f.componentsUsedIn.join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold text-xs">
                    <tr>
                      <td colSpan={4} className="p-2 text-right uppercase">Event Total:</td>
                      <td className="p-2 text-right text-pink-900 font-black font-mono">
                        ₹{evData.subtotalCost.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>
          ))}

          {eventWiseFlowerData.length === 0 && (
            <div className="bg-white p-12 text-center rounded-2xl border-2 border-dashed border-gray-300">
              <p className="text-gray-500 font-bold">No natural flowers attached to the components in this wedding.</p>
              <p className="text-xs text-gray-400 mt-1">
                Edit your components in the Components Library to specify flower requirements, then return here.
              </p>
            </div>
          )}
        </section>

        {/* 4. VENDOR SIGN-OFF FOOTER */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 space-y-6 print:border print:rounded-none print:break-before-page">
          <h3 className="font-black text-sm uppercase text-gray-900 border-b pb-2">
            Mandi Vendor & Purchase Verification Sign-Off
          </h3>

          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Floral Procurement Manager</p>
              <p className="text-xs text-gray-500 font-semibold">DecorOps Operations Sign & Date</p>
            </div>

            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Flower Vendor / Mandi Wholesaler</p>
              <p className="text-xs text-gray-500 font-semibold">Supplier Acknowledgment Sign & Stamp</p>
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