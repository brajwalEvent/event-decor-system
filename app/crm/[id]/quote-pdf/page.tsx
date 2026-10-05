"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "../../../../context/AuthContext";

function QuotationContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = params.id as string;
  const { user, loading } = useAuth();

  const [lead, setLead] = useState<any>(null);
  // Mode: "itemized" | "package"
  const initialMode = searchParams.get("mode") === "package" ? "package" : "itemized";
  const [printMode, setPrintMode] = useState<"itemized" | "package">(initialMode);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    const fetchLead = async () => {
      if (!leadId) return;
      try {
        const lSnap = await getDoc(doc(db, "leads", leadId));
        if (lSnap.exists()) {
          setLead(lSnap.data());
        }
      } catch (err) {
        console.error("Error loading quotation data:", err);
      }
    };
    fetchLead();
  }, [leadId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading || !lead) {
    return <div className="p-12 text-center text-xl font-bold">Compiling Official Quotation...</div>;
  }

  const quote = lead.quotation || {};
  const weddingWide = quote.weddingWideItems || [];
  const events = quote.events || [];
  const milestones = quote.paymentMilestones || [];

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 print:bg-white print:p-0">
      {/* FLOATING ACTION BAR (HIDDEN IN PDF PRINT) */}
      <header className="sticky top-0 z-50 bg-gray-900 text-white px-6 py-3.5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/crm/${leadId}`)}
            className="text-xs font-bold bg-gray-800 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition flex items-center gap-1.5"
          >
            ← Back to Lead Workspace
          </button>
          <span className="text-xs text-gray-300 hidden md:inline">
            Proposal for: <strong>{lead.title}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* FORMAT SELECTOR TOGGLE */}
          <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex items-center">
            <button
              onClick={() => setPrintMode("itemized")}
              className={`px-3 py-1.5 rounded-md text-xs font-black transition ${
                printMode === "itemized" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"
              }`}
            >
              📊 Itemized Pricing
            </button>
            <button
              onClick={() => setPrintMode("package")}
              className={`px-3 py-1.5 rounded-md text-xs font-black transition ${
                printMode === "package" ? "bg-amber-600 text-white shadow" : "text-gray-400 hover:text-white"
              }`}
            >
              📦 Package / Lump-Sum
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="bg-green-700 hover:bg-green-800 text-white font-black px-5 py-2 rounded-lg text-xs shadow-lg transition flex items-center gap-1.5"
          >
            🖨️ Download / Save as PDF
          </button>
        </div>
      </header>

      {/* A4 PROPOSAL DOCUMENT WRAPPER */}
      <main className="max-w-4xl mx-auto p-4 sm:p-10 space-y-8 bg-white my-6 shadow-sm border border-gray-200 print:shadow-none print:border-none print:m-0 print:max-w-full print:p-2 print:space-y-6">

        {/* 1. LUXURY COMPANY HEADER */}
        <section className="border-b-2 border-gray-900 pb-6 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              {/* Brand Logo Placeholder */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-amber-600 text-white font-black text-2xl flex items-center justify-center shadow">
                  B
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-gray-950 uppercase leading-none">
                    Brajwal Weddings & Events
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-amber-800">
                    Private Limited • Luxury Decor & Production
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Premier Destination Weddings, Spatial Design & Technical Production
              </p>
            </div>

            <div className="text-left sm:text-right text-xs space-y-1 bg-gray-50 p-3 rounded-xl border border-gray-200 sm:bg-transparent sm:border-none sm:p-0">
              <span className="text-xs font-black uppercase text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                Official Client Quotation
              </span>
              <p className="text-gray-600 pt-1 font-semibold">
                Date: <strong>{new Date().toLocaleDateString()}</strong>
              </p>
              {quote.validityDate && (
                <p className="text-amber-900 font-bold">
                  Valid Until: <strong>{quote.validityDate}</strong>
                </p>
              )}
              <p className="text-gray-700">
                Prepared by: <strong>{lead.salesLead?.name || "Brajwal Sales Team"}</strong>
              </p>
              <p className="text-gray-600">
                Phone: <strong>{lead.salesLead?.phone || "+91 98765 43210"}</strong>
              </p>
            </div>
          </div>

          {/* Client & Wedding Summary Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 p-4 rounded-xl mt-6 text-xs font-semibold">
            <div>
              <span className="text-[10px] text-gray-400 uppercase font-black block">Wedding Couple</span>
              <p className="font-black text-gray-950 text-sm">{lead.title}</p>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 uppercase font-black block">Destination Venue</span>
              <p className="font-bold text-gray-800">{lead.resortName || "Venue Area"}</p>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 uppercase font-black block">Wedding Dates</span>
              <p className="font-bold text-gray-800">{lead.startDate} to {lead.endDate}</p>
            </div>

            <div>
              <span className="text-[10px] text-gray-400 uppercase font-black block">Guest Count</span>
              <p className="font-bold text-blue-800">👥 {lead.paxCount} Guests</p>
            </div>
          </div>
        </section>

        {/* 2. CORE WEDDING DECOR PACKAGE */}
        <section className="border-2 border-gray-200 rounded-xl p-5 space-y-3 print-avoid-break bg-white">
          <div className="flex justify-between items-start border-b pb-2">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Core Production Scope
              </span>
              <h3 className="text-lg font-black text-gray-900 mt-1">
                Comprehensive Wedding Decor & Spatial Styling Package
              </h3>
              <p className="text-xs text-gray-600 font-medium">
                Includes design, structures, main stages, entrance arches, bespoke canopies, lounge furniture clusters, ambient illumination, and on-site production crew.
              </p>
            </div>

            {/* In Itemized mode, show Decor Price. In Package mode, show Included */}
            <div className="text-right">
              {printMode === "itemized" ? (
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Decor Investment</span>
                  <span className="text-xl font-black text-gray-900 font-mono">
                    ₹{Number(quote.decorCost || 0).toLocaleString()}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-md">
                  ✓ Included in Package
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 3. WEDDING-WIDE ESSENTIALS SCOPE (HAMPERS, TAGS, ITINERARIES) */}
        {weddingWide.length > 0 && (
          <section className="space-y-3 print-avoid-break">
            <div className="flex justify-between items-center border-b pb-1">
              <h3 className="text-sm font-black uppercase tracking-wider text-purple-950">
                🌐 Wedding-Wide Deliverables & Logistics ({weddingWide.length})
              </h3>
              <span className="text-xs text-gray-500 font-medium">Deliverables across all days</span>
            </div>

            <div className="border border-gray-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 uppercase text-[10px] font-black text-gray-700 border-b">
                  <tr>
                    <th className="p-3">Deliverable / Service</th>
                    <th className="p-3 text-center">Quantity</th>
                    <th className="p-3 text-center">Duration</th>
                    {printMode === "itemized" && (
                      <>
                        <th className="p-3 text-right">Rate</th>
                        <th className="p-3 text-right">Discount</th>
                        <th className="p-3 text-right">Amount (₹)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {weddingWide.map((item: any) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <span className="font-bold text-gray-950 text-sm">{item.name}</span>
                        {item.variantName && <span className="text-purple-900 font-semibold ml-1">({item.variantName})</span>}

                        {/* RIDER BADGES */}
                        {(item.riders?.travelCostAdditional || item.riders?.foodCostAdditional || item.riders?.roomsRequired || item.riders?.customAttributes?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.riders.travelCostAdditional && (
                              <span className="bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                ✈️ Travel Extra
                              </span>
                            )}
                            {item.riders.foodCostAdditional && (
                              <span className="bg-orange-50 text-orange-900 border border-orange-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                🍽️ Food Extra
                              </span>
                            )}
                            {item.riders.roomsRequired && (
                              <span className="bg-blue-50 text-blue-900 border border-blue-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                🏨 Room Required
                              </span>
                            )}
                            {item.riders.customAttributes?.map((ca: string, caIdx: number) => (
                              <span key={caIdx} className="bg-gray-100 text-gray-800 border px-1.5 py-0.2 rounded text-[10px] font-semibold">
                                ⭐ {ca}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.notes && <p className="text-[11px] text-gray-500 italic mt-0.5">{item.notes}</p>}
                      </td>
                      <td className="p-3 text-center font-bold text-gray-900">{item.quantity} {(!item.unit || item.unit.toLowerCase().includes("pc")) ? item.name : item.unit}</td>
                      <td className="p-3 text-center font-bold text-gray-700">
                        {item.isDayApplicable ? `${item.days} day(s)` : "—"}
                      </td>

                      {printMode === "itemized" && (
                        <>
                          <td className="p-3 text-right font-mono text-gray-700">₹{item.unitPrice?.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-red-600">{item.discount > 0 ? `-₹${item.discount}` : "—"}</td>
                          <td className="p-3 text-right font-mono font-black text-gray-950">₹{item.netAmount?.toLocaleString()}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 4. EVENT-WISE SCOPES BREAKDOWN (HALDI, SANGEET, WEDDING) */}
        {events.length > 0 && (
          <section className="space-y-6">
            <div className="border-b-2 border-gray-900 pb-1">
              <h3 className="text-sm font-black uppercase tracking-wider text-gray-950">
                🗓️ Event-Wise Audio, SFX & Entertainment Deployments
              </h3>
            </div>

            {events.map((evSection: any, evIdx: number) => (
              <div key={evIdx} className="border border-gray-300 rounded-xl overflow-hidden print-avoid-break">
                <div className="bg-gray-100 px-4 py-2 border-b flex justify-between items-center">
                  <h4 className="font-black text-xs uppercase text-gray-900">
                    Event: {evSection.eventName}
                  </h4>
                  <span className="text-[10px] font-bold text-gray-500">
                    {evSection.items?.length || 0} Special Items
                  </span>
                </div>

                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 uppercase text-[10px] font-black text-gray-600 border-b">
                    <tr>
                      <th className="p-3">Service / Equipment / Act</th>
                      <th className="p-3 text-center">Quantity</th>
                      <th className="p-3 text-center">Duration</th>
                      {printMode === "itemized" && (
                        <>
                          <th className="p-3 text-right">Rate</th>
                          <th className="p-3 text-right">Discount</th>
                          <th className="p-3 text-right">Amount (₹)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {evSection.items?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="p-3">
                          <span className="font-bold text-gray-950 text-sm">{item.name}</span>
                          {item.variantName && <span className="text-purple-900 font-semibold ml-1">({item.variantName})</span>}

                          {/* RIDER BADGES */}
                          {(item.riders?.travelCostAdditional || item.riders?.foodCostAdditional || item.riders?.roomsRequired || item.riders?.customAttributes?.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.riders.travelCostAdditional && (
                                <span className="bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  ✈️ Travel Extra
                                </span>
                              )}
                              {item.riders.foodCostAdditional && (
                                <span className="bg-orange-50 text-orange-900 border border-orange-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  🍽️ Food Extra
                                </span>
                              )}
                              {item.riders.roomsRequired && (
                                <span className="bg-blue-50 text-blue-900 border border-blue-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                  🏨 Room Required
                                </span>
                              )}
                              {item.riders.customAttributes?.map((ca: string, caIdx: number) => (
                                <span key={caIdx} className="bg-gray-100 text-gray-800 border px-1.5 py-0.2 rounded text-[10px] font-semibold">
                                  ⭐ {ca}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.notes && <p className="text-[11px] text-gray-500 italic mt-0.5">{item.notes}</p>}
                        </td>
                        <td className="p-3 text-center font-bold text-gray-900">{item.quantity} {(!item.unit || item.unit.toLowerCase().includes("pc")) ? item.name : item.unit}</td>
                        <td className="p-3 text-center font-bold text-gray-700">
                          {item.isDayApplicable ? `${item.days} day(s)` : "—"}
                        </td>

                        {printMode === "itemized" && (
                          <>
                            <td className="p-3 text-right font-mono text-gray-700">₹{item.unitPrice?.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-red-600">{item.discount > 0 ? `-₹${item.discount}` : "—"}</td>
                            <td className="p-3 text-right font-mono font-black text-gray-950">₹{item.netAmount?.toLocaleString()}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        )}

        {/* 5. PAYMENT TERMS & MILESTONE SCHEDULE */}
        {milestones.length > 0 && (
          <section className="space-y-3 print-avoid-break">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-950 border-b pb-1">
              💳 Payment Milestones & Commercial Schedule
            </h3>

            <div className="border border-gray-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 uppercase text-[10px] font-black text-gray-700 border-b">
                  <tr>
                    <th className="p-2.5">Milestone Description</th>
                    <th className="p-2.5 text-center">Due Timeline</th>
                    <th className="p-2.5 text-center">% of Total</th>
                    <th className="p-2.5 text-right">Payable Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {milestones.map((m: any, idx: number) => {
                    const milestoneAmt = (Number(quote.finalOfferedPrice || 0) * Number(m.percentage)) / 100;
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-2.5 font-bold text-gray-900">{m.description}</td>
                        <td className="p-2.5 text-center text-gray-600">{m.dueDate || "As per agreement"}</td>
                        <td className="p-2.5 text-center font-black text-purple-900 bg-purple-50/50">{m.percentage}%</td>
                        <td className="p-2.5 text-right font-mono font-black text-gray-950">
                          ₹{Math.round(milestoneAmt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 6. CUSTOM INCLUSIONS & NOTES */}
        {quote.customNotes && (
          <section className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1 text-xs print-avoid-break">
            <span className="text-[10px] font-black uppercase text-gray-500 block">Scope Notes & Guidelines:</span>
            <p className="text-gray-800 leading-relaxed font-medium whitespace-pre-line">{quote.customNotes}</p>
          </section>
        )}

        {/* 7. MANDATORY LEGAL & FINANCIAL DISCLAIMERS */}
        <section className="bg-red-50 border border-red-200 p-4 rounded-xl space-y-1 text-xs print-avoid-break">
          <span className="text-[10px] font-black uppercase text-red-900 block">General Terms of Business:</span>
          <p className="text-red-950 font-bold">• Any Government Tax Or Charges Will Be Charged Additionally</p>
          <p className="text-red-950 font-bold">• The Booking Amount Is Not Refundable</p>
        </section>

        {/* 8. COMMERCIAL TOTALS RECAP */}
        <section className="border-2 border-gray-900 rounded-2xl p-6 bg-slate-900 text-white print:border-2 print:border-gray-900 print:bg-white print:text-gray-950 print-avoid-break">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-xs uppercase font-black text-gray-400 print:text-gray-500">Commercial Summary</p>
              <h4 className="text-lg font-black mt-0.5">Brajwal Weddings & Events Pvt Ltd</h4>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-right">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 print:text-gray-500 block">Total Scope Value</span>
                <span className="text-base font-bold font-mono">
                  ₹{Number(quote.grossSubtotal || 0).toLocaleString()}
                </span>
              </div>

              {Number(quote.totalDiscount) > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-red-400 block">Special Privilege Discount</span>
                  <span className="text-base font-bold font-mono text-red-400">
                    -₹{Number(quote.totalDiscount).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="border-l border-gray-700 print:border-gray-300 pl-6">
                <span className="text-[10px] uppercase font-black text-green-400 print:text-green-700 block">Final Offered Investment</span>
                <span className="text-3xl font-black font-mono text-green-400 print:text-green-800">
                  ₹{Number(quote.finalOfferedPrice || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 9. CLIENT AUTHORIZATION SIGN-OFF */}
        <section className="border-t-2 border-gray-300 pt-6 space-y-6 print:border-gray-400 print:break-before-page print-avoid-break">
          <h4 className="text-xs font-black uppercase text-gray-900">
            Acceptance & Authorization
          </h4>

          <div className="grid grid-cols-2 gap-12 pt-8 text-xs font-semibold text-gray-700">
            <div className="border-t border-gray-400 pt-2 text-center">
              <p className="font-bold text-gray-950">{lead.salesLead?.name || "Authorized Signatory"}</p>
              <p className="text-[11px] text-gray-500">For Brajwal Weddings & Events Pvt Ltd</p>
            </div>

            <div className="border-t border-gray-400 pt-2 text-center">
              <p className="font-bold text-gray-950">{lead.familyPoc?.name || "Client Representative"}</p>
              <p className="text-[11px] text-gray-500">Client Acceptance Sign & Date</p>
            </div>
          </div>
        </section>
      </main>

      {/* PRINT-OPTIMIZED STYLESHEET */}
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
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
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

export default function QuotationPdfPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center font-bold">Loading Quotation Engine...</div>}>
      <QuotationContent />
    </Suspense>
  );
}