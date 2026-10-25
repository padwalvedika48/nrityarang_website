// Nrityarang Admin Panel
// Protected admin management console for Nrityarang Event Bookings

const API_BASE_URL =
  window.NRITYARANG_API_URL ||
  "https://nrityarang-event-booking.onrender.com";

const $ = (id) => document.getElementById(id);

// ------------------- AUDITORIUM CONFIGURATION -------------------
// Prabodhankar Thackeray Auditorium Specs: Total Bookable Capacity = 941 Seats
const TOTAL_HALL_CAPACITY = 941;
const BLOCKED_ROWS = ["A", "B", "C"]; // VIP & Organizer reserved rows (85 seats)
const TOTAL_BLOCKED_SEATS = 85; // A: 27, B: 28, C: 30

const ROW_SPECS = [
  // TOP TIER (BALCONY - 308 Seats)
  { label: "CC", left: 10, center: 18, right: 10 },
  { label: "BB", left: 10, center: 19, right: 10 },
  { label: "AA", left: 10, center: 18, right: 10 },
  { label: "Z",  left: 10, center: 19, right: 10 },
  { label: "Y",  left: 10, center: 18, right: 10 },
  { label: "X",  left: 10, center: 19, right: 10 },
  { label: "W",  left: 10, center: 18, right: 10 },
  { label: "V",  left: 10, center: 19, right: 10 },

  // MIDDLE TIER (307 Seats)
  { label: "U", left: 12, center: 12, right: 12 },
  { label: "T", left: 13, center: 13, right: 13 },
  { label: "S", left: 13, center: 12, right: 13 },
  { label: "R", left: 13, center: 13, right: 13 },
  { label: "Q", left: 13, center: 12, right: 13 },
  { label: "P", left: 13, center: 13, right: 13 },
  { label: "O", left: 13, center: 12, right: 13 },
  { label: "N", left: 13, center: 13, right: 13 },

  // BOTTOM TIER / STALLS (383 Seats)
  { label: "M", left: 13, center: 12, right: 13 },
  { label: "L", left: 13, center: 13, right: 13 },
  { label: "K", left: 13, center: 12, right: 13 },
  { label: "J", left: 13, center: 13, right: 13 },
  { label: "H", left: 13, center: 12, right: 13 },
  { label: "G", left: 12, center: 13, right: 12 },
  { label: "F", left: 12, center: 12, right: 11 },
  { label: "E", left: 10, center: 13, right: 10 },
  { label: "D", left: 9,  center: 12, right: 9  },
  { label: "C", left: 9,  center: 13, right: 8  }, // Blocked (30)
  { label: "B", left: 8,  center: 12, right: 8  }, // Blocked (28)
  { label: "A", left: 7,  center: 13, right: 7  }  // Blocked (27)
];

// In-memory admin authentication state
let adminToken = null;
let currentSection = "overview";
let cachedSeatsList = [];

const loginPage = $("loginPage");
const dashboardPage = $("dashboardPage");
const loginForm = $("loginForm");
const loginButton = $("loginButton");
const loginMessage = $("loginMessage");
const dashboardMessage = $("dashboardMessage");

let isDemoMode = false;

// Sample confirmed event bookings for offline preview
const ALL_5_BRANCHES = [
  "Borivali (East)",
  "Dahisar (West)",
  "Dahisar (East)",
  "Goregaon (West)",
  "Nalasopara"
];

// Confirmed event bookings cache (starts empty until real customer bookings occur)
const SAMPLE_BOOKINGS = [];

function enterDemoMode() {
  isDemoMode = true;
  loginPage.hidden = true;
  dashboardPage.hidden = false;
  showMessage(dashboardMessage, "Signed in successfully.");
  showSection("overview").catch(() => {});
}

// Auto-activate demo mode if opened with ?preview=true or ?demo=true in URL
if (
  window.location.search.includes("preview=true") ||
  window.location.search.includes("demo=true") ||
  window.location.hash.includes("preview")
) {
  enterDemoMode();
}

function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#c34452" : "";
}

function normalizeSeatId(seat) {
  if (!seat || typeof seat !== "string") return "";
  return seat.trim().toUpperCase();
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers
  };

  let body = options.body;
  if (
    body &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams)
  ) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  } else if (body) {
    headers["Content-Type"] = "application/json";
  }

  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body,
    credentials: "include"
  });

  if (!response.ok) {
    let errorMessage = `Request failed (HTTP ${response.status}).`;
    try {
      const errData = await response.json();
      if (errData && errData.error) {
        errorMessage = errData.error;
      } else if (errData && errData.message) {
        errorMessage = errData.message;
      }
    } catch (_) {
      if (response.status === 401) {
        errorMessage = "Your session has expired or you are not authenticated.";
      } else if (response.status === 403) {
        errorMessage = "You are not authorized to perform this action.";
      }
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) return null;

  return response.json();
}

// ---------------- LOGIN ----------------

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    showMessage(loginMessage, "Enter your email and password.", true);
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  showMessage(loginMessage, "");

  try {
    let result = null;
    try {
      result = await apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
    } catch (netErr) {
      // Offline fallback: allow local sign-in with master password if backend server is not running
      const validPasswords = ["nrityarang2026", "admin", "admin123"];
      if (validPasswords.includes(password.trim())) {
        result = { token: "admin-session-" + Date.now() };
        isDemoMode = true;
      } else {
        throw netErr;
      }
    }

    if (typeof result?.token !== "string" || !result.token) {
      throw new Error(
        "Invalid email or password."
      );
    }

    adminToken = result.token;

    loginPage.hidden = true;
    dashboardPage.hidden = false;

    showMessage(dashboardMessage, "Signed in successfully. Loading event data…");

    await showSection("overview");
  } catch (error) {
    adminToken = null;

    showMessage(
      loginMessage,
      error.message.includes("Failed to fetch")
        ? "Cannot reach the backend. Check the API URL or sign in with your administrator password."
        : error.message,
      true
    );
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
    $("password").value = "";
  }
});

// ---------------- NAVIGATION ----------------

async function showSection(section) {
  currentSection = section;

  $("overviewSection").hidden = section !== "overview";
  $("bookingsSection").hidden = section !== "bookings";
  $("seatsSection").hidden = section !== "seats";
  if ($("eventSection")) $("eventSection").hidden = section !== "event";
  if ($("enquiriesSection")) $("enquiriesSection").hidden = section !== "enquiries";

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  const titles = {
    overview: "Dashboard overview",
    bookings: "Booking management",
    seats: "Seat management",
    event: "Event details & timing",
    enquiries: "Student admission enquiries"
  };

  $("pageTitle").textContent = titles[section] || "Dashboard";

  if (section === "overview") await loadDashboard();
  if (section === "bookings") await loadBookings();
  if (section === "seats") await loadSeats();
  if (section === "event") await loadEventSettings();
  if (section === "enquiries") await loadEnquiries();
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section).catch(handleLoadError);
  });
});

// ---------------- DASHBOARD ----------------

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent =
    value === null || value === undefined ? "—" : String(value);
}

async function loadDashboard() {
  showMessage(dashboardMessage, "Loading dashboard information…");

  try {
    let dashboardData = {};
    let liveBookedSeats = [];
    let bookingsList = [];

    // 1. Fetch dashboard data from backend
    try {
      const res = await apiRequest("/api/admin/dashboard");
      if (res && typeof res === "object") {
        dashboardData = res;
      }
    } catch (err) {
      console.warn("Direct /api/admin/dashboard load notice:", err.message);
    }

    // 2. Fallback / Live Sync: Fetch /api/booked-seats (confirmed bookings source of truth)
    try {
      const seatRes = await fetch(`${API_BASE_URL}/api/booked-seats`, {
        headers: { Accept: "application/json" }
      });
      if (seatRes.ok) {
        const json = await seatRes.json();
        if (Array.isArray(json)) {
          liveBookedSeats = json.map(normalizeSeatId).filter(Boolean);
        } else if (json && Array.isArray(json.bookedSeats)) {
          liveBookedSeats = json.bookedSeats.map(normalizeSeatId).filter(Boolean);
        } else if (json && Array.isArray(json.seats)) {
          liveBookedSeats = json.seats.map(normalizeSeatId).filter(Boolean);
        }
      }
    } catch (err) {
      console.warn("Could not query /api/booked-seats:", err.message);
    }

    // 3. Fallback / Live Sync: Fetch /api/admin/bookings for bookings count and revenue if needed
    if (!dashboardData.recentBookings || dashboardData.totalBookings === undefined) {
      try {
        const bRes = await apiRequest("/api/admin/bookings");
        bookingsList = Array.isArray(bRes) ? bRes : (bRes?.bookings || []);
      } catch (err) {
        console.warn("Could not load bookings list:", err.message);
      }
    }

    // --- Compute Total Bookings ---
    const totalBookings =
      dashboardData.totalBookings ??
      dashboardData.total_bookings ??
      dashboardData.bookingsCount ??
      (bookingsList.length > 0 ? bookingsList.length : (dashboardData.recentBookings ? dashboardData.recentBookings.length : 0));

    // --- Compute Seats Booked ---
    let bookedCount = 0;
    if (dashboardData.totalSeatsBooked !== undefined && !isNaN(Number(dashboardData.totalSeatsBooked))) {
      bookedCount = Number(dashboardData.totalSeatsBooked);
    } else if (dashboardData.bookedSeats !== undefined) {
      bookedCount = Array.isArray(dashboardData.bookedSeats)
        ? dashboardData.bookedSeats.length
        : Number(dashboardData.bookedSeats);
    } else if (dashboardData.booked_seats !== undefined) {
      bookedCount = Array.isArray(dashboardData.booked_seats)
        ? dashboardData.booked_seats.length
        : Number(dashboardData.booked_seats);
    } else if (dashboardData.seats_booked !== undefined) {
      bookedCount = Number(dashboardData.seats_booked);
    } else if (liveBookedSeats.length > 0) {
      bookedCount = liveBookedSeats.length;
    } else if (bookingsList.length > 0) {
      const seatSet = new Set();
      bookingsList.forEach((b) => {
        const rawSeats = b.seats;
        const sArr = Array.isArray(rawSeats)
          ? rawSeats
          : (typeof rawSeats === "string" ? rawSeats.split(",") : []);
        sArr.forEach((s) => {
          const norm = normalizeSeatId(s);
          if (norm) seatSet.add(norm);
        });
      });
      bookedCount = seatSet.size;
    }

    // Strictly real bookings - no fake example bookings
    if (!bookingsList || !Array.isArray(bookingsList)) {
      bookingsList = [];
    }
    if (!totalBookings) {
      totalBookings = bookingsList.length;
    }
    if (bookedCount === undefined) {
      bookedCount = liveBookedSeats.length || 0;
    }

    // --- Compute Blocked Seats (VIP Rows A, B, C = 85 seats) ---
    const blockedCount =
      dashboardData.blockedSeats !== undefined
        ? (Array.isArray(dashboardData.blockedSeats) ? dashboardData.blockedSeats.length : Number(dashboardData.blockedSeats))
        : (dashboardData.blocked_seats !== undefined
            ? (Array.isArray(dashboardData.blocked_seats) ? dashboardData.blocked_seats.length : Number(dashboardData.blocked_seats))
            : TOTAL_BLOCKED_SEATS);

    // --- Compute Total Hall Capacity (941 Bookable Seats) ---
    const totalCapacity =
      dashboardData.totalSeats !== undefined
        ? Number(dashboardData.totalSeats)
        : (dashboardData.total_seats !== undefined
            ? Number(dashboardData.total_seats)
            : (dashboardData.capacity ? Number(dashboardData.capacity) : TOTAL_HALL_CAPACITY));

    // --- Compute Available Seats (941 Capacity - Booked) ---
    const availableCount =
      dashboardData.availableSeats !== undefined
        ? Number(dashboardData.availableSeats)
        : (dashboardData.available_seats !== undefined
            ? Number(dashboardData.available_seats)
            : Math.max(0, totalCapacity - (Number(bookedCount) || 0)));

    // --- Compute Verified Revenue ---
    let totalRevenue =
      dashboardData.totalRevenue ??
      dashboardData.total_revenue ??
      dashboardData.revenue;

    if (totalRevenue === undefined && bookingsList.length > 0) {
      totalRevenue = bookingsList.reduce((acc, b) => {
        const amt = Number(b.amount || b.total || 0);
        const status = String(b.paymentStatus || b.payment_status || "paid").toLowerCase();
        return status === "paid" || status === "success" || status === "confirmed" ? acc + amt : acc;
      }, 0);
    }

    // Update UI Cards
    setText("totalHallSeats", totalCapacity);
    setText("totalSeats", bookedCount); // "Seats booked"
    setText("blockedSeats", blockedCount);
    setText("availableSeats", availableCount);
    setText("totalBookings", totalBookings ?? "0");
    setText(
      "totalRevenue",
      totalRevenue === undefined ? "—" : formatCurrency(totalRevenue)
    );

    const recent = dashboardData.recentBookings || bookingsList.slice(0, 5);
    renderRecentBookings(recent || []);
    renderBranchLeaderboard(bookingsList || []);

    // Update active performance schedule widget on Overview
    const currentEvt = getLocalEventDetails();
    const ovEvt = $("overviewEventDisplay");
    if (ovEvt) {
      ovEvt.textContent = `${currentEvt.eventName} · ${currentEvt.eventDateTimeDisplay || currentEvt.eventDate}`;
    }
    const ovVen = $("overviewVenueDisplay");
    if (ovVen) {
      ovVen.textContent = currentEvt.venue || currentEvt.venueAddress;
    }
    updateBookingUI(currentEvt.isBookingEnabled !== false);

    // Update student enquiries overview summary
    const ovEnq = $("overviewEnquiriesSummary");
    if (ovEnq) {
      try {
        let stored = localStorage.getItem(ENQUIRIES_STORAGE_KEY);
        let list = stored ? JSON.parse(stored) : [];
        if (Array.isArray(list) && list.length > 0) {
          const total = list.length;
          const pending = list.filter(e => (e.status || "New").toLowerCase() === "new").length;
          const wa = list.filter(e => (e.mode || "").toLowerCase().includes("whatsapp")).length;
          const em = list.filter(e => (e.mode || "").toLowerCase().includes("email")).length;
          ovEnq.textContent = `${total} student lead${total === 1 ? '' : 's'} (${pending} new pending, ${wa} via WhatsApp, ${em} via Email)`;
        } else {
          ovEnq.textContent = "0 enquiries received yet · Live sync active for WhatsApp, Email & Website leads";
        }
      } catch (_) {}
    }

    showMessage(dashboardMessage, "Dashboard data updated successfully.");
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
    throw error;
  }
}

// ---------------- BRANCH ANALYTICS (OPTION 6) ----------------

function normalizeBranchName(raw) {
  if (!raw || typeof raw !== "string") return "Borivali (East)";
  const s = raw.toLowerCase().trim();
  if (s.includes("borivali")) return "Borivali (East)";
  if (s.includes("dahisar") && s.includes("west")) return "Dahisar (West)";
  if (s.includes("dahisar") && s.includes("east")) return "Dahisar (East)";
  if (s.includes("goregaon")) return "Goregaon (West)";
  if (s.includes("nalasopara") || s.includes("sopara")) return "Nalasopara";
  return raw || "Borivali (East)";
}

function renderBranchLeaderboard(bookings) {
  const grid = $("branchCardsGrid");
  const barsContainer = $("branchBarsContainer");
  const topBadge = $("topBranchBadge");
  if (!grid || !barsContainer) return;

  grid.replaceChildren();
  barsContainer.replaceChildren();

  // Aggregate stats across all 5 Mumbai branches
  const stats = {
    "Borivali (East)": { seats: 0, revenue: 0, orders: 0 },
    "Dahisar (West)": { seats: 0, revenue: 0, orders: 0 },
    "Dahisar (East)": { seats: 0, revenue: 0, orders: 0 },
    "Goregaon (West)": { seats: 0, revenue: 0, orders: 0 },
    "Nalasopara": { seats: 0, revenue: 0, orders: 0 }
  };

  const list = Array.isArray(bookings) ? bookings : [];

  let totalTicketsCount = 0;

  list.forEach((b) => {
    const rawBranch = b.branch || b.branchName || b.selectedBranch || b.academyBranch;
    const branchName = normalizeBranchName(rawBranch);

    const sArr = Array.isArray(b.seats)
      ? b.seats
      : (typeof b.seats === "string" ? b.seats.split(",") : []);
    const seatCount = sArr.length || 1;
    const amt = Number(b.amount || b.total || 0);

    if (stats[branchName]) {
      stats[branchName].seats += seatCount;
      stats[branchName].revenue += amt;
      stats[branchName].orders += 1;
    } else {
      stats["Borivali (East)"].seats += seatCount;
      stats["Borivali (East)"].revenue += amt;
      stats["Borivali (East)"].orders += 1;
    }

    totalTicketsCount += seatCount;
  });

  // Convert to sorted array (Rank 1 to 5)
  const sortedBranches = Object.entries(stats).map(([name, data]) => ({
    name,
    seats: data.seats,
    revenue: data.revenue,
    orders: data.orders,
    share: totalTicketsCount > 0 ? Math.round((data.seats / totalTicketsCount) * 100) : 0
  })).sort((a, b) => b.seats - a.seats || b.revenue - a.revenue);

  // Update top branch badge
  if (topBadge) {
    if (totalTicketsCount > 0 && sortedBranches.length > 0) {
      topBadge.textContent = `🥇 Leading: ${sortedBranches[0].name} (${sortedBranches[0].seats} Seats · ${formatCurrency(sortedBranches[0].revenue)})`;
    } else {
      topBadge.textContent = "📊 Branch Attendance: Awaiting first booking";
    }
  }

  const rankBadges = ["🥇", "🥈", "🥉", "4th", "5th"];
  const rankColors = ["#b7791f", "#4a5568", "#9c4221", "#6b46c1", "#2b6cb0"];

  // 1. Render Branch Cards
  sortedBranches.forEach((br, idx) => {
    const card = document.createElement("div");
    card.style.background = "#ffffff";
    card.style.border = idx === 0 ? "2px solid #ecc94b" : "1px solid #ebdff5";
    card.style.borderRadius = "12px";
    card.style.padding = "16px";
    card.style.boxShadow = idx === 0 ? "0 4px 14px rgba(236, 201, 75, 0.22)" : "0 2px 8px rgba(0,0,0,0.03)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "6px";

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; font-weight: 700; background: ${idx === 0 ? "#fefcbf" : "#edf2f7"}; color: ${rankColors[idx]}; padding: 2px 8px; border-radius: 10px;">
          ${rankBadges[idx]} Rank #${idx + 1}
        </span>
        <span style="font-size: 11.5px; font-weight: 700; color: var(--purple, #7434db);">${br.share}%</span>
      </div>
      <strong style="font-size: 14px; color: #1a202c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
        ${br.name}
      </strong>
      <div style="display: flex; align-items: baseline; gap: 6px; margin: 2px 0;">
        <span style="font-size: 22px; font-weight: 800; color: #2d3748;">${br.seats}</span>
        <small style="font-size: 12px; color: var(--muted, #666);">tickets</small>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: #718096; border-top: 1px dashed #e2e8f0; padding-top: 6px; margin-top: 2px;">
        <span>${br.orders} orders</span>
        <strong style="color: #27865d;">${formatCurrency(br.revenue)}</strong>
      </div>
    `;

    grid.append(card);
  });

  // 2. Render Comparative Progress Bars
  sortedBranches.forEach((br, idx) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.gap = "4px";

    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; color: #2d3748;">
        <span>${rankBadges[idx]} ${br.name}</span>
        <span>${br.seats} seats · ${formatCurrency(br.revenue)} (${br.share}%)</span>
      </div>
      <div style="height: 10px; width: 100%; background: #e2e8f0; border-radius: 5px; overflow: hidden;">
        <div style="height: 100%; width: ${Math.max(4, br.share)}%; background: ${idx === 0 ? "linear-gradient(90deg, #d69e2e, #ecc94b)" : "linear-gradient(90deg, var(--purple, #7434db), #9f7aea)"}; border-radius: 5px; transition: width 0.5s ease;"></div>
      </div>
    `;

    barsContainer.append(row);
  });
}

// ---------------- ONE-CLICK RESEND TICKET PASS (OPTION 5) ----------------

function generateTicketShareMessage(booking) {
  const currentEvt = getLocalEventDetails();
  const name = booking.customerName || booking.name || booking.buyer_name || "Valued Attendee";
  const id = booking.id || booking.booking_id || "NK-Ticket";
  const branch = normalizeBranchName(booking.branch || booking.selectedBranch || booking.academyBranch);
  const seats = Array.isArray(booking.seats)
    ? booking.seats.join(", ")
    : (booking.seats || "N/A");
  const eventName = currentEvt.eventName || "Nrityarang 2026";
  const dateTime = currentEvt.eventDateTimeDisplay || "September 6, 2026, 7:00 PM";
  const venue = currentEvt.venue || "Prabodhankar Thackeray Auditorium, Borivali West, Mumbai";

  return `*Namaste ${name}!* 🙏\n\nHere are your confirmed ticket details for *${eventName}* (Nrityanand Kathak Vidyalaya):\n\n🎫 *Booking ID:* ${id}\n🏛️ *Branch:* ${branch}\n🪑 *Assigned Seats:* ${seats}\n📅 *Date & Time:* ${dateTime}\n📍 *Venue:* ${venue}\n\n_Please show this booking confirmation at the auditorium entry gate. Thank you for celebrating Kathak with us!_ ✨`;
}

function buildResendActionCell(booking) {
  const td = document.createElement("td");
  td.style.whiteSpace = "nowrap";

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "6px";

  const rawPhone = String(booking.phone || booking.buyer_phone || "").replace(/\D/g, "");
  const cleanPhone = rawPhone.length === 10 ? "91" + rawPhone : rawPhone;
  const shareText = generateTicketShareMessage(booking);

  // 1. WhatsApp Button
  const waBtn = document.createElement("button");
  waBtn.type = "button";
  waBtn.title = "Send ticket pass via WhatsApp";
  waBtn.style.background = "#25D366";
  waBtn.style.color = "#ffffff";
  waBtn.style.border = "none";
  waBtn.style.borderRadius = "6px";
  waBtn.style.padding = "5px 10px";
  waBtn.style.fontSize = "11.5px";
  waBtn.style.fontWeight = "700";
  waBtn.style.cursor = "pointer";
  waBtn.style.display = "inline-flex";
  waBtn.style.alignItems = "center";
  waBtn.style.gap = "4px";
  waBtn.innerHTML = `<span>💬</span> WhatsApp`;

  waBtn.addEventListener("click", () => {
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, "_blank");
  });

  // 2. Copy Ticket Text Button
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.title = "Copy ticket details to clipboard";
  copyBtn.style.background = "#f0ebf8";
  copyBtn.style.color = "var(--purple-dark, #4b2678)";
  copyBtn.style.border = "1px solid #dcd3e6";
  copyBtn.style.borderRadius = "6px";
  copyBtn.style.padding = "5px 8px";
  copyBtn.style.fontSize = "11.5px";
  copyBtn.style.fontWeight = "600";
  copyBtn.style.cursor = "pointer";
  copyBtn.innerHTML = `📋 Copy`;

  copyBtn.addEventListener("click", () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = "✓ Copied";
        setTimeout(() => {
          copyBtn.innerHTML = orig;
        }, 2000);
      });
    } else {
      prompt("Copy ticket details below:", shareText);
    }
  });

  // 3. Email Button (if email is present)
  const email = booking.email || booking.buyer_email;
  if (email) {
    const emailBtn = document.createElement("a");
    emailBtn.title = "Send ticket pass via Email";
    emailBtn.style.background = "#eef2f7";
    emailBtn.style.color = "#2d3748";
    emailBtn.style.border = "1px solid #cbd5e0";
    emailBtn.style.borderRadius = "6px";
    emailBtn.style.padding = "5px 8px";
    emailBtn.style.fontSize = "11.5px";
    emailBtn.style.fontWeight = "600";
    emailBtn.style.textDecoration = "none";
    emailBtn.style.display = "inline-flex";
    emailBtn.style.alignItems = "center";
    emailBtn.innerHTML = `✉️ Email`;
    emailBtn.href = `mailto:${email}?subject=${encodeURIComponent(
      "Your Nrityarang 2026 Ticket Confirmation (" + (booking.id || "Ticket") + ")"
    )}&body=${encodeURIComponent(shareText)}`;
    wrap.append(emailBtn);
  }

  wrap.prepend(copyBtn);
  wrap.prepend(waBtn);
  td.append(wrap);
  return td;
}

// ---------------- BOOKINGS DATA MANAGEMENT ----------------

let allLoadedBookingsCache = [];

async function loadBookings() {
  try {
    let bookings = [];

    if (!isDemoMode) {
      try {
        const result = await apiRequest("/api/admin/bookings");
        bookings = Array.isArray(result) ? result : (result?.bookings || []);
      } catch (err) {
        console.warn("Could not load backend bookings, falling back to sample list:", err.message);
      }
    }

    bookings = Array.isArray(bookings) ? bookings : [];

    allLoadedBookingsCache = bookings;

    renderRecentBookings(bookings.slice(0, 5));
    renderBranchLeaderboard(bookings);
    filterAndRenderAllBookings();
    showMessage(dashboardMessage, `${bookings.length} booking records loaded.`);
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
    throw error;
  }
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent =
    text === null || text === undefined ? "—" : String(text);
  return td;
}

function renderRecentBookings(bookings) {
  const tbody = $("recentBookings");
  if (!tbody) return;
  tbody.replaceChildren();

  if (!bookings || !bookings.length) {
    const row = document.createElement("tr");
    const td = cell("No booking records available.");
    td.colSpan = 6;
    td.className = "empty-state";
    row.append(td);
    tbody.append(row);
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement("tr");
    const branchName = normalizeBranchName(booking.branch || booking.selectedBranch || booking.academyBranch);

    const branchTd = cell(branchName);
    branchTd.innerHTML = `<span style="font-size: 11px; font-weight: 700; background: #f3e8ff; color: #6b21a8; padding: 3px 8px; border-radius: 10px; border: 1px solid #e9d5ff;">${branchName}</span>`;

    row.append(
      cell(booking.id ?? booking.booking_id ?? booking._id),
      cell(booking.customerName ?? booking.name ?? booking.buyer_name),
      branchTd,
      cell(Array.isArray(booking.seats)
        ? booking.seats.join(", ")
        : (booking.seats || "—")),
      cell(
        booking.amount === undefined && booking.total === undefined
          ? "—"
          : formatCurrency(booking.amount ?? booking.total)
      ),
      buildResendActionCell(booking)
    );

    tbody.append(row);
  });
}

function filterAndRenderAllBookings() {
  const tbody = $("allBookings");
  if (!tbody) return;
  tbody.replaceChildren();

  const searchVal = ($("bookingSearchInput")?.value || "").toLowerCase().trim();
  const branchVal = $("bookingBranchFilter")?.value || "all";

  const list = Array.isArray(allLoadedBookingsCache) ? allLoadedBookingsCache : [];

  if (!list.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty-state";
    td.innerHTML = `
      <div style="padding: 32px 10px; text-align: center; color: var(--muted);">
        <div style="font-size: 32px; margin-bottom: 6px;">🎟️</div>
        <div style="font-size: 14.5px; font-weight: 600; color: #2d3748; margin-bottom: 2px;">No Booking Records Yet</div>
        <div style="font-size: 12.5px; color: #718096;">When visitors book tickets on the website, their confirmed orders will appear here.</div>
      </div>
    `;
    row.append(td);
    tbody.append(row);
    return;
  }

  const filtered = list.filter((b) => {
    const id = String(b.id || b.booking_id || "").toLowerCase();
    const name = String(b.customerName || b.name || b.buyer_name || "").toLowerCase();
    const phone = String(b.phone || b.buyer_phone || "").toLowerCase();
    const branch = normalizeBranchName(b.branch || b.selectedBranch || b.academyBranch);

    const matchesSearch =
      !searchVal ||
      id.includes(searchVal) ||
      name.includes(searchVal) ||
      phone.includes(searchVal);

    const matchesBranch =
      branchVal === "all" ||
      branch.toLowerCase() === branchVal.toLowerCase();

    return matchesSearch && matchesBranch;
  });

  if (!filtered.length) {
    const row = document.createElement("tr");
    const td = cell("No matching booking records found.");
    td.colSpan = 8;
    td.className = "empty-state";
    row.append(td);
    tbody.append(row);
    return;
  }

  filtered.forEach((booking) => {
    const row = document.createElement("tr");
    const branchName = normalizeBranchName(booking.branch || booking.selectedBranch || booking.academyBranch);

    const branchTd = cell(branchName);
    branchTd.innerHTML = `<span style="font-size: 11px; font-weight: 700; background: #f3e8ff; color: #6b21a8; padding: 3px 8px; border-radius: 10px; border: 1px solid #e9d5ff;">${branchName}</span>`;

    const seats = Array.isArray(booking.seats)
      ? booking.seats.join(", ")
      : (booking.seats || "—");

    row.append(
      cell(booking.id ?? booking.booking_id ?? booking._id),
      cell(booking.customerName ?? booking.name ?? booking.buyer_name),
      branchTd,
      cell(
        `${booking.email ?? booking.buyer_email ?? ""}${
          booking.phone || booking.buyer_phone ? " / " + (booking.phone || booking.buyer_phone) : ""
        }` || "—"
      ),
      cell(seats),
      cell(
        booking.amount === undefined && booking.total === undefined
          ? "—"
          : formatCurrency(booking.amount ?? booking.total)
      ),
      cell(booking.paymentStatus ?? booking.payment_status ?? "Confirmed"),
      buildResendActionCell(booking)
    );

    tbody.append(row);
  });
}

function renderAllBookings(bookings) {
  allLoadedBookingsCache = bookings || [];
  filterAndRenderAllBookings();
}

// Live search & branch filter event listeners
const searchInput = $("bookingSearchInput");
if (searchInput) {
  searchInput.addEventListener("input", filterAndRenderAllBookings);
}

const branchFilter = $("bookingBranchFilter");
if (branchFilter) {
  branchFilter.addEventListener("change", filterAndRenderAllBookings);
}

// ---------------- SEATS MANAGEMENT ----------------

function buildFullAuditoriumSeats(bookedSet = new Set(), blockedSet = new Set()) {
  const allSeats = [];
  ROW_SPECS.forEach((row) => {
    const totalInRow = row.left + row.center + row.right;
    const isBlockedRow = BLOCKED_ROWS.includes(row.label);

    for (let i = 1; i <= totalInRow; i++) {
      const numStr = String(i).padStart(2, "0");
      const seatId = `${row.label}-${numStr}`;
      const altSeatId = `${row.label}-${i}`;

      let status = "available";
      if (isBlockedRow || blockedSet.has(seatId) || blockedSet.has(altSeatId)) {
        status = "blocked";
      } else if (bookedSet.has(seatId) || bookedSet.has(altSeatId)) {
        status = "booked";
      }

      allSeats.push({
        seatNumber: seatId,
        row: row.label,
        status: status
      });
    }
  });
  return allSeats;
}

async function loadSeats() {
  showMessage(dashboardMessage, "Loading auditorium seat layout…");

  try {
    const bookedSet = new Set();
    const blockedSet = new Set();
    let seatListFromBackend = null;

    // 1. Try /api/admin/seats
    try {
      const result = await apiRequest("/api/admin/seats");
      const parsed = Array.isArray(result) ? result : result?.seats;
      if (Array.isArray(parsed) && parsed.length > 0) {
        seatListFromBackend = parsed;
      }
    } catch (err) {
      console.warn("/api/admin/seats fallback to live layout:", err.message);
    }

    // 2. Fetch live /api/booked-seats (confirmed bookings)
    try {
      const response = await fetch(`${API_BASE_URL}/api/booked-seats`, {
        headers: { Accept: "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        const booked = Array.isArray(data)
          ? data
          : (data.bookedSeats || data.seats || []);
        booked.forEach((s) => {
          const norm = normalizeSeatId(typeof s === "string" ? s : s?.seat_id || s?.id);
          if (norm) bookedSet.add(norm);
        });
      }
    } catch (err) {
      console.warn("Could not load /api/booked-seats in seat view:", err.message);
    }

    // Only genuine booked seats - no mock/sample booked seats

    // If backend provided complete seats list, use it; otherwise build the full 941-seat layout
    if (seatListFromBackend && seatListFromBackend.length > 100) {
      cachedSeatsList = seatListFromBackend;
    } else {
      cachedSeatsList = buildFullAuditoriumSeats(bookedSet, blockedSet);
    }

    // Update Seat Summary counters
    let countBooked = 0;
    let countBlocked = 0;
    let countAvailable = 0;

    cachedSeatsList.forEach((s) => {
      const st = String(s.status).toLowerCase();
      if (st === "booked") countBooked++;
      else if (st === "blocked") countBlocked++;
      else countAvailable++;
    });

    setText("seatSummaryBooked", countBooked);
    setText("seatSummaryBlocked", countBlocked);
    setText("seatSummaryAvailable", countAvailable);

    // Also update dashboard cards if present
    setText("totalHallSeats", TOTAL_HALL_CAPACITY);
    setText("totalSeats", countBooked);
    setText("blockedSeats", countBlocked);
    setText("availableSeats", countAvailable);

    renderSeats(cachedSeatsList);
    showMessage(dashboardMessage, `${cachedSeatsList.length} total seats loaded (Booked: ${countBooked}, Blocked: ${countBlocked}, Available: ${countAvailable}).`);
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
    throw error;
  }
}

function renderSeats(seats) {
  const grid = $("seatGrid");
  if (!grid) return;
  grid.replaceChildren();

  const filterEl = $("seatFilter");
  const currentFilter = filterEl ? filterEl.value : "all";

  const filteredSeats = seats.filter((s) => {
    if (currentFilter === "all") return true;
    return String(s.status).toLowerCase() === currentFilter;
  });

  if (!filteredSeats.length) {
    grid.textContent = "No seats matching the selected filter.";
    return;
  }

  filteredSeats.forEach((seat) => {
    const label = seat.seatNumber ?? seat.seat_number ?? seat.seat;
    const status = String(seat.status ?? "unknown").toLowerCase();

    const button = document.createElement("div");
    button.className = "seat";

    if (["available", "booked", "blocked"].includes(status)) {
      button.classList.add(status);
    }

    button.textContent = label ?? "—";
    button.title = `Seat ${label}: ${status.toUpperCase()}`;
    grid.append(button);
  });
}

// Seat filter change listener
const seatFilterElement = $("seatFilter");
if (seatFilterElement) {
  seatFilterElement.addEventListener("change", () => {
    if (cachedSeatsList && cachedSeatsList.length > 0) {
      renderSeats(cachedSeatsList);
    }
  });
}

// ---------------- REFRESH & ERRORS ----------------

function handleLoadError(error) {
  showMessage(
    dashboardMessage,
    error.message || "Unable to load data.",
    true
  );
}

$("refreshButton").addEventListener("click", () => {
  loadDashboard().catch(handleLoadError);
});

$("bookingsRefresh").addEventListener("click", () => {
  loadBookings().catch(handleLoadError);
});

$("seatsRefresh").addEventListener("click", () => {
  loadSeats().catch(handleLoadError);
});

// ---------------- CLEAR ALL BOOKINGS ----------------

function setupClearBookingsButton(btnId) {
  const clearBtn = $(btnId);
  if (!clearBtn) return;

  clearBtn.addEventListener("click", async () => {
    const confirmed = confirm(
      "⚠️ DANGER ZONE: Are you sure you want to delete ALL bookings?\n\nThis will permanently delete all customer bookings and release all booked seats. This action CANNOT be undone!"
    );
    if (!confirmed) return;

    const enteredPassword = prompt(
      "🔒 ADMIN SECURITY CHECK:\n\nPlease enter the Master Password to confirm deleting all bookings:"
    );

    if (enteredPassword === null) {
      // User clicked Cancel
      return;
    }

    if (!enteredPassword.trim()) {
      alert("❌ Password cannot be empty. Action cancelled.");
      return;
    }

    try {
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing…";

      if (isDemoMode) {
        // Offline preview mode validation: accepts 'nrityarang2026' or 'admin'
        const validPasswords = ["nrityarang2026", "admin", "admin123"];
        if (!validPasswords.includes(enteredPassword.trim())) {
          throw new Error("Incorrect master password. Clearance aborted.");
        }
        SAMPLE_BOOKINGS.length = 0;
        allLoadedBookingsCache = [];
        try {
          localStorage.removeItem("nrityarang_demo_booked_seats");
          localStorage.removeItem("nrityarang_bookings");
        } catch (_) {}
        alert("✅ All bookings and seats have been cleared successfully! (Offline Preview Mode)");
      } else {
        await apiRequest("/api/admin/clear-bookings", {
          method: "POST",
          body: { password: enteredPassword.trim() }
        });
        alert("✅ All bookings and seats have been cleared successfully!");
      }

      // Refresh dashboard, bookings table, and seat grid
      if (typeof loadBookings === "function") await loadBookings();
      if (typeof loadDashboard === "function") await loadDashboard();
      if (typeof loadSeats === "function") await loadSeats();
    } catch (error) {
      alert("❌ " + error.message);
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = "🗑️ Clear All Bookings";
    }
  });
}

setupClearBookingsButton("clearAllBookingsBtn");
setupClearBookingsButton("clearAllBookingsOverviewBtn");

// ---------------- EVENT DETAILS & SETTINGS ----------------

const DEFAULT_EVENT_DETAILS = {
  eventName: "Nrityarang 2026",
  eventTagline:
    "Experience the grace and elegance of Kathak in a mesmerizing evening of rhythm, storytelling, and timeless tradition......",
  eventDate: "September 6, 2026",
  eventTime: "7:00 PM",
  eventDateTimeDisplay: "September,6 2026, 7pm",
  venue: "Prabodhankar Thackeray auditorium, Borivali(west), Mumbai",
  venueShort: "Prabodhankar Thackeray Auditorium",
  venueAddress:
    "Chamunda Circle, Sodawala Lane, Borivali (West), Mumbai - 400092 (5 min walk from Borivali Railway Station)",
  ticketPriceInfo: "(starts from 250rs)",
  startingPrice: 250,
  isBookingEnabled: true,
  bookingDisabledMessage:
    "Seat booking is temporarily paused by the administrator. Please check back later!"
};

const EVENT_STORAGE_KEY = "nrityarang_event_details";

function getLocalEventDetails() {
  try {
    const raw = localStorage.getItem(EVENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_EVENT_DETAILS, ...parsed };
      }
    }
  } catch (_) {}
  return { ...DEFAULT_EVENT_DETAILS };
}

function updateBookingUI(isEnabled) {
  // 1. Badge in Event Details section
  const badge = $("bookingStatusBadge");
  if (badge) {
    badge.textContent = isEnabled
      ? "🟢 Seat Selection: OPEN (Active)"
      : "🔴 Seat Selection: DISABLED (Locked)";
    badge.style.background = isEnabled ? "#eafaf1" : "#fdf2f2";
    badge.style.color = isEnabled ? "#1e7e34" : "#c34452";
    badge.style.borderColor = isEnabled ? "#c3e6cb" : "#f5c6cb";
  }

  // 2. Main toggle button in Event Details
  const toggleBtn = $("toggleBookingStatusBtn");
  if (toggleBtn) {
    toggleBtn.innerHTML = isEnabled
      ? "🔒 Disable Seat Selection"
      : "🔓 Enable Seat Selection";
    toggleBtn.style.background = isEnabled ? "#dc3545" : "#28a745";
  }

  // 3. Overview badge & toggle
  const ovBadge = $("overviewBookingBadge");
  if (ovBadge) {
    ovBadge.textContent = isEnabled ? "🟢 Seats: OPEN" : "🔴 Seats: DISABLED";
    ovBadge.style.background = isEnabled ? "#eafaf1" : "#fdf2f2";
    ovBadge.style.color = isEnabled ? "#1e7e34" : "#c34452";
    ovBadge.style.borderColor = isEnabled ? "#c3e6cb" : "#f5c6cb";
  }

  const ovToggle = $("overviewToggleBookingBtn");
  if (ovToggle) {
    ovToggle.innerHTML = isEnabled
      ? "🔒 Disable Seat Selection"
      : "🔓 Enable Seat Selection";
    ovToggle.style.color = isEnabled ? "#c34452" : "#28a745";
  }

  // 4. Seats Section toggle
  const seatsToggle = $("seatsToggleBookingBtn");
  if (seatsToggle) {
    seatsToggle.innerHTML = isEnabled
      ? "🔒 Disable Seat Selection"
      : "🔓 Enable Seat Selection";
    seatsToggle.style.color = isEnabled ? "#c34452" : "#28a745";
  }

  // 5. Container for paused custom message
  const msgContainer = $("disabledMsgContainer");
  if (msgContainer) {
    msgContainer.style.display = isEnabled ? "none" : "block";
  }
}

function updateEventPreview(data) {
  const title = $("prevTitle");
  if (title) title.textContent = data.eventName || DEFAULT_EVENT_DETAILS.eventName;

  const tagline = $("prevTagline");
  if (tagline) tagline.textContent = data.eventTagline || DEFAULT_EVENT_DETAILS.eventTagline;

  const dt = $("prevDateTime");
  if (dt) {
    dt.textContent =
      data.eventDateTimeDisplay ||
      `${data.eventDate || ""}, ${data.eventTime || ""}`.trim();
  }

  const ven = $("prevVenue");
  if (ven) ven.textContent = data.venue || DEFAULT_EVENT_DETAILS.venue;

  const pr = $("prevPrice");
  if (pr) pr.textContent = data.ticketPriceInfo || DEFAULT_EVENT_DETAILS.ticketPriceInfo;

  // Live preview of "Select Seat" button
  const isEnabled = data.isBookingEnabled !== false;
  const prevBtn = $("prevSelectSeatBtn");
  const prevPill = $("prevBookingPausedPill");

  if (prevBtn) {
    if (isEnabled) {
      prevBtn.style.background = "linear-gradient(135deg, #c5a15b 0%, #dfc581 100%)";
      prevBtn.style.color = "#3b0d13";
      prevBtn.style.opacity = "1";
      prevBtn.style.cursor = "pointer";
      prevBtn.innerHTML = "<span>🪑</span> Select Seat";
    } else {
      prevBtn.style.background = "#3d2b30";
      prevBtn.style.color = "#a89498";
      prevBtn.style.opacity = "0.75";
      prevBtn.style.cursor = "not-allowed";
      prevBtn.innerHTML = "<span>🔒</span> Seat Selection Paused";
    }
  }

  if (prevPill) {
    prevPill.style.display = isEnabled ? "none" : "block";
  }
}

async function toggleBookingStatus() {
  const current = getLocalEventDetails();
  const nextState = current.isBookingEnabled === false ? true : false;
  const actionText = nextState ? "ENABLING" : "DISABLING";

  const confirmMsg = nextState
    ? "🔓 Are you sure you want to ENABLE seat selection?\n\nVisitors will be able to view the hall layout and book seats on the website."
    : "🔒 Are you sure you want to DISABLE seat selection?\n\nThe 'Select Seat' button on the website will be locked, and visitors will be prevented from accessing the hall layout.";

  if (!confirm(confirmMsg)) return;

  const enteredPassword = prompt(
    `🔒 ADMIN SECURITY CHECK:\n\nPlease enter the Master Password to confirm ${actionText} seat selection:`
  );

  if (enteredPassword === null) {
    // User clicked Cancel
    return;
  }

  if (!enteredPassword.trim()) {
    alert("❌ Password cannot be empty. Action cancelled.");
    return;
  }

  const validPasswords = ["nrityarang2026", "admin", "admin123"];
  if (!validPasswords.includes(enteredPassword.trim())) {
    alert("❌ Incorrect master password. Action aborted.");
    return;
  }

  current.isBookingEnabled = nextState;
  current.updatedAt = new Date().toISOString();

  try {
    localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(
      new CustomEvent("nrityarang_event_details_updated", { detail: current })
    );

    if (!isDemoMode && adminToken) {
      await apiRequest("/api/admin/event-details", {
        method: "POST",
        body: {
          ...current,
          password: enteredPassword.trim()
        }
      });
    }

    updateBookingUI(nextState);
    updateEventPreview(current);

    alert(
      nextState
        ? "✅ Seat selection has been ENABLED. Visitors can now view the hall layout and book tickets."
        : "🔒 Seat selection has been DISABLED. The 'Select Seat' button is locked and hall access is blocked."
    );
  } catch (err) {
    alert("❌ Failed to update booking status on server: " + err.message);
  }
}

// Attach toggle handlers to all 3 toggle buttons
["toggleBookingStatusBtn", "overviewToggleBookingBtn", "seatsToggleBookingBtn"].forEach((id) => {
  const btn = $(id);
  if (btn) {
    btn.addEventListener("click", toggleBookingStatus);
  }
});

async function loadEventSettings() {
  let details = getLocalEventDetails();

  if (!isDemoMode) {
    try {
      const res = await apiRequest("/api/event-details");
      if (res && typeof res === "object") {
        details = { ...details, ...res };
        try {
          localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(details));
        } catch (_) {}
      }
    } catch (err) {
      console.warn("Could not fetch remote event details, using local/defaults:", err.message);
    }
  }

  // Populate form inputs
  if ($("evtName")) $("evtName").value = details.eventName || "";
  if ($("evtDate")) $("evtDate").value = details.eventDate || "";
  if ($("evtTime")) $("evtTime").value = details.eventTime || "";
  if ($("evtDateTimeDisplay")) $("evtDateTimeDisplay").value = details.eventDateTimeDisplay || "";
  if ($("evtVenue")) $("evtVenue").value = details.venue || "";
  if ($("evtVenueShort")) $("evtVenueShort").value = details.venueShort || "";
  if ($("evtVenueAddress")) $("evtVenueAddress").value = details.venueAddress || "";
  if ($("evtPriceInfo")) $("evtPriceInfo").value = details.ticketPriceInfo || "";
  if ($("evtTagline")) $("evtTagline").value = details.eventTagline || "";
  if ($("evtDisabledMsg")) $("evtDisabledMsg").value = details.bookingDisabledMessage || "";

  updateBookingUI(details.isBookingEnabled !== false);
  updateEventPreview(details);
}

// Live typing updates in preview card
const eventInputIds = [
  "evtName",
  "evtDate",
  "evtTime",
  "evtDateTimeDisplay",
  "evtVenue",
  "evtVenueShort",
  "evtVenueAddress",
  "evtPriceInfo",
  "evtTagline",
  "evtDisabledMsg"
];

eventInputIds.forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const current = {
      eventName: $("evtName")?.value,
      eventDate: $("evtDate")?.value,
      eventTime: $("evtTime")?.value,
      eventDateTimeDisplay: $("evtDateTimeDisplay")?.value,
      venue: $("evtVenue")?.value,
      venueShort: $("evtVenueShort")?.value,
      venueAddress: $("evtVenueAddress")?.value,
      ticketPriceInfo: $("evtPriceInfo")?.value,
      eventTagline: $("evtTagline")?.value,
      isBookingEnabled: getLocalEventDetails().isBookingEnabled !== false
    };
    updateEventPreview(current);
  });
});

// Save button click
const saveEventBtn = $("saveEventBtn");
if (saveEventBtn) {
  saveEventBtn.addEventListener("click", async () => {
    const currentLocal = getLocalEventDetails();
    const updated = {
      ...currentLocal,
      eventName: $("evtName")?.value.trim() || DEFAULT_EVENT_DETAILS.eventName,
      eventDate: $("evtDate")?.value.trim() || DEFAULT_EVENT_DETAILS.eventDate,
      eventTime: $("evtTime")?.value.trim() || DEFAULT_EVENT_DETAILS.eventTime,
      eventDateTimeDisplay:
        $("evtDateTimeDisplay")?.value.trim() ||
        `${$("evtDate")?.value.trim() || ""}, ${$("evtTime")?.value.trim() || ""}`,
      venue: $("evtVenue")?.value.trim() || DEFAULT_EVENT_DETAILS.venue,
      venueShort: $("evtVenueShort")?.value.trim() || DEFAULT_EVENT_DETAILS.venueShort,
      venueAddress: $("evtVenueAddress")?.value.trim() || DEFAULT_EVENT_DETAILS.venueAddress,
      ticketPriceInfo: $("evtPriceInfo")?.value.trim() || DEFAULT_EVENT_DETAILS.ticketPriceInfo,
      eventTagline: $("evtTagline")?.value.trim() || DEFAULT_EVENT_DETAILS.eventTagline,
      bookingDisabledMessage: $("evtDisabledMsg")?.value.trim() || DEFAULT_EVENT_DETAILS.bookingDisabledMessage,
      updatedAt: new Date().toISOString()
    };

    const notice = $("eventSaveNotice");

    try {
      saveEventBtn.disabled = true;
      saveEventBtn.textContent = "Saving…";

      // 1. Save to local storage for immediate browser sync
      try {
        localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent("nrityarang_event_details_updated", { detail: updated }));
      } catch (_) {}

      // 2. Send to backend server if authenticated
      if (!isDemoMode && adminToken) {
        await apiRequest("/api/admin/event-details", {
          method: "POST",
          body: updated
        });
      }

      if (notice) {
        notice.style.display = "block";
        notice.style.color = "#1e7e34";
        notice.textContent = "✅ Event details & booking settings saved successfully!";
        setTimeout(() => {
          if (notice) notice.style.display = "none";
        }, 4000);
      }

      alert("✅ Event details and booking access settings updated successfully!");

      // Refresh overview widget
      loadDashboard().catch(() => {});
    } catch (err) {
      if (notice) {
        notice.style.display = "block";
        notice.style.color = "#c34452";
        notice.textContent = "❌ Failed to save to server: " + err.message;
      }
      alert("❌ Could not save to server: " + err.message);
    } finally {
      saveEventBtn.disabled = false;
      saveEventBtn.textContent = "💾 Save & Update Website";
    }
  });
}

// Reset button click
const resetEventBtn = $("resetEventBtn");
if (resetEventBtn) {
  resetEventBtn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to reset event details back to defaults?")) return;
    try {
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(DEFAULT_EVENT_DETAILS));
      window.dispatchEvent(new CustomEvent("nrityarang_event_details_updated", { detail: DEFAULT_EVENT_DETAILS }));
    } catch (_) {}
    loadEventSettings();
  });
}

// ---------------- STUDENT ADMISSION ENQUIRIES ----------------

const ENQUIRIES_STORAGE_KEY = "nrityanand_enquiries";

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Purge any previous mock/dummy test enquiries from browser storage
try {
  const stored = localStorage.getItem(ENQUIRIES_STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    const fakeNames = ["Aarohi Chitnis", "Saanvi Iyer", "Tanvi Kulkarni", "Ananya Deshmukh", "Meera Nair", "Diya Panchal", "Rhea Shenoy", "Isha Sawant"];
    const realOnly = Array.isArray(parsed) ? parsed.filter(item => {
      const name = item.studentName || item.name;
      const isFakeId = String(item.id || "").startsWith("ENQ-100");
      return !fakeNames.includes(name) && !isFakeId;
    }) : [];
    if (realOnly.length !== parsed.length) {
      localStorage.setItem(ENQUIRIES_STORAGE_KEY, JSON.stringify(realOnly));
    }
  }
} catch (_) {}

let cachedEnquiries = [];

async function loadEnquiries() {
  const tbody = $("enquiriesTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading student enquiries…</td></tr>`;
  }

  try {
    let list = [];
    if (!isDemoMode && adminToken) {
      try {
        const response = await apiRequest("/api/admin/enquiries");
        list = Array.isArray(response) ? response : (response && response.enquiries ? response.enquiries : []);
      } catch (err) {
        console.warn("Backend enquiries unavailable, using local storage cache:", err.message);
      }
    }

    if (!list || list.length === 0) {
      const stored = localStorage.getItem(ENQUIRIES_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const fakeNames = ["Aarohi Chitnis", "Saanvi Iyer", "Tanvi Kulkarni", "Ananya Deshmukh", "Meera Nair", "Diya Panchal", "Rhea Shenoy", "Isha Sawant"];
          list = Array.isArray(parsed) ? parsed.filter(item => {
            const name = item.studentName || item.name;
            const isFakeId = String(item.id || "").startsWith("ENQ-100");
            return !fakeNames.includes(name) && !isFakeId;
          }) : [];
          if (list.length !== parsed.length) {
            localStorage.setItem(ENQUIRIES_STORAGE_KEY, JSON.stringify(list));
          }
        } catch (_) {
          list = [];
        }
      }
    }

    // Only genuine user enquiries - no fake or sample data
    cachedEnquiries = Array.isArray(list) ? list : [];
    filterAndRenderEnquiries();
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state" style="color: #c34452;">Failed to load enquiries: ${error.message}</td></tr>`;
    }
  }
}

function getModeBadge(mode) {
  const m = (mode || "").toLowerCase();
  if (m.includes("whatsapp")) {
    return `<span style="background: #e6f4ea; color: #1e7e34; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">💬 WhatsApp</span>`;
  }
  if (m.includes("email")) {
    return `<span style="background: #e8f0fe; color: #1a73e8; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">✉️ Email</span>`;
  }
  if (m.includes("web")) {
    return `<span style="background: #f3e8fd; color: #7434db; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">🌐 Website</span>`;
  }
  if (m.includes("call")) {
    return `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">📞 Call</span>`;
  }
  return `<span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;">🏛️ Walk-in</span>`;
}

function filterAndRenderEnquiries() {
  const tbody = $("enquiriesTableBody");
  if (!tbody) return;

  // 1. Calculate & display stats
  const total = cachedEnquiries.length;
  const waCount = cachedEnquiries.filter(e => (e.mode || "").toLowerCase().includes("whatsapp")).length;
  const emailCount = cachedEnquiries.filter(e => (e.mode || "").toLowerCase().includes("email")).length;
  const webCount = cachedEnquiries.filter(e => (e.mode || "").toLowerCase().includes("web")).length;
  const pendingCount = cachedEnquiries.filter(e => (e.status || "New").toLowerCase() === "new").length;

  if ($("totalEnquiriesCount")) $("totalEnquiriesCount").textContent = total;
  if ($("waEnquiriesCount")) $("waEnquiriesCount").textContent = waCount;
  if ($("emailEnquiriesCount")) $("emailEnquiriesCount").textContent = emailCount;
  if ($("webEnquiriesCount")) $("webEnquiriesCount").textContent = webCount;
  if ($("pendingEnquiriesCount")) $("pendingEnquiriesCount").textContent = pendingCount;

  // 2. Read filter inputs
  const search = $("enquirySearchInput") ? $("enquirySearchInput").value.trim().toLowerCase() : "";
  const modeVal = $("enquiryModeFilter") ? $("enquiryModeFilter").value : "all";
  const branchVal = $("enquiryBranchFilter") ? $("enquiryBranchFilter").value : "all";
  const statusVal = $("enquiryStatusFilter") ? $("enquiryStatusFilter").value : "all";

  // 3. Filter list
  const filtered = cachedEnquiries.filter(item => {
    const itemMode = (item.mode || "").toLowerCase();
    if (modeVal !== "all") {
      if (modeVal === "WhatsApp" && !itemMode.includes("whatsapp")) return false;
      if (modeVal === "Email" && !itemMode.includes("email")) return false;
      if (modeVal === "Website Form" && !itemMode.includes("web")) return false;
    }
    if (branchVal !== "all" && item.branch !== branchVal) return false;
    if (statusVal !== "all" && (item.status || "New") !== statusVal) return false;
    if (search) {
      const studentName = item.studentName || item.name || "";
      const notes = item.notes || item.message || "";
      const match = `${studentName} ${item.phone || ""} ${item.email || ""} ${item.branch || ""} ${item.level || ""} ${notes}`.toLowerCase();
      if (!match.includes(search)) return false;
    }
    return true;
  });

  if (cachedEnquiries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px 20px; color: var(--muted);">
          <div style="font-size: 38px; margin-bottom: 10px;">📋</div>
          <div style="font-size: 15px; font-weight: 600; color: #2d3748; margin-bottom: 4px;">No Student Enquiries Yet</div>
          <div style="font-size: 13px; color: #718096; max-width: 480px; margin: 0 auto; line-height: 1.5;">
            When parents or students submit an admission enquiry through WhatsApp, Email, or the Website Form, their real details will appear here automatically.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 36px 20px; color: var(--muted);">
          <div style="font-size: 26px; margin-bottom: 6px;">🔍</div>
          <div style="font-size: 14px; font-weight: 600; color: #4a5568;">No enquiries match your search or filter criteria.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const studentName = item.studentName || item.name || "—";
    const notes = item.notes || item.message || "";
    const dateStr = item.submittedAt || item.date || "—";
    const cleanPhone = (item.phone || "").replace(/\D/g, "");

    const waMsg = `Namaste ${studentName}! Thank you for your inquiry with Nrityanand Academy of Performing Arts. We would be happy to share our Bharatanatyam batch schedules and admission details for our ${item.branch || 'Mumbai'} branch with you.`;
    const waUrl = `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
    
    const emailSubject = encodeURIComponent(`Nrityanand Academy Bharatanatyam Admission Inquiry - ${studentName}`);
    const emailBody = encodeURIComponent(`Dear ${studentName},\n\nNamaste!\n\nThank you for reaching out to Nrityanand Academy of Performing Arts regarding our Bharatanatyam training program.\n\nPreferred Branch: ${item.branch || 'Mumbai'}\nCourse/Level: ${item.level || 'Beginner'}\n\nWe would love to invite you for an interaction and trial class at our studio. Please let us know a suitable time to connect.\n\nWarm regards,\nNrityanand Academy of Performing Arts\nMumbai`);
    const mailtoUrl = (item.email && item.email !== "-" && item.email !== "Not provided") ? `mailto:${item.email}?subject=${emailSubject}&body=${emailBody}` : "";

    const statusOptions = ["New", "Contacted", "Follow-up", "Enrolled"].map(st => {
      const sel = (item.status || "New") === st ? "selected" : "";
      return `<option value="${st}" ${sel}>${st === "Enrolled" ? "✓ Enrolled" : st}</option>`;
    }).join("");

    const ageHtml = item.age ? `<span style="font-size: 11.5px; color: var(--muted); margin-left: 4px;">(${item.age} yrs)</span>` : "";

    let statusColor = "#c05621";
    if (item.status === "Enrolled") statusColor = "#1e7e34";
    else if (item.status === "Contacted") statusColor = "#2b6cb0";
    else if (item.status === "Follow-up") statusColor = "#805ad5";

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: #1a202c;">${escapeHtml(studentName)}${ageHtml}</div>
          ${notes ? `<div style="font-size: 11.5px; color: var(--muted); margin-top: 2px; max-width: 220px;" title="${escapeHtml(notes)}">📝 ${escapeHtml(notes)}</div>` : ""}
        </td>
        <td>
          <a href="tel:${cleanPhone}" style="color: var(--purple-dark); font-weight: 500; text-decoration: none;">📞 ${escapeHtml(item.phone || "—")}</a>
        </td>
        <td>
          ${item.email && item.email !== "-" && item.email !== "Not provided" ? `<a href="${mailtoUrl}" style="color: #2b6cb0; text-decoration: none; font-size: 12.5px;">✉️ ${escapeHtml(item.email)}</a>` : '<span style="color: var(--muted);">—</span>'}
        </td>
        <td>
          ${getModeBadge(item.mode)}
        </td>
        <td>
          <span style="font-size: 12.5px; font-weight: 500; color: #2d3748;">🏛️ ${escapeHtml(item.branch || "—")}</span>
        </td>
        <td>
          <span style="font-size: 12px; color: #4a5568;">${escapeHtml(item.level || "Beginner")}</span>
        </td>
        <td style="font-size: 12px; color: var(--muted); white-space: nowrap;">
          ${escapeHtml(dateStr)}
        </td>
        <td>
          <select class="enquiry-status-select" data-id="${item.id}" style="padding: 5px 8px; border-radius: 6px; border: 1px solid #dcd3e6; font-size: 12px; background: white; font-weight: 600; color: ${statusColor};">
            ${statusOptions}
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <a href="${waUrl}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: #e6f4ea; color: #1e7e34; text-decoration: none; font-size: 13px; border: 1px solid #b7e1cd;">
              💬
            </a>
            ${mailtoUrl ? `
            <a href="${mailtoUrl}" title="Send Email" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: #e8f0fe; color: #1a73e8; text-decoration: none; font-size: 13px; border: 1px solid #c2e7ff;">
              ✉️
            </a>` : ""}
            <a href="tel:${cleanPhone}" title="Direct Phone Call" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: #fef3c7; color: #b45309; text-decoration: none; font-size: 13px; border: 1px solid #fde68a;">
              📞
            </a>
            <button class="delete-enquiry-btn" data-id="${item.id}" title="Delete Record" style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: #fde8e8; color: #c34452; border: 1px solid #f8b4b4; cursor: pointer; font-size: 12px;">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Attach event listeners for status selects and delete buttons
  tbody.querySelectorAll(".enquiry-status-select").forEach(select => {
    select.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      updateEnquiryStatus(id, newStatus);
    });
  });

  tbody.querySelectorAll(".delete-enquiry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      deleteEnquiry(id);
    });
  });
}

async function updateEnquiryStatus(id, newStatus) {
  const item = cachedEnquiries.find(e => String(e.id) === String(id));
  if (!item) return;

  item.status = newStatus;
  try {
    localStorage.setItem(ENQUIRIES_STORAGE_KEY, JSON.stringify(cachedEnquiries));
  } catch (_) {}

  if (!isDemoMode && adminToken) {
    try {
      await apiRequest(`/api/admin/enquiries/${id}`, {
        method: "PUT",
        body: { status: newStatus }
      });
    } catch (err) {
      console.warn("Backend status update error:", err.message);
    }
  }

  filterAndRenderEnquiries();
}

async function deleteEnquiry(id) {
  if (!confirm("Are you sure you want to remove this admission enquiry record?")) return;

  cachedEnquiries = cachedEnquiries.filter(e => String(e.id) !== String(id));
  try {
    localStorage.setItem(ENQUIRIES_STORAGE_KEY, JSON.stringify(cachedEnquiries));
  } catch (_) {}

  if (!isDemoMode && adminToken) {
    try {
      await apiRequest(`/api/admin/enquiries/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Backend delete error:", err.message);
    }
  }

  filterAndRenderEnquiries();
}

// Search and filter listeners
const enqSearchInput = $("enquirySearchInput");
if (enqSearchInput) enqSearchInput.addEventListener("input", filterAndRenderEnquiries);

const enqModeFilter = $("enquiryModeFilter");
if (enqModeFilter) enqModeFilter.addEventListener("change", filterAndRenderEnquiries);

const enqBranchFilter = $("enquiryBranchFilter");
if (enqBranchFilter) enqBranchFilter.addEventListener("change", filterAndRenderEnquiries);

const enqStatusFilter = $("enquiryStatusFilter");
if (enqStatusFilter) enqStatusFilter.addEventListener("change", filterAndRenderEnquiries);

const enqRefreshBtn = $("enquiriesRefresh");
if (enqRefreshBtn) {
  enqRefreshBtn.addEventListener("click", async () => {
    enqRefreshBtn.disabled = true;
    enqRefreshBtn.textContent = "Refreshing…";
    await loadEnquiries();
    enqRefreshBtn.disabled = false;
    enqRefreshBtn.textContent = "🔄 Refresh";
  });
}

// Modal popup controls
const addEnqBtn = $("addEnquiryBtn");
const enqModal = $("addEnquiryModal");
const closeEnqModalBtn = $("closeEnquiryModalBtn");
const cancelManualEnqBtn = $("cancelManualEnqBtn");
const manualEnquiryForm = $("manualEnquiryForm");

if (addEnqBtn && enqModal) {
  addEnqBtn.addEventListener("click", () => {
    enqModal.style.display = "flex";
  });
}

function closeEnquiryModal() {
  if (enqModal) enqModal.style.display = "none";
  if (manualEnquiryForm) manualEnquiryForm.reset();
}

if (closeEnqModalBtn) closeEnqModalBtn.addEventListener("click", closeEnquiryModal);
if (cancelManualEnqBtn) cancelManualEnqBtn.addEventListener("click", closeEnquiryModal);

if (enqModal) {
  enqModal.addEventListener("click", (e) => {
    if (e.target === enqModal) closeEnquiryModal();
  });
}

if (manualEnquiryForm) {
  manualEnquiryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("mEnqName") ? $("mEnqName").value : "").trim();
    const phone = ($("mEnqPhone") ? $("mEnqPhone").value : "").trim();
    const age = $("mEnqAge") && $("mEnqAge").value ? Number($("mEnqAge").value) : null;
    const email = ($("mEnqEmail") ? $("mEnqEmail").value : "").trim() || "-";
    const mode = $("mEnqMode") ? $("mEnqMode").value : "Walk-in";
    const branch = $("mEnqBranch") ? $("mEnqBranch").value : "Borivali (East)";
    const level = $("mEnqLevel") ? $("mEnqLevel").value : "Beginner (New Admission)";
    const notes = ($("mEnqNotes") ? $("mEnqNotes").value : "").trim();

    if (!name || !phone) {
      alert("Please provide at least student name and contact phone number.");
      return;
    }

    const now = new Date();
    const formattedDate = now.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    const newRecord = {
      id: "ENQ-" + Date.now().toString().slice(-4),
      studentName: name,
      name: name,
      phone,
      age,
      email,
      mode,
      branch,
      level,
      notes,
      message: notes,
      status: "New",
      submittedAt: formattedDate,
      date: formattedDate,
      timestamp: Date.now()
    };

    cachedEnquiries.unshift(newRecord);

    try {
      localStorage.setItem(ENQUIRIES_STORAGE_KEY, JSON.stringify(cachedEnquiries));
    } catch (_) {}

    if (!isDemoMode && adminToken) {
      try {
        await apiRequest("/api/admin/enquiries", {
          method: "POST",
          body: newRecord
        });
      } catch (err) {
        console.warn("Backend add enquiry error:", err.message);
      }
    }

    closeEnquiryModal();
    filterAndRenderEnquiries();
    alert(`✅ Admission enquiry for ${name} recorded successfully!`);
  });
}

// ---------------- LOGOUT ----------------

$("logoutButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin/logout", { method: "POST" });
  } catch (error) {
    console.warn("Server logout notification:", error.message);
  } finally {
    adminToken = null;
    isDemoMode = false;
    cachedSeatsList = [];
    loginForm.reset();

    dashboardPage.hidden = true;
    loginPage.hidden = false;

    showMessage(loginMessage, "You have been signed out.");
    showMessage(dashboardMessage, "");
    setText("totalBookings", "—");
    setText("totalSeats", "—");
    setText("availableSeats", "—");
    setText("blockedSeats", "85");
    setText("totalRevenue", "—");
  }
});
