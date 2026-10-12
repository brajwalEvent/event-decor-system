import { auth } from "./firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    confirmationResult?: ConfirmationResult;
  }
}

/**
 * Initializes or resets the reCAPTCHA verifier attached to a DOM container ID.
 */
export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  if (typeof window === "undefined") {
    throw new Error("Window is not defined");
  }

  // Clear existing if any
  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (e) {
      // Ignore cleanup error
    }
  }

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved
    },
    "expired-callback": () => {
      console.warn("reCAPTCHA expired. Resetting...");
    },
  });

  window.recaptchaVerifier = verifier;
  return verifier;
}

/**
 * Sends OTP to international formatted mobile number (+91...)
 */
export async function sendFirebaseOtp(
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  const formattedPhone = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+91${phoneNumber.replace(/\D/g, "")}`;

  const confirmationResult = await signInWithPhoneNumber(
    auth,
    formattedPhone,
    verifier
  );
  window.confirmationResult = confirmationResult;
  return confirmationResult;
}