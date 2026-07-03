import { createAuthClient } from "better-auth/vue";
import {
  organizationClient,
  genericOAuthClient,
} from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { stripeClient } from "@better-auth/stripe/client";
import { ac, owner, admin, member } from "~~/shared/permissions";

export const authClient = createAuthClient({
  plugins: [
    genericOAuthClient(),
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
    ssoClient(),
    // Always registered on the client; the subscription endpoints return errors
    // when the server hasn't enabled billing (no STRIPE_SECRET_KEY).
    stripeClient({ subscription: true }),
  ],
});
