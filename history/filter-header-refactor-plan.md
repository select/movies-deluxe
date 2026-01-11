# Filter Header Refactor - Implementation Plan

## Epic Overview

Refactor the filter menu into an integrated search header with inline filter controls. Replace the sidebar filter icon with category buttons directly in the header.

## Current Architecture

### Components

- **SearchHeader.vue** - Fixed search bar at top (only on search page)
- **FilterMenu.vue** - Slide-out panel with all filters (mobile: bottom sheet, desktop: left sidebar)
- **Sidebar.vue** - Navigation sidebar with filter icon button
- **search.vue** - Search page with sticky search header

### Filter Categories (from FilterMenu.vue)

1. **Sort By** - Button group (relevance, rating, year, title, votes)
2. **Rating** - Single slider (min: 0-10, step 0.5)
3. **Year** - Two sliders (min/max: 1910-2025)
4. **Votes** - Two number inputs (min/max)
5. **Genres** - Multi-select pill buttons with counts
6. **Countries** - Multi-select pill buttons with counts
7. **Source** - Checkboxes (archive.org + YouTube channels)

### State Management

- **useMovieStore** - Manages all filter state in `filters` object
- Filters persisted to localStorage via VueUse `useStorage`
- Filter changes trigger database queries via watchers

## Target Design

### New SearchHeader Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [🔍 Search input...........................] [Clear] [X]    │
├─────────────────────────────────────────────────────────────┤
│  [Sort ▼] [Rating ▼] [Year ▼] [Votes ▼] [Genres ▼]         │
│  [Countries ▼] [Source ▼]                    [Clear All]    │
└─────────────────────────────────────────────────────────────┘
```

### Filter Button States

1. **Inactive** - Transparent background, category name only
2. **Active** - Shows selected value/count, colored indicator
3. **Hover** - Opens popup menu with filter controls

### Popup Menu Behavior

- Click button → Open popup menu below button
- Popup contains same controls as current FilterMenu section
- For sliders: Show current value + slider control
- For multi-select: Show pills/checkboxes
- Include "Clear" button in popup if filter active
- Click outside or ESC → Close popup
- Apply changes immediately (no "Apply" button needed)

### Votes Slider Design

- Use logarithmic scale for better UX
- Steps: 0, 100, 500, 1K, 5K, 10K, 50K, 100K, 500K, 1M+
- Display formatted value (e.g., "10K", "1.5M")
- Two handles for min/max range

## Implementation Tasks

### Phase 1: Component Architecture

1. **Create FilterButton.vue** - Reusable button component

   - Props: category, icon, activeValue, isActive
   - Emits: click, clear
   - Shows category name + active state indicator

2. **Create FilterPopup.vue** - Popup container component

   - Props: isOpen, position, title
   - Emits: close
   - Handles positioning, backdrop, click-outside
   - Focus trap for accessibility

3. **Create filter control components**
   - **FilterSortControl.vue** - Sort button group
   - **FilterRatingControl.vue** - Single slider (0-10)
   - **FilterYearControl.vue** - Dual slider (1910-2025)
   - **FilterVotesControl.vue** - Dual slider with logarithmic scale
   - **FilterGenresControl.vue** - Multi-select pills
   - **FilterCountriesControl.vue** - Multi-select pills
   - **FilterSourceControl.vue** - Checkboxes

### Phase 2: SearchHeader Refactor

4. **Refactor SearchHeader.vue**

   - Add filter button row below search input
   - Integrate FilterButton components for each category
   - Manage popup open/close state
   - Show "Clear All" button when filters active
   - Handle responsive layout (stack on mobile)

5. **Update search.vue page**
   - Remove old SearchHeader if needed
   - Ensure new SearchHeader is sticky
   - Test scroll behavior

### Phase 3: Sidebar Updates

6. **Remove filter icon from Sidebar.vue**

   - Remove filter button from desktop sidebar
   - Remove filter button from mobile sidebar
   - Remove activeFiltersCount badge
   - Remove clear filters hover button
   - Keep keyboard shortcut (Ctrl+K) but redirect to search page

7. **Update default.vue layout**
   - Remove FilterMenu component
   - Remove filter menu state management
   - Remove Escape key handler for filter menu
   - Keep Ctrl+K shortcut but navigate to /search

### Phase 4: Cleanup

8. **Remove FilterMenu.vue** - No longer needed
9. **Remove FilterSection.vue** - No longer needed
10. **Remove CollapsibleFilterItems.vue** - No longer needed
11. **Update keyboard shortcuts** - Ctrl+K navigates to search page

### Phase 5: Testing & Polish

12. **Test all filter interactions**

    - Each filter type works correctly
    - Popup positioning on all screen sizes
    - Active state indicators
    - Clear individual filters
    - Clear all filters

13. **Test responsive behavior**

    - Mobile: buttons stack/scroll horizontally
    - Tablet: optimal layout
    - Desktop: all buttons visible

14. **Accessibility testing**
    - Keyboard navigation
    - Screen reader support
    - Focus management

## Technical Considerations

### Popup Positioning

- Use floating-ui or similar for smart positioning
- Handle viewport edges (flip to top if needed)
- Mobile: Consider full-screen overlay for complex filters

### Performance

- Lazy load filter options (genres, countries, channels)
- Debounce slider changes
- Optimize re-renders with proper memoization

### State Management

- No changes to useMovieStore needed
- All filter state remains in store
- Components just read/write to existing store actions

### Votes Slider Scale

```javascript
const votesScale = [
  { value: 0, label: '0' },
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1000, label: '1K' },
  { value: 5000, label: '5K' },
  { value: 10000, label: '10K' },
  { value: 50000, label: '50K' },
  { value: 100000, label: '100K' },
  { value: 500000, label: '500K' },
  { value: 1000000, label: '1M' },
]
```

## Migration Strategy

1. Build new components alongside existing FilterMenu
2. Test new header on search page only
3. Once stable, remove old FilterMenu
4. Update sidebar to remove filter button
5. Clean up unused components

## Rollback Plan

- Keep FilterMenu.vue until new system is fully tested
- Feature flag to toggle between old/new filter UI
- Can revert by restoring sidebar filter button

## Success Criteria

- ✅ All filter functionality works as before
- ✅ Filters are more discoverable (visible in header)
- ✅ Faster access (no need to open sidebar menu)
- ✅ Better mobile UX (inline controls)
- ✅ Votes slider has better UX with logarithmic scale
- ✅ No filter icon in sidebar
- ✅ Responsive on all screen sizes
- ✅ Accessible via keyboard and screen readers
