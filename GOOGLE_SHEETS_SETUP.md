# Travel Booking Google Sheets Setup

## 1. Create the sheet

1. Open Google Sheets and create a blank spreadsheet.
2. Rename it to `Travel Car Bookings`.
3. Go to `Extensions > Apps Script`.
4. Paste the contents of `apps-script/Code.gs`.
5. Run `setupTravelBookingSheet` once and approve permissions.

This creates two tabs:

- `bookings`
- `admins`

The `admins` tab is seeded with this owner login:

```text
username: admin
password: admin123
```

Change that password directly in the `admins` sheet after setup.

## 2. Deploy the Apps Script API

1. In Apps Script, click `Deploy > New deployment`.
2. Select type `Web app`.
3. Set `Execute as` to `Me`.
4. Set `Who has access` to `Anyone`.
5. Deploy and copy the Web app URL ending in `/exec`.

## 3. Connect the React app

Create a `.env` file in this project:

```bash
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Restart the dev server:

```bash
npm run dev
```

When connected, the top bar changes from `Local demo mode` to `Google Sheets connected`.
