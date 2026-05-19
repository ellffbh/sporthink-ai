export function saveToken(token: string) {
  localStorage.setItem("token", token);
  // middleware için cookie (httpOnly değil, sadece Next.js edge'de okunabilsin)
  document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`;
}

export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  document.cookie = "token=; path=/; max-age=0";
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function saveRole(role: string) {
  localStorage.setItem("role", role);
}

export function getRole(): string | null {
  return localStorage.getItem("role");
}

export function decodeJwtRole(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role ?? "analyst";
  } catch {
    return "analyst";
  }
}
