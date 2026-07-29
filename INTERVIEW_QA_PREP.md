# Frontend Fundamentals Interview Q&A Prep

Clean format: No redundant question repetition. Just answers and pointers.

---

## Q1: What is the difference between useMemo and useCallback?

[POINTER 1]
useMemo saves a computed value; useCallback saves a function.

[POINTER 2]
useMemo runs its function when dependencies change—prevents expensive recalculations.
useCallback memoizes a function itself—prevents child components from re-rendering when the function is passed as a prop.

[POINTER 3]
In my dashboard, I used useCallback inside useFetch hook. The refetch function is memoized so child components that receive it as a prop don't re-render unnecessarily.

---

## Q2: Explain useEffect cleanup and why it matters.

[POINTER 1]
Cleanup runs when the component unmounts or dependencies change. It prevents memory leaks, duplicate listeners, and stale state.

[POINTER 2]
Common cleanup: removing event listeners, canceling API requests, clearing timers.
Without cleanup: multiple listeners stack up; old API responses override new ones.

[POINTER 3]
In useFetch, if the component unmounts while a request is pending, cleanup cancels the request. This prevents "can't update unmounted component" warnings.

---

## Q3: What's the difference between debounce and throttle?

[POINTER 1]
Debounce waits for silence—fires only after the user stops acting (e.g., finishes typing).
Throttle fires periodically—at most once per X milliseconds, even if the user keeps acting.

[POINTER 2]
Debounce: good for search input, form validation (reduce API calls until user pauses).
Throttle: good for scroll/resize events (ensure handler runs at least once per interval).

[POINTER 3]
In my dashboard, I use useDebounce for transaction search. If the user types three characters, I wait 300ms of silence before hitting the search API.

---

## Q4: How do you handle loading, error, and empty states?

[POINTER 1]
Three separate UI branches: one for loading (spinner), one for error (retry button), one for empty (helpful message).
Each state is independent and clear to the user.

[POINTER 2]
In useFetch hook, the return object includes { data, loading, error }. Components check these flags and render conditionally.
Loading shows a skeleton or spinner; error shows the message + retry button; empty state shows "No transactions yet."

[POINTER 3]
This matters in fintech: users expect fast feedback. A blank screen or delayed error message erodes trust.
Bright Money's automation-first UX needs instant clarity about what's happening.

---

## Q5: Why did you use custom hooks instead of Context API or Redux?

[POINTER 1]
Custom hooks are simpler for small, focused concerns. Each hook has single responsibility: fetch, analytics, debounce, storage.
Context/Redux add boilerplate when not needed.

[POINTER 2]
My app doesn't have deeply nested prop drilling or global state conflicts.
Hooks are easier to test, understand, and reuse across components.

[POINTER 3]
If the app grows (new pages, shared state across features), I'd introduce Zustand or Redux.
But for this scope, hooks keep code lean and DX fast.

---

## Q6: How does your mobile and desktop layout work?

[POINTER 1]
Window resize listener detects breakpoint (1024px). App renders completely different component trees: Layout (mobile) vs DesktopLayout (desktop).

[POINTER 2]
Mobile: 4 tabs, bottom navigation. Desktop: 5 tabs, left sidebar.
useLocalStorage remembers active tab across resize and refresh.

[POINTER 3]
This avoids awkward responsive squashing. Mobile UX is optimized for phones; desktop UX leverages extra screen space.
Different information hierarchy per device—fintech users expect clarity at any size.

---

## Q7: Explain your performance optimizations.

[POINTER 1]
Three main techniques:
1. Lazy loading with React.lazy() + Suspense (per-route code splitting; each page 5–21KB)
2. Memoization with useMemo and useCallback (prevent expensive recalculations and function recreation)
3. Debouncing in search (reduce API calls during typing)

[POINTER 2]
Initial bundle ~374KB. Lighthouse Performance: 91/100.
No images; mock data eliminates fetch latency.

[POINTER 3]
For fintech, performance = trust. Smooth transitions and instant feedback reassure users during financial actions.

---

## Q8: What is your approach to accessibility?

[POINTER 1]
WCAG 2.2 Level AA compliance. Lighthouse: 100/100.
Semantic HTML, ARIA labels, keyboard navigation, color contrast 7.8:1 (AAA).

[POINTER 2]
Tab, Enter, Space, arrow keys work throughout. Focus indicators visible (2px emerald ring).
Screen readers get proper labels on buttons, links, and regions.

[POINTER 3]
Financial apps need trust. Accessible UI signals confidence and inclusivity.

---

## Q9: How do you structure mock data to avoid conflicts between mobile and desktop?

[POINTER 1]
Single source of truth: mockData.ts exports MOCK_USER, MOCK_TRANSACTIONS, MOCK_SPENDING_DISTRIBUTION, etc.
Both mobile and desktop components import from the same module.

[POINTER 2]
No duplication = no sync bugs. Easy to swap for real API later; just change the fetch call in useFetch.

[POINTER 3]
This pattern scales: add new data types to mockData.ts once; all components benefit immediately.

---

## Q10: What's a challenge you solved and how?

[POINTER 1]
Challenge: Mobile and desktop have completely different navigation, layouts, and information hierarchies—but share the same data.
If I built one responsive layout, mobile would feel cramped; desktop would feel empty.

[POINTER 2]
Solution: Detect viewport size (1024px breakpoint), then render entirely different component trees.
useLocalStorage ensures tab state persists across resize and refresh.
mockData.ts keeps data consistent.

[POINTER 3]
Result: Seamless toggle between modes, no data conflicts, clear UX for each device.
Bright Money users switch between phone and desktop during financial tasks—this architecture ensures trust at any size.

---

## Q11: What would you improve if you had more time?

[POINTER 1]
1. Real backend (replace mockData.ts with API endpoints; add error retry logic)
2. State management at scale (Zustand or Redux for cross-component state)
3. E2E tests (Cypress/Playwright for user flows)
4. Server-side rendering (Next.js for SEO and initial load speed)

[POINTER 2]
5. Voice input for Wallet assistant (hands-free financial actions)
6. Advanced animations (gesture-based swipe navigation)
7. Dark mode toggle (CSS variables are ready; just add UI switch)

[POINTER 3]
All of these improve either trust (backend), scale (state mgmt), quality (tests), or UX (SSR, voice, animations).

---

## Q12: Describe your analytics approach.

[POINTER 1]
useAnalytics hook tracks events to both GTM dataLayer and GA4 with timestamps.
Events: page_load, navigation_tab_change, assistant_open_click, assistant_message_send, search_usage, filter_click, execute_strategy_click, preferences_change.

[POINTER 2]
SSR-safe: window object checked before access.
GA4 bootstrap already included in app initialization.

[POINTER 3]
For Bright Money: track where users engage with automation, which insights drive action, where they drop off.
Data-driven iteration is their core strategy.

---

## Q13: Why Vite over Create React App?

[POINTER 1]
Vite: instant dev startup, ES modules, faster rebuild on change, built-in TypeScript support.
CRA: slower startup, CommonJS, heavier webpack config (hidden).

[POINTER 2]
Vite is the modern default. HMR (hot module reload) feels instant.
For a dashboard with 6+ routes, developer experience difference is noticeable.

[POINTER 3]
Production: Vite builds 30% faster. Not critical here, but better practice.

---

## Q14: Why Recharts over D3.js?

[POINTER 1]
Recharts: React-first API, responsive by default, easy composable components.
D3: powerful but steep learning curve, not React-native, overkill for standard charts.

[POINTER 2]
My dashboard needs pie chart (spending distribution) and area chart (balance trends).
Recharts handles both in 10 lines of code. D3 would take 50+ lines.

[POINTER 3]
For fintech dashboards, clarity > fancy visualizations. Recharts hits the sweet spot.

---

## Q15: Tell me about the useDebounce hook.

[POINTER 1]
useDebounce<T> takes a value and delay (e.g., 300ms).
Returns the debounced value; only updates after the user stops changing the input for 300ms.

[POINTER 2]
In search field: user types 't', 'tr', 'tra', 'tran' rapidly.
API isn't called for each keystroke. Only called after user pauses.

[POINTER 3]
Tradeoff: perceived response is slightly slower while typing (user sees no results until pause).
Offset: instant local UI feedback (search field responds immediately; results update after debounce delay).

---

## Q16: How does useLocalStorage work and why is it useful?

[POINTER 1]
useLocalStorage<T> reads/writes to browser's localStorage with TypeScript generics.
const [activeTab, setActiveTab] = useLocalStorage('active_tab', 'home');

[POINTER 2]
Survives page refresh and browser restart. SSR-safe (checks if window exists).
Provides fallback: if localStorage unavailable, uses state instead.

[POINTER 3]
In dashboard: remember which tab the user was on. They close the app, come back later, and are right where they left off.
Trust signal: "the app remembers me."

---

## Q17: Explain the useFetch hook design.

[POINTER 1]
useFetch<T> is generic: accepts a URL string or async function.
Returns { data, loading, error, refetch }.

[POINTER 2]
Handles retry: error triggers a manual refetch button.
Supports manual mode: skip auto-fetch on mount; fetch only on user action.

[POINTER 3]
Why generics? Type safety. Caller knows what data shape to expect: `useFetch<Transaction[]>(...)` tells TypeScript the API returns an array of transactions.

---

## Q18: What is your CSS strategy (Tailwind)?

[POINTER 1]
Tailwind CSS 4 with custom theme: CSS variables for colors (--color-primary: emerald), spacing (4px baseline), radius (16px premium corners).
Utility-first: compose `className="flex gap-4 rounded-lg bg-surface"` instead of writing CSS.

[POINTER 2]
Benefits: consistent design system, no CSS naming conflicts, fast iteration, mobile-first responsive classes (md:, lg:, xl:).

[POINTER 3]
Downside: class names in JSX are verbose. Mitigation: component library (Button, Card, Avatar) wraps repeated patterns.

---

## Q19: How do you approach component organization?

[POINTER 1]
Flat by feature, not by type:
```
components/
  Layout.tsx (mobile container)
  DesktopLayout.tsx (desktop container)
  Home.tsx, Stats.tsx, Wallet.tsx, Me.tsx (mobile pages)
  DesktopHome.tsx, DesktopTransactions.tsx, etc. (desktop pages)
  ui/ (Button, Card, Avatar - shadcn-style primitives)
hooks/
  useFetch.ts, useAnalytics.ts, etc.
```

[POINTER 2]
Mobile and desktop layouts are separate to avoid conditional mess inside components.
Reusable UI primitives go in `ui/`; feature-specific components stay near their routes.

[POINTER 3]
Easy to add a new page: create Home.tsx and DesktopHome.tsx, import in router, done.

---

## Q20: What's a closing statement you use to end technical discussions?

[POINTER 1]
"I optimize for clarity first, then performance where measured.
I can explain every design choice, the tradeoff it introduced, and how I would improve it in the next iteration."

[POINTER 2]
This signals: thoughtful engineer, not checkbox-ticking; iterative mindset; ready for feedback.

[POINTER 3]
For Bright Money: matches their data-driven, fast-iteration culture.
They'll respect you can justify decisions and adapt based on metrics.
