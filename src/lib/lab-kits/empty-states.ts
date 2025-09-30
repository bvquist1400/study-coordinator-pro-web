/**
 * Empty State Configuration Helper
 * Provides consistent empty state configurations across lab kit management views
 */

export const EMPTY_STATE_TYPES = {
  FIRST_TIME: 'first-time',
  STUDY_SPECIFIC: 'study-specific',
  FILTERED: 'filtered',
  NO_EXPIRING: 'no-expiring',
  NO_EXPIRED: 'no-expired',
  NO_SHIPMENTS: 'no-shipments',
  NO_ORDERS: 'no-orders',
  NO_ALERTS: 'no-alerts',
  NO_ARCHIVE: 'no-archive',
  SELECT_STUDY: 'select-study',
} as const;

export const ACTION_TYPES = {
  OPEN_ADD_KIT: 'open-add-kit',
  OPEN_BULK_IMPORT: 'open-bulk-import',
  OPEN_QUICKSTART: 'open-quickstart',
  OPEN_CREATE_SHIPMENT: 'open-create-shipment',
  OPEN_SHIPMENTS_GUIDE: 'open-shipments-guide',
  OPEN_ORDER_MODAL: 'open-order-modal',
  GO_FORECAST: 'go-forecast',
  GO_INVENTORY: 'go-inventory',
  CLEAR_FILTERS: 'clear-filters',
  RESET_FILTERS: 'reset-filters',
  RESET_EXPIRING_FILTER: 'reset-expiring-filter',
  SELECT_STUDY: 'select-study',
  REFRESH_FORECAST: 'refresh-forecast',
} as const;

export type EmptyStateType = typeof EMPTY_STATE_TYPES[keyof typeof EMPTY_STATE_TYPES];
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

export interface Filter {
  label: string;
  value: string;
}

export interface EmptyStateContext {
  protocolNumber?: string;
  kitTypes?: string[];
  activeFilters?: Filter[];
  [key: string]: any;
}

export interface EmptyStateStep {
  number: string;
  title: string;
  description: string;
}

export interface EmptyStateAction {
  label: string;
  icon?: string;
  variant: 'primary' | 'secondary';
  type: ActionType;
}

export interface EmptyStateConfig {
  icon: string;
  title: string;
  subtitle?: string;
  description?: string;
  steps?: EmptyStateStep[];
  checkmarks?: string[];
  kitTypes?: {
    label: string;
    list: string[];
  };
  filters?: {
    label: string;
    list: string[];
  };
  actions: EmptyStateAction[];
}

export function getEmptyStateConfig(
  type: EmptyStateType,
  context?: EmptyStateContext
): EmptyStateConfig {
  const configs: Record<EmptyStateType, Omit<EmptyStateConfig, 'title' | 'subtitle' | 'description'> & {
    title: string | ((ctx?: EmptyStateContext) => string);
    subtitle?: string | ((ctx?: EmptyStateContext) => string);
    description?: string | ((ctx?: EmptyStateContext) => string);
  }> = {
    [EMPTY_STATE_TYPES.FIRST_TIME]: {
      icon: '🧪',
      title: 'Welcome!',
      subtitle: 'Get started with lab kit management',
      description: 'Track inventory, prevent shortages, and ship with confidence. Here\'s how to begin:',
      steps: [
        {
          number: '1️⃣',
          title: 'Add Lab Kits',
          description: 'Record kits you\'ve received from vendors',
        },
        {
          number: '2️⃣',
          title: 'Create Shipments',
          description: 'Send kits to subjects for sample collection',
        },
        {
          number: '3️⃣',
          title: 'Stay Ahead',
          description: 'Get alerts before you run out',
        },
      ],
      actions: [
        {
          label: 'Quick Start Guide',
          icon: '📚',
          variant: 'secondary',
          type: ACTION_TYPES.OPEN_QUICKSTART,
        },
        {
          label: 'Add Your First Kit',
          icon: '+',
          variant: 'primary',
          type: ACTION_TYPES.OPEN_ADD_KIT,
        },
      ],
    },

    [EMPTY_STATE_TYPES.STUDY_SPECIFIC]: {
      icon: '📦',
      title: (ctx) => `No kits for Study ${ctx?.protocolNumber || ''} yet`,
      subtitle: 'Add kits as you receive them from vendors',
      kitTypes: context?.kitTypes
        ? {
            label: 'This study uses the following lab kit types:',
            list: context.kitTypes,
          }
        : undefined,
      actions: [
        {
          label: 'Add Inventory',
          icon: '+',
          variant: 'primary',
          type: ACTION_TYPES.OPEN_ADD_KIT,
        },
        {
          label: 'Bulk Import CSV',
          icon: '📄',
          variant: 'secondary',
          type: ACTION_TYPES.OPEN_BULK_IMPORT,
        },
      ],
    },

    [EMPTY_STATE_TYPES.FILTERED]: {
      icon: '🔍',
      title: 'No kits match your filters',
      subtitle: 'Try adjusting your filters or search term',
      filters: context?.activeFilters
        ? {
            label: 'Current filters:',
            list: context.activeFilters.map((f) => `${f.label}: ${f.value}`),
          }
        : undefined,
      actions: [
        {
          label: 'Clear All Filters',
          variant: 'secondary',
          type: ACTION_TYPES.CLEAR_FILTERS,
        },
        {
          label: 'View All Kits',
          variant: 'primary',
          type: ACTION_TYPES.RESET_FILTERS,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_EXPIRING]: {
      icon: '✅',
      title: 'No kits expiring soon',
      description: 'All your kits have expiration dates beyond 30 days or no expiration date set.',
      subtitle: 'You\'re good to go!',
      actions: [
        {
          label: 'View All Inventory',
          variant: 'primary',
          type: ACTION_TYPES.RESET_EXPIRING_FILTER,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_EXPIRED]: {
      icon: '✨',
      title: 'No expired kits',
      description: 'Great job! You don\'t have any expired kits to archive or manage.',
      actions: [
        {
          label: 'View Active Inventory',
          variant: 'primary',
          type: ACTION_TYPES.GO_INVENTORY,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_SHIPMENTS]: {
      icon: '📮',
      title: 'No shipments yet',
      subtitle: 'Ready to send kits to the central lab?',
      description: 'Create a shipment to track kits as they travel to the central lab for processing.',
      actions: [
        {
          label: 'Create Shipment',
          icon: '+',
          variant: 'primary',
          type: ACTION_TYPES.OPEN_CREATE_SHIPMENT,
        },
        {
          label: 'Learn About Shipments',
          icon: '📚',
          variant: 'secondary',
          type: ACTION_TYPES.OPEN_SHIPMENTS_GUIDE,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_ORDERS]: {
      icon: '📋',
      title: 'No pending orders',
      description: 'Place orders to track vendor shipments and get notified when it\'s time to restock.',
      subtitle: 'The system will forecast when you need more kits based on upcoming visits.',
      actions: [
        {
          label: 'Plan Order',
          icon: '+',
          variant: 'primary',
          type: ACTION_TYPES.OPEN_ORDER_MODAL,
        },
        {
          label: 'View Forecast',
          icon: '📊',
          variant: 'secondary',
          type: ACTION_TYPES.GO_FORECAST,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_ALERTS]: {
      icon: '🎉',
      title: 'All clear!',
      description: 'No alerts right now. Your lab kit inventory looks healthy.',
      checkmarks: [
        'Sufficient kits for upcoming visits',
        'No kits expiring soon',
        'All orders and shipments on track',
      ],
      actions: [
        {
          label: 'View Inventory',
          variant: 'primary',
          type: ACTION_TYPES.GO_INVENTORY,
        },
        {
          label: 'View Forecast Details',
          variant: 'secondary',
          type: ACTION_TYPES.GO_FORECAST,
        },
      ],
    },

    [EMPTY_STATE_TYPES.NO_ARCHIVE]: {
      icon: '📂',
      title: 'Archive is empty',
      description: 'No expired, destroyed, or historical kits yet.',
      subtitle: 'Kits that are no longer active will appear here for record-keeping and audit purposes.',
      actions: [
        {
          label: 'View Active Inventory',
          variant: 'primary',
          type: ACTION_TYPES.GO_INVENTORY,
        },
      ],
    },

    [EMPTY_STATE_TYPES.SELECT_STUDY]: {
      icon: '🔒',
      title: 'Select a study to continue',
      description: 'Choose a specific study from the dropdown above to view and manage lab kits.',
      actions: [
        {
          label: 'Select Study',
          variant: 'primary',
          type: ACTION_TYPES.SELECT_STUDY,
        },
      ],
    },
  };

  const config = configs[type];

  // Resolve title, subtitle, and description if they're functions
  return {
    ...config,
    title: typeof config.title === 'function' ? config.title(context) : config.title,
    subtitle: config.subtitle && typeof config.subtitle === 'function' ? config.subtitle(context) : config.subtitle,
    description: config.description && typeof config.description === 'function' ? config.description(context) : config.description,
  };
}
