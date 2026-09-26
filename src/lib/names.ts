// Component and project names read like signs: "Main Street Watermain".

const SMALL_WORDS = new Set(
  "a an and at by for in of on or the to with".split(" "),
);

/**
 * Capitalizes a name the way a sign would read: "main street watermain" →
 * "Main Street Watermain". Words that already have capitals ("HL3", "McRae")
 * and small words after the first ("of", "and") are left alone.
 */
export function capitalizeName(name: string): string {
  let first = true;
  return name.replace(/[^\s-]+/g, (word) => {
    const isFirst = first;
    first = false;
    if (word !== word.toLowerCase()) return word;
    if (!isFirst && SMALL_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}
