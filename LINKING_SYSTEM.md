# ORBIT Unified Linking System

## Overview

The linking system provides a bulletproof, unified way to manage relationships between items in ORBIT. All link operations flow through a single source of truth, ensuring consistency and preventing bugs.

## Architecture

### Core Utilities (`src/lib/links.ts`)

Pure functions for all link-related operations:

```typescript
// Get relationships
getLinkedItems(item, allItems)          // Items this item links to
getReverseLinkedItems(item, allItems)   // Items that link to this item
getParentItem(item, allItems)           // Parent of this item
getChildItems(item, allItems)           // Direct children
getAllDescendants(item, allItems)       // All children recursively
getAllAncestors(item, allItems)         // All parents recursively
getAllRelatedItems(item, allItems)      // Everything connected (any path)

// Modify relationships
addLink(item, targetId)                 // Add a link
removeLink(item, targetId)              // Remove a link
setParent(item, parentId, allItems)     // Set parent (with cycle prevention)

// Utilities
areItemsConnected(item1, item2, allItems)
getLinkableItems(item, allItems, typeFilter?)
getItemRelationships(item, allItems)    // Get everything at once
```

### React Hook (`src/lib/hooks/use-links.ts`)

Provides a clean React API for components:

```typescript
const links = useLinks({ item, allItems, onUpdate });

// Access relationships
links.linkedItems           // Direct links
links.reverseLinkedItems    // Reverse links  
links.parentItem            // Parent
links.childItems            // Children
links.allRelatedItems       // Everything
links.linkableItems         // Available to link
links.relationships         // Complete relationship object

// Actions
links.handleAddLink(targetId)
links.handleRemoveLink(targetId)
links.handleSetParent(parentId)
links.isLinked(targetId)
links.canLink(targetId)
links.getLinkableByType(type)
```

## Usage Examples

### In a Component

```typescript
import { useLinks } from '@/lib/hooks/use-links';

function MyComponent({ item }) {
  const { items } = useOrbitStore();
  const links = useLinks({
    item,
    allItems: items,
    onUpdate: (updates) => updateItem(item.id, updates)
  });

  return (
    <div>
      {/* Show linked items */}
      {links.linkedItems.map(linked => (
        <div key={linked.id}>{linked.title}</div>
      ))}

      {/* Add a link */}
      <button onClick={() => links.handleAddLink(someId)}>
        Link
      </button>
    </div>
  );
}
```

### Using Utilities Directly

```typescript
import { getAllRelatedItems, areItemsConnected } from '@/lib/links';

// Check if two items are connected
if (areItemsConnected(item1, item2, allItems)) {
  console.log('These items are related!');
}

// Get complete network
const network = getAllRelatedItems(currentItem, allItems);
console.log(`Found ${network.length} related items`);
```

## Features

### ✅ Circular Reference Prevention

The `setParent` function automatically prevents circular relationships:

```typescript
// This is prevented automatically
Project A → parent: Project B
Project B → parent: Project C
Project C → parent: Project A  // ❌ Blocked!
```

### ✅ Recursive Graph Traversal

All relationship functions handle deep nesting:

```typescript
Event → Note → Task → Project (with 7 tasks)

// getAllRelatedItems from Event returns ALL items:
// - Note
// - Task
// - Project
// - All 7 tasks
```

### ✅ Type Safety

All functions are fully typed with TypeScript:

```typescript
const linkedItems: OrbitItem[] = getLinkedItems(item, allItems);
const parent: OrbitItem | undefined = getParentItem(item, allItems);
```

### ✅ Performance Optimized

- Uses `Set` for visited tracking (O(1) lookups)
- Filters out archived items automatically
- Memoized in React hooks

## Components Using the System

- **LinkManager**: Full UI for managing all relationships
- **LinkGraph**: Visual flowchart of connections
- **NoteEditor**: Simplified linking in settings
- **DetailPanel**: Integrated LinkManager

## Benefits

1. **Single Source of Truth**: All link logic in one place
2. **Consistency**: Same behavior everywhere
3. **Maintainability**: Easy to update and test
4. **Safety**: Built-in protections against common errors
5. **Developer Experience**: Clean, intuitive API

## Migration Guide

### Old Pattern ❌

```typescript
const linkedIds = item.linkedIds || [];
const newLinkedIds = [...linkedIds, targetId];
await updateItem(item.id, { linkedIds: newLinkedIds });
```

### New Pattern ✅

```typescript
const links = useLinks({ item, allItems, onUpdate });
links.handleAddLink(targetId);
```

## Testing

Test utilities directly without React:

```typescript
import { addLink, removeLink, setParent } from '@/lib/links';

test('addLink creates correct update', () => {
  const item = { id: '1', linkedIds: ['2'] };
  const result = addLink(item, '3');
  expect(result).toEqual({ linkedIds: ['2', '3'] });
});
```

## Future Enhancements

- [ ] Link labels/tags (e.g., "blocks", "references")
- [ ] Link strength/importance
- [ ] Bidirectional link sync option
- [ ] Link history/audit trail
- [ ] Bulk link operations
