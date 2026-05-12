import type { Booking } from "./App";

const scriptUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL;

export const isSheetsConfigured = Boolean(scriptUrl);

async function request<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  if (!scriptUrl) {
    throw new Error("Google Apps Script URL is not configured.");
  }

  const url = new URL(scriptUrl);
  url.searchParams.set("action", action);

  const response = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
    body: payload ? JSON.stringify({ action, ...payload }) : undefined,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Google Sheets request failed: ${response.status}`);
  }

  const result = await response.json();
  if (result.ok === false) {
    throw new Error(result.reason ?? "Google Sheets request failed.");
  }

  return result as T;
}

export function loadSheetsBookings() {
  return request<{ ok: boolean; bookings: Booking[] }>("listBookings");
}

export function createSheetsBooking(booking: Booking) {
  return request<{ ok: boolean; booking: Booking }>("createBooking", { booking });
}

export function updateSheetsBooking(id: string, patch: Partial<Booking>) {
  return request<{ ok: boolean; booking: Booking }>("updateBooking", { id, patch });
}

export function deleteSheetsBooking(id: string) {
  return request<{ ok: boolean }>("deleteBooking", { id });
}

export function authLogin(username: string, password: string) {
  return request<{ ok: boolean; role?: string }>("ownerLogin", { username, password });
}
