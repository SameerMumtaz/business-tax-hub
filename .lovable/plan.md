

## Add "Suggested Rules" Section to Expenses & Sales Tabs

### What
Add a "Rules" tab to both the Expenses and Sales pages that shows:
1. A "Detect Patterns" button that scans transactions for repeated vendor→category mappings
2. A "Suggested Rules" card listing inferred patterns with Accept/Dismiss actions
3. A link to the full Categorization Rules page for managing all rules

### How

**`src/pages/ExpensesPage.tsx`**
- Add a third tab: `<TabsTrigger value="rules">Rules</TabsTrigger>`
- In `<TabsContent value="rules">`: render a "Detect Patterns" button, the suggested rules list (reusing the same `InferredPattern` UI from CategorizationRulesPage), and existing expense rules summary
- Import and call `detectPatterns` and `saveInferredRule` from `ruleInference.ts`
- Add local state for `inferredPatterns` and `detectingPatterns`

**`src/pages/SalesPage.tsx`**
- Same approach: add a "Rules" tab with detect/suggest UI scoped to income/sales patterns

**Shared pattern display** (optional extraction)
- Consider extracting the suggested-rules card into a reusable `<SuggestedRulesPanel>` component to avoid duplicating the accept/dismiss UI across 3 pages

### Implementation Details

1. **New component: `src/components/SuggestedRulesPanel.tsx`**
   - Props: `type: "expense" | "income"`, `transactions: {id, vendor, category}[]`
   - Contains detect button, pattern state, and accept/dismiss UI
   - On accept: calls `saveInferredRule`, shows toast with count, invalidates queries

2. **Update `ExpensesPage.tsx`**
   - Add `<TabsTrigger value="rules">Rules</TabsTrigger>`
   - Add `<TabsContent value="rules">` containing `<SuggestedRulesPanel type="expense" transactions={expenses} />`

3. **Update `SalesPage.tsx`**
   - Same pattern with `type="income"`

4. **Update `CategorizationRulesPage.tsx`**
   - Replace inline suggested rules UI with `<SuggestedRulesPanel>` to stay DRY

