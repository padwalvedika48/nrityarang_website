// Nrityarang Admin Panel
// This frontend expects protected admin APIs on the existing backend.
// No Supabase keys or admin passwords belong in this file.

const API_BASE_URL =
  window.NRITYARANG_API_URL ||
  "https://nrityarang-event-booking.onrender.com";

const $ = (id) => document.getElementById(id);

// Keep the token in memory only. Refreshing the page clears it.
let adminToken = null;
let currentSection = "overview";

const loginPage = $("loginPage");
const dashboardPage = $("dashboardPage");
const loginForm = $("loginForm");
const loginButton = $("loginButton");
const loginMessage = $("loginMessage");
const dashboardMessage = $("dashboardMessage");

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#c34452" : "";
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    // Supports HttpOnly cookie authentication if the backend uses it.
    credentials: "include"
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      response.status === 401
        ? "Your session has expired or you are not authenticated."
        : "You are not authorized to perform this action."
    );
  }

  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status}).`);
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
    // Provisional endpoint: confirm its actual name with the backend.
    const result = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    // Expected token response for this initial frontend version.
    // If the backend uses HttpOnly cookies instead, adapt this contract.
    if (typeof result?.token !== "string" || !result.token) {
      throw new Error(
        "The login response needs to be matched to the backend's authentication design."
      );
    }

    adminToken = result.token;

    loginPage.hidden = true;
    dashboardPage.hidden = false;

    showMessage(dashboardMessage, "Signed in. Loading your event data…");

    await showSection("overview");
  } catch (error) {
    adminToken = null;

    showMessage(
      loginMessage,
      error.message.includes("Failed to fetch")
        ? "Cannot reach the backend. Check the API URL, network, and CORS settings."
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

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  const titles = {
    overview: "Dashboard overview",
    bookings: "Booking management",
    seats: "Seat management"
  };

  $("pageTitle").textContent = titles[section];

  if (section === "overview") await loadDashboard();
  if (section === "bookings") await loadBookings();
  if (section === "seats") await loadSeats();
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
    maximumFractionDigits: 2
  }).format(amount);
}

function setText(id, value) {
  $(id).textContent =
    value === null || value === undefined ? "—" : String(value);
}

async function loadDashboard() {
  showMessage(dashboardMessage, "Loading dashboard information…");

  try {
const data = await apiRequest("/api/admin/dashboard");
const metrics = data.metrics || {};

setText("totalBookings", metrics.totalBookings);
setText("totalSeats", metrics.totalSeatsBooked);
setText("availableSeats", metrics.availableSeats);
setText("blockedSeats", metrics.blockedSeats);

setText(
  "totalRevenue",
  metrics.totalRevenue === undefined
    ? "—"
    : formatCurrency(metrics.totalRevenue)
);

renderRecentBookings(data.recentBookings || []);
    showMessage(dashboardMessage, "Dashboard data updated.");
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
    throw error;
  }
}


 // ---------------- BOOKINGS ----------------

async function loadBookings() {
  try {
    const result = await apiRequest("/api/admin/bookings");

    // Supports both { bookings: [...] } and direct arrays
    const bookings = Array.isArray(result)
      ? result
      : result?.bookings;

    if (!Array.isArray(bookings)) {
      throw new Error(
        "Invalid booking data. Expected a bookings array."
      );
    }

    renderRecentBookings(bookings.slice(0, 5));
    renderAllBookings(bookings);

    showMessage(
      dashboardMessage,
      `${bookings.length} booking record(s) loaded.`
    );
  } catch (error) {
    showMessage(
      dashboardMessage,
      `Could not load bookings: ${error.message}`,
      true
    );
    console.error("Bookings loading error:", error);
  }
}

// Safely create a table cell
function cell(value) {
  const td = document.createElement("td");

  td.textContent =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);

  return td;
}

// Get customer information from demo data or Supabase data
function getCustomerName(booking) {
  return (
    booking.customerName ??
    booking.name ??
    booking.users?.name ??
    "—"
  );
}

function getCustomerEmail(booking) {
  return booking.email ?? booking.users?.email ?? "—";
}

function getCustomerPhone(booking) {
  return booking.phone ?? booking.users?.phone ?? "—";
}

function getBookingId(booking) {
  return booking.id ?? booking.booking_id ?? "—";
}

function getBookingSeats(booking) {
  const seats =
    booking.seats ??
    booking.booked_seats ??
    booking.selected_seats;

  if (Array.isArray(seats)) {
    return seats
      .map((seat) => {
        if (typeof seat === "object" && seat !== null) {
          return seat.seat_number ?? seat.seat ?? seat.seatNumber ?? "";
        }
        return seat;
      })
      .filter(Boolean)
      .join(", ") || "—";
  }

  if (typeof seats === "object" && seats !== null) {
    return JSON.stringify(seats);
  }

  return seats ?? "—";
}

function getBookingAmount(booking) {
  const amount = booking.amount ?? booking.total_amount;

  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }

  const number = Number(amount);

  return Number.isFinite(number)
    ? formatCurrency(number)
    : String(amount);
}

function getPaymentStatus(booking) {
  return (
    booking.paymentStatus ??
    booking.payment_status ??
    "Not provided"
  );
}

function getBookingDate(booking) {
  const date = booking.createdAt ?? booking.created_at;

  if (!date) return "—";

  const parsedDate = new Date(date);

  return Number.isNaN(parsedDate.getTime())
    ? String(date)
    : parsedDate.toLocaleString();
}

// Recent bookings table
function renderRecentBookings(bookings) {
  const tableBody = $("recentBookings");

  if (!tableBody) {
    console.error('Element with id "recentBookings" was not found.');
    return;
  }

  tableBody.replaceChildren();

  if (!bookings.length) {
    const row = document.createElement("tr");
    const emptyCell = cell("No bookings found.");
    emptyCell.colSpan = 5;
    row.appendChild(emptyCell);
    tableBody.appendChild(row);
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement("tr");

    row.append(
      cell(getBookingId(booking)),
      cell(getCustomerName(booking)),
      cell(getBookingSeats(booking)),
      cell(getBookingAmount(booking)),
      cell(getPaymentStatus(booking))
    );

    tableBody.appendChild(row);
  });
}

// Complete bookings table
function renderAllBookings(bookings) {
  const tableBody = $("allBookings");

  if (!tableBody) {
    console.error('Element with id "allBookings" was not found.');
    return;
  }

  tableBody.replaceChildren();

  if (!bookings.length) {
    const row = document.createElement("tr");
    const emptyCell = cell("No bookings found.");
    emptyCell.colSpan = 7;
    row.appendChild(emptyCell);
    tableBody.appendChild(row);
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement("tr");

    row.append(
      cell(getBookingId(booking)),
      cell(getCustomerName(booking)),
      cell(
        `${getCustomerEmail(booking)} / ${getCustomerPhone(booking)}`
      ),
      cell(getBookingSeats(booking)),
      cell(getBookingAmount(booking)),
      cell(getPaymentStatus(booking)),
      cell(getBookingDate(booking))
    );

    tableBody.appendChild(row);
  });
}


// ---------------- SEATS ----------------

async function loadSeats() {
  try {
    const result = await apiRequest("/api/admin/seats");

    const seats = Array.isArray(result) ? result : result.seats;

    if (!Array.isArray(seats)) {
      throw new Error("Unexpected seat API response format.");
    }

    renderSeats(seats);
    showMessage(dashboardMessage, `${seats.length} seat records loaded.`);
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
    throw error;
  }
}

function renderSeats(seats) {
  const grid = $("seatGrid");
  grid.replaceChildren();

  if (!seats.length) {
    grid.textContent = "No seat records returned by the backend.";
    return;
  }

  seats.forEach((seat) => {
    const label = seat.seatNumber ?? seat.seat_number ?? seat.seat;
    const status = String(seat.status ?? "unknown").toLowerCase();

    const button = document.createElement("div");
    button.className = "seat";

    if (["available", "booked", "blocked"].includes(status)) {
      button.classList.add(status);
    }

    button.textContent = label ?? "Unknown";
    button.title = `Seat ${label ?? "unknown"}: ${status}`;
    grid.append(button);
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

// ---------------- LOGOUT ----------------

$("logoutButton").addEventListener("click", async () => {
  try {
    // This endpoint is provisional and must be implemented by the backend.
    await apiRequest("/api/admin/logout", { method: "POST" });
  } catch (error) {
    // Clear local UI state even if the network is unavailable.
    console.warn("Server logout could not be confirmed:", error.message);
  } finally {
    adminToken = null;
    loginForm.reset();

    dashboardPage.hidden = true;
    loginPage.hidden = false;

    showMessage(loginMessage, "You have been signed out.");
    showMessage(dashboardMessage, "");
    setText("totalBookings", "—");
    setText("totalSeats", "—");
    setText("availableSeats", "—");
    setText("blockedSeats", "—");
    setText("totalRevenue", "—");
  }
});