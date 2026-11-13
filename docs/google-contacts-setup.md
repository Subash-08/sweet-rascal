# Connect Sweet Rascal to your phone contacts

This pilot writes to one restaurant Google account. When the owner or an authorized staff browser saves a customer, Sweet Rascal tries to save the contact to Google. The phone must be signed in to that same account with Contacts sync enabled. Google controls when the contact becomes visible on the phone.

## Set up once

1. Use a dedicated test Google account and dummy contacts first. In [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the [People API](https://console.cloud.google.com/apis/library/people.googleapis.com), and configure the OAuth consent screen. In External / Testing mode, add that account as a test user.
2. Create a **Web application** OAuth client. Add `http://localhost:3000/api/google-contacts/callback` as an authorized redirect URI for local testing. For deployment, add the exact HTTPS app origin followed by `/api/google-contacts/callback`.
3. Copy `.env.example` to `.env.local`. Set the Client ID, Client Secret, dedicated Google account email, and the app origin. Generate three independent secrets locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and use them as the owner code, staff code and storage key. Share only the staff code with authorized staff, outside the app. Never commit these values.
4. Restart Sweet Rascal. As Owner, open **Settings → Google Contacts**, enter the owner code and choose **Connect Google account**. Select the configured Google account and allow Contacts access. Under **Customers**, enter the staff code once per browser to allow contact writes. The browser lock expires after 12 hours; the owner can revoke all sessions for a code by rotating it on the server.
5. On your phone, add the same Google account and enable Contacts sync. Save a dummy customer from a staff browser. Confirm **Synced** in Sweet Rascal, then check [Google Contacts](https://contacts.google.com/) and the phone.

## What syncs

- The customer’s name, Indian mobile number, and optional **Phone contact note**. Private owner notes do not leave Sweet Rascal. An additional person syncs separately only if explicitly selected.
- Editing a linked customer updates the Sweet Rascal-managed Google contact. A conflicting phone number leaves sync pending and asks staff to review; existing contacts are not silently adopted or deleted. Sweet Rascal owns the name, number and note fields on contacts it created. Removing a number or unchecking an additional person does not delete a previously saved Google contact.
- A failed Google request never blocks the browser’s customer save. Use **Retry contact sync** from the customer record. There is no offline sync queue, and the app only shows **Synced** after Google confirms.

## Before daily use

For local use, run `npm run dev` or `npm run build` followed by `npm start`. Keep `CONTACTS_TOKEN_FILE` outside public directories. The server encrypts the token with `CONTACTS_STORAGE_KEY` before saving it.

For Vercel, add the Google Contacts variables from `.env.local` to **Project → Settings → Environment Variables** for **Production**. Set `CONTACTS_ORIGIN` to `https://sweet-rascal.vercel.app` and keep `https://sweet-rascal.vercel.app/api/google-contacts/callback` in Google's authorized redirect URIs. Connect an [Upstash Redis database](https://upstash.com/docs/redis/howto/vercelintegration) and confirm that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are available in Production. Vercel stores the encrypted token in Redis, so the local `CONTACTS_TOKEN_FILE` setting can be left out.

Deploy the updated code after saving the environment variables. Open [the live Google Contacts status endpoint](https://sweet-rascal.vercel.app/api/google-contacts) and look for `"configured": true`. Then unlock with the owner code and connect the Google account on the live site. The local connection and the live connection are stored separately.

The owner and staff codes protect the contact endpoints. The workspace role switch and customer database remain a prototype; customer records are browser-local, even though Google contacts are shared. Plan real per-user authentication and a shared customer database before a multi-device production rollout. External / Testing refresh tokens for the Contacts scope expire after seven days; the owner must reconnect during the trial. Before production, review [Google’s verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
