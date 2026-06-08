# Base44 HOQS Lab Setup

## Current App

- App id: `69de7e170e733e9653c3bbbd`
- Base URL: `https://peak-hoqs-lab.base44.app/api`

## Immediate Security Step

Treat the previously pasted Base44 API key as compromised.

Rotate it in Base44 before using the API again.

According to Base44's account settings documentation, the account API key can be regenerated from:

1. Open Base44.
2. Click the profile icon.
3. Open `Settings`.
4. Open `Account settings`.
5. Find the `API Key` field.
6. Click `Regenerate`.

After regenerating the key:

- update any scripts, integrations, or tools still using the old key
- stop using the previous key everywhere
- store the new key in a local `.env` file, not in committed code

## Local Environment Setup

Create a local `.env` file in this folder with:

```env
BASE44_APP_ID=69de7e170e733e9653c3bbbd
BASE44_API_BASE=https://peak-hoqs-lab.base44.app/api
BASE44_API_KEY=your_new_rotated_key_here
```

The repo now ignores `.env` files, and `.env.example` is the safe template.

## Collaboration Workflow

Use this workflow when multiple people are helping on the same Base44 app:

1. Keep the real key only in local `.env` files or approved secret stores.
2. Use `npm run base44:status` to share safe state:
   - app id
   - API base
   - redacted key preview
   - short fingerprint
3. Use `npm run base44:users` to verify who currently has access without pasting the raw key back into chat.
4. Treat the snapshot file `.mission-control/data/base44-security-status.json` as the non-secret coordination record for the current key state.

This keeps collaboration moving while reducing the need to repeat raw secrets in chat.

## Safe Client Pattern

Use the Base44 SDK with environment variables instead of hardcoded secrets:

```js
import { createClient } from "@base44/sdk";

export const base44 = createClient({
  appId: process.env.BASE44_APP_ID,
  headers: {
    api_key: process.env.BASE44_API_KEY,
  },
});
```

## Quick Verification

Once the new key is in place, a simple verification flow is:

```js
const users = await base44.entities.User.list();
console.log(users);
```

Use that to confirm the rotated key works and to verify who currently has access.

## Ownership Check

Since Lewis and Mathew now have the keys, treat them as the primary owners of the HOQS app.

After the key rotation, verify the `User` entity records and roles so access matches the intended ownership and admin model.
