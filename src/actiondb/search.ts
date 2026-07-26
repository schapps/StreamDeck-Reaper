import type { ActionEntry } from "./types.js";

export interface SearchOptions {
	limit?: number;
}

/**
 * Exact ID match always wins and comes first (typing "40044" finds it
 * directly, per spec section 7.3). Otherwise: every whitespace-separated
 * word in the query must match the action's name (as a substring, word-start
 * matches scoring higher) or one of its tags exactly - and if that fails
 * entirely, fall back to a compact in-order subsequence match against the
 * name, so a query like "trstp" can still surface "Transport: Stop".
 */
export function searchActions(actions: ActionEntry[], query: string, options: SearchOptions = {}): ActionEntry[] {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const queryLower = trimmed.toLowerCase();
	const exactId = actions.find((a) => a.id.toLowerCase() === queryLower);

	const words = queryLower.split(/\s+/).filter(Boolean);
	const scored: { action: ActionEntry; score: number }[] = [];

	for (const action of actions) {
		if (exactId && action.id === exactId.id) continue;

		const nameLower = action.name.toLowerCase();
		const wordScore = scoreAllWordsMatch(nameLower, action.tags, words);
		if (wordScore !== undefined) {
			scored.push({ action, score: wordScore });
			continue;
		}

		const subsequenceScore = scoreSubsequence(nameLower, queryLower.replace(/\s+/g, ""));
		if (subsequenceScore !== undefined) {
			scored.push({ action, score: subsequenceScore });
		}
	}

	scored.sort((a, b) => b.score - a.score || a.action.name.length - b.action.name.length);

	const results = scored.map((s) => s.action);
	if (exactId) results.unshift(exactId);

	return options.limit !== undefined ? results.slice(0, options.limit) : results;
}

const WORD_MATCH_BASE_SCORE = 1000; // always ranks above any subsequence-only match

function scoreAllWordsMatch(nameLower: string, tags: string[], words: string[]): number | undefined {
	let score = WORD_MATCH_BASE_SCORE;
	for (const word of words) {
		const idx = nameLower.indexOf(word);
		if (idx === -1) {
			if (tags.some((t) => t.toLowerCase() === word)) {
				score += 5;
				continue;
			}
			return undefined;
		}
		score += idx === 0 ? 10 : 3;
		const atWordBoundary = idx === 0 || !/[a-z0-9]/.test(nameLower[idx - 1] ?? "");
		if (atWordBoundary) score += 2;
	}
	return score;
}

/** In-order, not-necessarily-contiguous character match. Denser matches score higher. */
function scoreSubsequence(nameLower: string, compactQuery: string): number | undefined {
	if (compactQuery === "") return undefined;
	let nameIdx = 0;
	let firstMatchIdx = -1;
	let lastMatchIdx = -1;
	for (const ch of compactQuery) {
		const found = nameLower.indexOf(ch, nameIdx);
		if (found === -1) return undefined;
		if (firstMatchIdx === -1) firstMatchIdx = found;
		lastMatchIdx = found;
		nameIdx = found + 1;
	}
	const span = lastMatchIdx - firstMatchIdx + 1;
	// Denser (shorter span relative to query length) and earlier matches score higher.
	return Math.max(0, 200 - span - firstMatchIdx);
}
