const SHEETS = {
  bookings: "bookings",
  admins: "admins",
};

const HEADERS = {
  bookings: [
    "id",
    "startDate",
    "endDate",
    "from",
    "pickupAddress",
    "to",
    "seats",
    "name",
    "mobile",
    "notes",
    "status",
    "createdAt",
    "finalKm",
    "amountPaid",
    "completedAt",
  ],
  admins: ["username", "password", "role", "createdAt"],
};

function setupTravelBookingSheet() {
  ensureHeaders(SHEETS.bookings, HEADERS.bookings);
  ensureHeaders(SHEETS.admins, HEADERS.admins);
  seedDefaultAdmin();
}

function doGet(event) {
  const action = event.parameter.action || "listBookings";

  if (action === "listBookings") {
    return jsonResponse({ ok: true, bookings: readBookings() });
  }

  return jsonResponse({ ok: false, reason: "Unknown action." });
}

function doPost(event) {
  const body = JSON.parse(event.postData.contents || "{}");

  if (body.action === "createBooking") {
    return jsonResponse(createBooking(body.booking));
  }

  if (body.action === "updateBooking") {
    return jsonResponse(updateBooking(body.id, body.patch));
  }

  if (body.action === "deleteBooking") {
    return jsonResponse(deleteBooking(body.id));
  }

  if (body.action === "ownerLogin") {
    return jsonResponse(ownerLogin(body.username, body.password));
  }

  return jsonResponse({ ok: false, reason: "Unknown action." });
}

function ownerLogin(username, password) {
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");
  const admins = readObjects(SHEETS.admins, HEADERS.admins);

  const found = admins.find((admin) => {
    return String(admin.username || "").trim() === normalizedUsername && String(admin.password || "") === normalizedPassword;
  });

  if (!found) {
    return { ok: false, reason: "Invalid username or password." };
  }

  return { ok: true, role: String(found.role || "owner") };
}

function createBooking(booking) {
  const normalized = normalizeBooking(booking);
  appendObject(SHEETS.bookings, HEADERS.bookings, normalized);
  return { ok: true, booking: normalized };
}

function updateBooking(id, patch) {
  const sheet = ensureHeaders(SHEETS.bookings, HEADERS.bookings);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("id");

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][idIndex]) !== String(id)) {
      continue;
    }

    Object.keys(patch || {}).forEach((key) => {
      const columnIndex = headers.indexOf(key);
      if (columnIndex >= 0) {
        sheet.getRange(index + 1, columnIndex + 1).setValue(patch[key]);
      }
    });

    return { ok: true, booking: readBookings().find((booking) => booking.id === String(id)) };
  }

  return { ok: false, reason: "Booking not found." };
}

function deleteBooking(id) {
  const sheet = ensureHeaders(SHEETS.bookings, HEADERS.bookings);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("id");

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][idIndex]) === String(id)) {
      sheet.deleteRow(index + 1);
      return { ok: true };
    }
  }

  return { ok: false, reason: "Booking not found." };
}

function readBookings() {
  return readObjects(SHEETS.bookings, HEADERS.bookings).map(normalizeBooking);
}

function normalizeBooking(row) {
  return {
    id: String(row.id || Date.now()),
    startDate: normalizeDate(row.startDate),
    endDate: normalizeDate(row.endDate),
    from: String(row.from || ""),
    pickupAddress: String(row.pickupAddress || row.from || ""),
    to: String(row.to || ""),
    seats: Number(row.seats || 1),
    name: String(row.name || ""),
    mobile: String(row.mobile || ""),
    notes: String(row.notes || ""),
    status: String(row.status || "pending"),
    createdAt: String(row.createdAt || new Date().toISOString()),
    finalKm: String(row.finalKm || ""),
    amountPaid: Number(row.amountPaid || 0),
    completedAt: String(row.completedAt || ""),
  };
}

function normalizeDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}

function ensureHeaders(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.getActive();
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const currentLastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const existingHeaders = sheet.getLastRow()
    ? sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0].map(String)
    : [];

  headers.forEach((header) => {
    if (!existingHeaders.includes(header)) {
      existingHeaders.push(header);
    }
  });

  sheet.getRange(1, 1, 1, existingHeaders.length).setValues([existingHeaders]);
  sheet.setFrozenRows(1);
  return sheet;
}

function seedDefaultAdmin() {
  const admins = readObjects(SHEETS.admins, HEADERS.admins);
  if (admins.length > 0) {
    return;
  }

  appendObject(SHEETS.admins, HEADERS.admins, {
    username: "admin",
    password: "admin123",
    role: "owner",
    createdAt: new Date().toISOString(),
  });
}

function readObjects(sheetName, headers) {
  const sheet = ensureHeaders(sheetName, headers);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2) {
    return [];
  }

  const sheetHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues().map((row) => {
    const item = {};
    sheetHeaders.forEach((header, index) => {
      item[header] = row[index];
    });
    return item;
  });
}

function appendObject(sheetName, headers, object) {
  const sheet = ensureHeaders(sheetName, headers);
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(currentHeaders.map((header) => object[header] ?? ""));
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
