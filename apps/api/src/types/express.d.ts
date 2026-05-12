// Extends Express's Request type so TypeScript knows req.user exists on
// protected routes after the auth middleware has run.

declare namespace Express {
  interface Request {
    // Populated by requireAuth middleware. Only present on protected routes.
    user?: {
      id: string  // Supabase auth.users UUID
    }
  }
}
