"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "../../../../lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  onSnapshot 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as XLSX from "xlsx";
import { useAuth } from "../../../../context/AuthContext";

export default function WeddingRsvpPage() {
  const params = useParams();
  const router = useRouter();
  const handoverId = params.id as string;
  const { user, loading } = useAuth();

  const [handover, setHandover] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);

  // FAMILY / PARENTS CONFIGURATION FOR REGARDS
  const [brideParents, setBrideParents] = useState("");
  const [groomParents, setGroomParents] = useState("");
  const [isSavingParents, setIsSavingParents] = useState(false);

  // SEARCH & MULTI-FILTER STATE
  const [searchQuery, setSearchQuery] = useState("");
  const [sideFilter, setSideFilter] = useState("All"); // All | Bride | Groom
  const [resortFilter, setResortFilter] = useState("All");
  const [checkInFilter, setCheckInFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // BULK SELECTION & ACTIONS
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // CUSTOM APPROVED TEMPLATE BUILDER MODAL
  const [showBulkTemplateModal, setShowBulkTemplateModal] = useState(false);
  const [customTemplateSid, setCustomTemplateSid] = useState("");
  const [customVarCount, setCustomVarCount] = useState<number>(0);
  const [customVarMappings, setCustomVarMappings] = useState<Array<{ type: string; customText: string }>>([
    { type: "GuestName", customText: "" },
    { type: "ParentsRegards", customText: "" },
    { type: "ResortName", customText: "" },
    { type: "WeddingTitle", customText: "" },
    { type: "CheckInDate", customText: "" },
  ]);

  // BULK DELETE VERIFICATION MODAL
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // EXCEL IMPORT MODAL
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSideChoice, setImportSideChoice] = useState<"Bride" | "Groom">("Bride");
  const [importDefaultResort, setImportDefaultResort] = useState("");
  const [importDefaultCheckInRaw, setImportDefaultCheckInRaw] = useState("");

  // EDIT GUEST MODAL
  const [editingGuest, setEditingGuest] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSide, setEditSide] = useState<"Bride" | "Groom">("Bride");
  const [editResort, setEditResort] = useState("");
  const [editDateRaw, setEditDateRaw] = useState(""); // YYYY-MM-DD
  const [editAdults, setEditAdults] = useState<number>(2);
  const [editMinors, setEditMinors] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");
  const [savingEditGuest, setSavingEditGuest] = useState(false);

  // MANUAL ADD GUEST MODAL
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualSide, setManualSide] = useState<"Bride" | "Groom">("Bride");
  const [manualResort, setManualResort] = useState("");
  const [manualDateRaw, setManualDateRaw] = useState(""); // YYYY-MM-DD
  const [manualAdults, setManualAdults] = useState<number>(2);
  const [manualMinors, setManualMinors] = useState<number>(0);
  const [manualNotes, setManualNotes] = useState("");
  const [savingManualGuest, setSavingManualGuest] = useState(false);

  // ATTENDEE & ID ASSIGNMENT MODAL
  const [selectedAttendeeGuest, setSelectedAttendeeGuest] = useState<any | null>(null);
  const [newAttendeeName, setNewAttendeeName] = useState("");
  const [newAttendeeAgeGroup, setNewAttendeeAgeGroup] = useState("Adult");
  const [savingAttendees, setSavingAttendees] = useState(false);

  // -------------------------------------------------------------
  // MULTI-CROP ENGINE STATE
  // -------------------------------------------------------------
  const [croppingPdfUrl, setCroppingPdfUrl] = useState<string | null>(null);
  const [croppingPdfDoc, setCroppingPdfDoc] = useState<any | null>(null);
  const [cropCurrentPage, setCropCurrentPage] = useState(1);
  const [cropTotalPages, setCropTotalPages] = useState(1);
  const [cropPdfLoading, setCropPdfLoading] = useState(false);

  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStartPoint, setDragStartPoint] = useState<{ x: number; y: number } | null>(null);

  interface CroppedTrayItem {
    id: string;
    dataUrl: string;
    blob: Blob;
    page: number;
  }
  const [croppedTray, setCroppedTray] = useState<CroppedTrayItem[]>([]);
  const [showSaveCropChoiceModal, setShowSaveCropChoiceModal] = useState(false);
  const [isSavingCrops, setIsSavingCrops] = useState(false);
  const [selectedOldCropsToReplace, setSelectedOldCropsToReplace] = useState<Set<string>>(new Set());

  // WHATSAPP WEB STYLE CHAT
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [activeChatGuest, setActiveChatGuest] = useState<any | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ATTACHMENT PREVIEW & CONFIRMATION
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const [pendingFileCaption, setPendingFileCaption] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // VOICE RECORDER (MP4 / WEBM)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordedMimeTypeRef = useRef<string>("audio/webm");

  // LIGHTBOX / PREVIEW
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);
  const [activeLightboxDoc, setActiveLightboxDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  // DATE HELPERS
  const toISODate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const toReadableDate = (isoOrDateStr: string): string => {
    if (!isoOrDateStr) return "";
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }); // e.g. "30 Nov 2025"
  };

  // Constrain selectable date range (7 days before wedding start to 3 days after)
  const allowedDateRange = useMemo(() => {
    const defaultDate = new Date();
    const base = handover?.startDate ? new Date(handover.startDate) : defaultDate;
    const validBase = isNaN(base.getTime()) ? defaultDate : base;

    const min = new Date(validBase);
    min.setDate(min.getDate() - 7);

    const max = new Date(validBase);
    max.setDate(max.getDate() + 3);

    const d0 = new Date(validBase);
    d0.setDate(d0.getDate() - 1);

    const d1 = new Date(validBase);

    const d2 = new Date(validBase);
    d2.setDate(d2.getDate() + 1);

    return {
      min: toISODate(min),
      max: toISODate(max),
      day0Iso: toISODate(d0),
      day1Iso: toISODate(d1),
      day2Iso: toISODate(d2),
      day0Label: toReadableDate(toISODate(d0)),
      day1Label: toReadableDate(toISODate(d1)),
      day2Label: toReadableDate(toISODate(d2)),
    };
  }, [handover?.startDate]);

  // Realtime onSnapshot listener for Handover and Guests
  useEffect(() => {
    if (!handoverId) return;

    getDoc(doc(db, "handovers", handoverId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setHandover(data);
        setBrideParents(data.brideParents || "");
        setGroomParents(data.groomParents || "");
        setImportDefaultResort(data.resortName || "Main Resort");
      }
    });

    const q = query(collection(db, "handovers", handoverId, "rsvps"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveGuests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGuests(liveGuests);

      setActiveChatGuest((prev: any) => {
        if (!prev) return null;
        return liveGuests.find((g) => g.id === prev.id) || prev;
      });

      // Avoid overwriting state while actively editing attendees
      setSelectedAttendeeGuest((prev: any) => {
        if (!prev) return null;
        return prev;
      });
    });

    return () => unsubscribe();
  }, [handoverId]);

  useEffect(() => {
    if (allowedDateRange.day1Iso) {
      if (!importDefaultCheckInRaw) setImportDefaultCheckInRaw(allowedDateRange.day1Iso);
      if (!manualDateRaw) setManualDateRaw(allowedDateRange.day1Iso);
    }
  }, [allowedDateRange]);

  const cleanPhoneNumber = (val: any): string => {
    if (!val) return "";
    let s = String(val).replace(/[^0-9]/g, "");
    if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
    return s;
  };

  const isPdfFile = (url: string, msgBody?: string) => {
    const u = (url || "").toLowerCase();
    const b = (msgBody || "").toLowerCase();
    return u.includes(".pdf") || u.includes("application/pdf") || b.endsWith(".pdf") || b.includes(".pdf");
  };

  const getMediaDisplayUrl = (url: string) => {
    if (!url) return "";
    if (url.includes("api.twilio.com") || url.toLowerCase().includes(".pdf")) {
      return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const scrollToLatestMessage = (smooth = false) => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
      }
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 60);
  };

  // Realtime messages for active chat
  useEffect(() => {
    if (!activeChatGuest || !handoverId) return;

    const q = query(
      collection(db, "handovers", handoverId, "rsvps", activeChatGuest.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setChatMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      scrollToLatestMessage(false);
    });

    if (activeChatGuest.hasUnreadMessages) {
      updateDoc(doc(db, "handovers", handoverId, "rsvps", activeChatGuest.id), {
        hasUnreadMessages: false,
      });
    }

    return () => unsubscribe();
  }, [activeChatGuest?.id, handoverId]);

  useEffect(() => {
    if (isChatModalOpen && activeChatGuest) {
      scrollToLatestMessage(false);
      setTimeout(() => scrollToLatestMessage(false), 200);
    }
  }, [isChatModalOpen, activeChatGuest?.id]);

  // DELIVERY TICKS
  const renderMessageTicks = (status?: string) => {
    switch (status) {
      case "read":
        return (
          <span className="inline-flex items-center text-[#53bdeb] ml-1" title="Read (Blue Ticks)">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.365.365 0 0 1-.516.005l-1.32-1.32a.364.364 0 0 0-.514.006l-.423.433a.364.364 0 0 0 .006.514l2.122 2.122c.143.14.361.125.484-.031l6.568-8.524a.365.365 0 0 0-.063-.508v.002z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center text-gray-500 ml-1" title="Delivered to Phone">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.365.365 0 0 1-.516.005l-1.32-1.32a.364.364 0 0 0-.514.006l-.423.433a.364.364 0 0 0 .006.514l2.122 2.122c.143.14.361.125.484-.031l6.568-8.524a.365.365 0 0 0-.063-.508v.002z" />
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      case "sent":
      case "queued":
        return (
          <span className="inline-flex items-center text-gray-400 ml-1" title="Sent to Server">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-gray-400 ml-1">
            <svg viewBox="0 0 16 15" width="16" height="15" className="fill-current">
              <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879 2.035 7.425a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.031l5.943-7.707a.365.365 0 0 0-.063-.508h-.004z" />
            </svg>
          </span>
        );
    }
  };

  // -------------------------------------------------------------
  // REFINED PDF MULTI-CROP ENGINE (WITH FLAWLESS GLOBAL DRAGGING)
  // -------------------------------------------------------------
  const handleOpenPdfCropper = async (pdfUrl: string) => {
    setCroppingPdfUrl(pdfUrl);
    setCroppedTray([]);
    setCropCurrentPage(1);
    setCropPdfLoading(true);
    setCropRect(null);

    try {
      const proxyUrl = getMediaDisplayUrl(pdfUrl);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();

      if (!(window as any).pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load PDF engine"));
          document.head.appendChild(script);
        });
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      }

      const pdfjsLib = (window as any).pdfjsLib;
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      setCroppingPdfDoc(pdf);
      setCropTotalPages(pdf.numPages);
      renderPdfPageToCropCanvas(pdf, 1);
    } catch (err: any) {
      console.error("[Cropper Load Error]:", err);
      alert("Could not load PDF: " + (err.message || "Failed to fetch"));
      setCroppingPdfUrl(null);
    } finally {
      setCropPdfLoading(false);
    }
  };

  const renderPdfPageToCropCanvas = async (pdfDoc: any, pageNum: number) => {
    if (!pdfDoc || !cropCanvasRef.current) return;
    setCropPdfLoading(true);
    setCropRect(null);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = cropCanvasRef.current;
      const ctx = canvas.getContext("2d");

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx!, viewport }).promise;
    } catch (err) {
      console.error("Canvas render page error:", err);
    } finally {
      setCropPdfLoading(false);
    }
  };

  const handleNextCropPage = () => {
    if (!croppingPdfDoc || cropCurrentPage >= cropTotalPages) return;
    const nextP = cropCurrentPage + 1;
    setCropCurrentPage(nextP);
    renderPdfPageToCropCanvas(croppingPdfDoc, nextP);
  };

  const handlePrevCropPage = () => {
    if (!croppingPdfDoc || cropCurrentPage <= 1) return;
    const prevP = cropCurrentPage - 1;
    setCropCurrentPage(prevP);
    renderPdfPageToCropCanvas(croppingPdfDoc, prevP);
  };

  // Mouse & Touch down on canvas
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setIsDraggingCrop(true);
    setDragStartPoint({ x, y });
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(touch.clientY - rect.top, rect.height));

    setIsDraggingCrop(true);
    setDragStartPoint({ x, y });
    setCropRect({ x, y, w: 0, h: 0 });
  };

  // Global mousemove & mouseup listener while dragging so box never breaks
  useEffect(() => {
    if (!isDraggingCrop) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const canvas = cropCanvasRef.current;
      if (!canvas || !dragStartPoint) return;
      const rect = canvas.getBoundingClientRect();

      const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

      const x = Math.min(dragStartPoint.x, currentX);
      const y = Math.min(dragStartPoint.y, currentY);
      const w = Math.abs(currentX - dragStartPoint.x);
      const h = Math.abs(currentY - dragStartPoint.y);

      setCropRect({ x, y, w, h });
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingCrop(false);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const canvas = cropCanvasRef.current;
      if (!canvas || !dragStartPoint) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];

      const currentX = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
      const currentY = Math.max(0, Math.min(touch.clientY - rect.top, rect.height));

      const x = Math.min(dragStartPoint.x, currentX);
      const y = Math.min(dragStartPoint.y, currentY);
      const w = Math.abs(currentX - dragStartPoint.x);
      const h = Math.abs(currentY - dragStartPoint.y);

      setCropRect({ x, y, w, h });
    };

    const handleGlobalTouchEnd = () => {
      setIsDraggingCrop(false);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("touchmove", handleGlobalTouchMove);
    window.addEventListener("touchend", handleGlobalTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isDraggingCrop, dragStartPoint]);

  // Extract selected area to Tray
  const handleAddCropToTray = () => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;

    const domRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / domRect.width;
    const scaleY = canvas.height / domRect.height;

    let sx = 0, sy = 0, sw = canvas.width, sh = canvas.height;
    if (cropRect && cropRect.w > 20 && cropRect.h > 20) {
      sx = cropRect.x * scaleX;
      sy = cropRect.y * scaleY;
      sw = cropRect.w * scaleX;
      sh = cropRect.h * scaleY;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    tempCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.95);
    tempCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const newItem: CroppedTrayItem = {
          id: `crop_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          dataUrl,
          blob,
          page: cropCurrentPage,
        };
        setCroppedTray((prev) => [...prev, newItem]);
        setCropRect(null);
      },
      "image/jpeg",
      0.95
    );
  };

  const handleRemoveCropFromTray = (id: string) => {
    setCroppedTray((prev) => prev.filter((item) => item.id !== id));
  };

  // Helper to get previous crops for the active PDF
  const getExistingCropsForActivePdf = (): string[] => {
    if (!selectedAttendeeGuest || !croppingPdfUrl) return [];
    const existingCropMap = selectedAttendeeGuest.pdfCropMap || {};
    const previousCropsForThisPdf: string[] = existingCropMap[croppingPdfUrl] || [];
    return previousCropsForThisPdf.filter((url) =>
      (selectedAttendeeGuest.idCardUrls || []).includes(url)
    );
  };

  const handleInitiateSaveCrops = () => {
    if (croppedTray.length === 0) return;
    const existingCrops = getExistingCropsForActivePdf();

    if (existingCrops.length === 0) {
      handleExecuteSaveCrops([]);
    } else {
      setSelectedOldCropsToReplace(new Set());
      setShowSaveCropChoiceModal(true);
    }
  };

  const handleToggleOldCropSelection = (url: string) => {
    setSelectedOldCropsToReplace((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // Upload crops to Firebase Storage & update Firestore
  const handleExecuteSaveCrops = async (urlsToReplace: string[]) => {
    if (!selectedAttendeeGuest || !croppingPdfUrl || croppedTray.length === 0) return;

    setIsSavingCrops(true);
    setShowSaveCropChoiceModal(false);

    try {
      const cleanPhone = cleanPhoneNumber(selectedAttendeeGuest.phone);
      const uploadedImageUrls: string[] = [];

      for (let i = 0; i < croppedTray.length; i++) {
        const item = croppedTray[i];
        const fileName = `id_cards/${cleanPhone}_crop_${Date.now()}_p${item.page}_${i + 1}.jpg`;
        const storageRef = ref(storage, fileName);

        await uploadBytes(storageRef, item.blob, { contentType: "image/jpeg" });
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedImageUrls.push(downloadUrl);
      }

      let updatedIdUrls = (selectedAttendeeGuest.idCardUrls || []).filter(
        (u: string) => !urlsToReplace.includes(u)
      );
      updatedIdUrls = [...updatedIdUrls, ...uploadedImageUrls];

      const updatedAttendees = (selectedAttendeeGuest.attendees || []).map((att: any) => ({
        ...att,
        assignedIdUrls: (att.assignedIdUrls || []).filter((u: string) => !urlsToReplace.includes(u)),
      }));

      const existingCropMap = selectedAttendeeGuest.pdfCropMap || {};
      const remainingOldCrops = (existingCropMap[croppingPdfUrl] || []).filter(
        (u: string) => !urlsToReplace.includes(u)
      );

      await updateDoc(doc(db, "handovers", handoverId, "rsvps", selectedAttendeeGuest.id), {
        idCardUrls: updatedIdUrls,
        attendees: updatedAttendees,
        pdfCropMap: {
          ...existingCropMap,
          [croppingPdfUrl]: [...remainingOldCrops, ...uploadedImageUrls],
        },
      });

      setSelectedAttendeeGuest((prev: any) => ({
        ...prev,
        idCardUrls: updatedIdUrls,
        attendees: updatedAttendees,
      }));

      setCroppingPdfUrl(null);
      setCroppedTray([]);
      setSelectedOldCropsToReplace(new Set());

      alert(`Success! Saved ${uploadedImageUrls.length} extracted ID card(s). You can now assign them directly to each attendee.`);
    } catch (err: any) {
      console.error(err);
      alert("Error saving cropped images: " + (err.message || "Failed"));
    } finally {
      setIsSavingCrops(false);
    }
  };

  // -------------------------------------------------------------
  // WHATSAPP CHAT DRAWER: MOST RECENT GUEST AT THE TOP
  // -------------------------------------------------------------
  const sortedChatGuests = useMemo(() => {
    return [...guests].sort((a, b) => {
      const timeA = new Date(a.lastMessageAt || a.whatsappSentAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || b.whatsappSentAt || b.createdAt || 0).getTime();
      return timeB - timeA; // Descending: Most recent on top
    });
  }, [guests]);

  const filteredChatGuests = useMemo(() => {
    if (!chatSearchQuery.trim()) return sortedChatGuests;
    const q = chatSearchQuery.toLowerCase();
    return sortedChatGuests.filter(
      (g) => g.name?.toLowerCase().includes(q) || g.phone?.includes(q)
    );
  }, [sortedChatGuests, chatSearchQuery]);

  // Parents save handler
  const handleSaveParentsConfig = async () => {
    setIsSavingParents(true);
    try {
      await updateDoc(doc(db, "handovers", handoverId), {
        brideParents: brideParents.trim(),
        groomParents: groomParents.trim(),
      });
      alert("Family parents names saved successfully!");
    } catch (err) {
      alert("Error saving parent details.");
    } finally {
      setIsSavingParents(false);
    }
  };

  const getParentsForGuest = (guest: any) => {
    if (guest.side === "Groom") {
      return groomParents.trim() || handover?.groomParents || "Groom's Parents";
    }
    return brideParents.trim() || handover?.brideParents || "Bride's Parents";
  };

  // Multi-filter directory list
  const availableResorts = useMemo(() => {
    const set = new Set<string>();
    if (handover?.resortName) set.add(handover.resortName);
    guests.forEach((g) => {
      if (g.stayResort) set.add(g.stayResort);
    });
    return Array.from(set);
  }, [guests, handover]);

  const availableCheckIns = useMemo(() => {
    const set = new Set<string>();
    set.add(allowedDateRange.day0Label);
    set.add(allowedDateRange.day1Label);
    set.add(allowedDateRange.day2Label);
    guests.forEach((g) => {
      if (g.checkInDate) set.add(g.checkInDate);
    });
    return Array.from(set);
  }, [guests, allowedDateRange]);

  const filteredGuests = guests.filter((g) => {
    const matchSide = sideFilter === "All" || (g.side || "Bride") === sideFilter;
    const matchResort = resortFilter === "All" || (g.stayResort || handover?.resortName || "Main Resort") === resortFilter;
    const matchCheckIn = checkInFilter === "All" || (g.checkInDate || allowedDateRange.day1Label) === checkInFilter;
    const matchStatus = statusFilter === "All" || g.status === statusFilter;
    const matchSearch =
      !searchQuery ||
      g.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.phone?.includes(searchQuery);
    return matchSide && matchResort && matchCheckIn && matchStatus && matchSearch;
  });

  // SEND DEFAULT ID REQUEST
  const handleSendWhatsApp = async (guest: any) => {
    setSendingWhatsappId(guest.id);
    const parentsName = getParentsForGuest(guest);
    const guestResort = guest.stayResort || handover?.resortName || "the resort";
    const guestCheckIn = guest.checkInDate || allowedDateRange.day1Label;

    try {
      const res = await fetch("/api/twilio/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: guest.phone,
          guestName: guest.name,
          weddingTitle: handover?.title || "the wedding",
          resortName: guestResort,
          checkInDate: guestCheckIn,
          side: guest.side || "Bride",
          regardsName: parentsName,
          handoverId,
          guestId: guest.id,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert("Error sending WhatsApp ID Request.");
    } finally {
      setSendingWhatsappId(null);
    }
  };

  // BULK SEND ID REQUEST
  const handleBulkSendIdRequest = async () => {
    if (selectedGuestIds.size === 0) return;
    if (!window.confirm(`Send Meta Approved WhatsApp ID request to ${selectedGuestIds.size} selected guests?`)) return;

    setIsBulkRunning(true);
    const targetGuests = guests.filter((g) => selectedGuestIds.has(g.id));
    setBulkProgress({ current: 0, total: targetGuests.length });

    let sentCount = 0;
    for (let i = 0; i < targetGuests.length; i++) {
      const guest = targetGuests[i];
      setBulkProgress({ current: i + 1, total: targetGuests.length });
      try {
        await handleSendWhatsApp(guest);
        sentCount++;
      } catch (err) {
        console.error(err);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    alert(`Bulk Send Complete! Sent to ${sentCount} of ${targetGuests.length} guests.`);
  };

  // BULK SEND CUSTOM META APPROVED TEMPLATE
  const handleBulkSendCustomTemplate = async () => {
    if (!customTemplateSid.trim()) {
      alert("Please enter a valid Twilio Template Content SID (starts with HX...).");
      return;
    }

    const targetGuests = guests.filter((g) => selectedGuestIds.has(g.id));
    if (targetGuests.length === 0) return;

    setIsBulkRunning(true);
    setShowBulkTemplateModal(false);
    setBulkProgress({ current: 0, total: targetGuests.length });

    let sentCount = 0;
    for (let i = 0; i < targetGuests.length; i++) {
      const guest = targetGuests[i];
      setBulkProgress({ current: i + 1, total: targetGuests.length });

      const guestResort = guest.stayResort || handover?.resortName || "the resort";
      const guestCheckIn = guest.checkInDate || allowedDateRange.day1Label;
      const guestParents = getParentsForGuest(guest);

      const dynamicVars: Record<string, string> = {};
      for (let idx = 0; idx < customVarCount; idx++) {
        const mapping = customVarMappings[idx];
        const placeholderKey = String(idx + 1);

        switch (mapping.type) {
          case "GuestName": dynamicVars[placeholderKey] = guest.name; break;
          case "ParentsRegards": dynamicVars[placeholderKey] = guestParents; break;
          case "ResortName": dynamicVars[placeholderKey] = guestResort; break;
          case "CheckInDate": dynamicVars[placeholderKey] = guestCheckIn; break;
          case "WeddingTitle": dynamicVars[placeholderKey] = handover?.title || "the wedding"; break;
          case "GuestSide": dynamicVars[placeholderKey] = `${guest.side || "Bride"} Side`; break;
          case "CustomText": dynamicVars[placeholderKey] = mapping.customText || ""; break;
          default: dynamicVars[placeholderKey] = guest.name;
        }
      }

      try {
        const res = await fetch("/api/twilio/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: guest.phone,
            guestName: guest.name,
            weddingTitle: handover?.title || "the wedding",
            resortName: guestResort,
            checkInDate: guestCheckIn,
            side: guest.side || "Bride",
            regardsName: guestParents,
            templateSid: customTemplateSid.trim(),
            contentVariables: customVarCount > 0 ? dynamicVars : {},
            handoverId,
            guestId: guest.id,
          }),
        });

        const result = await res.json();
        if (result.success) sentCount++;
      } catch (e) {
        console.error(e);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    setIsBulkRunning(false);
    setBulkProgress(null);
    alert(`Custom Template Sent! Successfully delivered to ${sentCount} of ${targetGuests.length} guests.`);
  };

  // BULK DELETE CONFIRM
  const handleBulkDeleteConfirm = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      alert("Please type 'DELETE' exactly into the box to confirm deletion.");
      return;
    }

    setIsDeletingBulk(true);
    try {
      const idsToDelete = Array.from(selectedGuestIds);
      for (const id of idsToDelete) {
        await deleteDoc(doc(db, "handovers", handoverId, "rsvps", id));
      }
      setSelectedGuestIds(new Set());
      setShowBulkDeleteModal(false);
      setDeleteConfirmText("");
      alert(`Deleted ${idsToDelete.length} selected contacts.`);
    } catch (err) {
      alert("Error deleting contacts.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // EXCEL IMPORT
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        let addedCount = 0;
        for (const row of data) {
          const keys = Object.keys(row);
          const nameKey = keys.find((k) => /name|family|head|guest/i.test(k));
          const phoneKey = keys.find((k) => /phone|mobile|contact|whatsapp|cell|tel|mob/i.test(k));
          const paxKey = keys.find((k) => /pax|count|total|members/i.test(k));
          const sideKey = keys.find((k) => /side|party|family\s*side|bride.*groom/i.test(k));
          const resortKey = keys.find((k) => /resort|hotel|stay|venue|property/i.test(k));
          const checkInKey = keys.find((k) => /check.*in|checkin|arrival|date|day/i.test(k));

          const rawName = nameKey ? row[nameKey] : row["Name"] || row["Guest Name"] || "";
          const rawPhone = phoneKey ? row[phoneKey] : row["Phone"] || row["Mobile"] || "";
          const rawPax = paxKey ? row[paxKey] : row["Pax"] || 2;

          let parsedSide = importSideChoice;
          if (sideKey && row[sideKey]) {
            const val = String(row[sideKey]).toLowerCase();
            parsedSide = val.includes("groom") || val.includes("ladkewale") ? "Groom" : "Bride";
          }

          const parsedResort = resortKey && row[resortKey] ? String(row[resortKey]).trim() : importDefaultResort;

          let parsedCheckIn = toReadableDate(importDefaultCheckInRaw);
          if (checkInKey && row[checkInKey]) {
            const rawCell = String(row[checkInKey]).trim();
            if (/day[\s\-_]*(0|zero)/i.test(rawCell)) parsedCheckIn = allowedDateRange.day0Label;
            else if (/day[\s\-_]*(1|one)/i.test(rawCell)) parsedCheckIn = allowedDateRange.day1Label;
            else if (/day[\s\-_]*(2|two)/i.test(rawCell)) parsedCheckIn = allowedDateRange.day2Label;
            else {
              const directFormatted = toReadableDate(rawCell);
              if (directFormatted) parsedCheckIn = directFormatted;
            }
          }

          let cleanPhoneStr = cleanPhoneNumber(rawPhone);
          const nameStr = String(rawName).trim();
          const paxNum = parseInt(String(rawPax), 10) || 2;

          if (nameStr && cleanPhoneStr) {
            await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
              name: nameStr,
              phone: cleanPhoneStr,
              cleanPhone: cleanPhoneStr.slice(-10),
              side: parsedSide,
              stayResort: parsedResort || handover?.resortName || "Main Resort",
              checkInDate: parsedCheckIn || allowedDateRange.day1Label,
              invitedPax: paxNum,
              adultsCount: paxNum,
              minorsCount: 0,
              totalPax: paxNum,
              status: "Pending Call",
              callNotes: "",
              idCardUrls: [],
              attendees: [
                {
                  id: `att_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                  name: nameStr,
                  ageGroup: "Adult",
                  assignedIdUrls: [],
                },
              ],
              createdAt: new Date().toISOString(),
            });
            addedCount++;
          }
        }
        setShowImportModal(false);
        alert(`Successfully imported ${addedCount} guests for ${importSideChoice} Side!`);
      } catch (err: any) {
        alert(`Failed to parse file: ${err.message || "Invalid file format"}`);
      } finally {
        setUploadingExcel(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // MANUAL ADD
  const handleManualAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setSavingManualGuest(true);
    try {
      const total = Number(manualAdults) + Number(manualMinors);
      const cleanPhone = cleanPhoneNumber(manualPhone);
      const finalCheckInDate = toReadableDate(manualDateRaw) || allowedDateRange.day1Label;

      await addDoc(collection(db, "handovers", handoverId, "rsvps"), {
        name: manualName.trim(),
        phone: manualPhone.trim(),
        cleanPhone: cleanPhone.slice(-10),
        side: manualSide,
        stayResort: manualResort.trim() || handover?.resortName || "Main Resort",
        checkInDate: finalCheckInDate,
        invitedPax: total || 2,
        adultsCount: manualAdults,
        minorsCount: manualMinors,
        totalPax: total,
        status: "Pending Call",
        callNotes: manualNotes.trim(),
        idCardUrls: [],
        attendees: [
          {
            id: `att_${Date.now()}`,
            name: manualName.trim(),
            ageGroup: "Adult",
            assignedIdUrls: [],
          },
        ],
        createdAt: new Date().toISOString(),
      });
      setShowManualAddModal(false);
      setManualName("");
      setManualPhone("");
      setManualNotes("");
    } finally {
      setSavingManualGuest(false);
    }
  };

  // OPEN EDIT MODAL
  const handleOpenEditModal = (guest: any) => {
    setEditingGuest(guest);
    setEditName(guest.name || "");
    setEditPhone(guest.phone || "");
    setEditSide(guest.side || "Bride");
    setEditResort(guest.stayResort || handover?.resortName || "Main Resort");

    let initialIso = allowedDateRange.day1Iso;
    if (guest.checkInDate) {
      const parsed = new Date(guest.checkInDate);
      if (!isNaN(parsed.getTime())) {
        initialIso = toISODate(parsed);
      }
    }
    setEditDateRaw(initialIso);
    setEditAdults(guest.adultsCount ?? 2);
    setEditMinors(guest.minorsCount ?? 0);
    setEditNotes(guest.callNotes || "");
  };

  // SAVE EDITED GUEST
  const handleSaveEditedGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuest || !editName.trim() || !editPhone.trim()) return;

    setSavingEditGuest(true);
    try {
      const cleanPhone = cleanPhoneNumber(editPhone);
      const total = Math.max(0, Number(editAdults)) + Math.max(0, Number(editMinors));
      const formattedDate = toReadableDate(editDateRaw) || allowedDateRange.day1Label;

      let updatedAttendees = editingGuest.attendees || [];
      if (updatedAttendees.length > 0 && updatedAttendees[0].name === editingGuest.name) {
        updatedAttendees[0] = { ...updatedAttendees[0], name: editName.trim() };
      }

      await updateDoc(doc(db, "handovers", handoverId, "rsvps", editingGuest.id), {
        name: editName.trim(),
        phone: editPhone.trim(),
        cleanPhone: cleanPhone.slice(-10),
        side: editSide,
        stayResort: editResort.trim(),
        checkInDate: formattedDate,
        adultsCount: Math.max(0, Number(editAdults)),
        minorsCount: Math.max(0, Number(editMinors)),
        totalPax: total,
        callNotes: editNotes.trim(),
        attendees: updatedAttendees,
        updatedAt: new Date().toISOString(),
      });

      setEditingGuest(null);
    } catch (err) {
      alert("Failed to update guest details.");
    } finally {
      setSavingEditGuest(false);
    }
  };

  const handleUpdateCounts = async (guestId: string, adults: number, minors: number, status: string, notes: string) => {
    const total = Math.max(0, adults) + Math.max(0, minors);
    await updateDoc(doc(db, "handovers", handoverId, "rsvps", guestId), {
      adultsCount: Math.max(0, adults),
      minorsCount: Math.max(0, minors),
      totalPax: total,
      status,
      callNotes: notes,
      updatedAt: new Date().toISOString(),
    });
  };

  // SEND LIVE CHAT
  const handleSendChatReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !activeChatGuest) return;

    const text = chatInputText.trim();
    setChatInputText("");
    setSendingChatMessage(true);

    try {
      const res = await fetch("/api/twilio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handoverId,
          guestId: activeChatGuest.id,
          phone: activeChatGuest.phone,
          message: text,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        alert(`Failed: ${result.error}`);
        setChatInputText(text);
      } else {
        scrollToLatestMessage(true);
      }
    } catch (err) {
      alert("Error sending message.");
      setChatInputText(text);
    } finally {
      setSendingChatMessage(false);
    }
  };

  // VOICE RECORDING
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mime = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      recordedMimeTypeRef.current = mime;
      const mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied.");
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !activeChatGuest) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);

    mediaRecorderRef.current.onstop = async () => {
      const mime = recordedMimeTypeRef.current;
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      audioChunksRef.current = [];

      setUploadingAttachment(true);
      try {
        const fileRef = ref(storage, `chat_media/${handoverId}/${activeChatGuest.id}/${Date.now()}_voice.${ext}`);
        await uploadBytes(fileRef, audioBlob, { contentType: mime });
        const downloadUrl = await getDownloadURL(fileRef);

        await fetch("/api/twilio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handoverId,
            guestId: activeChatGuest.id,
            phone: activeChatGuest.phone,
            message: "🎤 Voice Message",
            mediaUrl: downloadUrl,
            fileName: `Voice Note.${ext}`,
          }),
        });
        scrollToLatestMessage(true);
      } catch (e) {
        alert("Failed to send voice recording.");
      } finally {
        setUploadingAttachment(false);
      }
    };

    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
  };

  // ATTENDEE & ID ASSIGNMENT
  const handleOpenAttendeeModal = (guest: any) => {
    setSelectedAttendeeGuest(JSON.parse(JSON.stringify(guest)));
    setNewAttendeeName("");
    setNewAttendeeAgeGroup("Adult");
  };

  const handleAddAttendee = () => {
    if (!newAttendeeName.trim() || !selectedAttendeeGuest) return;
    const currentAttendees = selectedAttendeeGuest.attendees || [];
    const newEntry = {
      id: `att_${Date.now()}`,
      name: newAttendeeName.trim(),
      ageGroup: newAttendeeAgeGroup,
      assignedIdUrls: [],
    };
    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: [...currentAttendees, newEntry],
    });
    setNewAttendeeName("");
  };

  const handleRemoveAttendee = (attId: string) => {
    if (!selectedAttendeeGuest) return;
    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: (selectedAttendeeGuest.attendees || []).filter((a: any) => a.id !== attId),
    });
  };

  const handleAssignPhotoToAttendee = (attId: string, docUrl: string) => {
    if (!selectedAttendeeGuest) return;
    const updatedAttendees = (selectedAttendeeGuest.attendees || []).map((att: any) => {
      if (att.id === attId) {
        const exists = (att.assignedIdUrls || []).includes(docUrl);
        return {
          ...att,
          assignedIdUrls: exists
            ? att.assignedIdUrls.filter((u: string) => u !== docUrl)
            : [...(att.assignedIdUrls || []), docUrl],
        };
      }
      return att;
    });

    setSelectedAttendeeGuest({
      ...selectedAttendeeGuest,
      attendees: updatedAttendees,
    });
  };

  const getAssignedAttendeeName = (docUrl: string) => {
    if (!selectedAttendeeGuest?.attendees) return null;
    const match = selectedAttendeeGuest.attendees.find((a: any) =>
      (a.assignedIdUrls || []).includes(docUrl)
    );
    return match ? match.name : null;
  };

  const handleSaveAttendees = async () => {
    if (!selectedAttendeeGuest) return;
    setSavingAttendees(true);
    try {
      await updateDoc(doc(db, "handovers", handoverId, "rsvps", selectedAttendeeGuest.id), {
        attendees: selectedAttendeeGuest.attendees || [],
      });
      setSelectedAttendeeGuest(null);
    } catch (err) {
      alert("Failed to save attendees.");
    } finally {
      setSavingAttendees(false);
    }
  };

  if (loading || !handover) return <div className="p-12 text-center text-xl font-bold">Loading RSVP Center...</div>;

  return (
    <div className="min-h-screen bg-slate-100 text-gray-900 pb-20">
      {/* Top Banner */}
      <div className="bg-white border-b-2 border-gray-300 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push(`/handovers/${handoverId}`)}
              className="text-xs font-bold text-gray-600 hover:text-black flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-md border transition mb-1"
            >
              ← Back to Handover
            </button>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              {handover.title} - Guest & ID Desk
              <span className="text-xs bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full border border-emerald-300">
                🟢 Live Sync
              </span>
            </h1>
            <p className="text-xs font-semibold text-gray-600 mt-0.5">
              📍 {handover.resortName} | 📅 Wedding Dates: {allowedDateRange.day1Label} to {allowedDateRange.day2Label}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveChatGuest(sortedChatGuests[0] || null);
                setIsChatModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow flex items-center gap-1.5"
            >
              💬 Open WhatsApp Web Desk
            </button>
            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-lg text-xs shadow flex items-center gap-1.5"
            >
              🖨️ Export Dossier (PDF)
            </button>
          </div>
        </div>

        {/* BRIDE & GROOM PARENTS REGARDS BAR */}
        <div className="bg-slate-50 border-t px-6 py-2">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <span className="font-black text-gray-700 uppercase tracking-wide text-[10px]">
                👨‍👩‍👧 Family Names for WhatsApp:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-pink-700">👰 Bride's Mom & Dad:</span>
                <input
                  placeholder="e.g. Mr. & Mrs. Sharma"
                  value={brideParents}
                  onChange={(e) => setBrideParents(e.target.value)}
                  className="border px-2 py-1 rounded font-semibold text-xs w-48 bg-white"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-blue-700">🤵 Groom's Mom & Dad:</span>
                <input
                  placeholder="e.g. Mr. & Mrs. Verma"
                  value={groomParents}
                  onChange={(e) => setGroomParents(e.target.value)}
                  className="border px-2 py-1 rounded font-semibold text-xs w-48 bg-white"
                />
              </div>
            </div>
            <button
              onClick={handleSaveParentsConfig}
              disabled={isSavingParents}
              className="bg-gray-800 hover:bg-black text-white font-bold px-3 py-1 rounded text-[11px] shadow"
            >
              {isSavingParents ? "Saving..." : "Save Family Names"}
            </button>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY DOSSIER */}
      <div className="hidden print-only p-8 bg-white">
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-black uppercase tracking-wide">{handover.title} - Official Guest ID Dossier</h1>
          <p className="text-sm font-bold text-gray-700">
            Resort: {handover.resortName} | Event Dates: {handover.startDate} to {handover.endDate}
          </p>
          <p className="text-xs text-gray-500 mt-1">Generated on: {new Date().toLocaleString()}</p>
        </div>

        <div className="space-y-8">
          {filteredGuests.map((guest, idx) => (
            <div key={guest.id} className="border-2 border-gray-400 rounded-lg p-5 page-break-inside-avoid">
              <div className="flex justify-between items-start border-b pb-2 mb-4 bg-gray-50 p-2 rounded">
                <div>
                  <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                    {idx + 1}. Family Head: {guest.name}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                      guest.side === "Groom" ? "bg-blue-100 text-blue-900 border border-blue-300" : "bg-pink-100 text-pink-900 border border-pink-300"
                    }`}>
                      {guest.side === "Groom" ? "🤵 Groom Side" : "👰 Bride Side"}
                    </span>
                  </h2>
                  <p className="text-xs font-bold text-gray-700 mt-0.5">
                    Phone: {guest.phone} | Stay Resort: <strong>{guest.stayResort || handover.resortName}</strong> | Check-in: <strong>{guest.checkInDate || allowedDateRange.day1Label}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black uppercase bg-gray-200 px-2 py-0.5 rounded">
                    Total Pax: {guest.totalPax || 2} ({guest.adultsCount || 2}A + {guest.minorsCount || 0}M)
                  </span>
                  {guest.callNotes && <p className="text-[11px] text-gray-600 italic mt-0.5">Note: {guest.callNotes}</p>}
                </div>
              </div>

              <div className="space-y-4">
                {(guest.attendees && guest.attendees.length > 0
                  ? guest.attendees
                  : [{ id: "head", name: guest.name, ageGroup: "Adult", assignedIdUrls: guest.idCardUrls || [] }]
                ).map((att: any, aIdx: number) => (
                  <div key={aIdx} className="border p-3 rounded-lg bg-white flex flex-col md:flex-row gap-4 items-start">
                    <div className="w-48 flex-shrink-0">
                      <span className="text-[10px] font-black uppercase text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block mb-1">
                        Attendee #{aIdx + 1}
                      </span>
                      <strong className="text-sm font-black text-gray-900 block">{att.name}</strong>
                      <span className="text-xs font-semibold text-gray-500">Age: {att.ageGroup || "Adult"}</span>
                    </div>

                    <div className="flex-1">
                      <span className="text-[11px] font-bold text-gray-500 block mb-1">Verified Government Photo ID(s):</span>
                      {att.assignedIdUrls && att.assignedIdUrls.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {att.assignedIdUrls.map((url: string, uIdx: number) => {
                            const isPdf = isPdfFile(url);
                            const resolvedUrl = getMediaDisplayUrl(url);

                            return (
                              <div
                                key={uIdx}
                                className="border-2 border-gray-300 rounded-lg p-2 bg-gray-50 flex flex-col justify-between items-center page-break-inside-avoid"
                              >
                                {isPdf ? (
                                  <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center w-full">
                                    <span className="text-2xl block mb-1">📄</span>
                                    <strong className="text-xs text-gray-800 block">PDF Government ID Proof</strong>
                                    <span className="text-[10px] text-gray-500">Extract as cropped image for native paper printing</span>
                                  </div>
                                ) : (
                                  <img
                                    src={resolvedUrl}
                                    alt="ID Document"
                                    className="w-full h-44 object-contain rounded bg-white"
                                  />
                                )}
                                <div className="w-full flex justify-between items-center pt-1.5 mt-1 border-t border-gray-200 text-[9px] text-gray-500 font-mono">
                                  <span>Verified ID #{uIdx + 1}</span>
                                  <span className="text-emerald-700 font-bold uppercase">{isPdf ? "Source PDF" : "Photo ID"}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No ID proof assigned yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Screen Body */}
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-4 no-print">
        {/* MULTI-FILTER BAR */}
        <div className="bg-white p-4 rounded-xl border border-gray-300 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <input
                placeholder="Search Name or Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 border p-2 rounded-lg text-xs font-bold"
              />

              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value)}
                className="border p-2 rounded-lg text-xs font-bold bg-white"
              >
                <option value="All">All Sides (Bride & Groom)</option>
                <option value="Bride">👰 Bride Side Only</option>
                <option value="Groom">🤵 Groom Side Only</option>
              </select>

              <select
                value={resortFilter}
                onChange={(e) => setResortFilter(e.target.value)}
                className="border p-2 rounded-lg text-xs font-bold bg-white"
              >
                <option value="All">All Stay Resorts</option>
                {availableResorts.map((r) => (
                  <option key={r} value={r}>🏨 {r}</option>
                ))}
              </select>

              <select
                value={checkInFilter}
                onChange={(e) => setCheckInFilter(e.target.value)}
                className="border p-2 rounded-lg text-xs font-bold bg-white"
              >
                <option value="All">All Check-in Dates</option>
                {availableCheckIns.map((c) => (
                  <option key={c} value={c}>📅 {c}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border p-2 rounded-lg text-xs font-bold bg-white"
              >
                <option value="All">All Statuses</option>
                <option value="Pending Call">Pending Call</option>
                <option value="ID Requested">ID Requested</option>
                <option value="IDs Received">IDs Received</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Declined">Declined</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              <button
                onClick={() => setShowManualAddModal(true)}
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-3 py-2 rounded-lg text-xs shadow"
              >
                + Add Guest
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-gray-100 border hover:bg-gray-200 text-gray-800 font-black px-3 py-2 rounded-lg text-xs shadow flex items-center gap-1"
              >
                📥 Import Excel / CSV
              </button>
            </div>
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedGuestIds.size > 0 && (
          <div className="bg-purple-900 text-white p-3.5 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded-full">
                {selectedGuestIds.size} Selected
              </span>
              <button onClick={() => setSelectedGuestIds(new Set())} className="text-xs text-purple-200 hover:text-white underline font-semibold">
                Deselect All
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isBulkRunning ? (
                <div className="flex items-center gap-2 bg-purple-950 px-4 py-1.5 rounded-lg text-xs font-bold text-yellow-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                  Sending ({bulkProgress?.current} of {bulkProgress?.total})...
                </div>
              ) : (
                <>
                  <button
                    onClick={handleBulkSendIdRequest}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow"
                  >
                    📲 Bulk ID Request ({selectedGuestIds.size})
                  </button>
                  <button
                    onClick={() => setShowBulkTemplateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow"
                  >
                    📢 Other Custom Template
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirmText("");
                      setShowBulkDeleteModal(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black px-3 py-1.5 rounded-lg text-xs shadow flex items-center gap-1"
                  >
                    🗑️ Delete Selected
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* DIRECTORY TABLE */}
        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 font-black uppercase text-[10px] text-gray-700 border-b">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredGuests.length > 0 && selectedGuestIds.size === filteredGuests.length}
                      onChange={(e) => setSelectedGuestIds(e.target.checked ? new Set(filteredGuests.map((g) => g.id)) : new Set())}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Guest / Family Head</th>
                  <th className="p-3 text-center">Side</th>
                  <th className="p-3">Stay Resort & Check-in</th>
                  <th className="p-3 text-center">Pax</th>
                  <th className="p-3">Calling Notes</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">WhatsApp ID Request</th>
                  <th className="p-3">Live Chat</th>
                  <th className="p-3">Attendees & IDs</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredGuests.map((guest) => {
                  const isChecked = selectedGuestIds.has(guest.id);
                  const isGroom = guest.side === "Groom";

                  return (
                    <tr key={guest.id} className={`hover:bg-gray-50 ${isChecked ? "bg-purple-50/60" : ""}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedGuestIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(guest.id)) n.delete(guest.id);
                              else n.add(guest.id);
                              return n;
                            });
                          }}
                          className="cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => handleOpenAttendeeModal(guest)}
                          className="font-black text-sm text-purple-900 hover:underline text-left block"
                        >
                          {guest.name}
                        </button>
                        <p className="text-gray-500 font-mono text-[11px]">{guest.phone}</p>
                      </td>

                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${
                          isGroom ? "bg-blue-50 text-blue-800 border-blue-200" : "bg-pink-50 text-pink-800 border-pink-200"
                        }`}>
                          {isGroom ? "🤵 Groom" : "👰 Bride"}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="font-bold text-gray-900 block truncate max-w-[150px]">
                          🏨 {guest.stayResort || handover.resortName}
                        </span>
                        <span className="text-[10px] text-gray-600 block mt-0.5 font-semibold">
                          📅 Check-in: <strong className="text-purple-900">{guest.checkInDate || allowedDateRange.day1Label}</strong>
                        </span>
                      </td>

                      <td className="p-3 text-center font-bold">
                        {guest.totalPax || 2}
                        <span className="text-[10px] text-gray-400 block font-normal">
                          ({guest.adultsCount || 2}A + {guest.minorsCount || 0}M)
                        </span>
                      </td>

                      <td className="p-3">
                        <input
                          placeholder="Notes..."
                          value={guest.callNotes || ""}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, guest.adultsCount || 2, guest.minorsCount || 0, guest.status, e.target.value)
                          }
                          className="w-full border p-1 rounded text-xs"
                        />
                      </td>

                      <td className="p-3 text-center font-bold">
                        <select
                          value={guest.status || "Pending Call"}
                          onChange={(e) =>
                            handleUpdateCounts(guest.id, guest.adultsCount || 2, guest.minorsCount || 0, e.target.value, guest.callNotes)
                          }
                          className="border p-1 rounded text-xs"
                        >
                          <option value="Pending Call">Pending Call</option>
                          <option value="ID Requested">ID Requested</option>
                          <option value="IDs Received">IDs Received</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Declined">Declined</option>
                        </select>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <button
                          onClick={() => handleSendWhatsApp(guest)}
                          disabled={sendingWhatsappId === guest.id}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow disabled:opacity-50"
                        >
                          {sendingWhatsappId === guest.id ? "Sending..." : "📲 Send ID Request"}
                        </button>
                        <div className="text-[10px] mt-1 text-gray-500 font-mono">
                          {guest.whatsappStatus ? `Status: ${guest.whatsappStatus}` : "Not sent yet"}
                        </div>
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => {
                            setActiveChatGuest(guest);
                            setIsChatModalOpen(true);
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-black px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow"
                        >
                          💬 Chat
                          {guest.hasUnreadMessages && (
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                          )}
                        </button>
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => handleOpenAttendeeModal(guest)}
                          className="text-xs font-bold text-gray-700 hover:text-purple-700 flex items-center gap-1.5"
                        >
                          <span className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded font-black">
                            {guest.attendees?.length || 1} Pax
                          </span>
                          <span className="text-gray-400">|</span>
                          <span className="text-emerald-700 font-bold">
                            {guest.idCardUrls?.length || 0} IDs
                          </span>
                        </button>
                      </td>

                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEditModal(guest)}
                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline text-xs mr-3"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Delete ${guest.name}?`)) {
                              await deleteDoc(doc(db, "handovers", handoverId, "rsvps", guest.id));
                            }
                          }}
                          className="text-red-600 hover:text-red-800 font-bold hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* EDIT GUEST MODAL WITH CONSTRAINED DATEPICKER */}
      {editingGuest && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-gray-900">✏️ Edit: {editingGuest.name}</h3>
              <button onClick={() => setEditingGuest(null)} className="text-gray-400 hover:text-black font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveEditedGuest} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Side *</label>
                <select
                  value={editSide}
                  onChange={(e: any) => setEditSide(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold bg-white"
                >
                  <option value="Bride">👰 Bride Side</option>
                  <option value="Groom">🤵 Groom Side</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Guest Name *</label>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">WhatsApp Number *</label>
                <input
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border p-2 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Stay Resort</label>
                <input
                  value={editResort}
                  onChange={(e) => setEditResort(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold"
                />
              </div>

              {/* DATEPICKER WITH CONSTRAINED RANGE */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-gray-700">Check-in Date (Pick Calendar Date) *</label>
                  <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {toReadableDate(editDateRaw)}
                  </span>
                </div>
                <input
                  type="date"
                  required
                  min={allowedDateRange.min}
                  max={allowedDateRange.max}
                  value={editDateRaw}
                  onChange={(e) => setEditDateRaw(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold bg-white cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditDateRaw(allowedDateRange.day0Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 0: {allowedDateRange.day0Label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDateRaw(allowedDateRange.day1Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 1: {allowedDateRange.day1Label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDateRaw(allowedDateRange.day2Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 2: {allowedDateRange.day2Label}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Adults</label>
                  <input
                    type="number"
                    value={editAdults}
                    onChange={(e) => setEditAdults(Number(e.target.value))}
                    className="w-full border p-2 rounded-lg text-center font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Minors</label>
                  <input
                    type="number"
                    value={editMinors}
                    onChange={(e) => setEditMinors(Number(e.target.value))}
                    className="w-full border p-2 rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Notes</label>
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border p-2 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setEditingGuest(null)} className="px-4 py-2 border font-bold text-xs rounded-xl">
                  Cancel
                </button>
                <button type="submit" disabled={savingEditGuest} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow">
                  {savingEditGuest ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL ADD GUEST MODAL WITH CONSTRAINED DATEPICKER */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-black text-gray-900 border-b pb-2">+ Add Guest Manually</h3>
            <form onSubmit={handleManualAddGuest} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Wedding Side *</label>
                <select
                  value={manualSide}
                  onChange={(e: any) => setManualSide(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold bg-white"
                >
                  <option value="Bride">👰 Bride Side</option>
                  <option value="Groom">🤵 Groom Side</option>
                </select>
              </div>

              <input
                required
                placeholder="Family Head / Guest Name *"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full border p-2 rounded-lg font-bold"
              />
              <input
                required
                placeholder="WhatsApp Number (e.g. 9876543210) *"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full border p-2 rounded-lg font-mono font-bold"
              />

              <div>
                <label className="font-bold text-gray-600 block mb-0.5">Stay Resort</label>
                <input
                  placeholder="e.g. Resort 1"
                  value={manualResort}
                  onChange={(e) => setManualResort(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold"
                />
              </div>

              {/* DATEPICKER WITH CONSTRAINED RANGE */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-gray-700">Check-in Date (Pick Calendar Date) *</label>
                  <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {toReadableDate(manualDateRaw)}
                  </span>
                </div>
                <input
                  type="date"
                  required
                  min={allowedDateRange.min}
                  max={allowedDateRange.max}
                  value={manualDateRaw}
                  onChange={(e) => setManualDateRaw(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold bg-white cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setManualDateRaw(allowedDateRange.day0Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 0: {allowedDateRange.day0Label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualDateRaw(allowedDateRange.day1Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 1: {allowedDateRange.day1Label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualDateRaw(allowedDateRange.day2Iso)}
                    className="px-2 py-1 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-900 rounded font-bold text-[10px] border"
                  >
                    Day 2: {allowedDateRange.day2Label}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-600 block mb-0.5 font-bold">Adults</label>
                  <input
                    type="number"
                    value={manualAdults}
                    onChange={(e) => setManualAdults(Number(e.target.value))}
                    className="w-full border p-2 rounded-lg text-center font-bold"
                  />
                </div>
                <div>
                  <label className="text-gray-600 block mb-0.5 font-bold">Minors</label>
                  <input
                    type="number"
                    value={manualMinors}
                    onChange={(e) => setManualMinors(Number(e.target.value))}
                    className="w-full border p-2 rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              <input
                placeholder="Arrival / Food Notes..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full border p-2 rounded-lg"
              />

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowManualAddModal(false)} className="px-3 py-1.5 border rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={savingManualGuest} className="px-5 py-1.5 bg-purple-700 text-white font-bold rounded-lg shadow">
                  {savingManualGuest ? "Saving..." : "Save Guest"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM META APPROVED TEMPLATE BUILDER */}
      {showBulkTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-2">
              <div>
                <h3 className="text-base font-black text-gray-900">Custom Meta Approved Template</h3>
                <p className="text-xs text-gray-500">Send to {selectedGuestIds.size} selected guests</p>
              </div>
              <button onClick={() => setShowBulkTemplateModal(false)} className="text-gray-400 hover:text-black font-bold">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Twilio Template Content SID *</label>
                <input
                  placeholder="e.g. HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={customTemplateSid}
                  onChange={(e) => setCustomTemplateSid(e.target.value)}
                  className="w-full border p-2.5 rounded-lg font-mono text-xs font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  How many variables does this approved template have?
                </label>
                <select
                  value={customVarCount}
                  onChange={(e) => setCustomVarCount(Number(e.target.value))}
                  className="w-full border p-2 rounded-lg font-bold bg-white"
                >
                  <option value={0}>0 (Plain message with no variables)</option>
                  <option value={1}>1 Variable ({'{{1}}'})</option>
                  <option value={2}>2 Variables ({'{{1}}'}, {'{{2}}'})</option>
                  <option value={3}>3 Variables ({'{{1}}'}, {'{{2}}'}, {'{{3}}'})</option>
                  <option value={4}>4 Variables ({'{{1}}'} to {'{{4}}'})</option>
                  <option value={5}>5 Variables ({'{{1}}'} to {'{{5}}'})</option>
                </select>
              </div>

              {customVarCount > 0 && (
                <div className="border p-3 rounded-xl bg-gray-50 space-y-3">
                  <span className="font-black text-gray-700 uppercase tracking-wide text-[10px] block">
                    Map Each Variable to Guest Details:
                  </span>
                  {Array.from({ length: customVarCount }).map((_, idx) => {
                    const currentMapping = customVarMappings[idx] || { type: "GuestName", customText: "" };
                    return (
                      <div key={idx} className="space-y-1 bg-white p-2 rounded-lg border">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-purple-700 w-12 text-xs">
                            {`{{${idx + 1}}}`}:
                          </span>
                          <select
                            value={currentMapping.type}
                            onChange={(e) => {
                              const newMappings = [...customVarMappings];
                              newMappings[idx] = { ...currentMapping, type: e.target.value };
                              setCustomVarMappings(newMappings);
                            }}
                            className="flex-1 border p-1.5 rounded text-xs font-bold bg-white"
                          >
                            <option value="GuestName">Guest Full Name</option>
                            <option value="ParentsRegards">Family/Parents Names</option>
                            <option value="ResortName">Stay Resort Name</option>
                            <option value="CheckInDate">Check-in Date</option>
                            <option value="WeddingTitle">Wedding Title</option>
                            <option value="GuestSide">Side (Bride / Groom)</option>
                            <option value="CustomText">Custom Static Text...</option>
                          </select>
                        </div>
                        {currentMapping.type === "CustomText" && (
                          <input
                            placeholder="Type custom text for this variable..."
                            value={currentMapping.customText}
                            onChange={(e) => {
                              const newMappings = [...customVarMappings];
                              newMappings[idx] = { ...currentMapping, customText: e.target.value };
                              setCustomVarMappings(newMappings);
                            }}
                            className="w-full border p-1 rounded text-xs mt-1"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowBulkTemplateModal(false)} className="px-4 py-2 border font-bold text-xs rounded-xl">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkSendCustomTemplate}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow"
              >
                Send Template to ({selectedGuestIds.size}) Guests ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION DIALOG */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border-2 border-red-500">
            <div className="flex items-center gap-3 text-red-600 border-b pb-2">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="text-base font-black text-gray-900">Delete {selectedGuestIds.size} Guests</h3>
                <span className="text-xs text-red-600 font-bold">This cannot be undone</span>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              This will permanently delete the selected guests, their attendee rosters, message histories, and uploaded ID cards.
            </p>

            <div className="bg-red-50 border border-red-200 p-3 rounded-xl space-y-1">
              <label className="text-[11px] font-bold text-red-900 block">
                To confirm, type <span className="font-black text-red-600 underline">DELETE</span> below:
              </label>
              <input
                type="text"
                placeholder="Type DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full border-2 border-red-300 p-2 rounded-lg font-black text-center text-sm tracking-wider uppercase outline-none focus:border-red-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                disabled={isDeletingBulk}
                className="px-4 py-2 border font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={isDeletingBulk || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow disabled:opacity-40"
              >
                {isDeletingBulk ? "Deleting..." : `Delete ${selectedGuestIds.size} Guests`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-gray-900">📥 Import Guests (Excel / CSV)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-black font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Target Wedding Side *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportSideChoice("Bride")}
                    className={`py-2 px-3 rounded-lg border font-black flex items-center justify-center gap-1.5 ${
                      importSideChoice === "Bride" ? "bg-pink-100 border-pink-500 text-pink-900" : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    👰 Bride Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportSideChoice("Groom")}
                    className={`py-2 px-3 rounded-lg border font-black flex items-center justify-center gap-1.5 ${
                      importSideChoice === "Groom" ? "bg-blue-100 border-blue-500 text-blue-900" : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    🤵 Groom Side
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Default Stay Resort:</label>
                <input
                  value={importDefaultResort}
                  onChange={(e) => setImportDefaultResort(e.target.value)}
                  placeholder="e.g. Resort 1"
                  className="w-full border p-2 rounded-lg font-bold"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-gray-700">Default Check-in Date:</label>
                  <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {toReadableDate(importDefaultCheckInRaw)}
                  </span>
                </div>
                <input
                  type="date"
                  min={allowedDateRange.min}
                  max={allowedDateRange.max}
                  value={importDefaultCheckInRaw}
                  onChange={(e) => setImportDefaultCheckInRaw(e.target.value)}
                  className="w-full border p-2 rounded-lg font-bold bg-white cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <label className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl text-center block cursor-pointer shadow">
                  {uploadingExcel ? "Processing Sheet..." : "Select File to Upload (.xlsx, .csv)"}
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleExcelImport} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDEE & ID ROSTER MODAL */}
      {selectedAttendeeGuest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border-2 border-gray-300">
            <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase font-black tracking-widest text-emerald-400">
                  Guest Verification & Attendee Roster
                </span>
                <h2 className="text-xl font-black">
                  {selectedAttendeeGuest.name} ({selectedAttendeeGuest.phone})
                  <span className="text-xs ml-3 bg-purple-700 px-2.5 py-0.5 rounded-full font-bold">
                    {selectedAttendeeGuest.side || "Bride"} Side
                  </span>
                </h2>
              </div>
              <button onClick={() => setSelectedAttendeeGuest(null)} className="text-gray-400 hover:text-white text-2xl font-black">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                <span className="text-xs font-black text-purple-900 block mb-2">
                  + Add Family Member Attending with {selectedAttendeeGuest.name}:
                </span>
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. Sunita Sharma (Spouse) or Rohan Sharma (Son)"
                    value={newAttendeeName}
                    onChange={(e) => setNewAttendeeName(e.target.value)}
                    className="flex-1 border p-2 rounded-lg text-xs font-bold"
                  />
                  <select
                    value={newAttendeeAgeGroup}
                    onChange={(e) => setNewAttendeeAgeGroup(e.target.value)}
                    className="border p-2 rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="Adult">Adult</option>
                    <option value="Minor">Minor / Child</option>
                    <option value="Senior">Senior Citizen</option>
                  </select>
                  <button onClick={handleAddAttendee} className="bg-purple-700 hover:bg-purple-800 text-white font-black px-4 py-2 rounded-lg text-xs">
                    Add Attendee
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-black text-sm text-gray-800 uppercase tracking-wide">
                  Assign Received IDs to Attendees
                </h3>

                {(selectedAttendeeGuest.attendees || []).map((att: any, idx: number) => (
                  <div key={att.id} className="border-2 border-gray-300 rounded-xl p-4 bg-slate-50 space-y-3">
                    <div className="flex justify-between items-center border-b pb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-purple-200 text-purple-950 font-black px-2 py-0.5 rounded text-xs">
                          Person #{idx + 1}
                        </span>
                        <strong className="text-base font-black text-gray-900">{att.name}</strong>
                        <span className="text-xs text-gray-500 font-semibold">({att.ageGroup})</span>
                      </div>
                      <button onClick={() => handleRemoveAttendee(att.id)} className="text-red-600 hover:text-red-800 text-xs font-bold">
                        Remove
                      </button>
                    </div>

                    <div>
                      {selectedAttendeeGuest.idCardUrls && selectedAttendeeGuest.idCardUrls.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {selectedAttendeeGuest.idCardUrls.map((url: string, pIdx: number) => {
                            const isSelectedForThisAttendee = (att.assignedIdUrls || []).includes(url);
                            const assignedToName = getAssignedAttendeeName(url);
                            const isAssignedToOther = assignedToName && assignedToName !== att.name;
                            const isPdf = isPdfFile(url);
                            const resolvedUrl = getMediaDisplayUrl(url);

                            return (
                              <div
                                key={pIdx}
                                className={`relative rounded-xl overflow-hidden border-4 transition shadow-sm bg-white flex flex-col justify-between ${
                                  isSelectedForThisAttendee
                                    ? "border-emerald-600 ring-2 ring-emerald-400"
                                    : isAssignedToOther
                                    ? "border-amber-400 bg-amber-50/40"
                                    : "border-gray-200"
                                }`}
                              >
                                <div className="relative group h-36 w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                                  {isPdf ? (
                                    <div className="flex flex-col items-center justify-center p-2 text-center w-full">
                                      <span className="text-3xl">📄</span>
                                      <span className="text-[10px] font-black text-blue-800 mt-0.5 uppercase">
                                        Source PDF Document
                                      </span>

                                      {/* CROP BUTTON: OPENS MULTI-CROP MODAL */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenPdfCropper(url)}
                                        className="mt-1.5 w-full bg-purple-700 hover:bg-purple-800 text-white font-black text-[10px] py-1 px-2 rounded shadow flex items-center justify-center gap-1"
                                      >
                                        ✂️ Extract & Crop IDs
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setActiveLightboxDoc(resolvedUrl)}
                                        className="text-[10px] text-blue-600 font-bold underline mt-1"
                                      >
                                        🔍 Preview Full PDF
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <img src={resolvedUrl} alt="ID Thumbnail" className="w-full h-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => setActiveLightboxImg(resolvedUrl)}
                                        className="absolute bottom-1 right-1 bg-black/75 hover:bg-black text-white px-2 py-0.5 rounded text-[9px] font-bold shadow"
                                      >
                                        🔍 Enlarge
                                      </button>
                                    </>
                                  )}
                                </div>

                                <div className="p-2 border-t flex flex-col justify-between gap-1">
                                  {isSelectedForThisAttendee ? (
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-center truncate">
                                      ✓ Assigned to {att.name}
                                    </span>
                                  ) : isAssignedToOther ? (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-center truncate">
                                      Assigned to: {assignedToName}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded text-center">
                                      ⚠ Unassigned
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleAssignPhotoToAttendee(att.id, url)}
                                    className={`w-full py-1 rounded text-[11px] font-black transition ${
                                      isSelectedForThisAttendee
                                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }`}
                                  >
                                    {isSelectedForThisAttendee ? "Remove ID" : "Assign to this Person"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">No IDs received from this guest on WhatsApp yet.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-gray-100 border-t flex justify-end gap-3">
              <button onClick={() => setSelectedAttendeeGuest(null)} className="px-4 py-2 border font-bold text-xs rounded-xl bg-white">
                Cancel
              </button>
              <button
                onClick={handleSaveAttendees}
                disabled={savingAttendees}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow"
              >
                {savingAttendees ? "Saving..." : "Save Attendee Roster"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* INTERACTIVE MULTI-CROP MODAL (SUPPORTS MULTIPLE CROPS PER PAGE) */}
      {/* ------------------------------------------------------------- */}
      {croppingPdfUrl && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 no-print">
          <div className="bg-white w-full max-w-6xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border-2 border-gray-300">
            <div className="bg-gray-900 text-white px-6 py-3 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  ✂️ Extract & Crop Multiple IDs from PDF
                </h3>
                <p className="text-[11px] text-gray-300">
                  Drag on the page to crop an ID card. You can crop multiple IDs from the same page (e.g. Front & Back, or multiple people).
                </p>
              </div>
              <button onClick={() => setCroppingPdfUrl(null)} className="text-white hover:text-red-400 font-bold text-xl px-2">✕</button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100">
              {/* LEFT: CANVAS VIEWER WITH PERFECT SELECTION BOX */}
              <div className="flex-1 flex flex-col items-center justify-between p-4 overflow-hidden">
                <div className="flex items-center justify-between w-full max-w-2xl bg-white p-2 rounded-xl border shadow-sm mb-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevCropPage}
                      disabled={cropCurrentPage <= 1 || cropPdfLoading}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-40"
                    >
                      ← Prev Page
                    </button>
                    <span className="font-bold text-gray-700">
                      Page {cropCurrentPage} of {cropTotalPages}
                    </span>
                    <button
                      onClick={handleNextCropPage}
                      disabled={cropCurrentPage >= cropTotalPages || cropPdfLoading}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-40"
                    >
                      Next Page →
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCropRect(null)}
                      className="px-2.5 py-1 text-gray-500 hover:text-black font-semibold text-[11px]"
                    >
                      Reset Box
                    </button>
                    <button
                      onClick={handleAddCropToTray}
                      disabled={cropPdfLoading || !cropRect}
                      className="bg-purple-700 hover:bg-purple-800 text-white font-black px-3.5 py-1.5 rounded-lg shadow flex items-center gap-1.5 animate-pulse disabled:opacity-50"
                    >
                      ➕ Crop This Selection
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 w-full max-w-2xl flex items-center justify-center overflow-auto border-2 border-dashed border-gray-300 rounded-xl bg-gray-200 p-2">
                  {cropPdfLoading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center font-bold text-sm text-gray-600 z-20">
                      Loading PDF Engine & Page {cropCurrentPage}...
                    </div>
                  )}

                  <div className="relative inline-block select-none shadow-lg">
                    <canvas
                      ref={cropCanvasRef}
                      onMouseDown={handleCanvasMouseDown}
                      onTouchStart={handleCanvasTouchStart}
                      className="max-h-[62vh] max-w-full w-auto object-contain cursor-crosshair rounded bg-white block"
                    />

                    {cropRect && (
                      <div
                        style={{
                          left: `${cropRect.x}px`,
                          top: `${cropRect.y}px`,
                          width: `${cropRect.w}px`,
                          height: `${cropRect.h}px`,
                        }}
                        className="absolute border-2 border-dashed border-emerald-500 bg-emerald-500/20 pointer-events-none"
                      >
                        <span className="absolute top-1 left-1 bg-emerald-700 text-white text-[9px] px-1 font-bold rounded">
                          Crop Box
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 font-medium mt-1">
                  💡 Tip: Click and drag across the Aadhaar or Passport card on screen, then click <strong>"➕ Crop This Selection"</strong>. You can repeat this multiple times on this same page!
                </p>
              </div>

              {/* RIGHT: CROPPED IDS TRAY */}
              <div className="w-full md:w-80 lg:w-96 bg-white border-l flex flex-col justify-between">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <div>
                    <h4 className="font-black text-sm text-gray-900">Cropped Cards Tray</h4>
                    <span className="text-xs text-gray-500 font-semibold">{croppedTray.length} ID card(s) ready</span>
                  </div>
                  {croppedTray.length > 0 && (
                    <button
                      onClick={() => setCroppedTray([])}
                      className="text-xs text-red-600 hover:underline font-bold"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {croppedTray.map((item, idx) => (
                    <div
                      key={item.id}
                      className="border-2 border-gray-200 rounded-xl p-2 bg-slate-50 flex items-center justify-between gap-3 shadow-sm hover:border-purple-300"
                    >
                      <img
                        src={item.dataUrl}
                        alt="Crop Thumbnail"
                        className="w-24 h-16 object-contain rounded border bg-white"
                      />
                      <div className="flex-1 min-w-0">
                        <strong className="text-xs text-gray-900 block truncate">ID Card #{idx + 1}</strong>
                        <span className="text-[10px] text-gray-500 block">Cropped from Page {item.page}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCropFromTray(item.id)}
                        className="text-red-500 hover:text-red-700 text-base font-bold p-1"
                        title="Delete this crop"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {croppedTray.length === 0 && (
                    <div className="py-20 text-center text-gray-400 text-xs italic space-y-2">
                      <span className="text-4xl block">✂️</span>
                      <p>No cards cropped yet.</p>
                      <p className="text-[11px] text-gray-400">
                        Drag a box on the left and click "Crop This Selection".
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t bg-gray-50">
                  <button
                    onClick={handleInitiateSaveCrops}
                    disabled={croppedTray.length === 0 || isSavingCrops}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-lg transition disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {isSavingCrops ? "Uploading to Cloud..." : `Save & Attach (${croppedTray.length}) ID Cards ➤`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* GRANULAR REPLACEMENT MODAL (WITH ENLARGE PREVIEWS) */}
      {/* ------------------------------------------------------------- */}
      {showSaveCropChoiceModal && (
        <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border-2 border-gray-300 max-h-[90vh] flex flex-col">
            <div className="border-b pb-2 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Select Previous Crops to Replace
                </h3>
                <p className="text-xs text-gray-500">
                  You are saving <strong>{croppedTray.length} new ID card(s)</strong>.
                </p>
              </div>
              <button
                onClick={() => setShowSaveCropChoiceModal(false)}
                className="text-gray-400 hover:text-black font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Click on any previous crop below that you want to <strong>replace/overwrite</strong> with your new crop(s). Unselected cards will be kept safe.
            </p>

            <div className="flex-1 overflow-y-auto p-2 border rounded-xl bg-gray-50 space-y-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">
                Previously Cropped Cards from this PDF:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {getExistingCropsForActivePdf().map((oldUrl, oIdx) => {
                  const isSelectedForReplace = selectedOldCropsToReplace.has(oldUrl);
                  const displayOldUrl = getMediaDisplayUrl(oldUrl);

                  return (
                    <div
                      key={oIdx}
                      onClick={() => handleToggleOldCropSelection(oldUrl)}
                      className={`relative border-2 rounded-xl p-2 cursor-pointer transition flex flex-col justify-between ${
                        isSelectedForReplace
                          ? "border-red-500 bg-red-50/80 ring-2 ring-red-400"
                          : "border-gray-200 bg-white hover:border-purple-300"
                      }`}
                    >
                      <div className="relative h-24 w-full bg-gray-100 rounded overflow-hidden">
                        <img
                          src={displayOldUrl}
                          alt="Previous Crop"
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveLightboxImg(displayOldUrl);
                          }}
                          className="absolute bottom-1 right-1 bg-black/75 hover:bg-black text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow"
                        >
                          🔍 Enlarge
                        </button>
                      </div>

                      <div className="mt-2 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            isSelectedForReplace
                              ? "bg-red-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isSelectedForReplace ? "✕ Will Replace" : "✓ Keep Card"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveCropChoiceModal(false)}
                  disabled={isSavingCrops}
                  className="px-4 py-2 border font-bold text-xs rounded-xl"
                >
                  Back to Cropper
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteSaveCrops([])}
                  disabled={isSavingCrops}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow"
                >
                  Keep All & Add as New ({croppedTray.length})
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteSaveCrops(Array.from(selectedOldCropsToReplace))}
                  disabled={isSavingCrops || selectedOldCropsToReplace.size === 0}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-black text-xs rounded-xl shadow disabled:opacity-40"
                >
                  Replace Selected ({selectedOldCropsToReplace.size}) & Save New ({croppedTray.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP WEB STYLE CHAT MODAL */}
      {isChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 no-print">
          <div className="bg-white w-full h-full md:rounded-2xl shadow-2xl flex overflow-hidden border border-gray-300">
            {/* LEFT SIDEBAR: SORTED BY MOST RECENT INTERACTION AT TOP */}
            <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col bg-white ${activeChatGuest ? "hidden md:flex" : "flex"}`}>
              <div className="bg-[#075E54] text-white px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <span className="font-black text-sm">WhatsApp Chats</span>
                </div>
                <button
                  onClick={() => setIsChatModalOpen(false)}
                  className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-md text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>

              <div className="p-2 border-b bg-gray-50">
                <input
                  placeholder="Search chats by name or mobile..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {filteredChatGuests.map((guest) => {
                  const isActive = activeChatGuest?.id === guest.id;
                  return (
                    <div
                      key={guest.id}
                      onClick={() => {
                        setActiveChatGuest(guest);
                        scrollToLatestMessage(false);
                      }}
                      className={`p-3 cursor-pointer transition flex items-center justify-between ${
                        isActive ? "bg-emerald-50 border-l-4 border-emerald-600" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-purple-700 text-white font-black flex items-center justify-center flex-shrink-0 text-sm">
                          {guest.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-gray-900 truncate flex items-center gap-1.5">
                            {guest.name}
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-gray-100 text-gray-700">
                              {guest.side || "Bride"}
                            </span>
                          </h4>
                          <p className="text-[11px] text-gray-500 font-mono truncate">{guest.phone}</p>
                          <p className="text-[11px] text-gray-600 truncate mt-0.5">
                            {guest.lastMessage || "No messages yet"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-2">
                        {guest.hasUnreadMessages && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block ml-auto mb-1 animate-pulse"></span>
                        )}
                        <span className="text-[9px] text-gray-400 block font-mono">
                          {guest.lastMessageAt
                            ? new Date(guest.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANE: ACTIVE CONVERSATION */}
            {activeChatGuest ? (
              <div className="flex-1 flex flex-col bg-[#efeae2]">
                <div className="bg-[#075E54] text-white px-4 py-3 flex justify-between items-center shadow-md">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveChatGuest(null)}
                      className="md:hidden text-white font-bold text-xs bg-white/20 px-2 py-1 rounded"
                    >
                      ← Back
                    </button>
                    <div>
                      <h3 className="font-black text-sm flex items-center gap-2">
                        {activeChatGuest.name}
                        <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded text-emerald-100 font-normal">
                          {activeChatGuest.side || "Bride"} Side
                        </span>
                      </h3>
                      <p className="text-[11px] text-emerald-100 font-mono">
                        {activeChatGuest.phone} • {activeChatGuest.stayResort || handover.resortName} (Check-in: {activeChatGuest.checkInDate || allowedDateRange.day1Label})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => handleOpenAttendeeModal(activeChatGuest)}
                      className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold"
                    >
                      👤 Attendees & IDs ({activeChatGuest.idCardUrls?.length || 0})
                    </button>
                  </div>
                </div>

                {/* Messages Feed */}
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-xl rounded-2xl p-3 text-xs shadow-sm space-y-1.5 ${
                            isOutbound
                              ? "bg-[#d9fdd3] text-gray-900 rounded-tr-none border border-emerald-200"
                              : "bg-white text-gray-900 rounded-tl-none border border-gray-200"
                          }`}
                        >
                          <span className="text-[10px] font-bold text-gray-500 block">
                            {isOutbound ? msg.senderName || "Executive" : activeChatGuest.name}
                          </span>

                          {msg.body && (
                            <p className="leading-relaxed whitespace-pre-wrap text-[13px] font-sans">
                              {msg.body}
                            </p>
                          )}

                          {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                            <div className="space-y-2 pt-1">
                              {msg.mediaUrls.map((url: string, idx: number) => {
                                const isAudio = url.includes(".mp4") || url.includes(".webm") || url.includes("audio");
                                const isPdf = isPdfFile(url, msg.body);
                                const isVideo = url.includes("video");
                                const resolvedUrl = getMediaDisplayUrl(url);

                                if (isAudio) {
                                  return (
                                    <div key={idx} className="bg-white/80 p-2 rounded-lg border">
                                      <span className="text-[10px] font-bold text-gray-600 block mb-1">
                                        🎤 Voice Note
                                      </span>
                                      <audio controls className="w-64 h-8" src={resolvedUrl} />
                                    </div>
                                  );
                                }

                                if (isVideo) {
                                  return (
                                    <video key={idx} controls className="max-w-xs rounded-lg border max-h-60">
                                      <source src={resolvedUrl} />
                                    </video>
                                  );
                                }

                                if (isPdf) {
                                  const displayName = msg.body?.toLowerCase().includes(".pdf")
                                    ? msg.body
                                    : "Government ID (PDF Document)";

                                  return (
                                    <div
                                      key={idx}
                                      className="bg-white p-3 rounded-xl border border-gray-300 shadow-sm flex items-center justify-between gap-3 max-w-sm"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-3xl flex-shrink-0">📄</span>
                                        <div className="min-w-0">
                                          <strong className="text-xs text-gray-900 block truncate font-bold">
                                            {displayName}
                                          </strong>
                                          <span className="text-[10px] text-gray-500 font-semibold uppercase">
                                            PDF Document
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setActiveLightboxDoc(resolvedUrl)}
                                          className="text-xs font-black text-blue-700 hover:bg-blue-100 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-200 transition"
                                        >
                                          Preview
                                        </button>
                                        <a
                                          href={resolvedUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-black text-gray-700 hover:bg-gray-100 bg-gray-50 px-2.5 py-1.5 rounded-lg border transition"
                                          title="Open in new tab"
                                        >
                                          ↗
                                        </a>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <img
                                    key={idx}
                                    src={resolvedUrl}
                                    alt="Attachment"
                                    onClick={() => setActiveLightboxImg(resolvedUrl)}
                                    className="max-w-xs max-h-64 object-cover rounded-lg border cursor-zoom-in"
                                  />
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 font-mono">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isOutbound && renderMessageTicks(msg.status)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div ref={messagesEndRef} className="h-1" />

                  {chatMessages.length === 0 && (
                    <div className="py-20 text-center text-gray-500 text-xs italic">
                      No conversation history yet. Send a message below to start chatting.
                    </div>
                  )}
                </div>

                {/* Input Bar */}
                <div className="p-3 bg-[#f0f2f5] border-t flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPendingFile(file);
                      if (file.type.startsWith("image/")) {
                        const r = new FileReader();
                        r.onload = (ev) => setPendingFilePreview(ev.target?.result as string);
                        r.readAsDataURL(file);
                      } else {
                        setPendingFilePreview(null);
                      }
                    }}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment || isRecording}
                    className="p-2 text-gray-600 hover:text-black hover:bg-gray-200 rounded-full transition disabled:opacity-50 text-base"
                    title="Attach Document / Photo / PDF"
                  >
                    📎
                  </button>

                  {isRecording ? (
                    <div className="flex-1 flex items-center justify-between bg-red-50 border border-red-300 px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2 text-red-600 font-bold text-xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
                        Recording ({recordingDuration}s)
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={cancelVoiceRecording}
                          className="text-xs font-bold text-gray-600 hover:text-black px-2 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={stopAndSendVoiceRecording}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded-lg text-xs shadow"
                        >
                          Send Audio ➤
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSendChatReply} className="flex-1 flex items-center gap-2">
                      <input
                        required
                        placeholder={`Type a message to ${activeChatGuest.name}...`}
                        value={chatInputText}
                        onChange={(e) => setChatInputText(e.target.value)}
                        className="flex-1 border border-gray-300 p-2.5 rounded-xl text-xs bg-white outline-none focus:border-emerald-600"
                      />

                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        disabled={uploadingAttachment}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-200 rounded-full transition text-base"
                        title="Record Voice Note"
                      >
                        🎙️
                      </button>

                      <button
                        type="submit"
                        disabled={sendingChatMessage || uploadingAttachment}
                        className="bg-[#00a884] hover:bg-[#067f65] text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow transition disabled:opacity-50 flex items-center gap-1"
                      >
                        {sendingChatMessage || uploadingAttachment ? "Sending..." : "Send ➤"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex flex-col items-center justify-center p-10 bg-slate-50 text-gray-400">
                <span className="text-6xl mb-3">💬</span>
                <h3 className="text-base font-black text-gray-700">Select a Guest from the Left</h3>
                <p className="text-xs text-gray-500 mt-1">Open conversation, review received IDs, or reply.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM ATTACHMENT MODAL */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border">
            <h3 className="text-base font-black text-gray-900 border-b pb-2">Confirm Attachment</h3>

            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 bg-gray-50">
              {pendingFilePreview ? (
                <img
                  src={pendingFilePreview}
                  alt="Preview"
                  className="max-h-60 max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : (
                <div className="text-center py-6">
                  <span className="text-4xl block mb-2">{pendingFile.type.includes("pdf") ? "📄" : "📁"}</span>
                  <p className="font-bold text-xs text-gray-800">{pendingFile.name}</p>
                  <p className="text-[10px] text-gray-500">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                </div>
              )}
            </div>

            <input
              placeholder="Add an optional caption..."
              value={pendingFileCaption}
              onChange={(e) => setPendingFileCaption(e.target.value)}
              className="w-full border p-2 rounded-xl text-xs font-medium"
            />

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setPendingFilePreview(null);
                }}
                disabled={uploadingAttachment}
                className="px-4 py-2 border font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!pendingFile || !activeChatGuest) return;
                  setUploadingAttachment(true);
                  try {
                    const fileRef = ref(storage, `chat_media/${handoverId}/${activeChatGuest.id}/${Date.now()}_${pendingFile.name}`);
                    await uploadBytes(fileRef, pendingFile, { contentType: pendingFile.type });
                    const downloadUrl = await getDownloadURL(fileRef);

                    await fetch("/api/twilio/chat", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        handoverId,
                        guestId: activeChatGuest.id,
                        phone: activeChatGuest.phone,
                        message: pendingFileCaption.trim(),
                        mediaUrl: downloadUrl,
                        fileName: pendingFile.name,
                      }),
                    });
                    setPendingFile(null);
                    setPendingFilePreview(null);
                    scrollToLatestMessage(true);
                  } finally {
                    setUploadingAttachment(false);
                  }
                }}
                disabled={uploadingAttachment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow"
              >
                {uploadingAttachment ? "Sending..." : "Confirm & Send ➤"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR IMAGES */}
      {activeLightboxImg && (
        <div
          onClick={() => setActiveLightboxImg(null)}
          className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4 cursor-zoom-out no-print"
        >
          <button
            onClick={() => setActiveLightboxImg(null)}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white font-black px-4 py-2 rounded-full text-xs transition"
          >
            ✕ Close Preview
          </button>
          <img
            src={activeLightboxImg}
            alt="ID Document"
            className="max-w-full max-h-[85vh] object-contain rounded-xl bg-white shadow-2xl"
          />
        </div>
      )}

      {/* LIGHTBOX FOR PDF */}
      {activeLightboxDoc && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-gray-900 text-white px-5 py-3 flex justify-between items-center">
              <span className="font-black text-sm">📄 Government ID PDF Preview</span>
              <div className="flex items-center gap-2">
                <a
                  href={activeLightboxDoc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold"
                >
                  Open in New Tab ↗
                </a>
                <button
                  onClick={() => setActiveLightboxDoc(null)}
                  className="text-white hover:text-red-400 font-black text-lg px-2"
                >
                  ✕
                </button>
              </div>
            </div>
            <iframe
              src={activeLightboxDoc}
              className="w-full flex-1 border-0"
              title="PDF ID Viewer"
            />
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            font-size: 10pt !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
            padding: 0 !important;
          }
          .page-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 10mm 12mm 10mm;
          }
        }
      `}</style>
    </div>
  );
}