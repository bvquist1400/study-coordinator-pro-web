import '@testing-library/jest-dom'
// Polyfill fetch/Request/Response for route handler tests
try {
  // Node 20+ provides undici; register fetch globals for Jest
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('undici/register')
} catch {}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  usePathname() {
    return '/dashboard'
  },
  useSearchParams() {
    return new URLSearchParams()
  },
}))

// Global test utilities
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Stub/override alert in jsdom to avoid not implemented errors
// @ts-expect-error: jsdom types may not include alert
window.alert = jest.fn()

// Mock supabase client used on the client side where only session access is needed in tests
jest.mock('@/lib/supabase/client', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

// Note: undici/register above provides fetch, Request, Response, Headers globals in Node 18/20

// Provide a default SiteProvider/useSite for tests that don't supply a provider explicitly
jest.mock('@/components/site/SiteProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  return {
    __esModule: true,
    SiteProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useSite: () => ({
      sites: [],
      currentSiteId: null,
      setCurrentSiteId: jest.fn(),
      reload: jest.fn(),
    }),
  }
})
