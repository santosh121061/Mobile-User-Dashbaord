// Recovery strings are kept together; supplied locales can translate the same keys.
export const recoveryText = {
    resetTitle: "Reset password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordHint:
        "Use at least 12 characters, including uppercase and lowercase letters, a number and a symbol.",
    passwordMismatch: "Enter the same password in both fields.",
    complete: "Password reset. Sign in again.",
    disabled: "Password recovery is currently unavailable.",
    verificationTitle: "Verify email",
    verificationHint:
        "Continue on the existing secure account website to verify your email. You may need to sign in there. Return here and sign in after verification.",
    verificationOpen: "Continue to verification",
    verificationDisabled: "Email verification is currently unavailable.",
} as const;
