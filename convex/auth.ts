import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

const ALLOWED_EMAILS = new Set([
  "nagapranayimmadi@gmail.com",
  "nagapranay_immadi@oakridge.in",
]);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLocaleLowerCase();
        if (!ALLOWED_EMAILS.has(email)) {
          throw new Error("This private Oakridge workspace is not enabled for that email.");
        }
        return {
          email,
          name: email === "nagapranayimmadi@gmail.com" ? "Naga Pranay Immadi" : "Oakridge MUN Admin",
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 12) {
          throw new Error("Use at least 12 characters for the workspace password.");
        }
      },
    }),
  ],
});
