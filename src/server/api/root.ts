import { createTRPCRouter } from "~/server/api/trpc";
import { gitRouter, dirRouter } from "~/server/api/routers/git";

export const appRouter = createTRPCRouter({
  git: gitRouter,
  dir: dirRouter,
});

export type AppRouter = typeof appRouter;
