# Base44 Canonical App Setup

## Canonical App

- App id: `69b84417922e4d60ff8ef01c`
- Base URL: `https://pure-canonical-core.base44.app/api`
- Local OpenAPI spec: `C:\Users\Tim Milkewicz\Downloads\CANONICAL-openapi-spec.json`

## Current API Surface

As of April 21, 2026, the local OpenAPI spec for the Canonical app exposes:

- `User`

That means the safest default inventory for this app is `User` only.

## Important Security Note

The Canonical app API key was pasted into chat, so treat it as sensitive and rotate it in Base44 when you get a chance.

Do not hardcode live keys into committed code or docs. Keep the real key in a local env file only.

## Recommended Local File

Create a local file named:

`C:\Users\Tim Milkewicz\Documents\New project\.env.canonical.local`

with:

```env
BASE44_APP_ID=69b84417922e4d60ff8ef01c
BASE44_API_BASE=https://pure-canonical-core.base44.app/api
BASE44_API_KEY=your_rotated_canonical_app_key_here
```

That filename is already ignored by git because `.env.*.local` is ignored.

## Commands

Check safe config state:

```powershell
$env:BASE44_ENV_FILE='.env.canonical.local'; npm run base44:status
```

List users:

```powershell
$env:BASE44_ENV_FILE='.env.canonical.local'; npm run base44:users
```

Inventory the Canonical app safely:

```powershell
$env:BASE44_ENV_FILE='.env.canonical.local'
$env:BASE44_ENTITIES='User'
npm run base44:inventory
```

Peek at Canonical users:

```powershell
$env:BASE44_ENV_FILE='.env.canonical.local'
$env:BASE44_FIELDS='full_name,email,role'
npm run base44:peek -- User
```

The inventory command writes a safe summary snapshot to:

`C:\Users\Tim Milkewicz\Documents\New project\.mission-control\data\base44-inventory-69b84417922e4d60ff8ef01c.json`

The peek command writes a safe summary snapshot to:

`C:\Users\Tim Milkewicz\Documents\New project\.mission-control\data\base44-peek-69b84417922e4d60ff8ef01c-User.json`
