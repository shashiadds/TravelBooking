import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  IndianRupee,
  LogOut,
  Plus,
  QrCode,
  ReceiptText,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  authLogin,
  createSheetsBooking,
  deleteSheetsBooking,
  isSheetsConfigured,
  loadSheetsBookings,
  updateSheetsBooking,
} from "./sheetsApi";

type BookingStatus = "pending" | "accepted" | "completed";

export type Booking = {
  id: string;
  startDate: string;
  endDate: string;
  from: string;
  pickupAddress: string;
  to: string;
  seats: number;
  name: string;
  mobile: string;
  notes: string;
  status: BookingStatus;
  createdAt: string;
  finalKm: string;
  amountPaid: number;
  completedAt?: string;
};

type Route = "book" | "admin";

const STORE_KEY = "travel-car-bookings-v1";
const OWNER_SESSION_KEY = "travel-car-owner-session-v1";
const LOCAL_OWNER_USERNAME = "admin";
const LOCAL_OWNER_PASSWORD = "admin123";

const statusLabels: Record<BookingStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  completed: "Completed",
};

const statusOrder: Record<BookingStatus, number> = {
  pending: 0,
  accepted: 1,
  completed: 2,
};

function loadBookings(): Booking[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]") as Booking[];
  } catch {
    return [];
  }
}

function loadOwnerSession() {
  return localStorage.getItem(OWNER_SESSION_KEY) === "true";
}

function getRoute(): Route {
  return location.hash === "#admin" ? "admin" : "book";
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function daysBetween(start: string, end: string) {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.round((last.getTime() - first.getTime()) / 86400000) + 1);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseKm(value: string) {
  const numeric = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function transactionDate(booking: Booking) {
  return String(booking.completedAt || booking.endDate).slice(0, 10);
}

function dateInRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function bookingLink() {
  return `${location.origin}${location.pathname}#book`;
}

function adminLink() {
  return `${location.origin}${location.pathname}#admin`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute);
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);
  const [monthCursor, setMonthCursor] = useState(() => firstDayOfMonth(new Date()));
  const [qrUrl, setQrUrl] = useState("");
  const [syncStatus, setSyncStatus] = useState(isSheetsConfigured ? "Connecting to Google Sheets..." : "Local demo mode");
  const [isOwnerAuthenticated, setIsOwnerAuthenticated] = useState(loadOwnerSession);
  const [loginError, setLoginError] = useState("");
  const [submittedBooking, setSubmittedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    if (!isSheetsConfigured) return;

    loadSheetsBookings()
      .then((result) => {
        setBookings(result.bookings);
        setSyncStatus("Google Sheets connected");
      })
      .catch((error: Error) => {
        setSyncStatus(error.message);
      });
  }, []);

  useEffect(() => {
    QRCode.toDataURL(bookingLink(), {
      width: 280,
      margin: 2,
      color: { dark: "#17211c", light: "#ffffff" },
    }).then(setQrUrl);
  }, []);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      return statusOrder[a.status] - statusOrder[b.status] || a.startDate.localeCompare(b.startDate);
    });
  }, [bookings]);

  const countByStatus = (status: BookingStatus) => bookings.filter((booking) => booking.status === status).length;
  const pendingCount = countByStatus("pending");
  const totalPaid = bookings.reduce((sum, booking) => sum + Number(booking.amountPaid || 0), 0);

  async function addBooking(form: HTMLFormElement) {
    const formData = new FormData(form);
    const startDate = String(formData.get("startDate"));
    const endDate = String(formData.get("endDate"));

    if (endDate < startDate) {
      alert("End date must be same as or after start date.");
      return;
    }

    const booking: Booking = {
      id: uid(),
      startDate,
      endDate,
      from: String(formData.get("from")).trim(),
      pickupAddress: String(formData.get("pickupAddress")).trim(),
      to: String(formData.get("to")).trim(),
      seats: Math.min(7, Math.max(1, Number(formData.get("seats")) || 1)),
      name: String(formData.get("name")).trim(),
      mobile: String(formData.get("mobile")).trim(),
      notes: String(formData.get("notes")).trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      finalKm: "",
      amountPaid: 0,
    };

    setBookings((current) => [booking, ...current]);
    setSubmittedBooking(booking);
    form.reset();
    if (isSheetsConfigured) {
      try {
        await createSheetsBooking(booking);
        setSyncStatus("Google Sheets connected");
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
      }
    }
  }

  async function updateBooking(id: string, patch: Partial<Booking>) {
    setBookings((current) => current.map((booking) => (booking.id === id ? { ...booking, ...patch } : booking)));
    if (!isSheetsConfigured) return;

    try {
      await updateSheetsBooking(id, patch);
      setSyncStatus("Google Sheets connected");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
    }
  }

  function completeBooking(id: string) {
    const booking = bookings.find((item) => item.id === id);
    const km = prompt("Enter final kilometer reading or total km:", booking?.finalKm || "");
    if (km === null) return;

    const amount = prompt("Enter amount paid:", String(booking?.amountPaid || ""));
    if (amount === null) return;

    updateBooking(id, {
      status: "completed",
      finalKm: km.trim(),
      amountPaid: Number(amount) || 0,
      completedAt: new Date().toISOString(),
    });
  }

  async function deleteBooking(id: string) {
    if (!confirm("Delete this booking?")) return;
    setBookings((current) => current.filter((booking) => booking.id !== id));
    if (!isSheetsConfigured) return;

    try {
      await deleteSheetsBooking(id);
      setSyncStatus("Google Sheets connected");
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
    }
  }

  function addSampleBooking() {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    setBookings((current) => [
      {
        id: uid(),
        startDate: toISODate(today),
        endDate: toISODate(tomorrow),
        from: "Pune",
        pickupAddress: "Kothrud, Pune",
        to: "Mumbai Airport",
        seats: 4,
        name: "Sample Customer",
        mobile: "+91 98765 43210",
        notes: "Morning pickup",
        status: "pending",
        createdAt: new Date().toISOString(),
        finalKm: "",
        amountPaid: 0,
      },
      ...current,
    ]);
  }

  async function loginOwner(username: string, password: string) {
    setLoginError("");

    if (!isSheetsConfigured) {
      if (username === LOCAL_OWNER_USERNAME && password === LOCAL_OWNER_PASSWORD) {
        localStorage.setItem(OWNER_SESSION_KEY, "true");
        setIsOwnerAuthenticated(true);
        return;
      }

      setLoginError("Invalid username or password.");
      return;
    }

    try {
      const result = await authLogin(username, password);
      if (!result.ok) {
        setLoginError("Invalid username or password.");
        return;
      }

      localStorage.setItem(OWNER_SESSION_KEY, "true");
      setIsOwnerAuthenticated(true);
      setSyncStatus("Google Sheets connected");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    }
  }

  function logoutOwner() {
    localStorage.removeItem(OWNER_SESSION_KEY);
    setIsOwnerAuthenticated(false);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#book" aria-label="Booking form">
          <span className="brand-mark">
            <Car size={24} strokeWidth={2.4} />
          </span>
          <span>
            <strong>Car Travel</strong>
            <small>Private booking desk</small>
          </span>
        </a>
        <span className={`sync-pill ${isSheetsConfigured ? "connected" : "local"}`}>{syncStatus}</span>
        <nav className="nav">
          <a className={route === "book" ? "active" : ""} href="#book">
            Booking
          </a>
          <a className={route === "admin" ? "active" : ""} href="#admin">
            Owner
            {pendingCount ? <span className="nav-badge">{pendingCount}</span> : null}
          </a>
        </nav>
      </header>

      {route === "admin" ? (
        isOwnerAuthenticated ? (
          <AdminView
            bookings={bookings}
            sortedBookings={sortedBookings}
            countByStatus={countByStatus}
            pendingCount={pendingCount}
            totalPaid={totalPaid}
            monthCursor={monthCursor}
            onMonthChange={setMonthCursor}
            onAccept={(id) => updateBooking(id, { status: "accepted" })}
            onComplete={completeBooking}
            onDelete={deleteBooking}
            onSeed={addSampleBooking}
            onLogout={logoutOwner}
          />
        ) : (
          <OwnerLogin error={loginError} onLogin={loginOwner} />
        )
      ) : (
          <BookingView
            qrUrl={qrUrl}
            submittedBooking={submittedBooking}
            onSubmit={addBooking}
            onBookAnother={() => setSubmittedBooking(null)}
        />
      )}
    </main>
  );
}

function OwnerLogin({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (username: string, password: string) => void;
}) {
  return (
    <section className="login-layout">
      <div className="login-panel">
        <div className="section-title">
          <p>Owner login</p>
          <h1>Sign in to manage bookings</h1>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onLogin(String(formData.get("username")).trim(), String(formData.get("password")));
          }}
        >
          <label className="wide">
            <span>Username</span>
            <input required name="username" type="text" autoComplete="username" placeholder="Owner username" />
          </label>
          <label className="wide">
            <span>Password</span>
            <input required name="password" type="password" autoComplete="current-password" placeholder="Owner password" />
          </label>
          {error ? <p className="form-error wide">{error}</p> : null}
          <button className="primary wide" type="submit">
            <CheckCircle2 size={18} />
            Sign in
          </button>
        </form>
        {!isSheetsConfigured ? <p className="login-hint">Local demo login: admin / admin123</p> : null}
      </div>
    </section>
  );
}

function BookingView({
  qrUrl,
  submittedBooking,
  onSubmit,
  onBookAnother,
}: {
  qrUrl: string;
  submittedBooking: Booking | null;
  onSubmit: (form: HTMLFormElement) => void;
  onBookAnother: () => void;
}) {
  const today = toISODate(new Date());

  return (
    <section className="booking-layout">
      <div className="booking-panel">
        <div className="section-title">
          <p>Book the car</p>
          <h1>Select your travel dates and route</h1>
        </div>
        {submittedBooking ? (
          <BookingSuccess booking={submittedBooking} onBookAnother={onBookAnother} />
        ) : (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(event.currentTarget);
            }}
          >
            <label>
              <span>Start date</span>
              <input required name="startDate" type="date" min={today} />
            </label>
            <label>
              <span>End date</span>
              <input required name="endDate" type="date" min={today} />
            </label>
            <label>
              <span>From</span>
              <input required name="from" type="text" placeholder="Pickup city" />
            </label>
            <label>
              <span>Pickup address</span>
              <input required name="pickupAddress" type="text" placeholder="House, building, area, landmark" />
            </label>
            <label>
              <span>To</span>
              <input required name="to" type="text" placeholder="Destination city or address" />
            </label>
            <label>
              <span>
                Seats <em>max 7 only</em>
              </span>
              <input required name="seats" type="number" inputMode="numeric" min={1} max={7} defaultValue={1} />
            </label>
            <label>
              <span>Name</span>
              <input required name="name" type="text" placeholder="Customer name" />
            </label>
            <label>
              <span>Mobile number</span>
              <input required name="mobile" type="tel" inputMode="tel" pattern="[0-9 +()-]{8,}" placeholder="+91 98765 43210" />
            </label>
            <label className="wide">
              <span>Notes</span>
              <textarea name="notes" rows={3} placeholder="Pickup time, luggage, return trip, or other details" />
            </label>
            <button className="primary wide" type="submit">
              <CheckCircle2 size={18} />
              Request booking
            </button>
          </form>
        )}
      </div>

      <aside className="qr-panel">
        <div className="section-title compact">
          <p>Scan link</p>
          <h2>Customer booking QR</h2>
        </div>
        {qrUrl ? <img className="qr" src={qrUrl} alt="QR code for booking link" /> : <div className="qr loading" />}
        <a className="link-copy" href={bookingLink()}>
          {bookingLink()}
        </a>
      </aside>
    </section>
  );
}

function BookingSuccess({ booking, onBookAnother }: { booking: Booking; onBookAnother: () => void }) {
  return (
    <div className="success-panel">
      <div className="success-icon">
        <CheckCircle2 size={32} />
      </div>
      <h2>Booking request received</h2>
      <p>Thank you, {booking.name}. Your request is saved and the owner will call you to confirm availability.</p>
      <dl className="success-details">
        <div>
          <dt>Reference</dt>
          <dd>{booking.id.slice(-8).toUpperCase()}</dd>
        </div>
        <div>
          <dt>Dates</dt>
          <dd>
            {prettyDate(booking.startDate)} - {prettyDate(booking.endDate)}
          </dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {booking.from} to {booking.to}
          </dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{booking.pickupAddress}</dd>
        </div>
        <div>
          <dt>Seats</dt>
          <dd>{booking.seats}</dd>
        </div>
        <div>
          <dt>Mobile</dt>
          <dd>{booking.mobile}</dd>
        </div>
      </dl>
      <button className="secondary" type="button" onClick={onBookAnother}>
        <Plus size={17} />
        Book another trip
      </button>
    </div>
  );
}

function AdminView({
  bookings,
  sortedBookings,
  countByStatus,
  pendingCount,
  totalPaid,
  monthCursor,
  onMonthChange,
  onAccept,
  onComplete,
  onDelete,
  onSeed,
  onLogout,
}: {
  bookings: Booking[];
  sortedBookings: Booking[];
  countByStatus: (status: BookingStatus) => number;
  pendingCount: number;
  totalPaid: number;
  monthCursor: Date;
  onMonthChange: (date: Date) => void;
  onAccept: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSeed: () => void;
  onLogout: () => void;
}) {
  const completedBookings = [...bookings]
    .filter((booking) => booking.status === "completed")
    .sort((a, b) => String(b.completedAt || b.endDate).localeCompare(String(a.completedAt || a.endDate)));
  const totalKm = completedBookings.reduce((sum, booking) => sum + parseKm(booking.finalKm), 0);
  const averagePaid = completedBookings.length ? totalPaid / completedBookings.length : 0;

  return (
    <section className="admin-layout">
      <div className="admin-head">
        <div className="section-title">
          <p>Owner view</p>
          <h1>Bookings and travel calendar</h1>
        </div>
        <div className="owner-actions">
          {pendingCount ? (
            <span className="notification-pill">
              {pendingCount} new {pendingCount === 1 ? "request" : "requests"} awaiting action
            </span>
          ) : (
            <span className="notification-pill quiet">No pending requests</span>
          )}
          <a className="secondary" href={bookingLink()}>
            <QrCode size={17} />
            Open booking link
          </a>
          <a className="secondary" href={adminLink()}>
            <CalendarDays size={17} />
            Owner link
          </a>
          <button className="secondary" type="button" onClick={onLogout}>
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </div>

      <div className="stats-row">
        <Stat label="Pending" value={countByStatus("pending")} />
        <Stat label="Accepted" value={countByStatus("accepted")} />
        <Stat label="Completed" value={countByStatus("completed")} />
        <Stat label="Paid" value={formatMoney(totalPaid)} />
      </div>

      <div className="owner-grid">
        <section className="list-panel">
          <div className="panel-head">
            <h2>All bookings</h2>
            <button className="text-button" type="button" onClick={onSeed}>
              <Plus size={16} />
              Add sample
            </button>
          </div>
          <div className="booking-list">
            {sortedBookings.length ? (
              sortedBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onAccept={onAccept}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <div className="empty">
                <h3>No bookings yet</h3>
                <p>Share the QR code or booking link with customers and requests will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <section className="calendar-panel">
          <CalendarPanel
            bookings={bookings}
            monthCursor={monthCursor}
            onMonthChange={(amount) => onMonthChange(addMonths(monthCursor, amount))}
          />
        </section>
      </div>

      <div className="finance-grid">
        <section className="finance-panel">
          <div className="panel-head">
            <h2>Financial details</h2>
            <WalletCards size={20} />
          </div>
          <div className="metric-list">
            <Metric label="Total received" value={formatMoney(totalPaid)} />
            <Metric label="Completed trips" value={completedBookings.length} />
            <Metric label="Average per trip" value={formatMoney(averagePaid)} />
            <Metric label="Total km recorded" value={`${totalKm.toLocaleString("en-IN")} km`} />
          </div>
        </section>

        <section className="history-panel">
          <div className="panel-head">
            <h2>Transaction history</h2>
            <ReceiptText size={20} />
          </div>
          {completedBookings.length ? (
            <TransactionHistory bookings={completedBookings} />
          ) : (
            <div className="empty compact-empty">
              <h3>No payments yet</h3>
              <p>Finished trips with amount paid will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function TransactionHistory({ bookings }: { bookings: Booking[] }) {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      const date = transactionDate(booking);
      const searchable = `${booking.name} ${booking.mobile} ${booking.from} ${booking.to} ${booking.pickupAddress}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesFrom = !dateFrom || date >= dateFrom;
      const matchesTo = !dateTo || date <= dateTo;
      const matchesAmount = !minAmount || Number(booking.amountPaid || 0) >= Number(minAmount);
      return matchesQuery && matchesFrom && matchesTo && matchesAmount;
    });
  }, [bookings, dateFrom, dateTo, minAmount, query]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleBookings = filteredBookings.slice(pageStart, pageStart + pageSize);
  const filteredTotal = filteredBookings.reduce((sum, booking) => sum + Number(booking.amountPaid || 0), 0);

  function updateFilter(callback: () => void) {
    callback();
    setPage(1);
  }

  function resetFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setPageSize(5);
    setPage(1);
  }

  function exportCsv() {
    const header = ["Date", "Customer", "Mobile", "From", "To", "Pickup", "KM", "Amount"];
    const rows = filteredBookings.map((booking) => [
      transactionDate(booking),
      booking.name,
      booking.mobile,
      booking.from,
      booking.to,
      booking.pickupAddress,
      booking.finalKm || "0",
      String(booking.amountPaid || 0),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `travel-transactions-${toISODate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="history-summary">
        <Metric label="Filtered transactions" value={filteredBookings.length} />
        <Metric label="Filtered amount" value={formatMoney(filteredTotal)} />
      </div>

      <div className="history-filters">
        <label>
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => updateFilter(() => setQuery(event.target.value))}
            type="search"
            placeholder="Name, mobile, route"
          />
        </label>
        <label>
          <span>From date</span>
          <input value={dateFrom} onChange={(event) => updateFilter(() => setDateFrom(event.target.value))} type="date" />
        </label>
        <label>
          <span>To date</span>
          <input value={dateTo} onChange={(event) => updateFilter(() => setDateTo(event.target.value))} type="date" />
        </label>
        <label>
          <span>Min amount</span>
          <input
            value={minAmount}
            onChange={(event) => updateFilter(() => setMinAmount(event.target.value))}
            type="number"
            min={0}
            placeholder="0"
          />
        </label>
        <label>
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => updateFilter(() => setPageSize(Number(event.target.value)))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </label>
        <div className="filter-actions">
          <button className="secondary small" type="button" onClick={resetFilters}>
            Reset
          </button>
          <button className="secondary small" type="button" onClick={exportCsv} disabled={!filteredBookings.length}>
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {visibleBookings.length ? (
        <div className="table-wrap">
          <table className="transaction-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Route</th>
                <th>KM</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleBookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{prettyDate(transactionDate(booking))}</td>
                  <td>
                    <strong>{booking.name}</strong>
                    <span>{booking.mobile}</span>
                  </td>
                  <td>
                    {booking.from} to {booking.to}
                    <span>{booking.pickupAddress}</span>
                  </td>
                  <td>{booking.finalKm || "0"}</td>
                  <td>{formatMoney(booking.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty compact-empty">
          <h3>No matching transactions</h3>
          <p>Adjust the filters to see more completed trips.</p>
        </div>
      )}

      <div className="pagination-row">
        <span>
          Showing {filteredBookings.length ? pageStart + 1 : 0}-{Math.min(pageStart + pageSize, filteredBookings.length)} of{" "}
          {filteredBookings.length}
        </span>
        <div>
          <button className="secondary small" type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <strong>
            {currentPage} / {totalPages}
          </strong>
          <button
            className="secondary small"
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function BookingCard({
  booking,
  onAccept,
  onComplete,
  onDelete,
}: {
  booking: Booking;
  onAccept: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const duration = daysBetween(booking.startDate, booking.endDate);

  return (
    <article className={`booking-card status-${booking.status}`}>
      <div className="card-top">
        <div>
          <h3>{booking.name}</h3>
          <p>{booking.mobile}</p>
        </div>
        <span className="pill">{statusLabels[booking.status]}</span>
      </div>
      <div className="route">
        <span>{booking.from}</span>
        <strong>→</strong>
        <span>{booking.to}</span>
      </div>
      <dl className="details">
        <div>
          <dt>Dates</dt>
          <dd>
            {prettyDate(booking.startDate)} - {prettyDate(booking.endDate)}
          </dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{booking.pickupAddress || booking.from}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>
            {duration} {duration === 1 ? "day" : "days"}
          </dd>
        </div>
        <div>
          <dt>Seats</dt>
          <dd>{booking.seats || 1}</dd>
        </div>
        {booking.notes ? (
          <div>
            <dt>Notes</dt>
            <dd>{booking.notes}</dd>
          </div>
        ) : null}
        {booking.status === "completed" ? (
          <div>
            <dt>Final</dt>
            <dd>
              {booking.finalKm} km, {formatMoney(booking.amountPaid)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="card-actions">
        {booking.status === "pending" ? (
          <button className="primary small" type="button" onClick={() => onAccept(booking.id)}>
            <CheckCircle2 size={16} />
            Accept
          </button>
        ) : null}
        {booking.status !== "completed" ? (
          <button className="secondary small" type="button" onClick={() => onComplete(booking.id)}>
            <IndianRupee size={16} />
            Finish trip
          </button>
        ) : null}
        <button className="danger small" type="button" onClick={() => onDelete(booking.id)}>
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </article>
  );
}

function CalendarPanel({
  bookings,
  monthCursor,
  onMonthChange,
}: {
  bookings: Booking[];
  monthCursor: Date;
  onMonthChange: (amount: number) => void;
}) {
  const monthName = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(monthCursor);
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const cells: JSX.Element[] = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(<div className="day muted" key={`empty-${i}`} />);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toISODate(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
    const dayBookings = bookings.filter((booking) => dateInRange(iso, booking.startDate, booking.endDate));
    cells.push(
      <div className="day" key={iso}>
        <strong>{day}</strong>
        {dayBookings.slice(0, 3).map((booking) => (
          <span className={`event ${booking.status}`} key={booking.id}>
            {booking.name}
          </span>
        ))}
        {dayBookings.length > 3 ? <small>+{dayBookings.length - 3} more</small> : null}
      </div>
    );
  }

  return (
    <>
      <div className="calendar-head">
        <button className="icon-button" type="button" onClick={() => onMonthChange(-1)} aria-label="Previous month">
          <ChevronLeft size={22} />
        </button>
        <h2>{monthName}</h2>
        <button className="icon-button" type="button" onClick={() => onMonthChange(1)} aria-label="Next month">
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="weekday-row">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid">{cells}</div>
      <div className="calendar-legend">
        <span className="legend pending" />
        Pending
        <span className="legend accepted" />
        Accepted
        <span className="legend completed" />
        Completed
      </div>
    </>
  );
}
