import type { Request, RequestHandler, Response } from "express"

type AsyncHandler = (req: Request, res: Response) => Promise<void>

export function asyncRoute(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next)
  }
}
