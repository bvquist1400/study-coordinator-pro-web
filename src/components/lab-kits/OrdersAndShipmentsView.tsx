'use client'
import LabKitOrdersSection from './LabKitOrdersSection'
import ShipmentsList from './ShipmentsList'

interface OrdersAndShipmentsViewProps {
  studyId: string
  ordersRefreshKey: number
  shipmentsRefreshKey: number
  onOrdersRefresh: () => void
  onShipmentsRefresh: () => void
  onOrderReceived: (details: {
    study_id: string
    kit_type_id: string | null
    received_date: string | null
    kit_type_name: string | null
    quantity?: number | null
  }) => void
  onLocateKit: (details: { studyId?: string | null; accessionNumber?: string | null }) => void
  externalNotice: { type: 'success' | 'error'; message: string } | null
  onClearExternalNotice: () => void
  onCreateShipment?: () => void
  onOpenShipmentsGuide?: () => void
}

export default function OrdersAndShipmentsView({
  studyId,
  ordersRefreshKey,
  shipmentsRefreshKey,
  onOrdersRefresh: _onOrdersRefresh,
  onShipmentsRefresh,
  onOrderReceived,
  onLocateKit,
  externalNotice,
  onClearExternalNotice,
  onCreateShipment,
  onOpenShipmentsGuide
}: OrdersAndShipmentsViewProps) {
  return (
    <div className="space-y-8">
      {/* Pending Orders Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              📦 Pending Orders
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Track vendor orders and mark received
            </p>
          </div>
        </div>

        <LabKitOrdersSection
          studyId={studyId}
          refreshKey={ordersRefreshKey}
          externalNotice={externalNotice}
          onClearExternalNotice={onClearExternalNotice}
          onOrderReceived={onOrderReceived}
        />
      </section>

      {/* Shipments Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              🚚 Shipments
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Track kits in transit to the central laboratory
            </p>
          </div>
        </div>

      <ShipmentsList
          studyId={studyId === 'all' ? null : studyId}
          refreshKey={shipmentsRefreshKey}
          onRefresh={onShipmentsRefresh}
          onLocateKit={onLocateKit}
          onCreateShipment={onCreateShipment}
          onOpenShipmentsGuide={onOpenShipmentsGuide}
        />
      </section>
    </div>
  )
}
