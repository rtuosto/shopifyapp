# Shoptimizer Design Guidelines

## Design Approach
**Selected Framework**: Shopify Polaris Design System
**Rationale**: As an embedded Shopify admin app, maintaining consistency with the Shopify admin interface ensures merchant familiarity, reduces cognitive load, and provides a professional, trusted experience. Polaris web components guarantee visual consistency across all Shopify surfaces.

**Design Principles**:
- **Data-First**: Prioritize actionable insights over decorative elements
- **Scannable Hierarchies**: Clear visual separation between critical metrics and supporting data
- **Trustworthy Precision**: Professional aesthetics that inspire confidence when handling pricing and revenue optimization
- **Guided Automation**: Make AI recommendations feel helpful, not intrusive

---

## Core Design Elements

### A. Color Palette

**Light Mode**:
- **Background**: 246 246 247% (Polaris surface-subdued)
- **Surface**: 0 0% 100% (pure white cards and containers)
- **Primary**: 212 100% 48% (Shopify green for success states and CTAs)
- **Critical**: 359 70% 50% (red for warnings, price decreases)
- **Success**: 120 39% 54% (green for positive metrics, revenue gains)
- **Warning**: 43 100% 50% (amber for attention items)
- **Text Primary**: 0 0% 18%
- **Text Subdued**: 0 0% 46%

**Dark Mode**:
- **Background**: 220 13% 13%
- **Surface**: 220 13% 18%
- **Primary**: 212 100% 58%
- **Critical**: 359 70% 60%
- **Success**: 120 39% 64%
- **Text Primary**: 0 0% 95%
- **Text Subdued**: 0 0% 72%

**Semantic Colors**:
- AI-generated recommendations: Soft purple accent (260 60% 65%)
- Competitor data: Blue-gray (210 20% 55%)
- A/B test results: Teal (180 65% 50%)

### B. Typography

**Primary Font**: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue" (Polaris system stack)

**Type Scale**:
- **Hero Numbers**: 2.5rem / 700 (key metrics like revenue lift)
- **Section Headings**: 1.25rem / 600
- **Card Titles**: 0.9375rem / 600
- **Body Text**: 0.875rem / 400
- **Labels/Captions**: 0.75rem / 500 (uppercase tracking-wide for data labels)
- **Micro Text**: 0.6875rem / 400 (timestamps, metadata)

**Special Treatments**:
- Metric values: Tabular numbers (font-variant-numeric: tabular-nums)
- Percentage changes: Semibold with directional icons
- AI insights: Slightly larger leading (line-height 1.6) for readability

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 2, 3, 4, 6, 8, 12, 16
- Component internal spacing: p-4, p-6
- Card gaps: gap-4, gap-6  
- Section margins: mb-6, mb-8
- Page padding: p-6 (mobile), p-8 (desktop)

**Grid Structure**:
- Dashboard: 12-column grid with 4-column metric cards (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- Data tables: Full-width with responsive horizontal scroll
- Side-by-side comparisons: 2-column layouts (grid-cols-2)

**Container Widths**:
- Main content: max-w-7xl (constrained for readability)
- Full-width tables: w-full
- Modal dialogs: max-w-2xl

### D. Component Library

**Navigation**:
- Polaris TitleBar with app name and contextual actions
- Sticky top navigation with clear active states
- Breadcrumbs for nested views (Tests > Test #123 > Results)

**Cards & Containers**:
- Elevated cards (shadow-sm) for primary metrics
- Flat cards (border) for secondary information
- Card headers with icon + title + action button alignment
- Consistent rounded-lg borders

**Data Display**:
- **Metric Cards**: Large number + percentage change + sparkline trend
- **Progress Indicators**: Linear progress bars showing test confidence levels
- **Data Tables**: Zebra striping, sortable headers, row hover states
- **Status Badges**: Rounded-full pills with semantic colors (Active/Draft/Completed)
- **Comparison Views**: Side-by-side product variants with visual diff highlighting

**AI Recommendation Components**:
- Distinct card styling with purple-tinted border-l-4 accent
- "AI Recommended" badge in top-right
- Confidence score visualization (0-100% circular progress)
- Accept/Reject action buttons with clear primary/secondary hierarchy

**Forms & Inputs**:
- Polaris TextField, Select, Checkbox components
- Inline validation with success/error states
- Helper text below inputs in subdued color
- Price inputs with currency symbols and decimal precision

**Buttons**:
- Primary: Solid green for main actions (Create Test, Apply Optimization)
- Secondary: Outline for alternative actions
- Destructive: Red outline for deletions
- Icon-only buttons for compact actions (edit, delete, info)

**Data Visualization**:
- Line charts for revenue trends (Chart.js or Recharts)
- Bar charts for A/B test performance comparisons
- Donut charts for traffic source breakdowns
- Minimal, non-distracting chart aesthetics with Polaris color palette
- Clear axis labels and data point tooltips

**Overlays**:
- Modal dialogs for test creation workflows
- Toast notifications for success/error feedback (top-right positioning)
- Tooltips for AI insight explanations
- Loading skeletons for async data fetching

### E. Animations

**Minimal, Purposeful Motion**:
- Card hover: Subtle elevation increase (shadow transition 150ms)
- Metric updates: Number count-up animation (500ms)
- Loading states: Pulsing skeleton screens
- NO distracting scroll animations or unnecessary transitions
- Focus on instant feedback for user actions

---

## Dashboard-Specific Guidelines

**Homepage Structure**:
1. **Header Bar**: Active tests count, total revenue lift, last sync timestamp
2. **Quick Metrics Grid** (4 columns): Conversion Rate, Avg Order Value, Revenue Lift, Active Tests
3. **AI Recommendations Section**: 2-3 prioritized optimization cards
4. **Recent Tests Table**: Status, product, variant, performance, actions
5. **Performance Charts**: 30-day revenue trend line chart

**Visual Hierarchy**:
- Revenue/conversion metrics: Largest, most prominent
- AI recommendations: Distinct purple accent, secondary prominence  
- Historical data: Tertiary, collapsed by default with expand interaction
- Action buttons: Always visible, never buried in overflow menus

**Empty States**:
- Friendly illustrations (simple line art style)
- Clear onboarding CTAs for first-time users
- "No tests running" → "Create your first test" button
- Helpful microcopy explaining value proposition

**Responsive Behavior**:
- Mobile: Single column stack, simplified metric cards
- Tablet: 2-column grid for metrics
- Desktop: Full 4-column dashboard layout
- Data tables: Horizontal scroll with sticky first column on mobile

---

## Trust & Professional Polish

**Micro-Interactions**:
- Confirm dialogs before applying price changes
- Loading indicators when AI analyzes products
- Success animations when tests complete
- Clear error messages with recovery suggestions

**Data Integrity Indicators**:
- Timestamps on all metrics ("Updated 5 min ago")
- Confidence intervals on AI predictions
- Source attribution for competitor data
- Version history for test iterations

**Accessibility**:
- WCAG AA contrast ratios minimum
- Keyboard navigation for all interactions
- Screen reader-friendly data table semantics
- Focus visible states on all interactive elements

---

## Visual Tone

Professional SaaS dashboard aesthetic that balances data density with clarity. Think Linear's precision + Stripe's trustworthiness + Shopify's merchant-friendly approachability. Clean, spacious layouts that make complex optimization data feel manageable and actionable.