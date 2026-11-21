# Design: a mobile-first campus app

SunuCampus is designed as a **mobile app first**. Most students reach it from a phone between lectures, so every
screen is laid out for a ~390px-wide display and then adapted for tablets and desktops. The frontend is a web app that
can be installed to the home screen (it has a web app manifest and app icon) and behaves like a native app: bottom tab
navigation, full-screen flows, bottom sheets and touch-sized controls.

## Research

Behance and Dribbble were the starting point. Relevant concepts include *Kommunity* (a college community app on
Behance), *Campus Connect* (a Behance case study), a *school social network iOS app* by Purrweb and a *social networking
app for college students* (Dribbble). Behance and Dribbble pages can't be read by automated tools, so the concrete
findings below come from written case studies of similar student apps:

| Finding | Source | How SunuCampus applies it |
|---|---|---|
| Usability testing led the team to replace a side menu with a **bottom navigation bar** for the main features. | Howard University student app case study | Five-tab bottom bar: Home, Matches, Communities, Messages, Profile. It becomes a left rail on desktop. |
| Students wanted control over what they see. The feed was split into **"For You"** (targeted) and **"All Posts"**. | UI Connect (Universitas Indonesia) case study | Home feed has **For you** (connections and communities) and **Campus** (everything public) tabs. |
| Groups should be easy to browse and to create. | ADM Unity (NTU) case study | Communities tab with category chips, search, an Explore/Joined switch, and a create-community sheet. |
| **Profile prompts** ("We'll get along if…") make profiles personal and act as conversation starters. A consistent onboarding structure reduces cognitive effort. | Bumble BFF design critique (Pratt IXD) and Bumble's own prompt guidance | Up to three prompts per profile, shown on match cards. A four-step onboarding after sign-up. |
| Interest tags make compatibility visible at a glance. | Bumble BFF interest badges | Interests and skills as chips; the ones shared with the viewer are highlighted in sun yellow. |

## Visual identity

The brand comes from the SunuCampus mark (`frontend/public/brand/sunucampus-mark.png`), a glossy pink wave. The
palette was sampled from the mark and kept to pinks and neutrals (no purple):

| Token | Hex | Role |
|---|---|---|
| Night | `#120C0F` | Splash screen, intro, dark headers, a neutral near-black |
| Brand | `#CC2280` | Primary buttons, links, active tab (white text 5.11:1) |
| Glow | `#F057BB` | Match rings, highlights, decorative only |
| Heart | `#D4258F` | Likes and unread badges |
| Danger | `#D92D20` | Errors and destructive actions, kept distinct from the brand pink |
| Gradient | `#FFB3D1 → #F080B5 → #F057BB → #E0338F` | Brand moments |
| Mist | `#F6F4F5` | App background |
| White | `#FFFFFF` | Cards, sheets, posts |

The launch (splash) screen shows the mark on Night with a soft pink glow. It is inlined in `index.html`, so it
appears before any JavaScript loads, and stays up while a saved session is restored. App icons use the same mark on Night.

- **Type:** Manrope throughout, a geometric sans that stays legible at small sizes on phones. Heavier weights (700 to 800)
  carry headings, names, prompt answers and the match percentage; regular weights carry body text.
- **The memorable element:** the **match card**. It has a river-coloured hero, a sun-yellow ring that fills to the
  compatibility score, the reasons in plain language, a prompt and the shared interests. Students swipe right to
  connect or left to pass, or use the large buttons that stay within thumb reach. Everything else is deliberately quiet.
- **Avoided defaults:** no all-caps labels, no identical shadowed cards everywhere (posts run edge to edge on phones,
  settings use grouped lists), and no decorative gradients.

## Patterns used

| Pattern | Where |
|---|---|
| Bottom tab bar with unread badge | App shell |
| Large-title app bar with actions, compact bar with back button on pushed screens | Every screen |
| Segmented control | Feed tabs, matches/search, network, community sections |
| Bottom sheet (`<dialog>`, focus-trapped, Escape to close) | New post, post options, report, filters, create and edit community |
| Floating action button | New post on Home and in communities |
| Horizontally scrolling "people you might click with" strip with score rings | Home |
| Swipeable card deck with keyboard support (arrow keys) and button alternatives | Matches |
| Grouped settings list | Profile account section, post options |
| Full-screen chat thread (tab bar hidden) | Messages |
| Stacked cards instead of wide tables on phones | Admin tables |

## Accessibility

- Touch targets are at least 44px and form inputs use 16px text, so iOS doesn't zoom.
- Every icon-only button has an accessible name, and sheets are real dialogs with focus management.
- Swipe actions always have visible button equivalents. Reduced-motion settings are respected.
- Colour is never the only signal: match scores show the number, shared interests are also listed in the reasons,
  and the chart palette was validated for colour-vision deficiency.

## Sources

- [Howard University student app case study (UX Planet)](https://uxplanet.org/collegetribe-an-honest-ux-case-study-part-2-2-cfdb564c60ef)
- [UI Connect alumni app UI/UX case study](https://uxplanet.org/ui-connect-alumni-app-ui-ux-case-study-c7faedf758a3)
- [ADM Unity school community app case study](https://oss.adm.ntu.edu.sg/ycheuk001/adm-unity-interface-design/)
- [Design critique: BFF iOS app (Pratt IXD)](https://ixd.prattsi.org/2026/02/design-critique-bff-ios-app/)
- [Bumble profile prompts](https://bumble.com/the-buzz/bumble-profile-prompts)
- [Kommunity UX/UI case study (Behance)](https://www.behance.net/gallery/130187955/Kommunity-UX-UI-Design-Case-Study)
- [Campus Connect UX/UI case study (Behance)](https://www.behance.net/gallery/198248905/Project-Case-Study-UXUI-(Campus-Connect))
- [School Social Network iOS app (Dribbble)](https://dribbble.com/shots/21344376-School-Social-Network-Mobile-IOS-App)
- [Social networking app for college students (Dribbble)](https://dribbble.com/shots/9520594-Social-Networking-App-For-College-Students)
