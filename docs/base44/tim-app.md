# Base44 Tim App Setup

## Tim App

- App id: `695cfbf7fba07f58d25ff8bb`
- Base URL: `https://seth-copy-d25ff8bb.base44.app/api`

## Important Security Note

The Tim app API key was pasted into chat, so treat it as sensitive and rotate it in Base44 when you get a chance.

Do not hardcode live keys into committed code or docs. Keep the real key in a local env file only.

## Multi-App Workflow In This Repo

This repo now supports choosing a Base44 env file per run through `BASE44_ENV_FILE`.

That means you can keep the existing HOQS setup in `.env.local` and target the Tim app with a separate local file.

## Recommended Local File

Create a local file named:

`C:\Users\Tim Milkewicz\Documents\New project\.env.tim.local`

with:

```env
BASE44_APP_ID=695cfbf7fba07f58d25ff8bb
BASE44_API_BASE=https://seth-copy-d25ff8bb.base44.app/api
BASE44_API_KEY=your_rotated_tim_app_key_here
```

That filename is already ignored by git because `.env.*.local` is ignored.

## Commands

Check safe config state:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'; npm run base44:status
```

List users:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'; npm run base44:users
```

Inventory the live Tim app:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'; npm run base44:inventory
```

Peek at one entity:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'; npm run base44:peek -- IntegrityAlert
```

Optional filtered peek:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'
$env:BASE44_QUERY='{"status":"new"}'
$env:BASE44_FIELDS='alert_type,status,signal_summary,review_notes'
npm run base44:peek -- IntegrityAlert
```

Optional entity override:

```powershell
$env:BASE44_ENV_FILE='.env.tim.local'
$env:BASE44_ENTITIES='User,ChatSession,IntegrityAlert,MaintenanceTask'
npm run base44:inventory
```

The inventory command writes a safe summary snapshot to:

`C:\Users\Tim Milkewicz\Documents\New project\.mission-control\data\base44-inventory-695cfbf7fba07f58d25ff8bb.json`
