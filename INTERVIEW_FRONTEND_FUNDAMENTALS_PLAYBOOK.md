# Technical Discussion 1 - Frontend Fundamentals Playbook

Date: April 21, 2026
Use this tonight for prep and tomorrow for final review.

## 0) Your Assignment Context
**GSV AI Finance Dashboard** (React 19 + TypeScript + Vite)
Live: https://intern-assign-sooty.vercel.app/

Key Features to Reference in Answers:
- Custom hooks: useFetch, useAnalytics, useDebounce, useLocalStorage
- Mobile/Desktop responsive with conditional rendering (1024px breakpoint)
- Lazy loading with React.lazy() + Suspense
- Recharts data visualization
- useCallback in hooks to prevent function recreation
- useMemo for expensive computations
- useLocalStorage for tab persistence
- GA4 analytics integration
- WCAG 2.2 Level AA accessibility (100/100 Lighthouse)
- Mock data architecture (single source of truth)

**Full details:** See FRONTEND_ROLE_CONTEXT_TEMPLATE.md → "My Assignment" section

## 1) 2-Minute Project Walkthrough Script
Use this structure exactly:

I built an AI-powered fintech dashboard with React 19, TypeScript, and Vite.
It works on mobile and desktop with different layouts—bottom nav on phones, sidebar on desktop.
I implemented custom hooks for data fetching, analytics tracking, debouncing, and local storage.
I prioritized performance with lazy loading, memoization, and code splitting.
I achieved 100/100 Lighthouse accessibility; the entire interface is keyboard navigable and screen-reader compatible.
If I had more time, I would add real backend integration and write E2E tests.

Keep delivery under 60 seconds.
Speak in 1 to 2 short fragments.
Do not turn this into a long paragraph.
Prefer one idea per line.
Avoid stacking clauses with commas or semicolons.
Use the same answer shape every time.

## 1b) How to Reference Your Assignment in Q&A Answers

**When asked about React hooks:**
"In my dashboard, I built useFetch to handle data loading with retry logic. useFetch uses useEffect internally—every time the dependency array changes, it refetches. I also use useCallback in that hook to prevent the refetch function from recreating on every render."

**When asked about performance:**
"I lazy-loaded components with React.lazy and Suspense. Each page chunk is 5–21KB. I also used useMemo for expensive chart calculations and useCallback in custom hooks. Result: Lighthouse Performance 91/100."

**When asked about mobile vs desktop:**
"My dashboard detects the breakpoint (1024px) and renders completely different layouts. Mobile has 4 tabs with bottom nav; desktop has 5 tabs with a sidebar. useLocalStorage preserves the active tab across resize and refresh. This avoids the awkward responsive squashing where mobile and desktop fight for space."

**When asked about state management:**
"I used custom hooks instead of Redux. Each hook has a single responsibility: useFetch for data, useAnalytics for tracking, useDebounce for search, useLocalStorage for persistence. This keeps the scope simple and makes hooks reusable."

**When asked about accessibility:**
"The entire dashboard is WCAG 2.2 Level AA. I used semantic HTML, ARIA labels on icon buttons, keyboard navigation (Tab, Enter, arrow keys work), and 7.8:1 color contrast. Lighthouse gave 100/100 for accessibility."

## 2) 30-Second Answers for High-Probability Questions

One plain fragment.
Two tiny pointers.

## 7) Live Coding Preparation (Likely)
Practice these now:
1. Array transform: group transactions by category and sum amounts.
2. Debounced search input component with cancel-safe effect.
3. Flatten nested arrays and return top-k frequent values.
4. Implement throttle utility.

Expectations in interview:
- Start with brute force, explain complexity, then optimize.
- Narrate assumptions and edge cases before coding.
- Test with 2-3 sample inputs aloud.

## 8) Decision-Making Framework (Use during answers)
Always answer in this sequence:
1. Requirement or constraint.
2. Options considered.
3. Choice made and why.
4. Tradeoff accepted.
5. What you would improve next.

Keep the spoken form compact. Prefer 1 to 2 short chunks rather than one long block.
If the answer is getting long, split it into a first sentence that answers directly and a second sentence that explains the tradeoff.
If you find yourself writing a paragraph, rewrite it into 3 to 5 short spoken lines.

Example:
"I chose debounce over throttle for search because API call reduction and final-input accuracy mattered more than intermediate updates. Tradeoff: slower perceived response while typing; I offset with instant local UI feedback."

## 9) 90-Minute Tonight Plan

0-15 min:
- Rehearse the 2-minute walkthrough 3 times.

15-40 min:
- Review hooks and performance concepts from this playbook.
- Prepare one real example per concept from your assignment.

40-65 min:
- Do 2 live coding drills (array + debounce/throttle).

65-80 min:
- Revise event loop, closures, Promise concurrency.

80-90 min:
- Simulate Q and A: answer 8 probable questions out loud.

## 10) Morning-of Interview Checklist (10 min)
- 2-minute walkthrough ready.
- 3 performance examples ready.
- 3 custom hook internals ready.
- 2 tradeoff stories ready.
- 1 mistake you learned from ready.

## 11) Red Flags to Avoid in Round
- Do not say "I used it because it is best practice" without context.
- Do not over-claim optimization without profiler evidence.
- Do not mix debounce and throttle definitions.
- Do not ignore cleanup in effects.
- Do not hide missing features; state priority and next step clearly.

## 12) Closing Line You Can Use
"I optimize for clarity first, then performance where measured. I can explain every design choice, the tradeoff it introduced, and how I would improve it in the next iteration."

## 13) Bright Money Context (Use in Answers)

Use these facts naturally, not as a memorized monologue:
- Bright Money is an AI-powered personal finance platform for US users, focused on reducing credit card debt, improving credit profile, and growing savings through automation.
- Founded in 2019 by Petko Plachkov and Avi Patchava.
- Business hub is San Francisco; engineering execution is centered in Bangalore.
- Product direction is automation-first, not dashboard-only.
- Core concepts: MoneyScience, Smart Pace Transfers, Bright Builder, and personalized savings.

How to map this to frontend answers:
- In fintech, frontend quality impacts trust directly.
- Financial actions need strong UX clarity, explicit loading states, and reliable status feedback.
- Mobile-first constraints increase importance of performance, component reuse, and consistent interaction patterns.

## 14) Speakable Bright-Specific Lines

Why Bright Money:
"Bright is solving a real and painful problem with an automation-first product, which feels genuinely differentiated from apps that only show analytics. I also like that engineering ownership sits strongly in Bangalore, because that usually means faster learning and real end-to-end responsibility."

Assignment linkage:
"I tried to design my assignment with actionable insights and clear user decisions, because that aligns with Bright's product philosophy of guiding users toward better outcomes, not just exposing raw numbers."

Performance linkage:
"For a fintech flow, performance is not only speed, it is trust. When balances, transfers, and confirmations feel instant and predictable, user confidence goes up significantly."

React Native or cross-platform linkage:
"Given Bright's mobile-first footprint, I value component architecture and shared logic patterns that can scale across platforms without sacrificing UX quality."

## 15) Safe Framing for Company Facts

If you are unsure about a number or recent update, use safe phrasing:
- "As I understand, Bright has raised significant funding and is scaling with a lean team."
- "From what I have seen, the Bangalore office is a major engineering center."
- "My understanding is that their product focus is automation-led debt reduction and savings behavior improvement."

This keeps you accurate and confident without overcommitting to potentially stale details.
