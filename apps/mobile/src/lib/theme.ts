// RoadGuard Design System — Colors, Typography, Spacing
// Clean civic-technology aesthetic: white, charcoal, green accent

export const Colors = {
  // Primary palette
  background: '#FFFFFF',
  surface: '#F8F9FA',
  surfaceElevated: '#FFFFFF',
  border: '#E5E8EC',
  borderLight: '#F0F2F5',

  // Typography
  textPrimary: '#1A1D21',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Accent — restrained civic green
  accent: '#2D7D46',
  accentLight: '#EBF5EE',
  accentMedium: '#4CAF71',
  accentDark: '#1E5C32',

  // Status colors
  statusPending: '#F59E0B',
  statusPendingBg: '#FFFBEB',
  statusVerified: '#3B82F6',
  statusVerifiedBg: '#EFF6FF',
  statusAssigned: '#8B5CF6',
  statusAssignedBg: '#F5F3FF',
  statusInProgress: '#F97316',
  statusInProgressBg: '#FFF7ED',
  statusResolved: '#10B981',
  statusResolvedBg: '#ECFDF5',
  statusRejected: '#EF4444',
  statusRejectedBg: '#FEF2F2',
  statusDuplicate: '#6B7280',
  statusDuplicateBg: '#F9FAFB',

  // Confidence / detection states
  detected: '#10B981',      // pothole detected
  uncertain: '#F59E0B',     // uncertain
  notDetected: '#6B7280',   // not detected
  error: '#EF4444',         // inference error

  // Utility
  shadow: 'rgba(0, 0, 0, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  transparent: 'transparent',
} as const

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const

// Status display helpers
export const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending_verification': return { text: Colors.statusPending, bg: Colors.statusPendingBg, label: 'Pending Review' }
    case 'verified': return { text: Colors.statusVerified, bg: Colors.statusVerifiedBg, label: 'Verified' }
    case 'assigned': return { text: Colors.statusAssigned, bg: Colors.statusAssignedBg, label: 'Assigned' }
    case 'in_progress': return { text: Colors.statusInProgress, bg: Colors.statusInProgressBg, label: 'In Progress' }
    case 'resolved': return { text: Colors.statusResolved, bg: Colors.statusResolvedBg, label: 'Resolved' }
    case 'rejected': return { text: Colors.statusRejected, bg: Colors.statusRejectedBg, label: 'Rejected' }
    case 'duplicate': return { text: Colors.statusDuplicate, bg: Colors.statusDuplicateBg, label: 'Duplicate' }
    default: return { text: Colors.textSecondary, bg: Colors.surface, label: status }
  }
}

export const getDetectionStateColor = (state: string) => {
  switch (state) {
    case 'pothole_detected': return Colors.detected
    case 'uncertain_low_confidence': return Colors.uncertain
    case 'no_pothole_detected': return Colors.notDetected
    default: return Colors.error
  }
}
