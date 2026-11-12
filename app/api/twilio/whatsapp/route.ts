import { NextResponse } from "next/server";
import { db, storage } from "../../../../lib/firebase";
import { 
  getDoc, 
  doc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  collectionGroup, 
  orderBy, 
  limit, 
  arrayUnion, 
  runTransaction 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ status: "Twilio WhatsApp Webhook is active" });
}

export async function POST(req: Request) {
  try {
    const textData = await req.text();
    const params = new URLSearchParams(textData);

    const from = params.get("From") || "";
    const rawBody = params.get("Body") || "";
    const messageSid = params.get("MessageSid") || "";
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const cleanSenderPhone = from.replace("whatsapp:", "").replace(/[^0-9]/g, "");

    if (!cleanSenderPhone) {
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    const tenDigitPhone = cleanSenderPhone.slice(-10);

    // 1. ACCURATE MULTI-WEDDING ROUTING
    let targetHandoverId: string | null = null;
    let targetGuestId: string | null = null;
    let matchedGuestDoc: any = null;

    try {
      const routingSnap = await getDoc(doc(db, "phone_routing", tenDigitPhone));
      if (routingSnap.exists()) {
        const rData = routingSnap.data();
        const candidateGuestSnap = await getDoc(doc(db, "handovers", rData.handoverId, "rsvps", rData.guestId));
        if (candidateGuestSnap.exists()) {
          targetHandoverId = rData.handoverId;
          targetGuestId = rData.guestId;
          matchedGuestDoc = candidateGuestSnap;
        }
      }
    } catch (e) {
      console.warn("phone_routing lookup skipped:", e);
    }

    // Fallback if not registered in phone_routing
    if (!matchedGuestDoc) {
      try {
        const qClean = query(
          collectionGroup(db, "rsvps"),
          where("cleanPhone", "==", tenDigitPhone),
          orderBy("lastMessageAt", "desc"),
          limit(1)
        );
        const snapClean = await getDocs(qClean);
        if (!snapClean.empty) {
          matchedGuestDoc = snapClean.docs[0];
          targetGuestId = matchedGuestDoc.id;
          targetHandoverId = matchedGuestDoc.ref.parent.parent?.id || null;
        }
      } catch (e) {
        const qSimple = query(collectionGroup(db, "rsvps"), where("cleanPhone", "==", tenDigitPhone), limit(1));
        const snapSimple = await getDocs(qSimple);
        if (!snapSimple.empty) {
          matchedGuestDoc = snapSimple.docs[0];
          targetGuestId = matchedGuestDoc.id;
          targetHandoverId = matchedGuestDoc.ref.parent.parent?.id || null;
        }
      }
    }

    if (!matchedGuestDoc || !targetHandoverId || !targetGuestId) {
      console.warn(`[Twilio Inbound] No guest record found for ${cleanSenderPhone}`);
      return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
    }

    const guestDocPath = `handovers/${targetHandoverId}/rsvps/${targetGuestId}`;
    const guestDocRef = doc(db, guestDocPath);

    // 2. ATOMIC AUTO-REPLY CHECK (LOCKS IN <50ms TO PREVENT DOUBLE MESSAGES)
    let shouldSendAutoReply = false;
    try {
      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(guestDocRef);
        if (!freshSnap.exists()) return;
        const freshData = freshSnap.data();

        const lastReplyTime = freshData.lastAutoReplyAt 
          ? new Date(freshData.lastAutoReplyAt).getTime() 
          : 0;
        const now = Date.now();

        // 2-hour cooldown. If another image arrives 1s or 10s later, this check immediately fails.
        if (!lastReplyTime || now - lastReplyTime > 2 * 60 * 60 * 1000) {
          shouldSendAutoReply = true;
          transaction.update(guestDocRef, {
            lastAutoReplyAt: new Date().toISOString(),
          });
        }
      });
    } catch (txErr) {
      console.warn("[Auto-Reply Transaction Error]:", txErr);
    }

    // 3. DOWNLOAD FROM TWILIO & UPLOAD TO FIREBASE STORAGE
    const finalizedMediaUrls: string[] = [];
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params.get(`MediaUrl${i}`);
      const contentType = (params.get(`MediaContentType${i}`) || "application/pdf").toLowerCase();

      if (mediaUrl) {
        try {
          const res = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const isPdf = contentType.includes("pdf") || rawBody.toLowerCase().includes(".pdf");
            const ext = isPdf
              ? "pdf"
              : contentType.includes("video")
              ? "mp4"
              : contentType.includes("png")
              ? "png"
              : "jpg";

            const randomSalt = Math.random().toString(36).substring(2, 7);
            const fileName = `id_cards/${cleanSenderPhone}_${Date.now()}_${randomSalt}_${i}.${ext}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, new Uint8Array(arrayBuffer), {
              contentType: isPdf ? "application/pdf" : contentType,
            });

            const firebaseDownloadUrl = await getDownloadURL(storageRef);
            finalizedMediaUrls.push(firebaseDownloadUrl);
          } else {
            finalizedMediaUrls.push(mediaUrl);
          }
        } catch (uploadErr) {
          console.error("[Storage Upload Error]:", uploadErr);
          finalizedMediaUrls.push(mediaUrl);
        }
      }
    }

    let messageBody = rawBody.trim();
    if (!messageBody && finalizedMediaUrls.length > 0) {
      const isPdf = finalizedMediaUrls.some((u) => u.toLowerCase().includes(".pdf"));
      messageBody = isPdf ? "📄 Sent a PDF Document" : "📷 Sent a Photo/ID";
    }

    // 4. WRITE INBOUND MESSAGE TO FIRESTORE
    const guestData = matchedGuestDoc.data();
    await addDoc(collection(db, guestDocPath, "messages"), {
      direction: "inbound",
      body: messageBody || "Replied on WhatsApp",
      mediaUrls: finalizedMediaUrls,
      sid: messageSid,
      status: "delivered",
      timestamp: new Date().toISOString(),
      senderName: guestData.name || "Guest",
    });

    // 5. IF THIS REQUEST WON THE LOCK, RECORD AUTO-REPLY IN CHAT
    let replyText = "";
    if (shouldSendAutoReply) {
      replyText = "Namaste, We have received your message and IDs. Our hospitality team will verify and get back to you shortly. Regards, Team Brajwal";

      await addDoc(collection(db, guestDocPath, "messages"), {
        direction: "outbound",
        body: replyText,
        mediaUrls: [],
        status: "delivered",
        timestamp: new Date().toISOString(),
        senderName: "Team Brajwal (Auto-Reply)",
      });
    }

    // 6. UPDATE GUEST DOCUMENT (Uses arrayUnion so images don't overwrite each other)
    await updateDoc(guestDocRef, {
      ...(finalizedMediaUrls.length > 0 ? { idCardUrls: arrayUnion(...finalizedMediaUrls) } : {}),
      lastMessage: messageBody || "Replied on WhatsApp",
      lastMessageAt: new Date().toISOString(),
      lastGuestInboundAt: new Date().toISOString(),
      hasUnreadMessages: true,
      cleanPhone: tenDigitPhone,
      ...(finalizedMediaUrls.length > 0 ? { status: "IDs Received" } : {}),
    });

    // Send auto-reply only for the first message; second message returns empty XML
    if (replyText) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
      return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
    }

    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  } catch (err: any) {
    console.error("[Twilio Inbound Fatal]:", err);
    return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
  }
}