import { ApiError, ApiTransportError } from "@/api/client";
import { t } from "@/localization";

export type LoginFeedback = {
  title: string;
  hint: string;
  verification?: boolean;
  fields?: Partial<Record<"email" | "password", string>>;
};

// Never display an arbitrary gateway message, validation string or stack trace.
// Specific account reasons require an explicit response signal, not just a 403.
export function loginFeedback(error: unknown): LoginFeedback {
  if (error instanceof ApiTransportError)
    return {
      title:
        error.reason === "timeout"
          ? "Sign-in took too long"
          : "Couldn’t connect",
      hint: "Check your connection and try again. Your details are still here.",
    };
  if (!(error instanceof ApiError))
    return {
      title: "Sign-in couldn’t finish",
      hint: "Please try again. If this continues, contact your administrator.",
    };
  const messages = [error.serverMessage, ...Object.values(error.fields).flat()]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
  if (error.status === 429)
    return {
      title: "Too many sign-in attempts",
      hint: error.retryAfter
        ? `Try again in ${error.retryAfter} seconds.`
        : "Wait a moment before trying again.",
    };
  if (
    error.status === 422 &&
    messages.includes("the supplied credentials could not be authenticated.")
  )
    return {
      title: "Email or password is incorrect",
      hint: "Check both details and try again.",
    };
  if (
    error.status === 403 &&
    messages.includes("verify your email before signing in.")
  )
    return {
      title: "Verify your email to sign in",
      hint: "Open the verification link sent to your email address.",
      verification: true,
    };
  if (error.status === 422) {
    const fields: LoginFeedback["fields"] = {};
    if (error.fields.email?.length) fields.email = "Check your email address.";
    if (error.fields.password?.length) fields.password = "Check your password.";
    return {
      title: "Check your sign-in details",
      hint: "Review the highlighted fields and try again.",
      fields,
    };
  }
  if (error.status === 403)
    return {
      title: "Sign-in isn’t allowed",
      hint: "Contact your administrator to check your account’s access.",
    };
  if (error.status === 404)
    return {
      title: t("apiDisabled"),
      hint: "Please try again later or contact your administrator.",
    };
  return {
    title: "Sign-in is unavailable",
    hint: "Please try again later. If this continues, contact your administrator.",
  };
}
