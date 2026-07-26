/**
 * Hand-picked tags for the most commonly used Main-section actions, so
 * searching e.g. "play" surfaces transport actions before obscure matches.
 * Every ID here was confirmed present in tools/ActionList.txt before being
 * added - none of these are guessed.
 *
 * Not exhaustive - anything not listed here still ships in the database,
 * just untagged, relying on name matching alone. Extend this table as more
 * common actions come up rather than trying to cover everything at once.
 */
export const CURATED_TAGS: Record<string, string[]> = {
	// Transport
	"1007": ["transport", "play"],
	"1008": ["transport", "pause"],
	"1013": ["transport", "record"],
	"1016": ["transport", "stop"],
	"1068": ["transport", "repeat", "loop"],
	"40042": ["transport", "navigation", "start"],
	"40043": ["transport", "navigation", "end"],
	"40044": ["transport", "play", "stop"],
	"40046": ["transport", "record"],
	"40667": ["transport", "stop", "record"],
	"40668": ["transport", "stop", "record"],
	"40364": ["transport", "metronome", "click"],

	// Track: selection / bulk
	"6": ["track", "mute"],
	"7": ["track", "solo"],
	"8": ["track", "fx"],
	"9": ["track", "recarm", "record"],
	"14": ["track", "mute", "master"],
	"15": ["track", "solo", "master"],
	"16": ["track", "fx", "master"],
	"40001": ["track", "insert", "new"],
	"40005": ["track", "remove", "delete"],
	"40062": ["track", "duplicate"],
	"40075": ["track", "master", "view"],
	"40296": ["track", "select", "selection"],
	"40297": ["track", "select", "selection"],
	"40495": ["track", "monitor", "recmon"],
	"40702": ["track", "insert", "new"],
	"40913": ["track", "scroll", "view"],
	"41147": ["track", "insert", "new", "mixer"],
	"43093": ["track", "insert", "new"],
	"40080": ["mixer", "track", "folder"],
	"40083": ["mixer", "dock"],
	"40197": ["mixer", "track"],
	"40110": ["track", "zoom", "height", "view"],
	"40113": ["track", "zoom", "height", "view"],
	"42697": ["track", "zoom", "height", "view"],
	"42700": ["track", "zoom", "height", "view"],
	"40291": ["track", "fx", "view"],
	"40846": ["track", "fx", "master", "view"],

	// Item
	"40006": ["item", "delete", "remove"],
	"40012": ["item", "split", "edit"],
	"40061": ["item", "split", "edit"],
	"40186": ["item", "split", "edit"],
	"40757": ["item", "split", "edit"],
	"40759": ["item", "split", "edit"],
	"43178": ["item", "split", "edit"],
	"40257": ["item", "glue"],
	"40362": ["item", "glue"],
	"40606": ["item", "glue"],
	"41588": ["item", "glue"],
	"42008": ["item", "glue"],
	"42009": ["item", "glue"],
	"42432": ["item", "glue"],
	"42433": ["item", "glue"],
	"42434": ["item", "glue"],
	"41295": ["item", "duplicate"],
	"40416": ["item", "navigation", "select"],
	"40417": ["item", "navigation", "select"],
	"40034": ["item", "group", "select"],

	// Edit / file
	"40029": ["edit", "undo"],
	"40030": ["edit", "redo"],
	"40072": ["edit", "undo", "history"],
	"40022": ["file", "save"],
	"40026": ["file", "save"],
	"40394": ["file", "save", "template"],
	"42332": ["file", "save", "render"],

	// Markers / regions / loop
	"40157": ["marker", "insert"],
	"40172": ["marker", "navigation"],
	"40173": ["marker", "navigation"],
	"40613": ["marker", "delete"],
	"40222": ["loop", "transport"],
	"40223": ["loop", "transport"],

	// View / zoom
	"1011": ["view", "zoom"],
	"1012": ["view", "zoom"],
	"40111": ["view", "zoom"],
	"40112": ["view", "zoom"],
	"40295": ["view", "zoom"],
	"41622": ["view", "zoom", "selection"],
	"40251": ["view", "routing"],

	// Envelope
	"40064": ["envelope", "point", "insert"],
	"40106": ["envelope", "point", "insert"],
	"40915": ["envelope", "point", "insert"],
	"41126": ["envelope", "point", "insert"],

	// Snapping
	"40753": ["snap", "grid"],
	"40754": ["snap", "grid"],
};
