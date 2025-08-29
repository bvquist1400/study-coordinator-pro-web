import {
  calculateDrugCompliance,
  calculateVisitCompliance,
  calculateOverallCompliance,
  getComplianceColor,
  getComplianceLabel,
  DrugComplianceData,
  VisitComplianceData
} from '@/lib/compliance-calculator'

describe('Compliance Calculator', () => {
  describe('calculateDrugCompliance', () => {
    it('calculates perfect compliance correctly', () => {
      const drugData: DrugComplianceData = {
        tabletsDispensed: 30,
        tabletsReturned: 0,
        dispensingDate: new Date('2024-01-01'),
        expectedReturnDate: new Date('2024-01-31'), // 30 days
        dosingFrequency: 1,
        studyDrug: 'Test Drug'
      }

      const result = calculateDrugCompliance(drugData)
      
      expect(result.percentage).toBe(100)
      expect(result.status).toBe('excellent')
      expect(result.deviations).toHaveLength(0)
    })

    it('calculates poor compliance with recommendations', () => {
      const drugData: DrugComplianceData = {
        tabletsDispensed: 30,
        tabletsReturned: 20, // Only took 10 out of 30
        dispensingDate: new Date('2024-01-01'),
        expectedReturnDate: new Date('2024-01-31'), // 30 days
        dosingFrequency: 1,
        studyDrug: 'Test Drug'
      }

      const result = calculateDrugCompliance(drugData)
      
      expect(result.percentage).toBeCloseTo(33.33, 1)
      expect(result.status).toBe('poor')
      expect(result.deviations.length).toBeGreaterThan(0)
      expect(result.recommendations.length).toBeGreaterThan(0)
    })

    it('detects over-compliance', () => {
      const drugData: DrugComplianceData = {
        tabletsDispensed: 30,
        tabletsReturned: -5, // Returned negative (took more than dispensed)
        dispensingDate: new Date('2024-01-01'),
        expectedReturnDate: new Date('2024-01-31'),
        dosingFrequency: 1,
        studyDrug: 'Test Drug'
      }

      const result = calculateDrugCompliance(drugData)
      
      expect(result.percentage).toBe(100) // Capped at 100%
      expect(result.deviations.some(d => d.includes('Over-compliance'))).toBe(true)
    })
  })

  describe('calculateVisitCompliance', () => {
    it('calculates perfect visit timing', () => {
      const visitData: VisitComplianceData = {
        scheduledDate: new Date('2024-01-15'),
        actualDate: new Date('2024-01-15'), // Same day
        visitWindow: 3,
        visitName: 'Visit 1',
        status: 'completed'
      }

      const result = calculateVisitCompliance(visitData)
      
      expect(result.percentage).toBe(100)
      expect(result.status).toBe('excellent')
      expect(result.deviations).toHaveLength(0)
    })

    it('calculates compliance within visit window', () => {
      const visitData: VisitComplianceData = {
        scheduledDate: new Date('2024-01-15'),
        actualDate: new Date('2024-01-17'), // 2 days late, within 3-day window
        visitWindow: 3,
        visitName: 'Visit 1',
        status: 'completed'
      }

      const result = calculateVisitCompliance(visitData)
      
      expect(result.percentage).toBeGreaterThan(90)
      expect(result.status).toBe('excellent')
    })

    it('calculates compliance outside visit window', () => {
      const visitData: VisitComplianceData = {
        scheduledDate: new Date('2024-01-15'),
        actualDate: new Date('2024-01-20'), // 5 days late, outside 3-day window
        visitWindow: 3,
        visitName: 'Visit 1',
        status: 'completed'
      }

      const result = calculateVisitCompliance(visitData)
      
      expect(result.percentage).toBeLessThan(75)
      expect(result.deviations.length).toBeGreaterThan(0)
      expect(result.deviations[0]).toContain('outside protocol window')
    })

    it('handles missed visits', () => {
      const visitData: VisitComplianceData = {
        scheduledDate: new Date('2024-01-15'),
        actualDate: undefined, // Visit not completed
        visitWindow: 3,
        visitName: 'Visit 1',
        status: 'missed'
      }

      const result = calculateVisitCompliance(visitData)
      
      expect(result.percentage).toBe(0)
      expect(result.status).toBe('poor')
    })
  })

  describe('calculateOverallCompliance', () => {
    it('calculates weighted average correctly', () => {
      const drugCompliances = [
        { percentage: 80, status: 'good' as const, deviations: [], recommendations: [] },
        { percentage: 90, status: 'excellent' as const, deviations: [], recommendations: [] }
      ]

      const visitCompliances = [
        { percentage: 100, status: 'excellent' as const, deviations: [], recommendations: [] },
        { percentage: 95, status: 'excellent' as const, deviations: [], recommendations: [] }
      ]

      const result = calculateOverallCompliance(drugCompliances, visitCompliances)
      
      // Expected: (85 * 0.7) + (97.5 * 0.3) = 59.5 + 29.25 = 88.75
      expect(result.percentage).toBeCloseTo(88.75, 1)
      expect(result.status).toBe('good')
    })

    it('aggregates deviations and recommendations', () => {
      const drugCompliances = [
        { 
          percentage: 60, 
          status: 'poor' as const, 
          deviations: ['Poor compliance'], 
          recommendations: ['Schedule counseling'] 
        }
      ]

      const visitCompliances = [
        { 
          percentage: 70, 
          status: 'acceptable' as const, 
          deviations: ['Late visit'], 
          recommendations: ['Document deviation'] 
        }
      ]

      const result = calculateOverallCompliance(drugCompliances, visitCompliances)
      
      expect(result.deviations).toContain('Poor compliance')
      expect(result.deviations).toContain('Late visit')
      expect(result.recommendations).toContain('Schedule counseling')
      expect(result.recommendations).toContain('Document deviation')
    })
  })

  describe('utility functions', () => {
    it('returns correct compliance colors', () => {
      expect(getComplianceColor('excellent')).toContain('green')
      expect(getComplianceColor('good')).toContain('blue')
      expect(getComplianceColor('acceptable')).toContain('yellow')
      expect(getComplianceColor('poor')).toContain('red')
    })

    it('returns correct compliance labels', () => {
      expect(getComplianceLabel('excellent')).toBe('Excellent')
      expect(getComplianceLabel('good')).toBe('Good')
      expect(getComplianceLabel('acceptable')).toBe('Acceptable')
      expect(getComplianceLabel('poor')).toBe('Poor')
    })
  })
})