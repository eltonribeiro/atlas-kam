import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { Route as recoveryRoute } from '@/routes/reset-password';

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it('redirects retired password recovery to Microsoft sign-in', () => {
    try {
      recoveryRoute.options.beforeLoad?.({} as never);
      throw new Error('Expected redirect');
    } catch (error) {
      expect(error).toMatchObject({ options: { to: '/auth', replace: true } });
    }
  });
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each(['/ocorrencias', '/ocorrencias/nova', '/ocorrencias/123', '/problemas', '/problemas/123', '/config/sla', '/contas', '/relatorios'])('keeps %s inside the authenticated layout', (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).map(match => match.routeId)).toContain('/_authenticated');
  });

  it.each(['/auth', '/reset-password', '/avaliacao/token'])('keeps %s outside the authenticated layout', (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.map(match => match.routeId)).not.toContain('/_authenticated');
  });
});
