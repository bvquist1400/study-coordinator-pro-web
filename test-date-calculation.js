/**
 * Test date calculations to verify timezone issues are fixed
 */

// Test the JavaScript UTC-safe calculation
function testJavaScriptCalculation() {
  console.log('🧪 Testing JavaScript UTC-safe calculation...')
  
  // Simulate parseDateUTC logic
  function parseDateUTC(dateStr) {
    const iso = /T/.test(dateStr) ? dateStr : `${dateStr}T00:00:00Z`
    return new Date(iso)
  }
  
  const startDate = parseDateUTC('2025-09-01')
  const endDate = parseDateUTC('2025-09-07')
  
  console.log(`Start: ${startDate.toISOString().split('T')[0]}`)
  console.log(`End: ${endDate.toISOString().split('T')[0]}`)
  
  const daysBetween = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const expectedTaken = daysBetween + 1 // Include both start and end day
  
  console.log(`Days between: ${daysBetween}`)
  console.log(`Expected taken: ${expectedTaken}`)
  console.log(`Should be 7: ${expectedTaken === 7 ? '✅' : '❌'}`)
}

// Test what PostgreSQL date subtraction should return
function testPostgreSQLLogic() {
  console.log('\n🧪 Testing PostgreSQL date logic...')
  
  // PostgreSQL: '2025-09-07'::date - '2025-09-01'::date + 1
  const start = new Date('2025-09-01')
  const end = new Date('2025-09-07')
  
  // This simulates PostgreSQL date subtraction (returns integer days)
  const pgDateDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24))
  const pgExpected = pgDateDiff + 1
  
  console.log(`PostgreSQL date diff: ${pgDateDiff}`)
  console.log(`PostgreSQL expected: ${pgExpected}`)
  console.log(`Should be 7: ${pgExpected === 7 ? '✅' : '❌'}`)
}

// Test problematic timezone conversion
function testTimezoneIssue() {
  console.log('\n🧪 Testing timezone conversion issue...')
  
  // This is what might be happening with timestamp conversion
  const start = new Date('2025-09-01T00:00:00')  // Local midnight
  const end = new Date('2025-09-07T00:00:00')    // Local midnight
  
  // If these get converted to UTC, they might shift
  console.log(`Start UTC: ${start.toISOString()}`)
  console.log(`End UTC: ${end.toISOString()}`)
  
  console.log(`Timezone offset: ${start.getTimezoneOffset()} minutes`)
  
  // The issue: if dates cross timezone boundaries during conversion
  const problematicCalc = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  console.log(`Problematic calculation: ${problematicCalc}`)
  console.log(`This might explain the 8: ${problematicCalc === 8 ? '❌ Found the bug!' : 'Not the issue'}`)
}

testJavaScriptCalculation()
testPostgreSQLLogic()
testTimezoneIssue()

console.log('\n💡 The fix: Use ::date casting in PostgreSQL to avoid timezone conversion')
console.log('   Before: (timestamp - timestamp + 1)')
console.log('   After:  (date::date - date::date + 1)')
