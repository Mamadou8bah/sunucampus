# SunuCampus ranking

For you combines relationships, interests, engagement, freshness, community relevance and discovery. Ranking runs over up to 160 recent network posts and 160 recent public posts. Each account contributes at most one like and one comment signal per post. Relationship strength uses the accepted graph, shared communities, and recent visible comments in both directions. Interaction patterns count at most three distinct posts per direction. Private messages are outside the scoring inputs.

The algorithm spaces out repeated authors and community categories and suppresses duplicate text from the same author. It targets 20% qualified discovery where enough candidates are available. Similar-scoring discovery posts rotate daily. With no interests, memberships or connections, it also considers substantive and fresh campus posts so a new viewer can discover content before any engagement accumulates. A moderator-confirmed warning on a post can reduce its score. Open reports alone carry no ranking penalty.

People you may know takes at most 150 direct connections and 3,000 edges for the second hop, mixes graph candidates with bounded profile and community pools, and ranks the union once. Large communities contribute a sample of at most 500 members each. Reasons reflect observed data. There is no course roster, so the course weight is left out of the normalization. The original goal-based Matches deck remains available.

Trending uses distinct, active participants in the selected window. Today starts at midnight UTC. This week is the previous seven days. Likes count from the point at which timestamps are recorded. Earlier likes still count for For you, where existing lifetime likes are available. Unliking removes the timestamp. Comments already have timestamps. The formula excludes shares because share actions are not recorded. At least two distinct participants are required, with full confidence at four.

Highlights summarize up to three recent discussions or close-connection posts. They use existing posts and suppress repeated authors, communities and identical text.

## Tuning and evaluation

Set a JSON object in the backend's `RANKING_CONFIG` environment variable. Partial overrides use the defaults in [ranking.js](../backend/src/config/ranking.js). For example:

```dotenv
RANKING_CONFIG='{"feed":{"relationship":0.3},"recencyHours":36,"discoveryShare":0.15}'
```

Weights are normalized across signals available to the product. Ranked responses return page counts for visible posts, discovery posts and unique authors. Existing admin reports track connection acceptance and recent activity. Feed impression rates, recommendation click-through, discovery conversion and returning-user cohorts need events that the app does not collect.

The ranking snapshot holds a viewer-specific ordered ID list for 15 minutes, with a process-wide cap of 500 snapshots. Each subsequent page rechecks visibility and dismissals without reordering the original slots. A server restart or eviction invalidates the snapshot. This uses the existing single-process deployment. The standalone browser demo retains its local chronological feed and existing matches.
