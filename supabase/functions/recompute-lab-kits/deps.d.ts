/// <reference lib="deno.ns" />

declare module 'https://deno.land/std@0.203.0/http/server.ts' {
  export interface ServeInit {
    port?: number
    hostname?: string
  }

  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: ServeInit
  ): void
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}
