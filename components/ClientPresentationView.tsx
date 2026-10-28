"use client";
import React, { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

interface ClientPresentationProps {
  handover: any;
  onClose: () => void;
}

// 1. FILTER: Returns true ONLY if at least one number in the dimension string is > 0
const isValidDimension = (sizeStr?: string): boolean => {
  if (!sizeStr || !sizeStr.trim()) return false;
  const numbers = sizeStr.match(/\d+(\.\d+)?/g);
  if (!numbers || numbers.length === 0) return false;
  return numbers.some((n) => parseFloat(n) > 0);
};

// 2. HELPER: Pre-loads and converts external URLs to Base64 to bypass CORS
const convertUrlToBase64 = async (url: string): Promise<string> => {
  if (!url || url.startsWith("data:")) return url;

  // First try direct fetch
  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Fall back to server proxy if direct fetch is blocked by CORS
  }

  // Fallback: Route through Next.js proxy
  try {
    const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.error("Proxy fetch failed:", url, e);
  }

  return url;
};

export default function ClientPresentationView({ handover, onClose }: ClientPresentationProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 3. ONE-PAGE SEAMLESS PDF GENERATOR (No page breaks, no split cards)
  const handleDirectPdfDownload = async () => {
    if (!pdfContainerRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const element = pdfContainerRef.current;
      const cleanTitle = (handover.title || "Wedding").replace(/[^a-zA-Z0-9]/g, "_");

      // A. Preload and convert all <img> elements to base64
      const imgElements = Array.from(element.querySelectorAll("img"));
      for (const img of imgElements) {
        const originalSrc = img.getAttribute("src");
        if (originalSrc && !originalSrc.startsWith("data:")) {
          const base64 = await convertUrlToBase64(originalSrc);
          img.setAttribute("src", base64);
        }
      }

      // Small delay to ensure all converted images are decoded by the browser
      await new Promise((resolve) => setTimeout(resolve, 300));

      // B. Render high-resolution canvas
      const canvas = await html2canvas(element, {
        scale: 2, // 2x Retina sharpness
        useCORS: true,
        logging: false,
        backgroundColor: "#fffefb",
        windowWidth: 850,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // C. CREATE ONE CONTINUOUS SEAMLESS PDF (Exact height of the document)
      const pdf = new jsPDF({
        orientation: "p",
        unit: "px",
        format: [canvas.width, canvas.height],
        hotfixes: ["px_scaling"],
      });

      // Fit 100% into a single continuous page
      pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);

      // D. Direct file download
      pdf.save(`${cleanTitle}_Brajwal_Weddings_Dossier.pdf`);
    } catch (err: any) {
      console.error("Direct PDF Error:", err);
      alert(`Could not generate PDF: ${err?.message || "Unknown error"}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!handover) return null;

  return (
    <div className="min-h-screen bg-[#11100e] text-[#2c2724] py-4 px-2 sm:px-6">
      {/* FLOATING ACTION BAR */}
      <header className="sticky top-2 z-50 max-w-4xl mx-auto bg-[#1c1814]/95 backdrop-blur-md border border-[#3d3429] text-[#f5ebd7] px-6 py-3 rounded-2xl shadow-2xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-xs font-bold bg-[#2b231b] hover:bg-[#3d3227] text-[#e0cfb3] px-3.5 py-2 rounded-lg transition border border-[#4a3f32] flex items-center gap-1.5"
          >
            ← Back to Internal View
          </button>
          <span className="text-xs text-[#a6967f] hidden sm:inline">
            Customer Presentation • <strong>{handover.title}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* DIRECT DOWNLOAD BUTTON */}
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleDirectPdfDownload}
            className="bg-gradient-to-r from-[#c5a059] to-[#9e7933] hover:from-[#d6b26b] hover:to-[#b08b43] text-black font-black px-6 py-2.5 rounded-xl text-xs shadow-lg transition flex items-center gap-2 tracking-wide disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                Generating Seamless PDF...
              </>
            ) : (
              <>⬇️ Direct Download PDF</>
            )}
          </button>

          <button
            onClick={onClose}
            className="text-[#a6967f] hover:text-white p-1 text-lg font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {/* CONTINUOUS PRESENTATION DOSSIER */}
      <div
        ref={pdfContainerRef}
        style={{ width: "800px" }}
        className="mx-auto bg-[#fffefb] shadow-2xl rounded-2xl overflow-hidden border border-[#d4af37]/30"
      >
        {/* ======================================================== */}
        {/* 1. COVER SECTION                                         */}
        {/* ======================================================== */}
        <section className="p-12 text-center relative border-8 border-double border-[#d4af37]/40 bg-gradient-to-b from-[#fdfbf7] via-[#fffdfa] to-[#f7f2e7] flex flex-col justify-between min-h-[780px]">
          {/* Brand Header */}
          <div className="space-y-1.5 pt-4">
            <span className="text-[10px] font-black tracking-[0.35em] uppercase text-[#9e7933] block font-sans">
              Bespoke Wedding & Event Design
            </span>
            <div className="w-14 h-0.5 bg-[#c5a059] mx-auto opacity-75"></div>
            <h3 className="text-2xl font-serif tracking-[0.2em] font-normal uppercase text-[#1a1714] pt-2">
              Brajwal Events & Weddings
            </h3>
          </div>

          {/* Wedding Title */}
          <div className="my-auto py-12 space-y-5 max-w-xl mx-auto">
            <div className="inline-block border border-[#c5a059]/50 bg-[#fbf7ee] px-5 py-1 rounded-full text-[11px] font-serif uppercase tracking-[0.25em] text-[#7a5e24]">
              Design & Conceptual Dossier
            </div>

            <h1 className="text-4xl sm:text-5xl font-serif font-normal text-[#1f1a14] leading-[1.18] capitalize tracking-tight">
              {handover.title}
            </h1>

            <div className="w-20 h-[1px] bg-gradient-to-r from-transparent via-[#c5a059] to-transparent mx-auto"></div>

            <p className="text-base font-serif italic text-[#635343]">
              A curated visual presentation of decor, spatial themes & experiences
            </p>
          </div>

          {/* Highlights Bar */}
          <div className="w-full border-t border-[#d4af37]/30 pt-5 pb-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#9e7933] block font-sans">Destination</span>
                <p className="font-serif text-xs font-bold text-[#1a1714] truncate">{handover.resortName || "Venue Destination"}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#9e7933] block font-sans">Celebration Dates</span>
                <p className="font-serif text-xs font-bold text-[#1a1714]">{handover.startDate} – {handover.endDate}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#9e7933] block font-sans">Honored Guests</span>
                <p className="font-serif text-xs font-bold text-[#1a1714]">{handover.paxCount ? `${handover.paxCount} Pax` : "Intimate"}</p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#9e7933] block font-sans">Curated By</span>
                <p className="font-serif text-xs font-bold text-[#1a1714]">Team Brajwal</p>
              </div>
            </div>

            <p className="text-[9px] tracking-widest text-[#a6967f] uppercase pt-4 font-sans">
              CONFIDENTIAL & EXCLUSIVELY CURATED FOR OUR PATRONS
            </p>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 2. ITINERARY & VISUAL SPATIAL CONCEPTS                   */}
        {/* ======================================================== */}
        <div className="p-8 space-y-10">
          {handover.days?.map((day: any, dayIdx: number) => {
            if (!day.events || day.events.length === 0) return null;

            return (
              <div key={dayIdx} className="space-y-6">
                {/* Day Header */}
                <div className="border-b-2 border-[#c5a059]/40 pb-2 flex justify-between items-baseline">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9e7933] font-sans">
                      Celebration Schedule
                    </span>
                    <h2 className="text-2xl font-serif text-[#1a1714] font-normal tracking-wide">
                      {day.dayName}
                    </h2>
                  </div>
                  <span className="text-xs font-serif italic text-[#7a5e24]">
                    {day.events.length} Event{day.events.length > 1 ? "s" : ""}
                  </span>
                </div>

                {/* Sub-Events */}
                {day.events.map((ev: any, evIdx: number) => {
                  const hasDecor = ev.decorComponents && ev.decorComponents.length > 0;
                  const hasFloorPlan = Boolean(ev.floorPlans?.plan2dUrl);
                  const hasEntertainment = ev.entertainmentElements && ev.entertainmentElements.length > 0;

                  if (!hasDecor && !hasFloorPlan && !hasEntertainment) return null;

                  return (
                    <section
                      key={evIdx}
                      className="bg-[#fcfaf7] border border-[#e6dcce] rounded-xl p-6 space-y-6"
                    >
                      {/* Event Banner */}
                      <div className="flex justify-between items-end border-b border-[#ebdcc7] pb-3 gap-2">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#9e7933] font-sans">
                            Event #{evIdx + 1}
                          </span>
                          <h3 className="text-2xl font-serif text-[#1f1a14] mt-0.5">
                            {ev.eventName}
                          </h3>
                          {ev.locationInResort && (
                            <p className="text-xs font-serif italic text-[#635343] mt-0.5">
                              📍 Venue: <strong className="font-semibold text-[#1a1714]">{ev.locationInResort}</strong>
                            </p>
                          )}
                        </div>

                        {ev.colorThemes && ev.colorThemes.length > 0 && (
                          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-[#e3d7c3] shadow-sm">
                            <span className="text-[9px] uppercase font-bold text-[#806f5b] font-sans">
                              Palette:
                            </span>
                            <div className="flex items-center gap-1">
                              {ev.colorThemes.map((ct: any, cIdx: number) => (
                                <span
                                  key={cIdx}
                                  title={ct.role}
                                  className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-inner"
                                  style={{ backgroundColor: ct.hex }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2D Floor Plan */}
                      {hasFloorPlan && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#7a5e24] block font-sans">
                            📐 Spatial Layout & Guest Flow
                          </span>
                          <div className="w-full h-72 bg-white rounded-lg border border-[#e3d7c3] overflow-hidden flex items-center justify-center p-2 shadow-sm">
                            <img
                              src={ev.floorPlans.plan2dUrl}
                              alt={`Layout - ${ev.eventName}`}
                              className="max-h-full max-w-full object-contain mx-auto"
                            />
                          </div>
                        </div>
                      )}

                      {/* DECOR CONCEPTS (2-Column Grid) */}
                      {hasDecor && (
                        <div className="space-y-4">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#9e7933] block font-sans border-b border-[#ebdcc7] pb-1">
                            🏛️ Curated Decor Concepts ({ev.decorComponents.length})
                          </span>

                          <div className="grid grid-cols-2 gap-4">
                            {ev.decorComponents.map((comp: any, compIdx: number) => {
                              const hasRemarks = Boolean(comp.productionRemarks && comp.productionRemarks.trim() !== "");
                              const hasDimensions = isValidDimension(comp.customSize);

                              return (
                                <div
                                  key={compIdx}
                                  className="bg-white border border-[#e3d7c3] rounded-lg overflow-hidden shadow-sm flex flex-col justify-between"
                                >
                                  <div>
                                    {/* UNIFORM CONTAINER */}
                                    <div className="w-full h-56 bg-[#f9f7f4] flex items-center justify-center p-2.5 border-b border-[#f0e6d8] relative overflow-hidden">
                                      {comp.imageUrl ? (
                                        <img
                                          src={comp.imageUrl}
                                          alt={comp.name}
                                          className="max-h-full max-w-full object-contain rounded shadow-sm"
                                        />
                                      ) : (
                                        <span className="text-xs font-serif italic text-gray-400">
                                          Visual rendering in progress
                                        </span>
                                      )}
                                      {comp.category && (
                                        <span className="absolute top-2 left-2 bg-black/75 text-[#f5ebd7] text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow">
                                          {comp.category}
                                        </span>
                                      )}
                                    </div>

                                    {/* Details */}
                                    <div className="p-3.5 space-y-1.5">
                                      <h4 className="font-serif text-lg font-normal text-[#1a1714] leading-snug">
                                        {comp.name}
                                      </h4>

                                      {comp.placement && (
                                        <p className="text-[11px] font-serif text-[#7a5e24] font-medium">
                                          📍 Placement: <strong>{comp.placement}</strong>
                                        </p>
                                      )}

                                      <div className="text-[11px] space-y-0.5 font-sans text-gray-700 pt-0.5">
                                        {hasDimensions && (
                                          <p>• <strong>Dimensions:</strong> {comp.customSize}</p>
                                        )}
                                        {comp.colorVariation && (
                                          <p>• <strong>Palette:</strong> {comp.colorVariation}</p>
                                        )}
                                        {comp.clientChanges && (
                                          <p className="text-[#8c591c]">
                                            • <strong>Custom Requests:</strong> {comp.clientChanges}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {hasRemarks && (
                                    <div className="mx-3 mb-3 p-2 rounded bg-[#faf6ee] border border-[#ebdcc7] text-[10px] font-sans text-[#5c4a30]">
                                      <strong>Design Note:</strong> {comp.productionRemarks}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ENTERTAINMENT & EXPERIENCES */}
                      {hasEntertainment && (
                        <div className="space-y-2 pt-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#9e7933] block font-sans border-b border-[#ebdcc7] pb-1">
                            🎤 Entertainment & Special Acts ({ev.entertainmentElements.length})
                          </span>

                          <div className="grid grid-cols-2 gap-3">
                            {ev.entertainmentElements.map((ent: any, entIdx: number) => (
                              <div
                                key={entIdx}
                                className="bg-white border border-[#e3d7c3] p-3 rounded-lg text-xs space-y-1 shadow-sm"
                              >
                                <div className="flex justify-between items-start">
                                  <strong className="font-serif text-sm text-[#1a1714]">
                                    {ent.name}
                                  </strong>
                                  {ent.variantName && (
                                    <span className="text-[9px] font-sans font-bold bg-[#fbf7ee] text-[#7a5e24] px-1.5 py-0.5 rounded border border-[#e3d7c3]">
                                      {ent.variantName}
                                    </span>
                                  )}
                                </div>
                                {ent.notes && (
                                  <p className="text-gray-600 font-sans text-[11px]">{ent.notes}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ======================================================== */}
        {/* 3. SIGNATURE CLOSING                                     */}
        {/* ======================================================== */}
        <footer className="border-t-2 border-[#d4af37]/40 p-8 text-center bg-[#fdfbf7] space-y-2">
          <h4 className="font-serif text-xl font-normal text-[#1a1714]">
            Thank You for Entrusting Your Celebration With Us
          </h4>
          <p className="font-serif italic text-xs text-[#635343] max-w-lg mx-auto">
            Every floral accent, archway, and setting is crafted with precision to bring your dream celebration to life.
          </p>
          <div className="pt-2">
            <span className="text-[11px] uppercase font-black tracking-[0.25em] text-[#9e7933] font-sans block">
              Brajwal Events & Weddings
            </span>
            <p className="text-[10px] text-gray-500 font-sans mt-0.5">
              Luxury Wedding Decor, Production & Spatial Planning
            </p>
          </div>
        </footer>
      </div>

      {/* TYPOGRAPHY INJECTION */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap');

        .font-serif {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }
        .font-sans {
          font-family: 'Montserrat', system-ui, sans-serif;
        }
      `}</style>
    </div>
  );
}