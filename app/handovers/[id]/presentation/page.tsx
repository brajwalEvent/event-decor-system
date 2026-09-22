"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { useAuth } from "../../../../context/AuthContext";

export default function HandoverPresentationPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [componentsLibrary, setComponentsLibrary] = useState<any[]>([]);
  const [elementsLibrary, setElementsLibrary] = useState<any[]>([]);

  // FULL-SCREEN IMAGE LIGHTBOX MODAL (ON WEB)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const loadAllData = async () => {
      if (!handoverId) return;
      try {
        const hSnap = await getDoc(doc(db, "handovers", handoverId));
        if (hSnap.exists()) setHandover(hSnap.data());

        const cSnap = await getDocs(collection(db, "components"));
        setComponentsLibrary(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const eSnap = await getDocs(collection(db, "elements"));
        setElementsLibrary(eSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading presentation handbook data:", err);
      }
    };
    loadAllData();
  }, [handoverId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePrintPdf = () => {
    window.print();
  };

  if (loading || !handover) {
    return <div className="p-12 text-center text-xl font-bold">Compiling Execution Handbook...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:bg-white print:p-0">
      {/* FLOATING ACTION BAR (HIDDEN IN PDF PRINT) */}
      <header className="sticky top-0 z-40 bg-gray-900 text-white px-6 py-3.5 shadow-md flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/handovers/${handoverId}`)}
            className="text-xs font-bold bg-gray-800 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            ← Back to Handover Workspace
          </button>
          <span className="text-xs text-gray-300 hidden sm:inline">
            Execution Deck: <strong>{handover.title}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400 hidden md:inline">
            💡 Click any image to expand full-screen
          </span>
          <button
            onClick={handlePrintPdf}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-6 py-2.5 rounded-lg text-xs shadow-lg transition flex items-center gap-2"
          >
            🖨️ Download / Save as PDF
          </button>
        </div>
      </header>

      {/* DOCUMENT ROOT */}
      <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 print:max-w-full print:p-2 print:space-y-6">

        {/* 1. COVER / EXECUTIVE SUMMARY (ZERO PRICING) */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 shadow-sm print:border print:rounded-none print:p-6 print:shadow-none print-avoid-break">
          <div className="flex justify-between items-start border-b-2 border-gray-900 pb-4">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-800 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                On-Site Production & Execution Handbook
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mt-2 leading-tight">
                {handover.title}
              </h1>
              <p className="text-sm font-bold text-gray-600 mt-1">
                📍 {handover.resortName || "Resort / Destination Venue"}
              </p>
            </div>

            <div className="text-right">
              <span className={`text-xs uppercase font-black px-3 py-1 rounded border ${
                handover.status === "Approved for Production"
                  ? "bg-green-100 text-green-900 border-green-400"
                  : "bg-purple-100 text-purple-950 border-purple-300"
              }`}>
                {handover.status}
              </span>
              <p className="text-[11px] font-mono text-gray-500 mt-1">
                Generated: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-500">Event Dates</span>
              <p className="text-sm font-black text-gray-900 mt-0.5">
                {handover.startDate} to {handover.endDate}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-500">Expected Guests</span>
              <p className="text-sm font-black text-blue-800 mt-0.5">
                👥 {handover.paxCount} Pax
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-500">Family POC</span>
              <p className="text-sm font-black text-gray-900 mt-0.5">
                {handover.familyPoc?.name || "N/A"}
              </p>
              <p className="text-xs text-gray-600">{handover.familyPoc?.phone}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-gray-500">Sales Lead POC</span>
              <p className="text-sm font-black text-gray-900 mt-0.5">
                {handover.salesLead?.name || "Direct Sales"}
              </p>
              <p className="text-xs text-gray-600">{handover.salesLead?.phone}</p>
            </div>
          </div>
        </section>

        {/* 2. DAY-BY-DAY EXECUTION SPECIFICATIONS */}
        {handover.days?.map((day: any, dayIdx: number) => (
          <article key={dayIdx} className="space-y-6 print:break-before-page">
            <div className="bg-gray-900 text-white px-6 py-3.5 rounded-xl flex justify-between items-center print:rounded-none">
              <h2 className="text-xl font-black uppercase tracking-wider">
                🗓️ {day.dayName}
              </h2>
              <span className="text-xs font-bold bg-gray-800 text-gray-200 px-3 py-1 rounded">
                {day.events?.length || 0} Sub-Events
              </span>
            </div>

            {day.events?.map((ev: any, evIdx: number) => (
              <section
                key={evIdx}
                className="bg-white border-2 border-gray-300 rounded-2xl p-6 shadow-sm space-y-6 print:border print:rounded-none print:shadow-none print-avoid-break"
              >
                {/* Event Top Banner */}
                <div className="border-b-2 border-gray-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black uppercase text-purple-700 tracking-wider">
                      Event #{evIdx + 1}
                    </span>
                    <h3 className="text-2xl font-black text-gray-900">{ev.eventName}</h3>
                    <p className="text-xs font-bold text-gray-600 mt-0.5">
                      📍 Venue Location: <strong className="text-gray-900">{ev.locationInResort || "TBD"}</strong>
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-300 px-4 py-2 rounded-xl text-left sm:text-right">
                    <span className="text-[10px] font-black uppercase text-amber-900 block">Setup Ready Time:</span>
                    <span className="text-sm font-black text-amber-950 font-mono">
                      ⏰ {ev.setupReadyTime || "As per schedule"}
                    </span>
                  </div>
                </div>

                {/* Event Color Theme Palette */}
                {ev.colorThemes && ev.colorThemes.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center gap-3">
                    <span className="text-xs font-black uppercase text-gray-700 whitespace-nowrap">
                      🎨 Color Theme:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {ev.colorThemes.map((ct: any, cIdx: number) => (
                        <div
                          key={cIdx}
                          className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border text-xs font-bold shadow-sm"
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-gray-300 shadow-inner"
                            style={{ backgroundColor: ct.hex }}
                          />
                          <span>{ct.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EVENT 2D FLOOR PLAN (PLANNER 5D) */}
                {ev.floorPlans?.plan2dUrl && (
                  <div className="bg-slate-50 border-2 border-emerald-300 rounded-2xl p-4 space-y-2 print-avoid-break">
                    <div className="flex justify-between items-center border-b border-emerald-200 pb-1">
                      <span className="text-xs font-black uppercase text-emerald-950 flex items-center gap-1.5">
                        📐 Event 2D Spatial Floor Plan Layout
                      </span>
                      <span className="text-[10px] text-gray-500 font-bold print:hidden">
                        (Click to view full-resolution blueprint)
                      </span>
                    </div>

                    <div
                      onClick={() =>
                        setLightboxImage({
                          url: ev.floorPlans.plan2dUrl,
                          title: `2D Layout Blueprint - ${ev.eventName}`,
                          subtitle: `Venue: ${ev.locationInResort || "Venue Area"}`,
                        })
                      }
                      className="w-full h-80 sm:h-96 print:h-80 flex items-center justify-center cursor-zoom-in relative group bg-white rounded-xl border overflow-hidden p-2"
                    >
                      <img
                        src={ev.floorPlans.plan2dUrl}
                        alt="2D Floor Plan"
                        className="max-h-full max-w-full object-contain mx-auto"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition flex items-center justify-center print:hidden">
                        <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                          🔍 Click to Expand Blueprint Fullscreen
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 2A. DECOR COMPONENTS (UNCROPPED TRUE-SHAPE IMAGES) */}
                <div className="space-y-8">
                  <h4 className="text-xs font-black uppercase tracking-wider text-blue-900 border-b pb-1">
                    🏛️ Decor Components Execution Scope ({ev.decorComponents?.length || 0})
                  </h4>

                  {ev.decorComponents?.map((comp: any, cIdx: number) => {
                    const masterComp = componentsLibrary.find((m) => m.id === comp.componentId);
                    const warehouseElementsUsed = masterComp?.warehouseElements || [];
                    const freshBuys = masterComp?.freshPurchases || [];
                    const rentals = masterComp?.vendorRentals || [];
                    const setupSteps = masterComp?.steps || [];
                    const writtenNotes = masterComp?.writtenInstructions || "";

                    return (
                      <div
                        key={cIdx}
                        className="border-2 border-gray-300 rounded-2xl overflow-hidden bg-white shadow-sm space-y-4 p-5 print:border print:shadow-none print-avoid-break"
                      >
                        {/* Component Header Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded">
                                {comp.category}
                              </span>
                              <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded">
                                {comp.code}
                              </span>
                            </div>
                            <h5 className="text-2xl font-black text-gray-900 mt-1 leading-tight">
                              {comp.name}
                            </h5>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-xs font-black text-purple-900 bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
                              📍 Placement: {comp.placement || "Venue Area"}
                            </span>
                          </div>
                        </div>

                        {/* COMPONENT IMAGE: FITTED & UNCROPPED (TRUE ASPECT RATIO IN PRINT) */}
                        <div className="w-full rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-50 print:bg-white flex items-center justify-center p-1 print:p-0">
                          {comp.imageUrl ? (
                            <div
                              onClick={() =>
                                setLightboxImage({
                                  url: comp.imageUrl,
                                  title: comp.name,
                                  subtitle: `Placement: ${comp.placement || "Venue Area"} | Code: ${comp.code}`,
                                })
                              }
                              className="w-full flex items-center justify-center cursor-zoom-in relative group"
                            >
                              <img
                                src={comp.imageUrl}
                                alt={comp.name}
                                className="w-full max-h-[420px] object-contain print:object-contain print:h-auto print:max-h-[380px] print:w-auto mx-auto rounded-lg"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition flex items-center justify-center print:hidden">
                                <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs font-bold px-3 py-1.5 rounded-full transition shadow">
                                  🔍 Click to Expand Full Screen
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-44 flex items-center justify-center text-xs font-bold text-gray-400">
                              No Component Photo Available
                            </div>
                          )}
                        </div>

                        {/* Specifications & Custom Changes Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-gray-50 p-3 rounded-xl border space-y-1 text-xs font-semibold text-gray-800">
                            {comp.customSize && <p>📐 <strong>Size:</strong> {comp.customSize}</p>}
                            {comp.colorVariation && <p>🎨 <strong>Color Changes:</strong> {comp.colorVariation}</p>}
                            {comp.clientChanges && (
                              <p className="text-amber-900">
                                ✏️ <strong>Client Special Requests:</strong> {comp.clientChanges}
                              </p>
                            )}
                          </div>

                          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs">
                            <span className="font-black text-blue-950 block mb-0.5">
                              🛠️ Production Team Remark:
                            </span>
                            <p className="text-blue-900 font-semibold">
                              {comp.productionRemarks || "Setup according to standard truss specifications."}
                            </p>
                          </div>
                        </div>

                        {/* Audio Notes */}
                        {(comp.audioUrl || masterComp?.audioUrl) && (
                          <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl space-y-2">
                            <span className="font-black text-purple-950 text-xs block">
                              🎙️ Supervisor Voice Notes & Instructions:
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
                              {comp.audioUrl && (
                                <div>
                                  <p className="text-[11px] font-bold text-purple-900 mb-0.5">Sales Audio Brief:</p>
                                  <audio controls src={comp.audioUrl} className="w-full h-8" />
                                </div>
                              )}
                              {masterComp?.audioUrl && (
                                <div>
                                  <p className="text-[11px] font-bold text-purple-900 mb-0.5">Technical Setup Guide:</p>
                                  <audio controls src={masterComp.audioUrl} className="w-full h-8" />
                                </div>
                              )}
                            </div>

                            <p className="text-purple-900 font-bold text-xs hidden print:block">
                              ✓ Recorded voice guide available on digital handover portal.
                            </p>
                          </div>
                        )}

                        {/* ATTACHED WAREHOUSE PROPS (FITTED, UNCROPPED THUMBNAILS) */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <span className="font-black uppercase text-gray-800 block text-xs border-b pb-1">
                            📦 Attached Warehouse Props ({warehouseElementsUsed.length}):
                          </span>

                          {warehouseElementsUsed.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {warehouseElementsUsed.map((el: any, elIdx: number) => {
                                const propDetail = elementsLibrary.find((elem) => elem.id === el.elementId);
                                const propPic = propDetail?.images?.[0] || propDetail?.imageUrl || "";

                                return (
                                  <div
                                    key={elIdx}
                                    className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between"
                                  >
                                    {/* Prop Image Box: object-contain so props are never cut off */}
                                    <div
                                      onClick={() => {
                                        if (propPic) {
                                          setLightboxImage({
                                            url: propPic,
                                            title: el.elementName,
                                            subtitle: `Quantity: ${el.quantity} units | SKU: ${propDetail?.sku || "N/A"}`,
                                          });
                                        }
                                      }}
                                      className={`h-40 w-full bg-gray-50 print:bg-white flex items-center justify-center relative p-1.5 ${
                                        propPic ? "cursor-zoom-in group" : ""
                                      }`}
                                    >
                                      {propPic ? (
                                        <>
                                          <img
                                            src={propPic}
                                            alt={el.elementName}
                                            className="max-h-full max-w-full object-contain group-hover:scale-105 transition"
                                          />
                                          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded print:hidden">
                                            🔍 Expand
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[10px] text-gray-400 font-bold">No Photo</span>
                                      )}
                                      <span className="absolute top-1.5 left-1.5 bg-blue-700 text-white text-[10px] font-black px-2 py-0.5 rounded shadow">
                                        Qty: {el.quantity}
                                      </span>
                                    </div>

                                    {/* Prop Details */}
                                    <div className="p-2.5 text-xs space-y-0.5 bg-white border-t border-gray-100">
                                      <p className="font-black text-gray-900 leading-snug">
                                        {el.elementName}
                                      </p>
                                      {propDetail?.dimensions?.length > 0 && (
                                        <p className="text-[11px] font-bold text-gray-600">
                                          📐 {propDetail.dimensions.length}×{propDetail.dimensions.width}×{propDetail.dimensions.height} {propDetail.dimensions.unit}
                                        </p>
                                      )}
                                      {el.notes && (
                                        <p className="text-[10px] text-amber-800 bg-amber-50 p-1 rounded font-medium mt-1">
                                          Note: {el.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-gray-400 italic text-xs">No warehouse props attached.</p>
                          )}

                          {/* Fresh Buys & Rentals */}
                          {(freshBuys.length > 0 || rentals.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                              {freshBuys.length > 0 && (
                                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200">
                                  <span className="font-black uppercase text-green-900 block text-[10px] mb-1">
                                    🌸 Fresh Buys (Flowers & Consumables):
                                  </span>
                                  <ul className="text-xs text-gray-800 space-y-0.5">
                                    {freshBuys.map((f: any, fIdx: number) => (
                                      <li key={fIdx}>• <strong>{f.item}</strong> ({f.qtyDescription})</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {rentals.length > 0 && (
                                <div className="bg-indigo-50 p-2.5 rounded-lg border border-indigo-200">
                                  <span className="font-black uppercase text-indigo-900 block text-[10px] mb-1">
                                    🚚 Vendor Rentals:
                                  </span>
                                  <ul className="text-xs text-gray-800 space-y-0.5">
                                    {rentals.map((r: any, rIdx: number) => (
                                      <li key={rIdx}>
                                        • <strong>{r.quantity}x {r.item}</strong> {r.size && `(${r.size})`} | Vendor: {r.vendorDetails}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Execution Steps & General Precautions */}
                        {(setupSteps.length > 0 || writtenNotes) && (
                          <div className="p-4 bg-gray-50 rounded-xl space-y-3 border">
                            {setupSteps.length > 0 && (
                              <div>
                                <span className="text-xs font-black uppercase text-gray-800 block mb-1">
                                  🪜 Step-By-Step Assembly & Execution Guide:
                                </span>
                                <ol className="list-decimal list-inside space-y-1 text-xs font-semibold text-gray-800">
                                  {setupSteps.map((step: string, sIdx: number) => (
                                    <li key={sIdx} className="bg-white p-2 rounded-md border border-gray-200">
                                      {step}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {writtenNotes && (
                              <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs">
                                <span className="font-black text-amber-950 block mb-0.5">
                                  ⚠️ General Notes & On-Site Precautions:
                                </span>
                                <p className="text-amber-900 font-medium leading-relaxed">{writtenNotes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 2B. ENTERTAINMENT & SFX SCOPE */}
                {ev.entertainmentElements && ev.entertainmentElements.length > 0 && (
                  <div className="space-y-3 pt-2 print-avoid-break">
                    <h4 className="text-xs font-black uppercase tracking-wider text-purple-900 border-b pb-1">
                      🎤 Entertainment, Audio & SFX Scope ({ev.entertainmentElements.length})
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ev.entertainmentElements.map((ent: any, entIdx: number) => (
                        <div
                          key={entIdx}
                          className="bg-purple-50/60 border border-purple-200 p-3.5 rounded-xl text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-purple-950 text-sm">
                              🎤 {ent.name}
                            </span>
                            {ent.variantName && (
                              <span className="text-[10px] font-bold bg-white border border-purple-300 text-purple-800 px-2 py-0.5 rounded">
                                Option: {ent.variantName}
                              </span>
                            )}
                          </div>

                          {ent.notes && (
                            <p className="text-gray-700">
                              <strong>Execution Instructions:</strong> {ent.notes}
                            </p>
                          )}

                          {ent.productionRemarks && (
                            <div className="bg-white p-2 rounded border border-blue-200 text-blue-900">
                              <strong>Production Note:</strong> {ent.productionRemarks}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
          </article>
        ))}

        {/* 3. SIGN-OFF FOOTER */}
        <section className="bg-white border-2 border-gray-300 rounded-2xl p-6 sm:p-8 space-y-6 print:border print:rounded-none print:break-before-page print-avoid-break">
          <h3 className="font-black text-sm uppercase text-gray-900 border-b pb-2">
            Execution Verification & On-Site Handover Sign-Off
          </h3>

          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">{handover.salesLead?.name || "Sales Representative"}</p>
              <p className="text-xs text-gray-500 font-semibold">Sales Lead Sign & Date</p>
            </div>

            <div className="border-t-2 border-gray-400 pt-2 text-center">
              <p className="font-bold text-sm text-gray-900">Site Operations Supervisor</p>
              <p className="text-xs text-gray-500 font-semibold">Backend Production Sign & Date</p>
            </div>
          </div>
        </section>
      </main>

      {/* FULL-SCREEN INTERACTIVE LIGHTBOX MODAL (ON WEB) */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm print:hidden cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center"
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 bg-white/20 hover:bg-red-600 text-white font-black px-4 py-1.5 rounded-full text-sm transition shadow-lg"
            >
              ✕ Close (Esc)
            </button>

            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-gray-700 bg-black"
            />

            <div className="mt-3 text-center bg-gray-900/90 text-white px-5 py-2 rounded-xl border border-gray-700 max-w-lg">
              <h4 className="font-black text-sm">{lightboxImage.title}</h4>
              {lightboxImage.subtitle && (
                <p className="text-xs text-gray-400 mt-0.5">{lightboxImage.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRINT-OPTIMIZED STYLESHEET: STRICTLY FORCING UNCROPPED IMAGES */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          header, nav, button {
            display: none !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:break-before-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* FORCE ALL IMAGES TO BE FITTED AND UNCROPPED */
          img {
            object-fit: contain !important;
            max-width: 100% !important;
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