# Testing Framework Documentation

## Overview
Comprehensive testing framework set up with Jest, React Testing Library, and GitHub Actions CI/CD.

## Setup Complete ✅

### Dependencies Installed
- `jest` - JavaScript testing framework
- `@testing-library/react` - React component testing utilities
- `@testing-library/jest-dom` - Custom Jest matchers
- `@testing-library/user-event` - User interaction simulation
- `jest-environment-jsdom` - Browser-like test environment
- `@types/jest` - TypeScript definitions
  
Note: We use `next/jest` for TypeScript + Next integration; `ts-jest` is not used.

### Configuration Files
- `jest.config.js` - Jest configuration with Next.js integration
- `jest.setup.js` - Global test setup and mocks
- `.github/workflows/test.yml` - CI/CD pipeline for automated testing

### Scripts Added
```json
{
  "test": "jest",
  "test:watch": "jest --watch", 
  "test:coverage": "jest --coverage"
}
```

## Test Structure

### Current Tests
- `ThemeToggle.test.tsx` - Theme switching component tests ✅
- `AddStudyForm.test.tsx` - Form validation and interaction tests (4/6 passing) ⚠️
- `database-types.test.ts` - TypeScript interface validation ✅
- `analytics-workload.route.test.ts` - Ensures `/api/analytics/workload?includeBreakdown=true` emits weekly coordinator breakdown aggregates ✅
- `WorkloadEngineView.test.tsx` - Renders dashboard with API mocks and verifies the per-study breakdown card/summary ✅

### Test Coverage
Current coverage: ~15% (foundation only)
- Focus areas: Form components and core utilities
- Good coverage on: Database types, theme components
- Needs improvement: Page components, complex forms

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test pattern
npm test -- --testNamePattern="ThemeToggle"
```

## Mocking Strategy

### Global Mocks (jest.setup.js)
- Next.js router functions
- Browser APIs (ResizeObserver, matchMedia)

### Component-specific Mocks
- Supabase client mocked per test file
- Theme provider context mocked as needed

## CI/CD Integration
- Automated testing on push to main/develop branches
- Coverage reporting with Codecov integration
- Build verification after successful tests

## Next Steps for Testing

### Immediate (Week 1)
1. Fix remaining AddStudyForm test issues
2. Add tests for DashboardLayout component
3. Add API route testing setup

### Medium-term (Weeks 2-4)
1. Add integration tests for complete user flows
2. Set up E2E testing with Playwright
3. Increase coverage to 80%+ on core components

### Long-term (Month 2+)
1. Visual regression testing
2. Performance testing for large datasets
3. Accessibility testing integration

## Testing Best Practices

1. **Test behavior, not implementation** - Focus on what users see/do
2. **Use meaningful test names** - Describe the expected behavior
3. **Keep tests isolated** - Each test should be independent
4. **Mock external dependencies** - Keep tests fast and reliable
5. **Test error states** - Don't just test happy paths

## Troubleshooting

### Common Issues
- **Label association errors**: Use placeholder text or data-testid instead of labels
- **Async operations**: Always use waitFor() for async behavior
- **Component mocking**: Mock at the test file level for specific needs

### Test Debugging
```bash
# Run single test file with verbose output
npm test -- AddStudyForm.test.tsx --verbose

# Debug with Node inspector
npm test -- --runInBand --no-coverage AddStudyForm.test.tsx
```

## Framework Status: COMPLETE ✅

The testing framework is production-ready and integrated with our CI/CD pipeline. Ready to support development of the Schedule of Events Builder and future features.
