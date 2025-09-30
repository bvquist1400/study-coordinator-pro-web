/**
 * EmptyState Component
 * Renders contextual empty states for lab kit management views
 */

import React from 'react';
import {
  getEmptyStateConfig,
  type EmptyStateType,
  type EmptyStateContext,
  type ActionType,
} from '@/lib/lab-kits/empty-states';

export interface EmptyStateProps {
  type: EmptyStateType;
  context?: EmptyStateContext;
  onAction?: (actionType: ActionType) => void;
}

export default function EmptyState({
  type,
  context,
  onAction,
}: EmptyStateProps) {
  const config = getEmptyStateConfig(type, context);

  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">{config.icon}</div>

      <h3 className="empty-state-title">{config.title}</h3>

      {config.subtitle && (
        <p className="empty-state-subtitle">{config.subtitle}</p>
      )}

      {config.description && (
        <p className="empty-state-description">{config.description}</p>
      )}

      {config.kitTypes && (
        <div className="empty-state-kit-types">
          <p className="kit-types-label">{config.kitTypes.label}</p>
          <ul className="kit-types-list">
            {config.kitTypes.list.map((kitType, idx) => (
              <li key={idx}>• {kitType}</li>
            ))}
          </ul>
        </div>
      )}

      {config.filters && (
        <div className="empty-state-filters">
          <p className="filters-label">{config.filters.label}</p>
          <ul className="filters-list">
            {config.filters.list.map((filter, idx) => (
              <li key={idx}>• {filter}</li>
            ))}
          </ul>
        </div>
      )}

      {config.steps && (
        <ol className="empty-state-steps">
          {config.steps.map((step, idx) => (
            <li key={idx}>
              <span className="step-number">{step.number}</span>
              <div className="step-content">
                <strong className="step-title">{step.title}</strong>
                <p className="step-description">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {config.checkmarks && (
        <ul className="empty-state-checkmarks">
          {config.checkmarks.map((item, idx) => (
            <li key={idx}>
              <span className="checkmark">•</span> {item}
            </li>
          ))}
        </ul>
      )}

      <div className="empty-state-actions">
        {config.actions.map((action, idx) => (
          <button
            key={idx}
            className={`empty-state-btn empty-state-btn-${action.variant}`}
            onClick={() => onAction?.(action.type)}
          >
            {action.icon && <span className="btn-icon">{action.icon}</span>}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
