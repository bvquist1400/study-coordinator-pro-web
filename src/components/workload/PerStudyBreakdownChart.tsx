import type { CSSProperties } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from 'recharts'

export type PerStudyBreakdownCoordinator = {
  coordinatorId?: string | null
  meetingHours?: number | null
  screeningHours?: number | null
  queryHours?: number | null
  totalHours?: number | null
  notesCount?: number | null
  lastUpdatedAt?: string | null
}

export type PerStudyBreakdownDatum = {
  weekStart: string
  meetingHours: number
  screeningHours: number
  queryHours: number
  totalHours: number
  notesCount?: number
  coordinators?: PerStudyBreakdownCoordinator[]
}

export type PerStudyBreakdownChartProps = {
  data: PerStudyBreakdownDatum[]
  height?: number
  disableAnimation?: boolean
  tooltipStyle?: CSSProperties
}

const DEFAULT_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  padding: '8px 10px',
  color: '#f9fafb',
  fontSize: '12px'
}

type BreakdownTooltipDatum = PerStudyBreakdownDatum

type BreakdownTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: BreakdownTooltipDatum }>
  tooltipStyle: CSSProperties
}

const roundHours = (value: number) => Math.round(value * 10) / 10

function BreakdownTooltip(props: BreakdownTooltipProps) {
  const { active, payload, label, tooltipStyle } = props as BreakdownTooltipProps & {
    label?: string | number
  }

  if (!active || !payload || payload.length === 0) {
    return null
  }

  const datum = payload[0]?.payload as BreakdownTooltipDatum | undefined

  if (!datum) return null

  const formatHours = (value: number) => `${roundHours(value)} hrs`

  return (
    <div style={tooltipStyle} className="space-y-1">
      <div className="text-xs font-semibold text-gray-100">{label}</div>
      <div className="text-xs text-gray-200">Meetings: {formatHours(datum.meetingHours)}</div>
      <div className="text-xs text-gray-200">Screening: {formatHours(datum.screeningHours)}</div>
      <div className="text-xs text-gray-200">Queries: {formatHours(datum.queryHours)}</div>
      <div className="text-xs text-gray-300">Total: {formatHours(datum.totalHours)}</div>
      {datum.notesCount && datum.notesCount > 0 && (
        <div className="text-[11px] text-blue-300">Notes logged: {datum.notesCount}</div>
      )}
      {datum.coordinators && datum.coordinators.length > 0 && (
        <div className="text-[11px] text-gray-400">
          Contributors: {datum.coordinators.length}
        </div>
      )}
    </div>
  )
}

export default function PerStudyBreakdownChart({
  data,
  height = 288,
  disableAnimation = false,
  tooltipStyle = DEFAULT_TOOLTIP_STYLE
}: PerStudyBreakdownChartProps) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="weekStart"
            stroke="#9ca3af"
            fontSize={11}
          />
          <YAxis
            tickFormatter={(value) => `${roundHours(value as number)}h`}
            stroke="#9ca3af"
            fontSize={11}
          />
          <Tooltip
            content={(props) => (
              <BreakdownTooltip
                {...(props as TooltipProps<number, string>)}
                tooltipStyle={tooltipStyle}
              />
            )}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={36}
            formatter={(value) => <span className="text-xs text-gray-300">{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="meetingHours"
            name="Meetings"
            stackId="1"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.5}
            isAnimationActive={!disableAnimation}
          />
          <Area
            type="monotone"
            dataKey="screeningHours"
            name="Screening"
            stackId="1"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.5}
            isAnimationActive={!disableAnimation}
          />
          <Area
            type="monotone"
            dataKey="queryHours"
            name="Queries"
            stackId="1"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.5}
            isAnimationActive={!disableAnimation}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
