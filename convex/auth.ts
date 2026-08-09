import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { staffRoleForEmail } from "./lib/access";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLocaleLowerCase();
        const role = staffRoleForEmail(email);
        if (!role) {
          throw new Error("This private Oakridge workspace is not enabled for that email.");
        }
        return {
          email,
          name: email === "nagapranayimmadi@gmail.com" ? "Naga Pranay Immadi" : role === "administrator" ? "Oakridge MUN Admin" : "Oakridge MUN EB Publisher",
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
