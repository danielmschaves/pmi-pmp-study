import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetSession,
  mockOnAuthStateChange,
  mockSignUp,
  mockSignInWithPassword,
  mockSignOut,
} = vi.hoisted(() => ({
  mockGetSession:         vi.fn(),
  mockOnAuthStateChange:  vi.fn(),
  mockSignUp:             vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut:            vi.fn(),
}));

vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession:         mockGetSession,
      onAuthStateChange:  mockOnAuthStateChange,
      signUp:             mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut:            mockSignOut,
    },
  },
}));

import { getSession, onAuthChange, signIn, signOut, signUp } from "../src/auth";

beforeEach(() => vi.clearAllMocks());

describe("getSession", () => {
  it("returns the session from supabase", async () => {
    const fakeSession = { user: { id: "u1" } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    const result = await getSession();
    expect(result).toBe(fakeSession);
    expect(mockGetSession).toHaveBeenCalledOnce();
  });

  it("returns null when no session exists", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await getSession()).toBeNull();
  });
});

describe("signUp", () => {
  it("delegates to supabase.auth.signUp with email and password", async () => {
    mockSignUp.mockResolvedValue({ data: {}, error: null });
    await signUp("test@example.com", "secret123");
    expect(mockSignUp).toHaveBeenCalledWith({ email: "test@example.com", password: "secret123" });
  });

  it("passes through error from supabase", async () => {
    const err = { message: "Email already in use" };
    mockSignUp.mockResolvedValue({ data: null, error: err });
    const { error } = await signUp("dup@example.com", "pass");
    expect(error).toBe(err);
  });
});

describe("signIn", () => {
  it("delegates to supabase.auth.signInWithPassword", async () => {
    const fakeSession = { user: { id: "u1" } };
    mockSignInWithPassword.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const { data } = await signIn("user@example.com", "pass");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "pass",
    });
    expect(data.session).toBe(fakeSession);
  });

  it("passes through authentication error", async () => {
    const err = { message: "Invalid credentials" };
    mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: err });
    const { error } = await signIn("bad@example.com", "wrong");
    expect(error).toBe(err);
  });
});

describe("signOut", () => {
  it("calls supabase.auth.signOut", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});

describe("onAuthChange", () => {
  it("subscribes via supabase.auth.onAuthStateChange and returns subscription", () => {
    const mockSub = { unsubscribe: vi.fn() };
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: mockSub } });

    const cb = vi.fn();
    const sub = onAuthChange(cb);

    expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
    expect(sub).toBe(mockSub);
  });

  it("invokes the callback when onAuthStateChange fires", () => {
    const fakeSession = { user: { id: "u2" } };
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      cb("SIGNED_IN", fakeSession);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const cb = vi.fn();
    onAuthChange(cb);
    expect(cb).toHaveBeenCalledWith(fakeSession);
  });
});
