import React from 'react'
import { expect, test } from '@playwright/experimental-ct-react'
import PerStudyBreakdownChart, {
  type PerStudyBreakdownDatum
} from '@/components/workload/PerStudyBreakdownChart'

const SAMPLE_DATA: PerStudyBreakdownDatum[] = [
  {
    weekStart: '2025-12-29',
    meetingHours: 1.2,
    screeningHours: 1.8,
    queryHours: 0.6,
    totalHours: 3.6,
    notesCount: 1,
    coordinators: [{ coordinatorId: 'coord-1' }]
  },
  {
    weekStart: '2026-01-05',
    meetingHours: 1.6,
    screeningHours: 2.4,
    queryHours: 0.8,
    totalHours: 4.8,
    notesCount: 2,
    coordinators: [{ coordinatorId: 'coord-1' }, { coordinatorId: 'coord-2' }]
  },
  {
    weekStart: '2026-01-12',
    meetingHours: 1.4,
    screeningHours: 2.1,
    queryHours: 0.9,
    totalHours: 4.4,
    notesCount: 1,
    coordinators: [{ coordinatorId: 'coord-2' }]
  },
  {
    weekStart: '2026-01-19',
    meetingHours: 1.9,
    screeningHours: 2.6,
    queryHours: 1,
    totalHours: 5.5,
    notesCount: 0,
    coordinators: [{ coordinatorId: 'coord-1' }, { coordinatorId: 'coord-3' }]
  },
  {
    weekStart: '2026-01-26',
    meetingHours: 2.1,
    screeningHours: 2.8,
    queryHours: 1.2,
    totalHours: 6.1,
    notesCount: 1,
    coordinators: [{ coordinatorId: 'coord-1' }, { coordinatorId: 'coord-2' }, { coordinatorId: 'coord-3' }]
  }
]

test.describe('PerStudyBreakdownChart', () => {
  test('captures a stable visual snapshot of the stacked area chart', async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 820, height: 360, padding: 16, background: '#111827' }}>
        <PerStudyBreakdownChart data={SAMPLE_DATA} disableAnimation />
      </div>
    )

    await expect(component.locator('svg')).toBeVisible()

    await expect(component).toHaveScreenshot('per-study-breakdown.png', {
      fullPage: false
    })
  })
})
