import type { Request, Response, NextFunction, RequestHandler } from 'express'

// catchAsync wraps an async route handler so that any thrown error is
// forwarded to Express's next() error handler instead of crashing silently.
// Without this, a rejected promise in an async handler would never reach
// the global error middleware at the bottom of index.ts.
//
// Usage:
//   router.get('/foo', catchAsync(async (req, res) => { ... }))
export function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
