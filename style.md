{
  `body`: `## Dark Theme Design System Request

I'd like you to implement a sophisticated dark theme with the following color palette and design principles:

### Core Color Scheme
- **Background**: Deep charcoal/black (`bg-black`, `bg-gray-900`)
- **Cards/Containers**: Semi-transparent dark gray (`bg-gray-800/50`, `bg-gray-700/30`)
- **Borders**: Subtle gray (`border-gray-700`, `border-gray-600` on hover)
- **Text Hierarchy**:
  - Primary: Pure white (`text-white`)
  - Secondary: Light gray (`text-gray-300`) 
  - Tertiary: Medium gray (`text-gray-400`)
  - Muted: Dark gray (`text-gray-500`)

### Accent Colors
- **Primary Blue**: `text-blue-400`, `bg-blue-600/700` for buttons
- **Success Green**: `text-green-400`, `bg-green-600/700`
- **Warning Orange**: `text-orange-400`, `bg-orange-600/700`
- **Danger Red**: `text-red-400`, `bg-red-600/700`
- **Purple**: `from-purple-500 to-purple-700` for gradients

### Design Elements
- **Glass Morphism**: Use `backdrop-blur-sm` with semi-transparent backgrounds
- **Rounded Corners**: Consistent `rounded-2xl` for cards, `rounded-lg` for buttons
- **Hover Effects**: Scale transforms (`hover:scale-105`), color transitions
- **Gradients**: Vibrant gradient backgrounds for action cards (`bg-gradient-to-br`)
- **Shadows**: Subtle `hover:shadow-2xl` on interactive elements

### Component Styling Patterns
- Cards should use `bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700`
- Buttons should have `bg-blue-600 hover:bg-blue-700 transition-colors`
- Input fields should use `bg-gray-700/50 border-gray-600 focus:border-blue-500`
- Loading states with blue accent: `border-blue-400 border-t-transparent animate-spin`

### Interactive States
- Hover: Slight scale increase, color shifts, shadow enhancement
- Focus: Blue ring or border highlight
- Active/Selected: Brighter accent colors
- Disabled: Reduced opacity (`opacity-50`)

This creates a modern, professional dark interface that's easy on the eyes while maintaining excellent contrast and accessibility. The semi-transparent layering and backdrop blur effects add visual depth without being distracting.`,
  `kind`: `other`,
  `summaryTitle`: `Dark Theme Design System for Claude Code`
}